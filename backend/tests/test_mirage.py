"""End-to-end and unit tests. Run from backend/: `python -m pytest -q`."""
from __future__ import annotations

import os
import tempfile
import time

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["MIRAGE_STORAGE"] = tempfile.mkdtemp()

import pytest
from fastapi.testclient import TestClient

from app import audit
from app.db import Base, SessionLocal, engine
from app.fusion.risk import assess
from app.witnesses import words
from app.witnesses.base import Evidence, WitnessResult


@pytest.fixture(scope="module")
def client():
    from app import history

    history.populate = lambda **_: None  # keep tests fast and deterministic
    from app.main import app

    with TestClient(app) as c:
        for _ in range(60):
            if c.get("/v1/health").json()["ready"]:
                break
            time.sleep(0.5)
        yield c


@pytest.fixture(scope="module")
def token(client):
    return client.post("/v1/auth/login", json={"persona_id": "analyst"}).json()["token"]


def _wait(client, token, case_id, timeout=90):
    h = {"authorization": f"Bearer {token}"}
    for _ in range(timeout * 4):
        d = client.get(f"/v1/cases/{case_id}", headers=h).json()
        if d["status"] in ("complete", "failed"):
            return d
        time.sleep(0.25)
    raise AssertionError("case did not finish")


@pytest.mark.parametrize("key,expected", [
    ("cfo_wire", "HIGH"), ("it_otp", "HIGH"), ("real_voice_fraud", "HIGH"), ("harmless_avatar", "LOW"),
    ("papa_emergency", "HIGH"), ("digital_arrest", "HIGH"), ("vendor_headshot", "HIGH"), ("too_little", "INCONCLUSIVE"),
])
def test_scenarios_reach_expected_band(client, token, key, expected):
    r = client.post(f"/v1/scenarios/{key}/run", headers={"authorization": f"Bearer {token}"})
    assert r.status_code == 200
    d = _wait(client, token, r.json()["id"])
    assert d["status"] == "complete"
    assert d["verdict"]["band"] == expected, d["verdict"]["reasons"]
    # every citation in the Tribunal points at real evidence
    ids = {e["id"] for e in d["evidence"]}
    for m in d["tribunal"]:
        assert set(m["evidence_refs"]) <= ids
    assert [m["agent"] for m in d["tribunal"]][-3:] == ["judge", "verifier", "reporter"]


def test_upload_rejects_executables(client, token):
    r = client.post("/v1/cases", headers={"authorization": f"Bearer {token}"},
                    files=[("files", ("invoice.pdf", b"MZ\x90\x00binary", "application/pdf"))])
    assert r.status_code == 415


def test_requires_auth(client):
    assert client.get("/v1/cases").status_code == 401


def test_words_tactics_and_entities():
    r = words.analyse("Papa main hoon, accident ho gaya. Paise abhi bhejo family.help@ibl pe, ₹75,000, kisi ko mat batana")
    assert {"secrecy", "urgency", "fear"} <= set(r.details["tactics"])
    assert r.details["requested_action"] == "payment"
    assert r.details["amount_inr"] == 75000
    assert "family.help@ibl" in r.details["entities"]["upi"]
    assert words.analyse("Happy Diwali to you and your family!").score < 0.2


def test_bank_otp_notice_is_not_a_credential_request():
    r = words.analyse("Your OTP for login is 482913. Do not share it with anyone.")
    assert r.details["requested_action"] != "credential"


def test_credential_rule_overrides_genuine_media():
    w = WitnessResult("words", score=0.2, confidence=0.9, details={"requested_action": "credential", "tactics": []})
    v = WitnessResult("voice", score=0.05, confidence=0.9)
    a = assess({"words": w, "voice": v}, [])
    assert a.band == "HIGH" and a.rule_fired == "credential_request"


def test_harmless_synthetic_stays_low():
    w = WitnessResult("words", score=0.02, confidence=0.9, details={"requested_action": "none", "tactics": []})
    v = WitnessResult("voice", score=0.97, confidence=0.9)
    a = assess({"words": w, "voice": v}, [])
    assert a.band == "LOW" and "SYNTHETIC_MEDIA" in a.tags


def test_shapley_contributions_sum_to_risk():
    w = WitnessResult("words", score=0.7, confidence=0.8, details={"requested_action": "data", "tactics": ["urgency"]})
    i = WitnessResult("identity", score=0.4, confidence=0.8)
    a = assess({"words": w, "identity": i}, [Evidence("words", "urgency", "urgency", severity=2, id="E1")])
    assert abs(sum(a.contributions.values()) - a.risk) < 0.5


def test_audit_chain_detects_tampering(client):
    with SessionLocal() as db:
        audit.record(db, "test", "x", {"a": 1})
        audit.record(db, "test", "y", {"b": 2})
        db.commit()
        assert audit.verify_chain(db)["intact"]
        from app.models import AuditEntry

        e = db.query(AuditEntry).order_by(AuditEntry.id.desc()).first()
        e.payload_hash = "0" * 64
        db.commit()
        assert not audit.verify_chain(db)["intact"]
        db.rollback()


def test_voice_triage_matrix():
    from app.routers.triage import _decide

    sem = {"action": "payment", "category": "payment_fraud", "tactics": ["urgency", "secrecy"]}
    assert _decide("ai", sem)[:2] == ("CRITICAL", "voice_clone_scam")
    assert _decide("human", sem)[:2] == ("HIGH", "human_social_engineering")
    assert _decide("uncertain", sem)[0] == "HIGH"  # an uncertain detector never downgrades a sensitive request
    assert _decide("ai", {"action": "none", "category": "benign", "tactics": []})[:2] == ("LOW", "synthetic_benign")
    assert _decide("human", None)[0] == "LOW"


def test_response_plan_categories():
    from app.fusion import response as resp

    assert resp.categorise("payment", {"fear", "authority"}, "CBI arrest warrant, transfer now") == "digital_arrest"
    assert resp.categorise("payment", {"fear"}, "Papa accident hospital") == "family_emergency"
    assert resp.categorise("credential", set(), "share the OTP") == "credential_theft"
    plan = resp.build("credential_theft", "CRITICAL", True, org=True)
    assert plan["say_this"] and any(r["id"] == "1930" for r in plan["report_to"]) and plan["if_paid"]
    assert resp.build("benign", "LOW", False)["report_to"] == []


def test_redteam_laundering_keeps_audio(tmp_path):
    import numpy as np

    from app import redteam
    from app.witnesses import dsp

    t = np.arange(dsp.SR * 3) / dsp.SR
    src = tmp_path / "tone.wav"
    src.write_bytes(dsp.write_wav((0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)))
    for kind in redteam.AUDIO_LAUNDER:
        out = redteam.launder_audio(src, kind, tmp_path / f"{kind}.wav")
        assert abs(len(dsp.load_audio(out)) / dsp.SR - 3) < 0.3, kind


def test_cure_console_family_emergency(client, token):
    """The cure run: scenario plan, simulated hold, golden hour after 'paid', blocklist, drafts and evidence pack."""
    import io
    import zipfile

    h = {"authorization": f"Bearer {token}"}
    cid = client.post("/v1/scenarios/papa_emergency/run", headers=h).json()["id"]
    assert _wait(client, token, cid)["status"] == "complete"
    v = client.get(f"/v1/cases/{cid}/cure", headers=h).json()
    assert v["context"]["category"] == "family_emergency"
    ids = [a["id"] for s in v["stages"] for a in s["actions"]]
    assert {"hold_payment", "callback", "call_1930", "set_code_word"} <= set(ids)
    assert not next(a for s in v["stages"] for a in s["actions"] if a["id"] == "call_1930")["active"]  # locked until paid

    v = client.post(f"/v1/cases/{cid}/cure/actions/hold_payment", headers=h, json={}).json()
    hold = next(a for s in v["stages"] for a in s["actions"] if a["id"] == "hold_payment")
    assert hold["status"] == "done" and hold["result"]["simulated"] and v["exposure"]["remaining_pct"] < 100

    v = client.post(f"/v1/cases/{cid}/cure/paid", headers=h, json={"amount_inr": 75000, "txn": "UTR123"}).json()
    assert v["golden"]["window"] == "golden hour" and v["paid"]["txn"] == "UTR123"
    assert next(a for s in v["stages"] for a in s["actions"] if a["id"] == "call_1930")["active"]
    assert client.get(f"/v1/cases/{cid}/cure", headers=h).json()["paid"]["txn"] == "UTR123"  # persisted

    client.post(f"/v1/cases/{cid}/cure/actions/block_identifiers", headers=h, json={})
    d = client.get(f"/v1/cases/{cid}/cure/drafts", headers=h).json()
    assert "UTR123" in d["complaint"]["text"] and "code word" in d["challenge"]["text"]
    z = zipfile.ZipFile(io.BytesIO(client.get(f"/v1/cases/{cid}/cure/evidence-pack", headers=h).content))
    assert "MANIFEST.json" in z.namelist() and any(n.startswith("drafts/") for n in z.namelist())


def test_ocr_normaliser_recovers_glued_words():
    """Screenshot OCR drops spaces; the normaliser must restore tactics and identifiers without breaking IFSC / UPI."""
    from app.witnesses.transcribe import normalise_ocr

    t = normalise_ocr("PleaseprocessRs9,80,000 to account600112233445IFSC HDFC0001234today. No,keep thisbetweenus. family.help@ibl")
    assert "keep this between us" in t and "account 600112233445" in t and "HDFC0001234 today" in t
    assert "family.help@ibl" in t
    r = words.analyse(t, live=True)
    assert "secrecy" in r.details["tactics"] and r.details["requested_action"] == "payment"


def _h(client, persona):
    return {"authorization": f"Bearer {client.post('/v1/auth/login', json={'persona_id': persona}).json()['token']}"}


def test_ops_overview_feed_and_reset(client, token):
    h = {"authorization": f"Bearer {token}"}
    r = client.post("/v1/scenarios/harmless_avatar/run", headers=h).json()
    _wait(client, token, r["id"])
    d = client.get("/v1/ops/overview", headers=h).json()
    fact = next(f for f in d["facts"] if f["id"] == r["id"])
    assert fact["band"] in ("LOW", "MEDIUM", "HIGH", "INCONCLUSIVE") and fact["at"].endswith("+00:00")
    assert "intact" in d["audit"]  # an earlier test breaks the chain on purpose, so only the shape is checked
    assert client.post("/v1/ops/reset-demo", headers=_h(client, "employee")).status_code == 403
    assert client.post("/v1/ops/reset-demo", headers=h).json()["removed"] >= 1
    for _ in range(40):
        if not client.get("/v1/ops/overview", headers=h).json()["reset"]["running"]:
            break
        time.sleep(0.25)
    assert client.get("/v1/ops/overview", headers=h).json()["facts"] == []  # populate is stubbed in tests


def test_trustbook_edit_and_enrolment_rules(client):
    admin = _h(client, "admin")
    p = client.post("/v1/identity/people", json={"name": "Test Vendor", "circle": "external", "usual_channels": ["email"]}, headers=admin).json()
    assert p["voiceprint_kind"] is None
    assert client.patch(f"/v1/identity/people/{p['id']}", json={"usual_hours": [20, 3]}, headers=admin).status_code == 422
    assert client.patch(f"/v1/identity/people/{p['id']}", json={"approval_limit_inr": 1}, headers=_h(client, "employee")).status_code == 403
    files = [("files", ("a.wav", b"RIFF", "audio/wav"))] * 3
    r = client.post(f"/v1/identity/people/{p['id']}/enroll-guided", files=files, data={"consent": "false"}, headers=admin)
    assert r.status_code == 422 and "consent" in r.json()["detail"]


def test_drill_needs_consent_and_scores_responses(client, token):
    analyst = {"authorization": f"Bearer {token}"}
    assert client.post("/v1/drills", json={"attack": "ceo_voice_wire", "targets": ["employee"]}, headers=analyst).status_code == 422
    r = client.post("/v1/drills", json={"attack": "ceo_voice_wire", "targets": ["employee"], "consent_confirmed": True}, headers=analyst).json()
    emp = _h(client, "employee")
    inbox = client.get("/v1/drills/inbox", headers=emp).json()
    assert inbox[0]["id"] == r["drills"][0] and "attack" not in inbox[0]  # not disclosed before the answer
    done = client.post(f"/v1/drills/{inbox[0]['id']}/respond", json={"choice": "verified"}, headers=emp).json()
    assert done["attack_title"]
    board = client.get("/v1/drills", headers=analyst).json()
    assert board["totals"]["verified"] >= 1


def test_liveness_pose_directions():
    from app.routers.liveness import pose, satisfied

    face = lambda eyes, nose, mouth: pose({"eyes": eyes, "nose": nose, "mouth": mouth})
    base = face([[100, 100], [160, 100]], [130, 130], [[110, 160], [150, 160]])
    assert satisfied("turn_left", face([[105, 100], [160, 100]], [150, 130], [[115, 160], [152, 160]]), base)
    assert satisfied("look_up", face([[100, 100], [160, 100]], [130, 115], [[110, 150], [150, 150]]), base)
    tilt = face([[100, 95], [160, 115]], [130, 130], [[110, 160], [150, 160]])
    assert satisfied("tilt_left", tilt, base) and not satisfied("tilt_right", tilt, base)


def test_c2pa_validation_detects_tampering(tmp_path):
    pytest.importorskip("c2pa")
    import datetime

    import c2pa
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    from PIL import Image

    from app.witnesses.provenance import c2pa_check

    now = datetime.datetime.now(datetime.timezone.utc)
    ca_key, key = ec.generate_private_key(ec.SECP256R1()), ec.generate_private_key(ec.SECP256R1())
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test CA"), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "test")])
    base = lambda b: b.not_valid_before(now - datetime.timedelta(days=1)).not_valid_after(now + datetime.timedelta(days=2)).serial_number(x509.random_serial_number())
    ca = base(x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key()))         .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)         .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True).sign(ca_key, hashes.SHA256())
    leaf = base(x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Signer"), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "test")]))
                .issuer_name(ca_name).public_key(key.public_key()))         .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)         .add_extension(x509.KeyUsage(True, False, False, False, False, False, False, False, False), critical=True)         .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]), critical=False)         .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)         .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False).sign(ca_key, hashes.SHA256())
    chain = leaf.public_bytes(serialization.Encoding.PEM) + ca.public_bytes(serialization.Encoding.PEM)
    pk = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    signer = c2pa.Signer.from_info(c2pa.C2paSignerInfo(b"es256", chain, pk, None))
    src = tmp_path / "src.jpg"
    Image.new("RGB", (256, 256), (120, 90, 60)).save(src, quality=92)
    manifest = {"claim_generator_info": [{"name": "test"}], "title": "t", "assertions": [{"label": "c2pa.actions", "data": {"actions": [
        {"action": "c2pa.created", "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"}]}}]}
    with c2pa.Builder(manifest) as b:
        b.sign_file(str(src), str(tmp_path / "ai.jpg"), signer)
    ok = c2pa_check(tmp_path / "ai.jpg")
    assert ok["present"] and ok["valid"] and ok["ai_declared"]
    raw = bytearray((tmp_path / "ai.jpg").read_bytes())
    raw[-200] ^= 0xFF
    (tmp_path / "bad.jpg").write_bytes(bytes(raw))
    assert not c2pa_check(tmp_path / "bad.jpg")["valid"]
    assert c2pa_check(src) == {"present": False}


def test_noisy_audio_is_judged_by_the_noise_robust_model(monkeypatch):
    import numpy as np

    from app.witnesses import pretrained

    monkeypatch.setattr(pretrained, "available", lambda k: k in ("df_arena", "nii"))
    monkeypatch.setattr(pretrained, "df_arena_fake", lambda c: 0.9)
    monkeypatch.setattr(pretrained, "nii_fake", lambda c, key="nii": 0.1)
    x = np.zeros(16000 * 6, dtype=np.float32)
    clean = pretrained.audio_scores(x)
    noisy = pretrained.audio_scores(x, noisy=True)
    assert not clean["noise_mode"] and set(clean["windows"][0]["models"]) == {"df_arena", "nii"}
    assert noisy["noise_mode"] and set(noisy["windows"][0]["models"]) == {"df_arena"}
    assert noisy["windows"][0]["p"] > clean["windows"][0]["p"]
    monkeypatch.setattr(pretrained, "available", lambda k: k == "nii")  # without DF_Arena, NII still answers
    assert not pretrained.audio_scores(x, noisy=True)["noise_mode"]


def test_assistant_routes_twisted_questions():
    from app.assistant import router

    cases = {"kya ye fake hai, kyun?": "why", "I already sent the money, help": "scammed_help",
             "how do you know a voice is cloned": "voice_how", "what's the weather today": "out_of_scope",
             "show case MRG-0501": "open_case"}
    for q, want in cases.items():
        assert router.route(q, has_subject=want == "why")["intent"] == want, q
    assert router.payload("is this a scam: 'Your account is blocked, share the OTP now to unlock it'").startswith("Your account")


def test_assistant_conversation_is_grounded(client, token):
    h = {"authorization": f"Bearer {token}"}
    r = client.post("/v1/assistant/chat", data={"message": "is this a scam: 'Dear customer, your KYC expired. Share the OTP sent to "
                                                           "your phone in 10 minutes or your account will be blocked.'"}, headers=h).json()
    assert r["intent"] == "analyse_text" and r["subject"]["kind"] == "text"
    assert any(b["type"] == "verdict" for b in r["blocks"])
    sid = r["session_id"]
    why = client.post("/v1/assistant/chat", data={"message": "why?", "session_id": sid}, headers=h).json()
    assert why["intent"] == "why" and why["blocks"]
    now = client.post("/v1/assistant/chat", data={"message": "ok so what do I do now", "session_id": sid}, headers=h).json()
    assert now["intent"] == "what_now" and any(b["type"] == "steps" for b in now["blocks"])
    # an action with side effects is never run on a guess
    vague = client.post("/v1/assistant/chat", data={"message": "maybe something with a scenario thing", "session_id": sid}, headers=h).json()
    assert vague["intent"] != "run_scenario" or "Did you want" in vague["blocks"][0]["text"]


def test_asr_amounts_and_avatar_lure_are_read():
    # field report: "Invest just 20 ,000" (Whisper's spacing) read as no request, so an AI avatar's pitch was LOW
    t = "I personally use this trading platform. Invest just 20 ,000 today and earn 4 % daily guaranteed. join the WhatsApp group now."
    assert words.requested_action(t)[0] == "payment"
    assert words.parse_amount(t) == 20000
    assert {"reward", "channel_switch"} <= {s[0] for s in words.tactic_spans(t)}
    assert words.parse_amount("send 2 lakh") == 200000 and words.parse_amount("pay 3.2 crore") == 32000000

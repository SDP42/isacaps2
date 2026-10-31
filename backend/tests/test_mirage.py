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

    history.populate = lambda: None  # keep tests fast and deterministic
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

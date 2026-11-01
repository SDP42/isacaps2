"""The cure: a stateful incident-response run attached to a case (docs/CURE.md).

Five stages, Contain → Verify → Recover → Report → Immunise, with actions picked for the scam category. Actions have
real effects where MIRAGE owns the system (blocking identifiers, Trustbook and policy changes, closing the case after a
callback) and clearly labelled simulated connectors where a partner API would be needed (bank hold, telecom report,
SOC ticket). Drafts are pre-filled from the evidence the witnesses already extracted.
"""
from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit
from .fusion import response as resp
from .models import Beneficiary, Case, Organization, ResponseRun, Verification
from .storage import path_for
from .witnesses.identity import resolve_person
from .witnesses.words import fmt_inr

STAGES = [
    ("contain", "Contain", "Stop the damage in the next minutes"),
    ("verify", "Verify", "Prove who is really asking, on a channel the attacker does not control"),
    ("recover", "Recover", "Get money or access back while it is still possible"),
    ("report", "Report", "Put the evidence where it can freeze money and block the attacker"),
    ("immunise", "Immunise", "Make the same attack fail next time"),
]

# id: stage, title, why, kind (do | connector | draft | verify | effect | link), weight (share of exposure removed)
ACTIONS: dict[str, dict] = {
    "stop_engaging": dict(stage="contain", kind="do", weight=8, title="Stop engaging on that channel",
                          why="Every reply keeps you inside the attacker's script and confirms the number is live."),
    "hold_payment": dict(stage="contain", kind="connector", weight=30, title="Put a hold on the payment",
                         why="Nothing irreversible happens while you verify. Banks can hold a pending or new transfer."),
    "revoke_sessions": dict(stage="contain", kind="connector", weight=25, title="Revoke sessions and reset the password",
                            why="A shared OTP or password gives access within minutes; logging everyone out closes it."),
    "disconnect_remote": dict(stage="contain", kind="do", weight=25, title="Disconnect and remove the remote-access app",
                              why="Screen-sharing apps let the attacker act as you. Change passwords from another device."),
    "end_call": dict(stage="contain", kind="do", weight=20, title="End the call, do not transfer to 'verify'",
                     why="No Indian agency arrests or collects deposits over a video call."),
    "callback": dict(stage="verify", kind="verify", weight=15, title="Call back on the Trustbook number",
                     why="The real person answers on the number you already had, not the one that contacted you."),
    "challenge": dict(stage="verify", kind="draft", weight=5, title="Ask the challenge questions",
                      why="A cloned voice cannot answer what only the real person knows."),
    "second_approver": dict(stage="verify", kind="do", weight=8, title="Get a second approver",
                            why="Payments above the requester's limit need dual approval by policy."),
    "call_1930": dict(stage="recover", kind="draft", weight=15, title="Call 1930 with this script",
                      why="Within the golden hour, banks can freeze money still moving between accounts."),
    "bank_recall": dict(stage="recover", kind="connector", weight=15, title="Ask the bank to recall the transfer",
                        why="A written recall request with the transaction details speeds up the freeze."),
    "complaint": dict(stage="report", kind="draft", weight=6, title="File at cybercrime.gov.in (pre-filled)",
                      why="The complaint number is what banks and police act on. Every field is drafted from the evidence."),
    "chakshu": dict(stage="report", kind="draft", weight=4, title="Report the number on Sanchar Saathi (Chakshu)",
                    why="Reported numbers and WhatsApp accounts get blocked for everyone."),
    "soc_ticket": dict(stage="report", kind="connector", weight=4, title="Open a security incident",
                       why="Security can block the sender for the whole organisation and check who else was targeted."),
    "cert_in": dict(stage="report", kind="draft", weight=3, title="CERT-In incident summary",
                    why="Organisations must report cyber incidents to CERT-In within 6 hours."),
    "warn_network": dict(stage="report", kind="draft", weight=4, title="Warn the people who are next",
                         why="Scam crews reuse the same script and accounts on colleagues and relatives within hours."),
    "evidence_pack": dict(stage="report", kind="link", weight=3, title="Download the evidence pack",
                          why="Originals, SHA-256 manifest, report and drafts in one file: chain of custody."),
    "block_identifiers": dict(stage="immunise", kind="effect", weight=6, title="Block the scammer's accounts and numbers",
                              why="Flags the UPI IDs, accounts and numbers so any future case using them is escalated."),
    "set_code_word": dict(stage="immunise", kind="effect", weight=3, title="Set a family code word",
                          why="A phrase agreed in person defeats every future voice clone."),
    "tighten_policy": dict(stage="immunise", kind="effect", weight=3, title="Require dual approval for new beneficiaries",
                           why="The attack only works when one person can move money alone."),
    "drill": dict(stage="immunise", kind="link", weight=2, title="Run this attack as a drill",
                  why="The attack that got through becomes the one the team practises against in the red-team lab."),
}

PLANS: dict[str, list[str]] = {
    "payment_fraud": ["stop_engaging", "hold_payment", "callback", "challenge", "second_approver", "call_1930", "bank_recall",
                      "complaint", "soc_ticket", "cert_in", "warn_network", "evidence_pack", "block_identifiers",
                      "tighten_policy", "drill"],
    "family_emergency": ["stop_engaging", "hold_payment", "callback", "challenge", "call_1930", "bank_recall", "complaint",
                         "chakshu", "warn_network", "evidence_pack", "block_identifiers", "set_code_word", "drill"],
    "digital_arrest": ["end_call", "hold_payment", "callback", "call_1930", "bank_recall", "complaint", "chakshu",
                       "warn_network", "evidence_pack", "block_identifiers", "set_code_word", "drill"],
    "credential_theft": ["stop_engaging", "revoke_sessions", "callback", "call_1930", "complaint", "chakshu", "soc_ticket",
                         "warn_network", "evidence_pack", "block_identifiers", "drill"],
    "remote_access": ["disconnect_remote", "revoke_sessions", "callback", "call_1930", "complaint", "chakshu", "soc_ticket",
                      "evidence_pack", "block_identifiers", "drill"],
    "reward_scam": ["stop_engaging", "hold_payment", "call_1930", "bank_recall", "complaint", "chakshu", "warn_network",
                    "evidence_pack", "block_identifiers", "drill"],
    "data_theft": ["stop_engaging", "callback", "challenge", "soc_ticket", "cert_in", "warn_network", "evidence_pack",
                   "block_identifiers", "drill"],
    "synthetic_benign": ["evidence_pack"],
    "benign": ["evidence_pack"],
}
DRILL_ATTACK = {"payment_fraud": "ceo_voice_wire", "family_emergency": "family_emergency", "digital_arrest": "digital_arrest",
                "credential_theft": "otp_helpdesk", "remote_access": "otp_helpdesk", "reward_scam": "investment_endorsement",
                "data_theft": "vendor_bec"}
RECOVER_ONLY_IF_PAID = {"call_1930", "bank_recall"}


# ---- context: everything the witnesses already extracted ------------------------------------------------------------

def context(db: Session, c: Case, role: str) -> dict:
    words = next((f for f in c.findings if f.witness == "words"), None)
    d = words.details_json if words else {}
    v = c.verdict
    tactics = set(d.get("tactics", []))
    synthetic = bool(v and "LIKELY_SYNTHETIC" in (v.tags or []))
    action = v.requested_action if v else "none"
    category = resp.categorise(action, tactics, resp.case_text(c))
    if category == "benign" and synthetic:
        category = "synthetic_benign"
    if category == "payment_fraud" and c.channel == "email":
        category = "payment_fraud"
    person, _ = resolve_person(db, c.claimed_sender or "", c.sender_contact or "")
    ents = d.get("entities", {}) or {}
    return {
        "category": category, "category_label": resp.CATEGORIES.get(category, category),
        "band": v.band if v else None, "risk": v.risk if v else None, "synthetic": synthetic, "action": action,
        "tactics": sorted(tactics), "amount_inr": d.get("amount_inr"), "deadline": d.get("deadline"),
        "upi": ents.get("upi", []), "accounts": ents.get("account", []), "ifsc": ents.get("ifsc", []),
        "phones": ents.get("phone", []), "urls": ents.get("url", []), "emails": ents.get("email", []),
        "sender_contact": c.sender_contact or "", "channel": c.channel, "claimed": c.claimed_sender or "the sender",
        "person": {"name": person.name, "phone": person.phone, "role": person.role, "circle": person.circle,
                   "code_word_set": person.code_word_set, "id": person.id} if person else None,
        "received_at": (c.received_at or c.created_at).isoformat() if (c.received_at or c.created_at) else None,
        "message": c.message_text or "", "org": role != "family",
        "artifacts": [{"name": a.filename, "sha256": a.sha256, "kind": a.kind} for a in c.artifacts],
        "summary": v.summary if v else "",
    }


def _run(db: Session, c: Case) -> ResponseRun:
    run = db.get(ResponseRun, c.id)
    if not run:
        run = ResponseRun(case_id=c.id, state_json={"actions": {}, "paid": None})
        db.add(run)
        db.flush()
    return run


def _state(run: ResponseRun) -> dict:
    """A deep copy: mutating the loaded JSON in place would hide the change from SQLAlchemy and nothing would save."""
    return json.loads(json.dumps(run.state_json or {"actions": {}, "paid": None}))


def _save(run: ResponseRun, state: dict) -> None:
    run.state_json = json.loads(json.dumps(state))  # new object so SQLAlchemy sees the JSON change


def others_targeted(db: Session, c: Case, ctx: dict) -> list[dict]:
    """Other cases that share a UPI ID, account, phone number or sender contact with this one."""
    keys = {k.lower() for k in ctx["upi"] + ctx["accounts"] + ctx["phones"] if k}
    if ctx["sender_contact"]:
        keys.add(ctx["sender_contact"].lower())
    if not keys:
        return []
    hits = []
    for other in db.scalars(select(Case).where(Case.id != c.id)).all():
        f = next((x for x in other.findings if x.witness == "words"), None)
        e = (f.details_json.get("entities", {}) if f else {}) or {}
        theirs = {k.lower() for k in (e.get("upi", []) + e.get("account", []) + e.get("phone", []))}
        if other.sender_contact:
            theirs.add(other.sender_contact.lower())
        shared = sorted(keys & theirs)
        if shared:
            hits.append({"case_id": other.id, "title": other.title, "submitted_by": other.submitted_by, "shared": shared,
                         "band": other.verdict.band if other.verdict else None})
    return hits[:12]


# ---- golden hour and exposure -----------------------------------------------------------------------------------

def golden(paid: dict | None) -> dict | None:
    if not paid:
        return None
    at = datetime.fromisoformat(paid["at"])
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    mins = max(0.0, (datetime.now(timezone.utc) - at).total_seconds() / 60)
    window = "golden hour" if mins < 60 else "same day" if mins < 24 * 60 else "late"
    chance = {"golden hour": "high", "same day": "medium", "late": "low"}[window]
    return {"paid_at": at.isoformat(), "minutes": round(mins, 1), "window": window, "recall_chance": chance}


def view(db: Session, c: Case, role: str) -> dict:
    ctx = context(db, c, role)
    run = _run(db, c)
    state = _state(run)
    ids = [a for a in PLANS.get(ctx["category"], PLANS["benign"]) if ctx["org"] or a not in ("soc_ticket", "cert_in", "tighten_policy")]
    if not ctx["org"] and "set_code_word" not in ids and ctx["category"] != "benign":
        ids.append("set_code_word")
    paid = state.get("paid")
    stages = []
    for sid, title, sub in STAGES:
        acts = []
        for aid in ids:
            a = ACTIONS[aid]
            if a["stage"] != sid:
                continue
            st = state["actions"].get(aid, {})
            acts.append({"id": aid, **{k: a[k] for k in ("title", "why", "kind", "weight")},
                         "status": st.get("status", "todo"), "result": st.get("result"), "at": st.get("at"),
                         "needs_payment": aid in RECOVER_ONLY_IF_PAID, "active": aid not in RECOVER_ONLY_IF_PAID or bool(paid)})
        if acts:
            stages.append({"id": sid, "title": title, "subtitle": sub, "actions": acts,
                           "done": sum(x["status"] == "done" for x in acts), "total": len(acts)})
    live = [x for s in stages for x in s["actions"] if x["active"]]
    total_w = sum(x["weight"] for x in live) or 1
    done_w = sum(x["weight"] for x in live if x["status"] == "done")
    remaining = round(100 * (1 - done_w / total_w))
    amount = (paid or {}).get("amount_inr") or ctx["amount_inr"]
    db.commit()
    return {
        "case_id": c.id, "context": ctx, "stages": stages, "paid": paid, "golden": golden(paid),
        "exposure": {"remaining_pct": remaining, "amount_inr": amount,
                     "remaining_inr": round(amount * remaining / 100) if amount else None,
                     "label": "money at risk" if amount else "access and data at risk"},
        "others": others_targeted(db, c, ctx),
        "drill_attack": DRILL_ATTACK.get(ctx["category"]),
        "simulated": ["hold_payment", "revoke_sessions", "bank_recall", "soc_ticket"],
    }


# ---- actions ------------------------------------------------------------------------------------------------------

def _ref(prefix: str, c: Case, aid: str) -> str:
    return f"{prefix}-{hashlib.sha1(f'{c.id}{aid}'.encode()).hexdigest()[:8].upper()}"


def act(db: Session, c: Case, actor: str, role: str, aid: str, body: dict) -> dict:
    if aid not in ACTIONS:
        raise KeyError(aid)
    ctx = context(db, c, role)
    run = _run(db, c)
    state = _state(run)
    result: dict = {}
    undo = body.get("undo")
    if aid == "hold_payment" and not undo:
        result = {"reference": _ref("HOLD", c, aid), "simulated": True,
                  "message": f"Simulated bank connector: hold placed on the transfer{' of ' + fmt_inr(ctx['amount_inr']) if ctx['amount_inr'] else ''}."}
    elif aid == "revoke_sessions" and not undo:
        result = {"reference": _ref("IDP", c, aid), "simulated": True, "message": "Simulated identity connector: all sessions revoked, password reset forced."}
    elif aid == "bank_recall" and not undo:
        result = {"reference": _ref("RECALL", c, aid), "simulated": True, "message": "Simulated bank connector: recall request lodged with the transaction details."}
    elif aid == "soc_ticket" and not undo:
        result = {"reference": _ref("SEC", c, aid), "simulated": True, "message": "Simulated SOC connector: incident opened with severity HIGH."}
    elif aid == "callback" and not undo:
        outcome = body.get("outcome", "denied")
        c.closed = True
        c.outcome = "confirmed_fraud" if outcome == "denied" else "verified_genuine"
        who = ctx["person"]["name"] if ctx["person"] else ctx["claimed"]
        db.add(Verification(case=c, step="call_directory", outcome="done", actor=actor,
                            note=f"Callback to {who}: {'denied sending it' if outcome == 'denied' else 'confirmed it'}"))
        result = {"outcome": outcome, "message": f"{who} {'denied sending it: confirmed fraud' if outcome == 'denied' else 'confirmed the request'}."}
    elif aid == "block_identifiers" and not undo:
        flagged = []
        for ident, kind in [(u, "upi") for u in ctx["upi"]] + [(a, "account") for a in ctx["accounts"]]:
            b = db.scalar(select(Beneficiary).where(Beneficiary.identifier == ident))
            if b:
                b.trust_level = "flagged"
            else:
                db.add(Beneficiary(label=f"Blocked from {c.id}", identifier=ident, kind=kind, trust_level="flagged"))
            flagged.append(ident)
        numbers = [n for n in ctx["phones"] + ([ctx["sender_contact"]] if ctx["sender_contact"] else []) if n]
        state["blocklist"] = sorted(set(state.get("blocklist", []) + flagged + numbers))
        result = {"flagged": flagged, "numbers": numbers,
                  "message": f"Blocked {len(flagged)} account(s) and {len(numbers)} number(s); future cases using them escalate automatically."}
    elif aid == "set_code_word" and not undo:
        from .models import Person

        if ctx["person"]:
            p = db.get(Person, ctx["person"]["id"])
            p.code_word_set = True
        result = {"message": "Code word recorded as set. Agree it in person, never over chat."}
    elif aid == "tighten_policy" and not undo:
        org = db.scalar(select(Organization))
        if org:
            pol = dict(org.policy_json or {})
            pol["dual_approval_new_beneficiary"] = True
            org.policy_json = pol
        result = {"message": "Policy updated: payments to new beneficiaries now need a second approver."}
    if undo:
        state["actions"].pop(aid, None)
    else:
        state["actions"][aid] = {"status": "done", "at": datetime.now(timezone.utc).isoformat(), "by": actor,
                                 "result": result or None}
    _save(run, state)
    audit.record(db, actor, f"cure.{aid}" + (".undo" if undo else ""), {"result": result}, c.id)
    db.commit()
    return view(db, c, role)


def mark_paid(db: Session, c: Case, actor: str, role: str, body: dict) -> dict:
    run = _run(db, c)
    state = _state(run)
    if body.get("clear"):
        state["paid"] = None
    else:
        at = body.get("at") or datetime.now(timezone.utc).isoformat()
        state["paid"] = {"amount_inr": body.get("amount_inr"), "at": at, "method": body.get("method", "UPI"),
                         "txn": body.get("txn", ""), "to": body.get("to", "")}
    _save(run, state)
    audit.record(db, actor, "cure.paid" if state["paid"] else "cure.paid.clear", state["paid"] or {}, c.id)
    db.commit()
    return view(db, c, role)


# ---- drafts -------------------------------------------------------------------------------------------------------

ASKED = {"payment": "send a payment", "credential": "share an OTP or password", "remote_access": "install a remote-access app",
         "data": "share confidential data", "info": "share information", "none": "act on the message"}


def _when(iso: str | None) -> str:
    if not iso:
        return "—"
    t = datetime.fromisoformat(iso)
    return t.astimezone(timezone.utc).strftime("%d %b %Y, %H:%M UTC")


def drafts(db: Session, c: Case, role: str) -> dict[str, dict]:
    v = view(db, c, role)
    ctx, paid = v["context"], v["paid"] or {}
    amount = paid.get("amount_inr") or ctx["amount_inr"]
    ids = ", ".join(ctx["upi"] + ctx["accounts"]) or "—"
    numbers = ", ".join(n for n in ctx["phones"] + [ctx["sender_contact"]] if n) or "—"
    who = ctx["person"]["name"] if ctx["person"] else ctx["claimed"]
    hashes = "\n".join(f"  {a['name']}  SHA-256 {a['sha256']}" for a in ctx["artifacts"]) or "  (text only)"
    media = "an AI-generated (deepfake) voice or image" if ctx["synthetic"] else "messages"
    tactics = ", ".join(t.replace("_", " ") for t in ctx["tactics"]) or "none recorded"
    out: dict[str, dict] = {}
    out["complaint"] = {"title": "cybercrime.gov.in complaint", "link": "https://cybercrime.gov.in", "text": f"""Category: Online financial fraud / Impersonation using {media}
Incident date and time: {_when(ctx['received_at'])}
Platform / medium: {ctx['channel'].title()} from {ctx['sender_contact'] or 'unknown number'}
Suspect identifiers: phone/handle {numbers}; UPI / account {ids}{'; IFSC ' + ', '.join(ctx['ifsc']) if ctx['ifsc'] else ''}
Amount {'lost' if paid else 'requested'}: {fmt_inr(amount) if amount else '—'}{'; transaction ' + paid['txn'] if paid.get('txn') else ''}{'; paid at ' + _when(paid.get('at')) if paid else ''}

Description:
I received {media} from someone claiming to be {who}. They asked me to {ASKED.get(ctx['action'], 'act')}{' of ' + fmt_inr(ctx['amount_inr']) if ctx['amount_inr'] else ''}{' (deadline: ' + ctx['deadline'] + ')' if ctx['deadline'] else ''}, using pressure tactics ({tactics}). {who} has confirmed they did not send this. MIRAGE case {c.id} analysed the evidence: {ctx['summary'][:400]}

Evidence attached (original files, SHA-256):
{hashes}"""}
    out["call_1930"] = {"title": "1930 call script", "link": "tel:1930", "text": f"""Say: "I want to report a cyber financial fraud{' that happened ' + str(int(v['golden']['minutes'])) + ' minutes ago' if v['golden'] else ''}."
- Amount: {fmt_inr(amount) if amount else 'not yet paid'}{' · transaction ID ' + paid['txn'] if paid.get('txn') else ''}
- Paid to: {paid.get('to') or ids}
- From my bank account / UPI app: (your bank and last 4 digits)
- The fraudster's number: {numbers}
- How: someone impersonating {who} using {media}.
Ask for: the acknowledgement number, and that the beneficiary account be frozen.
Then: give the acknowledgement number to your bank and paste it into the cybercrime.gov.in complaint."""}
    out["bank_recall"] = {"title": "Bank recall request", "text": f"""To: Fraud & Disputes team, (your bank)
Subject: Urgent recall and hold request: fraudulent transfer {paid.get('txn') or ''}

I authorised a transfer under deception (impersonation fraud). Please recall the amount and place a hold on the
beneficiary account immediately.

Amount: {fmt_inr(amount) if amount else '—'}
Date and time: {_when(paid.get('at')) if paid else '—'}
Beneficiary: {paid.get('to') or ids}{' (IFSC ' + ', '.join(ctx['ifsc']) + ')' if ctx['ifsc'] else ''}
Transaction reference: {paid.get('txn') or '—'}
National helpline (1930) acknowledgement: (number)
cybercrime.gov.in complaint: (number)

Evidence and SHA-256 hashes are attached (MIRAGE case {c.id})."""}
    out["chakshu"] = {"title": "Sanchar Saathi · Chakshu report", "link": "https://sancharsaathi.gov.in/sfc/", "text": f"""Medium: {ctx['channel'].title()}
Suspected fraud category: {'Impersonation (deepfake / AI voice)' if ctx['synthetic'] else 'Impersonation'}{' · Digital arrest' if ctx['category'] == 'digital_arrest' else ''}
Number / handle: {numbers}
Date and time: {_when(ctx['received_at'])}
Description: The sender impersonated {who} and asked me to {ASKED.get(ctx['action'], 'act')}. Pressure tactics: {tactics}."""}
    out["cert_in"] = {"title": "CERT-In incident summary", "link": "mailto:incident@cert-in.org.in", "text": f"""Type of incident: Social engineering / impersonation using synthetic media
Organisation: (name, sector)
Date and time of detection: {_when(ctx['received_at'])}
Systems / people affected: {', '.join(x['submitted_by'] for x in v['others']) or 'one employee'}
Indicators: numbers {numbers}; accounts {ids}; URLs {', '.join(ctx['urls']) or '—'}
Actions taken: {', '.join(ACTIONS[a]['title'].lower() for s in v['stages'] for a in [x['id'] for x in s['actions'] if x['status'] == 'done']) or 'none yet'}
Reference: MIRAGE case {c.id}"""}
    out["warn_network"] = {"title": "Warning for your team or family group", "text": f"""⚠️ Scam alert: someone is impersonating {who}{' with an AI-cloned voice' if ctx['synthetic'] else ''}.
They ask you to {ASKED.get(ctx['action'], 'act')}{' (' + fmt_inr(ctx['amount_inr']) + ')' if ctx['amount_inr'] else ''} and push you to hurry and keep it secret.
Do NOT pay or share codes. Numbers / accounts used: {numbers}; {ids}.
If you get this, hang up and call {who} on the number you already have."""}
    q = []
    if ctx["person"] and ctx["person"]["circle"] == "family":
        q.append("What is our family code word?")
    q += [f"I'll call you back on your saved number{' (' + ctx['person']['phone'] + ')' if ctx['person'] else ''}. Is that OK?",
          "What did we last talk about in person?",
          "Which colleague / relative was with us the last time we met?"]
    if ctx["category"] == "payment_fraud":
        q.insert(1, "What is this week's verification phrase?")
        q.append("Can you send the request from the official approval system instead?")
    out["challenge"] = {"title": "Challenge questions", "text": "\n".join(f"{i + 1}. {x}" for i, x in enumerate(q))}
    return out


def evidence_pack(db: Session, c: Case, role: str) -> bytes:
    from . import report
    from .serializers import case_detail

    buf = io.BytesIO()
    manifest = {"case": c.id, "generated": datetime.now(timezone.utc).isoformat(), "audit_head": audit.verify_chain(db).get("head"),
                "files": []}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for a in c.artifacts:
            try:
                z.writestr(f"originals/{a.filename}", path_for(a.storage_key).read_bytes())
                manifest["files"].append({"name": a.filename, "sha256": a.sha256, "bytes": a.size_bytes})
            except FileNotFoundError:
                manifest["files"].append({"name": a.filename, "sha256": a.sha256, "missing": True})
        if c.message_text:
            z.writestr("originals/message.txt", c.message_text)
        if c.verdict:
            z.writestr(f"{c.id}-incident-report.pdf", report.build(case_detail(c), audit_head=manifest["audit_head"] or ""))
        for k, d in drafts(db, c, role).items():
            z.writestr(f"drafts/{k}.txt", d["text"])
        z.writestr("MANIFEST.json", json.dumps(manifest, indent=2))
    return buf.getvalue()

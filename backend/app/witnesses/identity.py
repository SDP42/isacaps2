"""Identity & context witness: checks the request against the Trustbook (org directory + family circle).

Rules mirror how a careful analyst reasons: does the claimed person exist, is this their number or address, do they use
this channel, is it within their hours and authority, is the beneficiary known, have we seen these identifiers in other
cases, and how anomalous is the request versus 12 months of real traffic (Isolation Forest)?
"""
from __future__ import annotations

import difflib
import re
from datetime import datetime

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Beneficiary, Case, Person
from .base import Evidence, Timer, WitnessResult, load_model


def _norm_phone(s: str) -> str:
    d = re.sub(r"\D", "", s or "")
    return d[-10:]


def resolve_person(db: Session, claimed: str, contact: str = "") -> tuple[Person | None, float]:
    """Map 'Rajesh from finance' / 'Papa' / an email to a Trustbook record, with a confidence."""
    people = db.scalars(select(Person)).all()
    if contact:
        ph, low = _norm_phone(contact), contact.lower().strip()
        for p in people:
            if (ph and len(ph) == 10 and _norm_phone(p.phone) == ph) or (p.email and p.email.lower() == low):
                return p, 1.0
    if not claimed:
        return None, 0.0
    c = claimed.lower()
    best, best_s = None, 0.0
    for p in people:
        for cand in [p.name, p.role, *p.aliases]:
            cl = cand.lower()
            if cl and (re.search(rf"\b{re.escape(cl)}\b", c) or re.search(rf"\b{re.escape(c)}\b", cl)):
                s = 0.95 if cl == c or cl == p.name.lower() else 0.85
            else:
                s = difflib.SequenceMatcher(None, c, cl).ratio() * 0.9
            if s > best_s:
                best, best_s = p, s
    return (best, best_s) if best_s >= 0.6 else (None, best_s)


def analyse(db: Session, case: Case, request: dict, voice_details: dict | None = None,
            style_drift: float | None = None) -> WitnessResult:
    res = WitnessResult(witness="identity", model_version="trustbook-rules@1.0 + isoforest@1.0")
    with Timer() as t:
        person, conf = resolve_person(db, case.claimed_sender, case.sender_contact)
        action = request.get("action", "none")
        amount = request.get("amount_inr") or 0
        ents = request.get("entities", {})
        hour = (case.received_at or case.created_at or datetime.now()).hour
        ev: list[Evidence] = []

        if case.claimed_sender and not person:
            ev.append(Evidence(witness="identity", kind="unknown_sender", label="not in Trustbook", severity=2,
                               observed=case.claimed_sender, detail=f"No Trustbook record matches “{case.claimed_sender}”."))
        if person:
            res.details["resolved"] = {"id": person.id, "name": person.name, "role": person.role, "circle": person.circle,
                                       "confidence": round(conf, 2), "directory_phone": person.phone,
                                       "approval_limit_inr": person.approval_limit_inr}
            contact = case.sender_contact.strip()
            if contact:
                known = {_norm_phone(person.phone), (person.email or "").lower()}
                if _norm_phone(contact) not in known and contact.lower() not in known:
                    ev.append(Evidence(
                        witness="identity", kind="contact_mismatch", label="number/address not on record", severity=3,
                        expected=f"{person.phone or person.email} (Trustbook)", observed=contact,
                        detail=f"The message came from {contact}, which is not {person.name}'s saved contact."))
                else:
                    ev.append(Evidence(witness="identity", kind="contact_match", label="contact matches record", severity=0,
                                       exculpatory=True, detail=f"{contact} matches {person.name}'s Trustbook entry. "
                                       "Caller ID and display names can still be spoofed."))
            if case.channel and case.channel != "unknown" and case.channel not in person.usual_channels:
                ev.append(Evidence(
                    witness="identity", kind="unusual_channel", label="unusual channel", severity=2,
                    expected=", ".join(person.usual_channels), observed=case.channel,
                    detail=f"{person.name} does not normally use {case.channel}"
                           + (f" for {action} requests." if action != "none" else ".")))
            lo, hi = person.usual_hours
            if not (lo <= hour < hi):
                ev.append(Evidence(witness="identity", kind="out_of_hours", label="out of hours", severity=1,
                                   expected=f"{lo:02d}:00–{hi:02d}:00", observed=f"{hour:02d}:00",
                                   detail="The request arrived outside the sender's usual working hours."))
            if action == "payment" and person.circle == "org" and amount:
                if amount > person.approval_limit_inr:
                    ev.append(Evidence(
                        witness="identity", kind="above_authority", label="above approval limit", severity=3,
                        expected=f"≤ ₹{person.approval_limit_inr:,}", observed=f"₹{amount:,}",
                        detail=f"{person.name} cannot approve this amount alone; policy requires a second approver."))
            if action in ("credential", "remote_access") and person.circle == "org":
                ev.append(Evidence(witness="identity", kind="credential_policy", label="policy: never share credentials",
                                   severity=3, detail="IT never asks for OTPs, passwords or remote-access codes by message or call."))
            if person.circle == "family" and action == "payment":
                ev.append(Evidence(witness="identity", kind="family_code_word", label="family code word available",
                                   severity=1, detail=f"A family code word is set for {person.name}; ask for it before paying."
                                   if person.code_word_set else "No family code word set yet."))
            if style_drift is not None and person.style_profile:
                res.details["style_drift"] = round(style_drift, 3)

        # beneficiary memory
        ids = ents.get("upi", []) + ents.get("account", []) + ents.get("iban", [])
        ben_states = []
        for ident in ids:
            b = db.scalar(select(Beneficiary).where(Beneficiary.identifier == ident))
            if b is None:
                ben_states.append((ident, "new"))
                if action == "payment":
                    ev.append(Evidence(witness="identity", kind="new_beneficiary", label="new beneficiary", severity=3,
                                       observed=ident, detail=f"{ident} has never been paid before."))
            elif b.trust_level == "flagged":
                ben_states.append((ident, "flagged"))
                ev.append(Evidence(witness="identity", kind="flagged_beneficiary", label="flagged beneficiary", severity=3,
                                   observed=ident, detail=f"{ident} was reported in an earlier confirmed fraud case."))
            else:
                ben_states.append((ident, b.trust_level))
                ev.append(Evidence(witness="identity", kind="known_beneficiary", label="known beneficiary", severity=0,
                                   exculpatory=True, detail=f"{ident} is a trusted, previously paid beneficiary ({b.label})."))
        res.details["beneficiaries"] = [{"id": i, "state": s} for i, s in ben_states]

        # pattern memory: same identifiers in other cases
        repeats = []
        if ids or case.sender_contact:
            needles = ids + ([case.sender_contact] if case.sender_contact else [])
            others = db.scalars(select(Case).where(Case.id != case.id)).all()
            for o in others:
                blob = f"{o.message_text} {o.sender_contact}"
                hit = [n for n in needles if n and n in blob]
                if hit:
                    repeats.append({"case_id": o.id, "matches": hit, "outcome": o.outcome})
        fraud = [r for r in repeats if r["outcome"] == "confirmed_fraud"]
        if fraud:
            ev.append(Evidence(witness="identity", kind="linked_confirmed_fraud", label="linked to confirmed fraud", severity=3,
                               observed=", ".join(sorted({m for r in fraud for m in r["matches"]}))[:120],
                               detail=f"These identifiers were used in {len(fraud)} case(s) already confirmed as fraud: "
                                      + ", ".join(r["case_id"] for r in fraud[:4]) + "."))
        elif repeats:
            ev.append(Evidence(witness="identity", kind="pattern_repeat", label="seen in other cases", severity=2,
                               detail=f"The same identifiers appear in {len(repeats)} other case(s): "
                                      + ", ".join(r["case_id"] for r in repeats[:4]) + "."))
        res.details["pattern_matches"] = repeats[:6]

        # request anomaly vs 12 months of history
        anomaly = None
        if person and action != "none":
            from ml.synth_org import request_vector

            bundle = load_model("request_anomaly.joblib")
            age = 0 if any(s == "new" for _, s in ben_states) else 400
            v = request_vector(case.channel, action, amount, hour, age, person.usual_channels, person.usual_hours,
                               max(person.approval_limit_inr, 1))
            raw = float(-bundle["model"].score_samples(np.array([v]))[0])
            anomaly = float(np.clip((raw - bundle["lo"]) / (bundle["hi"] - bundle["lo"] + 1e-9), 0, 1))
            res.details["request_anomaly"] = round(anomaly, 3)
            if anomaly > 0.6:
                ev.append(Evidence(witness="identity", kind="request_anomaly", label="anomalous request", score=round(anomaly, 2),
                                   severity=2, detail=f"Anomaly {anomaly:.2f} against 12 months of this organisation's requests."))

    if voice_details and voice_details.get("voiceprint_similarity") is not None:
        res.details["voiceprint_similarity"] = voice_details["voiceprint_similarity"]

    res.evidence = ev
    sev = [e.severity for e in ev if not e.exculpatory]
    # noisy-OR of rule severities: one strong flag dominates, many weak flags saturate slowly
    p = 1.0
    for s in sev:
        p *= 1 - {0: 0.0, 1: 0.12, 2: 0.3, 3: 0.55}[s]
    score = 1 - p
    if anomaly is not None:
        score = 1 - (1 - score) * (1 - 0.3 * anomaly)
    res.score = round(float(score), 4) if (case.claimed_sender or ids or person) else None
    if res.score is None:
        res.status = "not_applicable"
        res.summary = "No claimed sender, contact or beneficiary to check against the Trustbook."
        return res
    res.confidence = round(0.85 if person else 0.55, 3)
    res.latency_ms = t.ms
    n = len(sev)
    res.summary = (f"{'Matched ' + person.name + ' (' + person.role + ')' if person else 'Sender not resolved'}; "
                   f"{n} context flag{'s' if n != 1 else ''}"
                   + (f", request anomaly {anomaly:.2f}" if anomaly is not None else "") + ".")
    return res

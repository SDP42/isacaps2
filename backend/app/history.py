"""Populate a realistic case history on first start so the dashboard, graphs and campaigns show real pipeline output.

Every historical case runs through the full pipeline (no hand-written verdicts). One linked cross-channel campaign is
included: email → WhatsApp → voice call → video meeting → payment request, sharing a mule account and phone number.
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from ml import synth_text
from . import pipeline
from .db import session_scope
from .models import Case
from .samples import SAMPLES_DIR, SCENARIOS, ensure_samples
from .security import Principal

log = logging.getLogger("mirage.history")

SENDERS = {
    "ceo_fraud": [("Rajesh Mehta (CFO)", "whatsapp", "+91 93321 45008"), ("Ashok Raman", "sms", "+91 81234 77120")],
    "vendor_bec": [("Zenith Logistics accounts", "email", "accounts@zenith-logistic.co")],
    "credential": [("IT helpdesk", "phone", "+91 88002 31109"), ("IT Service Desk", "email", "it-helpdesk@acme-reset.org")],
    "family_emergency": [("Papa", "whatsapp", "+91 73040 99812"), ("Bhaiya", "whatsapp", "+91 99001 22113")],
    "digital_arrest": [("Inspector Sharma", "video", "+91 90011 22334")],
    "kyc": [("SBI Alerts", "sms", "+91 60011 00110")],
    "job_reward": [("HR Recruiter", "whatsapp", "+91 77889 66554")],
    "work": [("Priya Nair", "teams", ""), ("Ananya Iyer", "email", "ananya.iyer@acmefintech.in"),
             ("Rajesh Mehta", "email", "rajesh.mehta@acmefintech.in")],
    "personal": [("Mummy", "whatsapp", "+91 98920 45111"), ("Rohan Panchal", "whatsapp", "+91 98920 45112")],
    "service": [("", "sms", "")],
}

CAMPAIGN = [
    ("email", "Orbit Supplies billing", "billing@orbit-supp1ies.com",
     "Dear Accounts, our bank details have changed due to an audit. The new account is 600112233445 IFSC ICIC0007890. "
     "The CFO will confirm on WhatsApp today.", None, 26),
    ("whatsapp", "Rajesh Mehta (CFO)", "+91 70451 88213",
     "Hi Kavita, Rajesh here, can't talk, in a board meeting. Orbit's new account 600112233445 is correct, please "
     "update it today. Keep this between us until the audit closes.", None, 25),
    ("phone", "Rajesh Mehta (CFO)", "+91 70451 88213",
     "Voice call: confirming the Orbit change, please release the pending ₹9,80,000 to 600112233445 urgently.",
     "cfo_voice_note.wav", 24),
    ("video", "Ashok Raman (CEO)", "+91 70451 88213",
     "Video meeting: the CEO and CFO ask to move ₹48,50,000 to 600112233445 today for a confidential settlement. Do not "
     "discuss with anyone in finance.", "ceo_meeting.mp4", 23),
    ("email", "Rajesh Mehta (CFO)", "rajesh.mehta@acme-fintech-pay.in",
     "Final payment request: wire ₹48,50,000 to account 600112233445 before 4 PM. Approvals will follow, don't loop in audit.",
     None, 22),
]


def _when(days_ago: float, hour: int | None = None) -> datetime:
    t = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return t.replace(hour=hour if hour is not None else random.randint(8, 22), minute=random.randint(0, 59))


def populate() -> None:
    from .routers.cases import create_case

    with session_scope() as db:
        if db.scalar(select(func.count(Case.id))):
            return
    random.seed(2026)
    ensure_samples()
    analyst = Principal(persona_id="analyst", name="Shreyas Kale", role="analyst")
    employee = Principal(persona_id="employee", name="Kavita Shah", role="employee")
    ids: list[str] = []
    data = synth_text.generate(n_per_family=6, seed=99)
    for i, s in enumerate(data[:44]):
        sender, channel, contact = random.choice(SENDERS.get(s.family, [("", "unknown", "")]))
        with session_scope() as db:
            c = create_case(db, random.choice([analyst, employee]), [], s.text, sender, channel, contact,
                            _when(random.uniform(0.2, 29)))
            ids.append(c.id)
    for i, (channel, sender, contact, text, fname, days) in enumerate(CAMPAIGN):
        files = [(fname, (SAMPLES_DIR / fname).read_bytes())] if fname else []
        with session_scope() as db:
            c = create_case(db, analyst, files, text, sender, channel, contact, _when(days, 11 + i * 2),
                            title=f"Campaign stage {i + 1}: {channel} from {sender}",
                            transcripts={fname: text} if fname else None)
            ids.append(c.id)
    for sc in SCENARIOS[:4]:
        files = [(f, (SAMPLES_DIR / f).read_bytes()) for f in sc.files]
        with session_scope() as db:
            c = create_case(db, analyst, files, sc.message, sc.claimed_sender, sc.channel, sc.sender_contact,
                            _when(random.uniform(1, 12), sc.received_hour), title=f"Scenario {sc.code} · {sc.title}",
                            scenario=sc.key)
            ids.append(c.id)
    for cid in ids:
        pipeline.run_case(cid, pace=0.0)
    # analysts closed a few of the older ones
    with session_scope() as db:
        for c in db.scalars(select(Case).where(Case.status == "complete")):
            if c.verdict and random.random() < 0.35:
                c.closed = True
                c.outcome = "confirmed_fraud" if c.verdict.band == "HIGH" else "verified_genuine"
    log.info("history populated with %d cases", len(ids))

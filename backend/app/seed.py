"""Seed the database: personas, the Acme Fintech Trustbook, the family circle, beneficiaries, 12 months of request
history, enrolled voiceprints and writing-style baselines. Idempotent."""
from __future__ import annotations

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ml import synth_audio, synth_org
from .models import Beneficiary, Organization, Persona, Person, RequestLog
from .witnesses import dsp
from .witnesses.words import style_features

PERSONAS = [
    Persona(id="analyst", name="Shreyas Kale", role="analyst", title="Security Analyst · SOC",
            blurb="Investigates escalated cases, runs the Tribunal and the Casebook, closes cases.", accent="cyan"),
    Persona(id="employee", name="Kavita Shah", role="employee", title="Accounts Payable Lead · Finance",
            blurb="Receives payment requests. Checks a message before acting and follows the verification plan.",
            accent="violet"),
    Persona(id="admin", name="Vikram Desai", role="admin", title="Head of IT · Administrator",
            blurb="Manages the Trustbook, voiceprints, policies, model registry and the audit chain.", accent="silver"),
    Persona(id="family", name="Lata Panchal", role="family", title="Personal Safety · Home",
            blurb="Forwards a suspicious call or voice note and gets one plain answer and one next step.", accent="amber"),
]

STYLE_SAMPLES = {
    "cfo": ["Hi Kavita, please route the Orbit invoice through the portal for approval. Thanks, Rajesh.",
            "Team, the Q3 numbers look good. Let's review the variance in Thursday's meeting. Regards, Rajesh.",
            "Please ensure all vendor payments above the limit go through dual approval as per policy. Thanks."],
    "ceo": ["Dear all, thank you for a strong quarter. Our townhall is on Friday. Best, Ashok.",
            "Please share the board deck by Wednesday evening. Regards, Ashok."],
    "fin_ctrl": ["Hi Kavita, please pay the approved Orbit invoice in Friday's run. Thanks.",
                 "Please reconcile the September vendor ledger by Monday. Thanks, Priya."],
    "papa": ["Beta khana kha liya? Call karna jab free ho.", "Ghar aate waqt doodh le aana. Papa."],
}


def _voiceprint(seed: int) -> list[float]:
    spk = synth_audio.Speaker.random(np.random.default_rng(seed))
    rng = np.random.default_rng(seed * 7 + 1)
    embs = [dsp.speaker_embedding(synth_audio.make_clip(rng, False, 4.0, spk)) for _ in range(3)]
    v = np.mean(embs, axis=0)
    return [round(float(x), 5) for x in v / (np.linalg.norm(v) + 1e-9)]


def _style(texts: list[str]) -> dict:
    feats = [style_features(t) for t in texts]
    return {k: round(float(np.mean([f[k] for f in feats])), 4) for k in feats[0]}


def seed(db: Session) -> bool:
    if db.scalar(select(func.count(Person.id))):
        return False
    for p in PERSONAS:
        db.merge(p)
    org = Organization(name="Acme Fintech Pvt Ltd", domain="acmefintech.in", policy_json={
        "dual_approval_above_inr": 1_000_000, "new_beneficiary_hold_hours": 24,
        "executives_never_use": ["whatsapp", "sms"], "code_words": True,
    })
    db.add(org)
    db.flush()

    specs = synth_org.build_people()
    key_to_id: dict[str, int] = {}
    enrolled = {"ceo", "cfo", "fin_ctrl", "ap_lead", "it_head", "helpdesk", "hr_dir", "analyst", "papa", "mummy", "bro"}
    for s in specs:
        p = Person(
            org_id=org.id if s.circle == "org" else None, circle=s.circle, name=s.name, aliases=s.aliases, role=s.role,
            department=s.department, email=s.email, phone=s.phone, approval_limit_inr=s.approval_limit_inr,
            usual_channels=s.usual_channels, usual_hours=s.usual_hours, code_word_set=s.code_word_set,
            voiceprint=_voiceprint(s.voice_seed) if s.key in enrolled else None,
            style_profile=_style(STYLE_SAMPLES[s.key]) if s.key in STYLE_SAMPLES else None,
        )
        db.add(p)
        db.flush()
        key_to_id[s.key] = p.id
    for s in specs:
        if s.reports_to:
            db.get(Person, key_to_id[s.key]).reports_to = key_to_id[s.reports_to]

    for label, ident, kind in synth_org.TRUSTED_BENEFICIARIES:
        db.add(Beneficiary(label=label, identifier=ident, kind=kind, trust_level="trusted",
                           linked_person_id=key_to_id["papa"] if "Papa" in label else None))
    db.add(Beneficiary(label="Reported mule account", identifier="safeacct.rbi@oksbi", kind="upi", trust_level="flagged"))

    for r in synth_org.request_logs(specs):
        db.add(RequestLog(person_id=key_to_id[r["person_key"]], channel=r["channel"], action=r["action"],
                          amount_inr=r["amount_inr"], hour=r["hour"], beneficiary_age_days=r["beneficiary_age_days"],
                          is_attack=r["is_attack"], ts=r["ts"]))
    db.commit()
    return True

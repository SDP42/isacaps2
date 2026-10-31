"""Simulated organisation "Acme Fintech Pvt Ltd": 60 people, reporting lines, approval limits, usual channels and hours,
known beneficiaries, a family circle, and 12 months of internal request logs with injected impersonation attacks.

Deterministic (seeded) so the seed data, the anomaly model and the demo scenarios always agree.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import numpy as np

CHANNELS = ["email", "teams", "phone", "whatsapp", "sms", "video", "portal"]
ACTIONS = ["payment", "data", "info", "access", "credential"]

FIRST = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Ayaan", "Krishna", "Ishaan", "Shaurya",
         "Atharv", "Ananya", "Diya", "Isha", "Kavya", "Meera", "Nisha", "Pooja", "Riya", "Saanvi", "Tara", "Zoya",
         "Farhan", "Imran", "Kabir", "Neel", "Om", "Parth", "Rahul", "Sameer", "Tanvi", "Uma", "Varun", "Yash",
         "Gauri", "Harsh", "Jaya", "Lakshmi", "Mohit", "Naina", "Pranav", "Radhika", "Siddharth", "Trisha",
         "Ujjwal", "Vedika", "Waqar", "Yamini", "Zubin", "Chirag", "Deepa", "Esha", "Gaurav", "Hema", "Jatin"]
LAST = ["Sharma", "Iyer", "Nair", "Patel", "Reddy", "Kulkarni", "Joshi", "Menon", "Desai", "Kapoor", "Verma",
        "Shah", "Rao", "Chopra", "Bose", "Ghosh", "Pillai", "Gupta", "Malhotra", "Saxena"]


@dataclass
class PersonSpec:
    key: str
    name: str
    role: str
    department: str
    email: str
    phone: str
    reports_to: str | None
    approval_limit_inr: int
    usual_channels: list[str]
    usual_hours: list[int]
    circle: str = "org"
    aliases: list[str] = field(default_factory=list)
    voice_seed: int = 0
    code_word_set: bool = False


# Named people used by the demo scenarios. Keys are stable.
EXEC = [
    PersonSpec("ceo", "Ashok Raman", "CEO", "Executive", "ashok.raman@acmefintech.in", "+91 98200 11001", None,
               20_000_000, ["email", "video", "phone"], [8, 21], aliases=["Ashok", "Raman sir", "CEO"], voice_seed=101),
    PersonSpec("cfo", "Rajesh Mehta", "CFO", "Finance", "rajesh.mehta@acmefintech.in", "+91 98200 11002", "ceo",
               10_000_000, ["email", "teams", "phone"], [9, 20], aliases=["Rajesh", "R. Mehta", "Mehta sir", "CFO"],
               voice_seed=102, code_word_set=True),
    PersonSpec("fin_ctrl", "Priya Nair", "Financial Controller", "Finance", "priya.nair@acmefintech.in",
               "+91 98200 11003", "cfo", 2_500_000, ["email", "teams", "portal"], [9, 19], aliases=["Priya"],
               voice_seed=103),
    PersonSpec("ap_lead", "Kavita Shah", "Accounts Payable Lead", "Finance", "kavita.shah@acmefintech.in",
               "+91 98200 11004", "fin_ctrl", 500_000, ["email", "portal", "teams"], [9, 18], aliases=["Kavita"],
               voice_seed=104),
    PersonSpec("it_head", "Vikram Desai", "Head of IT", "IT", "vikram.desai@acmefintech.in", "+91 98200 11005",
               "ceo", 0, ["email", "teams", "portal"], [9, 19], aliases=["Vikram", "IT head"], voice_seed=105),
    PersonSpec("helpdesk", "IT Service Desk", "Service Desk", "IT", "servicedesk@acmefintech.in", "+91 22 4000 1000",
               "it_head", 0, ["portal", "email", "phone"], [8, 22], aliases=["IT helpdesk", "IT support", "IT team"],
               voice_seed=106),
    PersonSpec("hr_dir", "Ananya Iyer", "HR Director", "HR", "ananya.iyer@acmefintech.in", "+91 98200 11007", "ceo",
               300_000, ["email", "teams"], [9, 18], aliases=["Ananya"], voice_seed=107),
    PersonSpec("analyst", "Shreyas Kale", "Security Analyst", "Security", "shreyas.kale@acmefintech.in",
               "+91 98200 11008", "it_head", 0, ["email", "teams", "phone"], [9, 21], aliases=["Shreyas"],
               voice_seed=108),
]

FAMILY = [
    PersonSpec("papa", "Suresh Panchal", "Father", "Family", "", "+91 98920 45110", None, 0,
               ["phone", "whatsapp"], [7, 22], circle="family", aliases=["Papa", "Dad", "Pappa"], voice_seed=201,
               code_word_set=True),
    PersonSpec("mummy", "Lata Panchal", "Mother", "Family", "", "+91 98920 45111", None, 0, ["phone", "whatsapp"],
               [7, 22], circle="family", aliases=["Mummy", "Mom", "Maa"], voice_seed=202, code_word_set=True),
    PersonSpec("bro", "Rohan Panchal", "Brother", "Family", "", "+91 98920 45112", None, 0,
               ["whatsapp", "phone"], [9, 24], circle="family", aliases=["Bhaiya", "Rohan"], voice_seed=203),
]

TRUSTED_BENEFICIARIES = [
    ("Orbit Supplies (vendor)", "50200011223344", "account"),
    ("Sunrise Exports (vendor)", "00401100223355", "account"),
    ("BlueLine Consulting (vendor)", "blueline.billing@okhdfcbank", "upi"),
    ("Acme payroll pool", "acmepayroll@icici", "upi"),
    ("Papa savings", "suresh.panchal@oksbi", "upi"),
]


def build_people(seed: int = 42) -> list[PersonSpec]:
    rng = random.Random(seed)
    people = list(EXEC)
    depts = [("Finance", "fin_ctrl", "Finance Associate", 100_000), ("IT", "it_head", "Systems Engineer", 0),
             ("HR", "hr_dir", "HR Associate", 0), ("Operations", "ceo", "Operations Manager", 200_000),
             ("Sales", "ceo", "Account Executive", 0), ("Security", "it_head", "SOC Engineer", 0)]
    used = {p.name for p in people}
    i = 0
    while len(people) < 60:
        dept, mgr, role, limit = depts[i % len(depts)]
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        if name in used:
            continue
        used.add(name)
        key = f"emp{i:02d}"
        people.append(PersonSpec(
            key, name, role, dept, f"{name.lower().replace(' ', '.')}@acmefintech.in",
            f"+91 9{rng.randint(100000000, 999999999)}", mgr, limit,
            rng.sample(["email", "teams", "portal", "phone"], 2), [9, 19], voice_seed=300 + i,
        ))
        i += 1
    return people + FAMILY


def request_logs(people: list[PersonSpec], months: int = 12, seed: int = 7) -> list[dict]:
    """Generate normal request traffic plus ~2% injected attacks (odd channel/hour, new beneficiary, big amount)."""
    rng = np.random.default_rng(seed)
    org = [p for p in people if p.circle == "org"]
    start = datetime(2025, 11, 1, tzinfo=timezone.utc)
    rows: list[dict] = []
    days = months * 30
    for d in range(days):
        day = start + timedelta(days=d)
        if day.weekday() >= 5 and rng.random() < 0.7:
            continue
        for _ in range(rng.poisson(14)):
            p = org[rng.integers(len(org))]
            attack = rng.random() < 0.02
            if attack:
                victim = rng.choice([x for x in org if x.approval_limit_inr > 0] or org)
                rows.append(dict(
                    person_key=victim.key, channel=str(rng.choice(["whatsapp", "sms", "phone", "video"])),
                    action=str(rng.choice(["payment", "payment", "credential", "access"])),
                    amount_inr=int(rng.choice([0, 1]) * 0 + rng.uniform(4e5, 6e6)),
                    hour=int(rng.choice([7, 8, 13, 19, 20, 21, 22])), beneficiary_age_days=int(rng.integers(0, 3)),
                    is_attack=True, ts=day + timedelta(hours=int(rng.integers(0, 23))),
                ))
                continue
            action = str(rng.choice(ACTIONS[:3], p=[0.35, 0.25, 0.4]))
            limit = max(p.approval_limit_inr, 50_000)
            amount = int(rng.lognormal(np.log(limit * 0.15), 0.8)) if action == "payment" else 0
            lo, hi = p.usual_hours
            rows.append(dict(
                person_key=p.key, channel=str(rng.choice(p.usual_channels)), action=action,
                amount_inr=min(amount, limit), hour=int(rng.integers(lo, hi)),
                beneficiary_age_days=int(rng.integers(60, 1500)) if action == "payment" else 365,
                is_attack=False, ts=day + timedelta(hours=int(rng.integers(lo, hi))),
            ))
    return rows


def request_vector(channel: str, action: str, amount_inr: int, hour: int, beneficiary_age_days: int,
                   usual_channels: list[str], usual_hours: list[int], approval_limit: int) -> list[float]:
    lo, hi = usual_hours
    out_of_hours = 0.0 if lo <= hour < hi else min(abs(hour - lo), abs(hour - hi)) / 6
    return [
        0.0 if channel in usual_channels else 1.0,
        out_of_hours,
        float(np.log10(amount_inr + 1)),
        float(amount_inr / max(approval_limit, 1)) if amount_inr else 0.0,
        float(np.exp(-beneficiary_age_days / 30)),
        1.0 if action in ("payment", "credential", "access") else 0.0,
    ]

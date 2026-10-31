"""After detection: what to do now.

Turns a verdict (synthetic or not, what was asked, which tactics) into an ordered emergency response: what to do in the
next minute, what to say to the caller, who to call, what to do if money already moved (the 1930 golden hour), and
what evidence to keep. Indian reporting channels first, because PS-02 targets Indian users and organisations.
"""
from __future__ import annotations

HELPLINES = {
    "1930": {"label": "National Cyber Crime Helpline 1930", "href": "tel:1930",
             "why": "Reported within the golden hour, money still in transit can be frozen across banks."},
    "portal": {"label": "cybercrime.gov.in", "href": "https://cybercrime.gov.in",
               "why": "File the complaint with the MIRAGE report attached (hashes, timestamps, transcript)."},
    "bank": {"label": "Your bank's fraud line", "href": None,
             "why": "Ask for a recall or hold on the transaction and block the beneficiary."},
    "sancharsaathi": {"label": "Sanchar Saathi · Chakshu", "href": "https://sancharsaathi.gov.in",
                      "why": "Report the fraudulent number or WhatsApp account so it is blocked for others."},
    "cert_in": {"label": "CERT-In · incident@cert-in.org.in", "href": "mailto:incident@cert-in.org.in",
                "why": "Organisations must report cyber incidents to CERT-In within 6 hours."},
    "soc": {"label": "Your security / IT team", "href": None,
            "why": "They can block the sender, reset accounts and warn colleagues targeted by the same campaign."},
}

CATEGORIES = {
    "payment_fraud": "Payment fraud · executive / vendor impersonation",
    "credential_theft": "Credential theft · OTP, password or PIN",
    "remote_access": "Remote-access scam · screen-sharing app",
    "digital_arrest": "Digital arrest · fake police or agency",
    "family_emergency": "Family emergency scam",
    "reward_scam": "Prize, refund, job or investment lure",
    "data_theft": "Sensitive data request",
    "synthetic_benign": "Synthetic media, harmless request",
    "benign": "No scam pattern",
}


def categorise(action: str, tactics: set[str], text: str = "", circle: str | None = None) -> str:
    t = text.lower()
    if {"fear", "authority"} <= tactics and any(k in t for k in ("arrest", "cbi", "police", "customs", "court", "narcotics", "warrant")):
        return "digital_arrest"
    if action == "credential":
        return "credential_theft"
    if action == "remote_access":
        return "remote_access"
    if action == "payment":
        if circle == "family" or any(k in t for k in ("papa", "mummy", "beta", "accident", "hospital", "mom", "dad")):
            return "family_emergency"
        return "payment_fraud"
    if "reward" in tactics:
        return "reward_scam"
    if action == "data":
        return "data_theft"
    return "benign"


def build(category: str, severity: str, synthetic: bool | None, *, claimed: str | None = None, org: bool = False) -> dict:
    """Emergency response card. severity: CRITICAL | HIGH | MEDIUM | LOW | INCONCLUSIVE."""
    who = claimed or "the person they claim to be"
    say = "I'll call you back on your saved number." if category != "digital_arrest" else \
        "I will verify this at my nearest police station. I'm ending this call."
    now: list[str] = []
    dont: list[str] = []
    if severity in ("CRITICAL", "HIGH"):
        now += ["Stop. Do not pay, share a code or install anything while you are on this call or chat.",
                f"Hang up or stop replying, then contact {who} on a number you already have (not the one that reached you)."]
        dont += ["Do not call back the number or click links in the message.",
                 "Do not stay on a video call because you are told not to disconnect."]
    elif severity == "MEDIUM":
        now += [f"Pause and verify with {who} on a number you already have before acting."]
    elif severity == "INCONCLUSIVE":
        now += ["The evidence is thin. A 30-second call on a known number settles it."]
    else:
        now += ["Nothing here asks you to act. Stay alert if a follow-up request for money or codes arrives."]

    extra = {
        "payment_fraud": (["Freeze the payment and ask a second approver to confirm through the vendor master or CFO office."],
                          ["Do not accept 'new bank details' over chat, email or a voice note."]),
        "credential_theft": (["Never read out an OTP: banks and IT never ask for one. If you already did, change the password and call the bank now."],
                             ["Do not approve unexpected login or MFA prompts."]),
        "remote_access": (["If an app like AnyDesk is installed, disconnect from the internet and uninstall it; change banking passwords from another device."], []),
        "digital_arrest": (["No Indian agency arrests or collects deposits over a video call. End the call and report the number on Sanchar Saathi."],
                           ["Do not transfer money to 'verify' or 'protect' your account."]),
        "family_emergency": (["Ask the family code word or a question only they can answer, then call them or another relative directly."],
                             ["Do not send money to a new number or UPI ID because of a voice alone."]),
        "reward_scam": (["Legitimate prizes, refunds and jobs never ask for a fee first."], ["Do not pay a 'processing' or 'registration' fee."]),
        "data_theft": (["Confirm the request through your manager or the official portal before sharing any records."], []),
    }.get(category, ([], []))
    if severity in ("CRITICAL", "HIGH", "MEDIUM"):
        now += extra[0]
        dont += extra[1]
    if synthetic:
        now.append("The voice or face is machine-generated. A familiar voice is no longer proof of identity.")

    report = []
    if severity in ("CRITICAL", "HIGH"):
        report = ["sancharsaathi", "1930", "portal"] + (["soc", "cert_in"] if org else [])
    if_paid = [
        "Call 1930 now: the first hour decides whether money in transit can be frozen.",
        "Call your bank's fraud line and ask for a recall or hold on the beneficiary.",
        "Block UPI and change PINs and banking passwords from a different device.",
        "File at cybercrime.gov.in with the MIRAGE report; note the transaction ID and time.",
        "Tell a family member or your manager: attackers depend on secrecy.",
    ]
    preserve = ["Keep the original audio, video, screenshots and chat (do not delete or forward-edit them).",
                "MIRAGE has recorded SHA-256 hashes; download the incident report for the complaint."]
    headline = {
        "CRITICAL": "Stop: this matches an active scam pattern",
        "HIGH": "High risk: verify before you act",
        "MEDIUM": "Be careful: verify first",
        "INCONCLUSIVE": "Not enough evidence: verify anyway",
        "LOW": "No action needed",
    }.get(severity, "Verify first")
    return {"severity": severity, "category": category, "category_label": CATEGORIES.get(category, category),
            "headline": headline, "do_now": now, "dont": dont, "say_this": say if severity in ("CRITICAL", "HIGH", "MEDIUM") else None,
            "report_to": [{"id": k, **HELPLINES[k]} for k in report], "if_paid": if_paid if severity != "LOW" else [],
            "preserve": preserve if severity in ("CRITICAL", "HIGH") else []}

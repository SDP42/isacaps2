"""Verify-before-you-act playbooks. The Verifier agent picks steps from here; every step routes the user to an
independent, pre-trusted channel instead of replying to the suspicious one."""
from __future__ import annotations

STEPS: dict[str, dict] = {
    "do_not_reply": {"title": "Do not reply on this channel", "why": "Replying confirms you are engaged and keeps you inside the attacker's channel."},
    "hold_payment": {"title": "Freeze the payment", "why": "Nothing irreversible happens while you verify."},
    "call_directory": {"title": "Call {name} on the Trustbook number", "why": "Use {phone}, never the number that contacted you."},
    "ask_code_word": {"title": "Ask for the code word", "why": "A clone cannot know a phrase shared in person."},
    "rotating_phrase": {"title": "Ask this week's verification phrase", "why": "Executives receive a rotating phrase out of band."},
    "second_approver": {"title": "Get a second approver", "why": "Payments above the requester's limit need dual approval by policy."},
    "verify_beneficiary": {"title": "Verify the beneficiary independently", "why": "Confirm new bank details through the vendor master and a known contact."},
    "never_share_otp": {"title": "Never share the OTP or password", "why": "IT and banks never ask for one-time codes."},
    "official_portal": {"title": "Use the official IT portal", "why": "Raise a ticket at the service desk instead of following the message."},
    "hang_up": {"title": "End the call", "why": "Indian agencies do not conduct 'digital arrests' or ask for deposits on video calls."},
    "report_1930": {"title": "Report to 1930 / cybercrime.gov.in", "why": "The national helpline can freeze money in transit if reported quickly."},
    "escalate_soc": {"title": "Escalate to the security team", "why": "The case is pre-filled with evidence and hashes."},
    "preserve_evidence": {"title": "Preserve the evidence", "why": "Keep the original files; MIRAGE has recorded their SHA-256 hashes."},
    "no_action": {"title": "No action needed", "why": "Nothing here asks you to act. Stay alert if a follow-up request arrives."},
    "verify_anyway": {"title": "Verify anyway", "why": "The evidence is thin. A quick call on a known number settles it."},
}

ALREADY_PAID = [
    {"id": "call_1930", "title": "Call 1930 immediately", "why": "The golden hour matters: banks can freeze funds still in transit."},
    {"id": "call_bank", "title": "Call your bank's fraud line", "why": "Ask them to recall or freeze the transaction and block the beneficiary."},
    {"id": "file_complaint", "title": "File at cybercrime.gov.in", "why": "Attach the MIRAGE incident report; it lists hashes and timestamps."},
    {"id": "freeze_upi", "title": "Freeze UPI and change PINs", "why": "Stop any follow-on debits from the same device or app."},
    {"id": "tell_family", "title": "Tell your family or manager", "why": "Attackers rely on secrecy; telling someone breaks the script."},
    {"id": "preserve", "title": "Keep every message and file", "why": "Do not delete chats; screenshots and originals help investigators."},
]


def plan(band: str, action: str, rule: str | None, tactics: set[str], identity_kinds: set[str], person: dict | None,
         scenario_hint: str | None = None) -> list[dict]:
    ids: list[str] = []
    if band == "INCONCLUSIVE":
        ids = ["verify_anyway", "call_directory" if person else "do_not_reply", "preserve_evidence"]
    elif band == "LOW" and action in ("none", "info"):
        ids = ["no_action"]
    else:
        ids.append("do_not_reply")
        if action == "payment":
            ids.append("hold_payment")
        if action in ("credential", "remote_access"):
            ids += ["never_share_otp", "official_portal"]
        if person:
            ids.append("call_directory")
            if person.get("circle") == "family":
                ids.append("ask_code_word")
            elif person.get("role") in ("CEO", "CFO", "MD"):
                ids.append("rotating_phrase")
        if "above_authority" in identity_kinds:
            ids.append("second_approver")
        if identity_kinds & {"new_beneficiary", "flagged_beneficiary"}:
            ids.append("verify_beneficiary")
        if scenario_hint == "digital_arrest" or ("fear" in tactics and "authority" in tactics and person is None):
            ids = ["hang_up", "do_not_reply", "report_1930"]
        if band == "HIGH":
            ids += ["escalate_soc", "preserve_evidence"]
            if person and person.get("circle") == "family":
                ids.append("report_1930")
    seen, out = set(), []
    for i in ids:
        if i in seen:
            continue
        seen.add(i)
        st = STEPS[i]
        fmt = {"name": (person or {}).get("name", "the sender"), "phone": (person or {}).get("directory_phone", "the saved number")}
        out.append({"id": i, "title": st["title"].format(**fmt), "why": st["why"].format(**fmt), "done": False})
    return out

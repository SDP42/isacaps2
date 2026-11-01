"""Scenario forge: turn a situation described in words into a real case, then let MIRAGE investigate it.

"Imagine the police call me saying they arrested my dad and want ₹50,000 bail" becomes:
  1. a spec (who is impersonated, over which channel, asking for what, in which language), read deterministically
     from the description, with every assumption stated back to the user;
  2. the attacker's script for that scam type, written the way such scripts are really written (authority, urgency,
     secrecy, a payment route);
  3. the evidence an attacker would produce: a neural-TTS "clone" laundered through a phone line or WhatsApp, an
     AI-generated avatar video for a video call, or the message / email itself;
  4. a genuine case through the full pipeline (custody, five witnesses, risk engine, Tribunal), so the verdict is
     computed, not scripted.

All generated media is synthetic and stamped (red-team lab rules); no real person's voice or face is used.
"""
from __future__ import annotations

import random
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

from ..witnesses.words import parse_amount

ROOT = Path(__file__).resolve().parents[3]


@dataclass
class Spec:
    role: str = "unknown"            # who the attacker pretends to be
    category: str = "payment_fraud"  # scam family that drives the script and the cure
    channel: str = "phone"           # phone | voice_note | video | whatsapp | sms | email
    ask: str = "payment"             # payment | credential | remote_access | data | none
    amount: int | None = None
    relative: str | None = None      # "your father" when a relative is part of the story
    language: str = "en"             # en | hinglish | hi
    real_voice: bool = False         # "what if it really was him": a real human recording carries the request
    persona: str = ""                # which executive, when the role is "boss" (ceo | cfo)
    assumptions: list[str] = field(default_factory=list)
    title: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


# who is impersonated: (keywords, display name for the case, category, TTS voice (edge, OS), avatar prompt)
ROLES: dict[str, tuple[tuple[str, ...], str, str, tuple[str, str], str]] = {
    "police": (("police", "cop", "inspector", "cbi", "crime branch", "cyber cell", "customs", "narcotics", "ncb",
                "enforcement directorate", "court", "officer", "fir", "arrest", "jail"),
               "Inspector Rajiv Rathore, Cyber Crime Cell", "digital_arrest", ("en-IN-PrabhatNeural", "Rishi"),
               "Indian police inspector in khaki uniform sitting at a desk in a police station, documentary photo"),
    "bank": (("bank", "sbi", "hdfc", "icici", "axis", "kotak", "kyc", "credit card", "debit card", "upi pin", "net banking"),
             "SBI Fraud Prevention Desk", "credential_theft", ("en-IN-NeerjaNeural", "Tara"),
             "Indian bank customer care executive with headset in an office, photo"),
    "it": (("it support", "it team", "helpdesk", "help desk", "microsoft", "tech support", "technical support", "it department",
            "system admin", "office 365"),
           "IT Helpdesk", "credential_theft", ("en-IN-PrabhatNeural", "Rishi"), "IT support engineer at a desk, office photo"),
    "government": (("income tax", "electricity", "trai", "telecom", "aadhaar", "uidai", "gas agency", "sim will be blocked",
                    "power cut", "tax department"),
                   "Electricity Board Officer", "credential_theft", ("en-IN-PrabhatNeural", "Rishi"),
                   "Indian government office clerk at a desk, photo"),
    "boss": (("boss", "ceo", "cfo", "managing director", "my manager", "director", "founder", "my company", "head of finance",
              "chairman", "my senior"),
             "Rajesh Mehta (CFO)", "payment_fraud", ("en-IN-PrabhatNeural", "Rishi"),
             "Indian corporate executive in a suit in a glass office, photo"),
    "vendor": (("vendor", "supplier", "invoice", "bank details changed", "new account details"),
               "Orbit Supplies accounts", "payment_fraud", ("en-IN-NeerjaNeural", "Tara"),
               "office accountant at a laptop, photo"),
    "investment": (("investment", "trading", "stock", "crypto", "returns", "double your money", "share market", "ipo"),
                   "Vikas Arora, SEBI-registered advisor", "reward_scam", ("en-IN-PrabhatNeural", "Rishi"),
                   "Indian financial influencer in a studio with stock charts behind him, photo"),
    "lottery": (("lottery", "prize", "kbc", "lucky draw", "you won", "winner", "jackpot", "gift"),
                "KBC Lucky Draw Office", "reward_scam", ("en-IN-NeerjaNeural", "Tara"),
                "television game show host on a bright stage, photo"),
    "job": (("job", "recruiter", "hr from", "work from home", "part time", "offer letter", "hiring"),
            "Priya, HR Recruitment", "reward_scam", ("en-IN-NeerjaNeural", "Tara"), "young HR recruiter in an office, photo"),
    "courier": (("courier", "parcel", "fedex", "dhl", "delivery", "package"),
                "FedEx Customer Care", "credential_theft", ("en-IN-NeerjaNeural", "Tara"),
                "courier company customer care agent, photo"),
    "support": (("anydesk", "teamviewer", "screen share", "remote", "refund", "virus", "hacked"),
                "Customer Support Team", "remote_access", ("en-IN-PrabhatNeural", "Rishi"), "call centre agent with headset, photo"),
}
RELATIVES = {"dad": "your father", "father": "your father", "papa": "your father", "mom": "your mother", "mother": "your mother",
             "mummy": "your mother", "son": "your son", "daughter": "your daughter", "brother": "your brother",
             "sister": "your sister", "wife": "your wife", "husband": "your husband", "grandson": "your grandson",
             "granddaughter": "your granddaughter", "uncle": "your uncle", "nephew": "your nephew", "friend": "your friend"}
CALLER_RELATIVE = {"your father": ("Suresh Panchal (Father)", "Papa", ("en-IN-PrabhatNeural", "Rishi")),
                   "your mother": ("Mummy", "Mummy", ("en-IN-NeerjaNeural", "Tara")),
                   "your son": ("Rohan Panchal", "Rohan", ("en-IN-PrabhatNeural", "Rishi")),
                   "your daughter": ("Riya Panchal", "Riya", ("en-IN-NeerjaNeural", "Tara"))}
DEFAULT_AMOUNT = {"digital_arrest": 50000, "family_emergency": 75000, "payment_fraud": 1250000, "reward_scam": 15000,
                  "credential_theft": None, "remote_access": None, "data_theft": None, "benign": None}
NARRATIVE = re.compile(r"\b(imagine|suppose|simulate|scenario|dummy|pretend\w*|role ?play|let'?s say|say (that )?(i|my|someone)|"
                       r"what if (someone|a |an |my |the |i )|i (get|got|receive|received|am getting)|someone (calls|called|"
                       r"messages|messaged|texts|texted|emails|emailed|sends|sent)|posing as|claiming to be|pretending to be)\b", re.I)
SCENE = re.compile(r"\b(call|calls|called|phone|message|whatsapp|sms|text|email|mail|voice note|video call|zoom|police|bank|"
                   r"boss|ceo|cfo|son|daughter|dad|father|mom|mother|otp|lottery|job|investment|parcel|courier|arrest\w*)\b", re.I)
MODIFIER = re.compile(r"^\s*(now |ok |okay )?(make it|try it|do it|same (scenario|thing|call)|instead|as an? |in hindi|in hinglish|"
                      r"what if (it|the caller|he|she) (was|is) (really|actually|genuine|real))", re.I)


def is_scenario(text: str) -> bool:
    """A described situation to simulate, as opposed to a pasted message to check or a question about MIRAGE."""
    return bool(NARRATIVE.search(text) and SCENE.search(text)) or bool(re.search(r"\b(simulate|scenario|dummy)\b", text, re.I))


def is_modifier(text: str) -> bool:
    return bool(MODIFIER.search(text))


def _has(t: str, words) -> str | None:
    return next((w for w in words if re.search(rf"\b{re.escape(w)}\b", t)), None)


def parse(text: str, base: Spec | None = None) -> Spec:
    t = text.lower()
    s = Spec(**{k: v for k, v in base.as_dict().items() if k != "assumptions"}) if base else Spec()
    s.assumptions = []
    # channel
    ch = ("video" if re.search(r"video call|zoom|google meet|skype|teams call|facetime|on video", t) else
          "voice_note" if re.search(r"voice (note|message)|audio message|voice clip", t) else
          "email" if re.search(r"\be-?mail\b|\bmail\b", t) else
          "whatsapp" if re.search(r"whatsapp (message|text|chat)|message on whatsapp|texts? me on whatsapp", t) else
          "sms" if re.search(r"\bsms\b|\btext message\b|\btexts? me\b|\bmessages? me\b|\bmessage\b", t) else
          "phone" if re.search(r"\bcall|\bcalls|\bcalled|\bphone|\brang|\bring", t) else None)
    if ch:
        s.channel = ch
    elif not base:
        s.assumptions.append("No channel given: simulated as a phone call")
    # language
    if "hinglish" in t:
        s.language = "hinglish"
    elif "hindi" in t:
        s.language = "hi"
    elif re.search(r"\bin english\b", t):
        s.language = "en"
    # the real person after all
    if re.search(r"(really|actually|genuinely?|real) (was |is )?(him|her|my|the)|real voice|genuine (caller|voice)|not a clone", t):
        s.real_voice = True
    if base and is_modifier(text):  # "make it a video call": keep the story, change only what was named
        s.title = base.title
        return _finish(s, text, modifier=True)
    # relative involved in the story
    rel_word = _has(t, RELATIVES)
    rel = RELATIVES[rel_word] if rel_word else None
    # who is impersonated: an authority beats a relative ("police say they arrested my dad")
    role = next((k for k, (kw, *_ ) in ROLES.items() if any(re.search(rf"\b{re.escape(w)}", t) for w in kw)), None)
    if role is None and re.search(r"\bIT\b", text):  # "an email from IT" (case matters: "it" is a pronoun)
        role = "it"
    harmless = re.search(r"announcement|reminder|invit|meeting (moved|rescheduled)|birthday|wish(es)?|just checking|greeting|"
                         r"townhall|no money|nothing (asked|sensitive)", t) and not re.search(r"money|pay|otp|transfer|fee|bail", t)
    if harmless:
        s.role, s.category, s.ask = role or (f"relative:{rel}" if rel else "colleague"), "benign", "none"
    elif role:
        s.role, s.category = role, ROLES[role][2]
        if role == "boss":
            s.persona = "ceo" if re.search(r"\bceo\b|managing director|\bmd\b|chairman|founder", t) else "cfo"
        if role == "police" and rel:
            s.relative = rel
    elif rel:
        s.role, s.category, s.relative = f"relative:{rel}", "family_emergency", rel
    else:
        s.role, s.category = "unknown", "payment_fraud"
        s.assumptions.append("Caller's identity not given: simulated as an unknown caller")
    # what is asked
    ask = ("credential" if re.search(r"\botp\b|\bpin\b|password|verification code|\bcvv\b|card details|one time", t) else
           "remote_access" if re.search(r"anydesk|teamviewer|screen ?shar|install (an |the )?app|remote access|quick ?support", t) else
           "data" if re.search(r"\bpan\b|aadhaar (number|details|card)|customer (list|data)|employee (data|details)|salary slips?", t) else
           "payment" if re.search(r"money|\bpay|transfer|send (me |him |her |them )?(money|cash|rs|₹|\d)|bail|\bfines?\b|\bfee|"
                                  r"deposit|gift ?card|\bupi\b|rupees|₹|\brs\b|lakh|crore|\d{4,}|thousand|invest|wire", t) else None)
    if s.category == "benign":
        s.ask = "none"
    elif ask:
        s.ask = ask
        if ask == "remote_access":
            s.category = "remote_access"
        elif ask == "credential" and s.category in ("payment_fraud", "family_emergency"):
            s.category = "credential_theft" if not s.relative else s.category
        elif ask == "data":
            s.category = "data_theft"
    else:
        s.ask = {"credential_theft": "credential", "remote_access": "remote_access", "benign": "none"}.get(s.category, "payment")
        s.assumptions.append(f"No request given: assumed the usual one for this scam ({s.ask.replace('_', ' ')})")
    amt = parse_amount(text) or _words_amount(t)
    s.amount = amt or (DEFAULT_AMOUNT.get(s.category) if s.ask == "payment" else None)
    if s.ask == "payment" and not amt and s.amount:
        s.assumptions.append(f"No amount given: assumed ₹{s.amount:,}")
    return _finish(s, text)


def _words_amount(t: str) -> int | None:
    m = re.search(r"(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore)\b", t)
    if not m:  # "a 4999 fee", "pay 2000": a bare number next to a money word
        b = re.search(r"(?:fee|pay|send|deposit|bail|fine|of|worth)\D{0,12}?(\d[\d,]{2,})|(\d[\d,]{2,})\s*(?:rupee|fee|bail)", t)
        return int((b.group(1) or b.group(2)).replace(",", "")) if b else None
    return int(float(m.group(1)) * {"k": 1e3, "thousand": 1e3, "lakh": 1e5, "lac": 1e5, "crore": 1e7}[m.group(2)])


def _finish(s: Spec, text: str, modifier: bool = False) -> Spec:
    who = claimed(s)
    via = {"phone": "phone call", "voice_note": "WhatsApp voice note", "video": "video call", "whatsapp": "WhatsApp message",
           "sms": "SMS", "email": "email"}[s.channel]
    if not modifier or not s.title:
        story = f"{who} · {via}"
        if s.relative and s.role == "police":
            story = f"{who} says {s.relative} was arrested · {via}"
        s.title = story
    else:
        s.title = re.sub(r" · [^·]+$", f" · {via}", s.title)
    if s.real_voice and s.channel in ("phone", "voice_note", "video"):
        s.assumptions.append("Real voice: a genuine human recording carries the same request, to test the request-aware rules")
    if s.language == "hi" and s.category not in SCRIPTS_HI:
        s.assumptions.append("No Hindi script for this scam yet: written in Hinglish")
        s.language = "hinglish"
    return s


def claimed(s: Spec) -> str:
    if s.role.startswith("relative:"):
        return CALLER_RELATIVE.get(s.role.split(":", 1)[1], ("Unknown relative",))[0]
    if s.role == "boss" and s.persona == "ceo":
        return "Ashok Raman (CEO)"
    if s.role in ROLES:
        return ROLES[s.role][1]
    return {"colleague": "Internal Comms", "unknown": "Unknown caller"}.get(s.role, "Unknown caller")


def _inr(n: int | None) -> str:
    if not n:
        return ""
    s = str(int(n))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ",".join(([head] if head else []) + parts) + "," + tail


def _spoken(n: int | None) -> str:
    """Amounts as a caller would say them, which speech-to-text then writes back as digits."""
    if not n:
        return "the amount"
    if n >= 10_000_000:
        return f"{n / 10_000_000:g} crore rupees"
    if n >= 100_000:
        return f"{n / 100_000:g} lakh rupees"
    return f"{_inr(n)} rupees"


# ---- the attacker's script ------------------------------------------------------------------------------------------

def script(s: Spec) -> str:
    amt, rel = _spoken(s.amount), s.relative or "your family member"
    pick = (SCRIPTS_HI if s.language == "hi" else SCRIPTS_HG if s.language == "hinglish" else SCRIPTS_EN).get(s.category) or SCRIPTS_EN[s.category]
    text = pick(s, amt, rel)
    if s.channel in ("whatsapp", "sms", "email"):  # written channels read tighter and carry the payment route
        text = text.replace(" I'll stay on the line.", "").replace(" Stay on the line.", "")
        if s.ask == "payment":
            text += " UPI: verify.desk@okaxis"
        if s.channel == "email":
            text = f"Subject: Urgent action required\n\n{text}"
    return text


def _en_arrest(s, amt, rel):
    if s.relative:
        return (f"Hello, this is Inspector Rajiv Rathore from the Cyber Crime Cell. {rel.capitalize()} has been arrested in a "
                f"hit and run case and is in our custody. To avoid an FIR and jail tonight, you must deposit {amt} as bail "
                f"immediately to the verification account I send you. Do not tell anyone about this and do not disconnect "
                f"the call, or the case will become serious.")
    return ("This is Inspector Rajiv Rathore from the CBI Cyber Cell. A parcel in your name with illegal drugs was seized at "
            f"Mumbai customs. You are under digital arrest. Stay on this call, do not tell your family, and transfer {amt} "
            "to the RBI verification account within one hour to clear your name.")


def _en_family(s, amt, rel):
    who = CALLER_RELATIVE.get(rel, (None, "it's me"))[1]
    return (f"{'Papa' if 'son' in rel or 'daughter' in rel else 'Hello'}, {who} here. I had an accident and I'm at the "
            f"hospital, my phone broke so this is a friend's number. I need {amt} right now for the treatment. Please send it "
            "to this UPI quickly and don't tell anyone at home, I'll explain later.")


SCRIPTS_EN = {
    "digital_arrest": _en_arrest,
    "family_emergency": _en_family,
    "payment_fraud": lambda s, amt, rel: (
        f"Hi, it's {'Ashok, the CEO' if s.persona == 'ceo' else 'Rajesh from the CFO office'}. I'm in a board meeting and can't take "
        f"calls. Please wire {amt} to the new vendor account before four PM today. It's urgent and confidential, don't loop in audit yet."),
    "credential_theft": lambda s, amt, rel: (
        {"bank": "Hello, I'm calling from the SBI fraud prevention desk. Your account will be blocked today because your KYC has "
                 "expired. Please read out the OTP we just sent to your registered mobile so I can verify you immediately.",
         "it": "Hi, this is the IT helpdesk. We're resetting your mailbox password tonight. Please tell me the six digit "
               "verification code that just came to your phone, otherwise your account will be locked in ten minutes.",
         "government": "This is the Electricity Board. Your power will be disconnected tonight at nine thirty because your bill "
                       "was not updated. Share the OTP sent to your phone right now to keep the connection.",
         "courier": "This is FedEx customer care. Your parcel is on hold for an incomplete address. Pay the twenty five rupee "
                    "re-delivery fee and share the OTP you receive to release it today."}
        .get(s.role, "Hello, this is the verification team. Your account will be suspended today. Please share the OTP you "
                     "just received immediately to keep it active.")),
    "remote_access": lambda s, amt, rel: (
        "Hello, this is customer support. Your bank app has a security problem and your refund is stuck. Please install "
        "AnyDesk from the Play Store right now and tell me the nine digit code, I will fix it from our side in two minutes."),
    "reward_scam": lambda s, amt, rel: (
        {"investment": f"I personally use this trading platform. Invest just {amt} today and earn four percent daily, "
                       "guaranteed. Registration closes tonight, join the WhatsApp group now.",
         "job": f"Congratulations, you are shortlisted for a remote job at forty five thousand per month. Pay the refundable "
                f"security deposit of {amt} today to receive your offer letter. Only a few seats are left.",
         "lottery": f"Congratulations! Your number has won twenty five lakh rupees in the KBC lucky draw. To claim the prize, "
                    f"pay the processing fee of {amt} within twenty four hours."}
        .get(s.role, f"Congratulations, you have won a cash prize. Pay the processing fee of {amt} today to claim it.")),
    "data_theft": lambda s, amt, rel: (
        "Hi, this is HR from head office. For the new insurance policy, send me the PAN, Aadhaar and bank details of "
        "everyone in your team by tonight on my personal email. Keep it confidential."),
    "benign": lambda s, amt, rel: (
        "Hi everyone, a quick reminder: the quarterly townhall moves to Friday at four PM. The agenda is in your calendar "
        "invite. See you there."),
}

SCRIPTS_HG = {
    "digital_arrest": lambda s, amt, rel: (
        f"Hello, main Cyber Crime Cell se Inspector Rathore bol raha hoon. {rel.replace('your', 'Aapke').replace('father', 'papa').replace('mother', 'mummy').replace('son', 'bete').replace('daughter', 'beti')} "
        f"ko arrest kiya gaya hai. Jail se bachana hai to abhi {amt} bail jama karo. Kisi ko mat batana aur call cut mat karna."
        if s.relative else
        f"Main CBI se Inspector Rathore bol raha hoon. Aapke naam ka drugs wala parcel pakda gaya hai. Aap digital arrest mein ho. "
        f"Call cut mat karna, family ko mat batana, aur abhi {amt} verification account mein bhejo."),
    "family_emergency": lambda s, amt, rel: (
        f"Papa, main bol raha hoon. Mera accident ho gaya hai, hospital mein hoon. Phone toot gaya, ye dost ka number hai. "
        f"Jaldi {amt} is UPI pe bhej do, mummy ko mat batana."),
    "payment_fraud": lambda s, amt, rel: (
        f"Bhai main Rajesh, meeting mein hoon, call nahi utha sakta. Naye vendor ko {amt} abhi transfer kar do, approval baad "
        "mein le lenge. Audit wale ko abhi mat batana."),
    "credential_theft": lambda s, amt, rel: (
        "Sir main bank se bol raha hoon, aapka account aaj band hone wala hai. Abhi jo OTP aaya hai woh jaldi bata dijiye."),
    "reward_scam": lambda s, amt, rel: (
        f"Badhai ho! Aapne lucky draw jeeta hai. Inaam lene ke liye aaj hi {amt} processing fee bhejo, kal tak offer khatam."),
    "remote_access": lambda s, amt, rel: (
        "Aapke phone mein virus hai jo UPI hack kar raha hai. AnyDesk download karke code batao, hum abhi theek kar denge."),
}

SCRIPTS_HI = {
    "digital_arrest": lambda s, amt, rel: (
        f"नमस्ते, मैं साइबर क्राइम सेल से इंस्पेक्टर राठौर बोल रहा हूँ। {'आपके पिता' if 'father' in rel else 'आपके परिवार के सदस्य'} को गिरफ्तार किया गया है। "
        f"जेल से बचाने के लिए तुरंत {amt} जमानत जमा कीजिए। किसी को मत बताइए और कॉल मत काटिए।"
        if s.relative else
        f"मैं सीबीआई अधिकारी बोल रहा हूँ। आपके नाम पर ड्रग्स का पार्सल पकड़ा गया है। आप डिजिटल अरेस्ट में हैं, कॉल मत काटिए और किसी को मत बताइए। "
        f"जाँच के लिए तुरंत {amt} भेजिए।"),
    "family_emergency": lambda s, amt, rel: (
        f"पापा, मैं मुसीबत में हूँ। मेरा एक्सीडेंट हो गया है, मैं अस्पताल में हूँ। अभी {amt} इस यूपीआई पर भेज दीजिए, मम्मी को मत बताना।"),
    "payment_fraud": lambda s, amt, rel: (
        f"मैं मीटिंग में हूँ, फ़ोन नहीं उठा सकता। नए खाते में आज ही {amt} भेज दो। यह बात अभी किसी को मत बताना।"),
    "credential_theft": lambda s, amt, rel: (
        "प्रिय ग्राहक, मैं बैंक से बोल रहा हूँ। आपका खाता आज बंद हो जाएगा। तुरंत वह ओटीपी बताइए जो अभी आपके फ़ोन पर आया है।"),
}
HINDI_VOICE = {"male": ("hi-IN-MadhurNeural", "Rishi"), "female": ("hi-IN-SwaraNeural", "Tara")}


def voice_for(s: Spec) -> tuple[str, str]:
    if s.role.startswith("relative:"):
        v = CALLER_RELATIVE.get(s.role.split(":", 1)[1], (None, None, ("en-IN-PrabhatNeural", "Rishi")))[2]
    else:
        v = ROLES.get(s.role, (None, None, None, ("en-IN-PrabhatNeural", "Rishi")))[3]
    if s.language == "hi":
        return HINDI_VOICE["female" if "Neerja" in v[0] else "male"]
    return v


def avatar_prompt(s: Spec) -> str:
    if s.role in ROLES:
        return ROLES[s.role][4]
    if s.role.startswith("relative:"):
        return "young Indian man looking worried, phone selfie in a hospital corridor, photo"
    return "Indian man in a dim room looking at the camera, video call screenshot"


# ---- evidence and the real case --------------------------------------------------------------------------------------

def build(s: Spec, work: Path) -> tuple[list[tuple[str, bytes]], str, dict]:
    """The attacker's evidence. Returns (files for the case, message text, details shown to the user)."""
    from .. import redteam

    text = script(s)
    info: dict = {"script": text, "engine": None, "laundering": None, "image_engine": None}
    files: list[tuple[str, bytes]] = []
    if s.channel in ("whatsapp", "sms", "email"):
        return files, text, info
    if s.real_voice:
        real = ROOT / "demo_inputs" / "01_voice_check" / "04_human_voice_audiobook_librispeech.wav"
        files.append(("real_human_voice.wav", real.read_bytes()))
        info["engine"] = "a real human recording (LibriSpeech, CC BY 4.0); the request travels as the accompanying message"
        return files, text, info
    raw = work / "voice.wav"
    info["engine"] = redteam.tts(text, voice_for(s), raw)
    launder = {"phone": "phone", "voice_note": "whatsapp", "video": None}.get(s.channel)
    audio = raw
    if launder:
        audio = work / f"voice_{launder}.wav"
        redteam.launder_audio(raw, launder, audio)
        info["laundering"] = {"phone": "8 kHz μ-law phone line", "whatsapp": "WhatsApp Opus 16 kbit/s"}[launder]
    if s.channel == "video":
        img, info["image_engine"] = redteam.gen_image(avatar_prompt(s), seed=random.randint(1, 10_000))
        ip = work / "face.png"
        img.save(ip)
        vid = work / "video_call.mp4"
        if redteam.make_video(ip, raw, vid):
            files.append(("video_call.mp4", vid.read_bytes()))
            return files, "", info
        files.append(("caller_photo.png", ip.read_bytes()))
    name = {"phone": "call_recording.wav", "voice_note": "voice_note.wav"}.get(s.channel, "voice.wav")
    files.append((name, audio.read_bytes()))
    return files, "", info


CHANNEL = {"phone": "phone", "voice_note": "whatsapp", "video": "video", "whatsapp": "whatsapp", "sms": "sms", "email": "email"}


def sender_contact(s: Spec) -> str:
    if s.channel == "email":
        return {"boss": "rajesh.mehta.cfo@gmail.com", "bank": "alerts@sbi-kyc-verify.co"}.get(s.role, "support@secure-verify-desk.com")
    r = random.Random(hash(s.title) & 0xFFFF)
    return f"+91 {r.randint(70000, 99999)} {r.randint(10000, 99999)}"


ATTACK = {  # what the attacker expects to happen next, for the "without MIRAGE" column
    "digital_arrest": ["Fear and authority keep the victim on the line", "A 'bail' or 'verification' deposit is demanded within the hour",
                       "Money goes to a mule account and is split within minutes"],
    "family_emergency": ["A familiar-sounding voice asks for urgent help", "Secrecy stops the one call that would expose it",
                         "UPI money is gone before the real relative is reached"],
    "payment_fraud": ["An 'executive' bypasses the approval chain", "Finance wires to a new account under time pressure",
                      "The fraud is found at month-end reconciliation"],
    "credential_theft": ["A 'bank' or 'IT' caller creates a deadline", "The OTP is read out on the call",
                         "The account is taken over and drained or used for further fraud"],
    "remote_access": ["A 'support agent' gets AnyDesk installed", "The victim opens banking while sharing the screen",
                      "The attacker moves money while the victim watches"],
    "reward_scam": ["A prize, job or 'guaranteed' return is dangled", "A small fee is paid first, then larger ones",
                    "The victim keeps paying to unlock money that never existed"],
    "data_theft": ["An 'HR' or 'auditor' request looks routine", "Personal or customer data is sent to a personal address",
                   "The data fuels identity theft or the next targeted scam"],
    "benign": ["Nothing is asked", "No action is expected", "No harm follows"],
}

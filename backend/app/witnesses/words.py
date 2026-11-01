"""Words witness: message and transcript intelligence in English, Hindi (Devanagari) and Hinglish.

Three layers, all explainable:
  1. A calibrated TF-IDF (char + word n-gram) classifier trained on the synthetic multilingual corpus.
  2. A tactic lexicon that returns character spans for authority, urgency, secrecy, fear, reward, channel switch and
     control bypass, so the UI can highlight exact phrases.
  3. Extractors for the requested action, amounts, UPI IDs, accounts, IFSC/IBAN, URLs, phone numbers and deadlines.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

from .base import Evidence, Timer, WitnessResult, load_model

TACTICS: dict[str, list[str]] = {
    "urgency": [
        r"\burgent(ly)?\b", r"\bimmediately\b", r"\bright now\b", r"\basap\b", r"\bwithin \d+ (minutes?|hours?|mins?)\b",
        r"\bin the next \d+ minutes\b", r"\bbefore \d{1,2}(:\d\d)? ?(am|pm)\b", r"\bby eod\b", r"\btoday itself\b",
        r"\bjaldi\b", r"\babhi\b", r"\bturant\b", r"\baaj hi\b", r"\bतुरंत\b", r"\bअभी\b", r"\bजल्दी\b",
        r"\bwill be (blocked|suspended|disconnected|locked)\b", r"\b(lock|band) ho jayega\b", r"\bvery urgent\b",
        r"\bbefore the bank closes\b",
    ],
    "authority": [
        r"\b(ceo|cfo|md|director|head|boss|sir)\b(?! *,? *(thanks|regards))", r"\bthis is [A-Z][a-z]+",
        r"\bcbi\b", r"\bpolice\b", r"\binspector\b", r"\brbi\b", r"\bcyber cell\b", r"\bcourt\b", r"\bofficer\b",
        r"\bbol raha hoon\b", r"\bboard meeting\b", r"\bit (team|helpdesk|admin|support)\b", r"\bमैं .{1,20} बोल रहा\b",
    ],
    "secrecy": [
        r"\bkeep (this|it) (between us|confidential|quiet)\b", r"\bconfidential\b", r"\bdon'?t (tell|inform) anyone\b",
        r"\bdo not (discuss|tell|inform)\b", r"\bdon'?t tell anyone\b", r"\bkisi ko (bhi )?mat (batana|batao)\b",
        r"\bmat batana\b", r"\bkisi ko mat\b", r"\bकिसी को (मत|न) (बताइए|बताना|बताएं)\b", r"\bबात किसी को\b",
        r"\bdon'?t call\b", r"\bcall mat karna\b", r"\bdo not disconnect\b", r"\bdon'?t disconnect\b",
    ],
    "fear": [
        r"\barrest(ed)?\b", r"\bmoney laundering\b", r"\billegal\b", r"\bpenalty\b", r"\baccident\b", r"\bhospital\b",
        r"\bin trouble\b", r"\bblocked\b", r"\bsuspend(ed)?\b", r"\blocked out\b", r"\bcase hai\b", r"\bmusibat\b",
        r"\bमुसीबत\b", r"\bडिजिटल अरेस्ट\b", r"\bunder audit\b",
    ],
    "reward": [
        r"\bcongratulations\b", r"\byou (have )?won\b", r"\blucky draw\b", r"\bselected for\b", r"\bper day\b",
        r"\bbadhai ho\b", r"\bबधाई\b", r"\bprocessing fee\b", r"\bregistration fee\b",
    ],
    "channel_switch": [
        r"\bwhatsapp (me|only)\b", r"\bmessage me on whatsapp\b", r"\bcan'?t (take|talk|attend) (calls?|now)\b",
        r"\bcall nahi utha sakta\b", r"\bwhatsapp pe (hi )?reply\b", r"\bthis is a friend'?s number\b",
        r"\bnew number\b", r"\bnaye number\b", r"\bphone (broke|toot gaya)\b", r"\bbaat nahi kar sakta\b",
        r"\bstay on (this|the) (video )?call\b",
    ],
    "bypass": [
        r"\bdon'?t loop in\b", r"\bdo not loop in\b", r"\bskip (the )?approvals?\b", r"\bapprovals? (will )?slow\b",
        r"\bi'?ll sign (the approval )?later\b", r"\bapproval baad mein\b", r"\baudit (wale )?ko\b",
        r"\bdon'?t involve\b", r"\bबाद में दूँगा\b", r"\bऑडिट को\b", r"\bdon'?t tell audit\b",
    ],
}
# Field test (testing/TEST_REPORT.md): Bengali, Gujarati, Marathi and Tamil scams read as LOW because only English,
# Hinglish and Hindi had patterns, and `\b` never matches after an Indic vowel sign. These are plain substrings.
INDIC_TACTICS: dict[str, list[str]] = {
    "urgency": ["तुरंत", "फ़ौरन", "फौरन", "आज ही", "लगेच", "ताबडतोब", "உடனே", "உடனடியாக", "এখনই", "আজই", "তাড়াতাড়ি",
                "તરત", "હમણાં", "આજે જ"],
    "authority": ["सीबीआई", "पुलिस", "पोलीस", "अधिकारी", "सायबर", "बैंक से", "போலீஸ்", "காவல்", "வங்கியிலிருந்து",
                  "পুলিশ", "ব্যাংক থেকে", "પોલીસ", "બેંકમાંથી"],
    "secrecy": ["मत बताना", "मत बताइए", "मत बताओ", "सांगू नको", "सांगू नका", "कोणालाही सांगू", "சொல்லாதீர்கள்",
                "சொல்ல வேண்டாம்", "বলবে না", "বলো না", "কাউকে বলবেন না", "કહેશો નહીં", "કહેતા નહીં"],
    "fear": ["गिरफ्तार", "अरेस्ट", "अपराध", "बंद हो जाएगा", "अपघात", "गुन्हा", "अटक", "விபத்து", "முடக்கப்படும்",
             "கைது", "মামলা", "বন্ধ হয়ে যাবে", "দুর্ঘটনা", "અકસ્માત", "ધરપકડ"],
    "reward": ["लॉटरी", "इनाम", "जीती", "जीता", "बक्षीस", "பரிசு", "வென்றுள்ளீர்கள்", "পুরস্কার", "লটারি", "ઇનામ", "લોટરી"],
}
TACTICS["urgency"] += [r"\bwithin \d+ ?(hrs?|hours?|h)\b", r"\bin \d+ (hours?|hrs?|minutes?|mins?)\b", r"\blimited (slots|seats|time)\b",
                       r"\boffer ends\b", r"\bat the earliest\b", r"\bb4 eod\b", r"\bend of (the )?day\b"]
TACTICS["secrecy"] += [r"\bdon'?t mention\b", r"\bdo not mention\b", r"\bbetween us\b", r"\btell no one\b", r"\bdont cc\b",
                       r"\bdon'?t (tell|inform) (mom|dad|mummy|papa|family|anyone)\b"]
TACTICS["fear"] += [r"\bdisconnected\b", r"\bfir\b", r"\blegal action\b", r"\bcontraband\b", r"\bbail\b", r"\bwarrant\b",
                    r"\bpolice station\b", r"\bclosed\b(?=.{0,30}\b(account|card)\b)"]
TACTICS["authority"] += [r"\bcustoms\b", r"\bcrime branch\b", r"\bregulatory authority\b", r"\bincome tax department\b",
                         r"\bnarcotics\b", r"\btrai\b", r"\bsebi\b"]
TACTICS["reward"] += [r"\bguaranteed\b", r"\b\d+% (monthly|weekly|daily) returns?\b", r"\blottery\b", r"\bjackpot\b",
                      r"\bcashback\b", r"\bpre-?approved loan\b", r"\bpaisa double\b", r"\bdouble (your )?money\b",
                      r"\bearn(ing)? .{0,20}(per|a|every) (day|week|month)\b", r"\bkamai\b", r"\brefund of\b"]
_TACTIC_RX = {k: [re.compile(p, re.I) for p in v] + [re.compile(re.escape(s)) for s in INDIC_TACTICS.get(k, [])]
              for k, v in TACTICS.items()}

ACTIONS: list[tuple[str, float, list[str]]] = [
    ("credential", 1.0, [r"\botp\b", r"\bpassword\b", r"\b6-digit code\b", r"\bverification code\b", r"\bpin\b",
                         r"\blogin\b.*\bverify\b", r"\bverify your (account|password)\b", r"\bcard details\b", r"\bcvv\b",
                         r"\b(enter|update) your (bank|payment|card|billing) (details|information)\b", r"\bp i n\b",
                         r"\bcode (that )?(just )?(came|sent)\b", r"\bkeep your card ready\b",
                         "ओटीपी", "पिन", "पासवर्ड", "ஓடிபி", "ওটিপি", "પિન"]),
    ("remote_access", 1.0, [r"\banydesk\b", r"\bteamviewer\b", r"\bremote access\b", r"\baccess code\b",
                            r"\binstall .{0,20}app\b", r"\bquick ?support\b", r"\bscreen shar", "एनीडेस्क"]),
    ("payment", 1.0, [r"\b(wire|transfer|process|release|send|pay|move|deposit|bhej|daal)\b.{0,60}(₹|rs\.?|inr|rupees?|lakh|crore|\d{4,}|account|upi|payment)",
                      r"(₹|rs\.?|inr)\s?[\d,.]+.{0,40}\b(transfer|bhej|send|wire|pay)", r"\b(paise|pise|paisa|pais)\b.{0,20}\bbhej", r"\bbhej\w*\b.{0,25}\d{3,}", r"\d[\d,]{3,}.{0,25}\bbhej",
                      r"\bपैसे\b|\bभेज\b|\bट्रांसफर\b", r"\bbank details have changed\b", r"\bnew (beneficiary|account)\b",
                      r"\bsecurity deposit\b", r"\bfee\b.{0,30}(upi|@)",
                      r"\bgift ?cards?\b", r"\b(voucher|redeem|redemption) codes?\b", r"\bscratch (off )?(the )?codes?\b",
                      r"\b(fee|charge|deposit|gst)\b.{0,40}\b(rs\.?|₹|inr|\d{3,})", r"\b(rs\.?|₹)\s?[\d,]+.{0,30}\b(fee|charge|deposit|gst)\b",
                      r"\binvest\b.{0,30}(rs\.?|₹|\d{4,})", r"\bremit\b", r"\bpay\b.{0,40}\binvoice\b",
                      "रुपये", "रुपए", "पाठव", "அனுப்ப", "ரூபாய்", "পাঠিয়ে", "পাঠান", "টাকা", "મોકલ", "રૂપિયા"]),
    ("data", 0.6, [r"\bsend (me )?(the )?(employee|customer|payroll) (data|list|records)\b", r"\bpan card\b",
                   r"\baadhaar\b.{0,30}(send|share)", r"\bshare (the )?(file|database|records)\b",
                   r"\bpan, aadhaar\b", r"\b(customer|client|employee) list\b", r"\bexport (it|the data|the list)\b",
                   r"\b(salary slips?|bank details|pan)\b.{0,60}\bpersonal (id|email|gmail|mail)\b"]),
    ("info", 0.3, [r"\bshare\b", r"\bupdate\b", r"\bconfirm\b"]),
]

_AMOUNT = re.compile(r"(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)(?:\s*(lakh|lac|crore|cr|k)\b)?|([\d.]+)\s*(lakh|lac|crore|cr)\b", re.I)
ENTITY_RX = {
    "upi": re.compile(r"\b[\w.\-]{2,40}@(ok\w+|ybl|paytm|ibl|axl|upi|icici|sbi|hdfc\w*|apl|kotak)\b", re.I),
    "ifsc": re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),
    "iban": re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b"),
    "account": re.compile(r"\b\d{9,18}\b"),
    "url": re.compile(r"https?://[^\s,)]*[^\s,).!?]", re.I),  # no trailing sentence punctuation
    "phone": re.compile(r"\+91[\s-]?\d{5}[\s-]?\d{5}|\b[6-9]\d{9}\b"),
    "email": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b"),
}
DEADLINE_RX = re.compile(
    r"before \d{1,2}(:\d\d)? ?(am|pm)|within \d+ (minutes?|hours?)|in the next \d+ minutes|by eod( today)?|"
    r"today|tonight|aaj hi|abhi|\d+ minute mein", re.I)
LOOKALIKE = ["acmefintech", "hdfc", "sbi", "icici", "rbi", "paytm", "mirage", "orbit"]
HINGLISH_MARKERS = {"hai", "hoon", "kar", "karo", "mat", "nahi", "abhi", "bhej", "bhai", "yaar", "kya", "ko", "ka",
                    "ki", "se", "pe", "mein", "aap", "jaldi", "batana", "paise"}


def fmt_inr(v: int | None) -> str:
    """Indian digit grouping: 4850000 -> 48,50,000."""
    if v is None:
        return ""
    s = str(int(v))
    if len(s) <= 3:
        return f"₹{s}"
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return "₹" + ",".join(groups) + "," + tail


def _article(word: str) -> str:
    return "an" if word[:1].lower() in "aeiou" else "a"


@dataclass
class RequestObject:
    action: str
    sensitivity: float
    amount_inr: int | None
    deadline: str | None
    entities: dict[str, list[str]]


def parse_amount(text: str) -> int | None:
    best = None
    for m in _AMOUNT.finditer(text):
        num = m.group(1) or m.group(3)
        unit = (m.group(2) or m.group(4) or "").lower()
        try:
            v = float(num.replace(",", ""))
        except ValueError:
            continue
        v *= {"lakh": 1e5, "lac": 1e5, "crore": 1e7, "cr": 1e7, "k": 1e3}.get(unit, 1)
        best = max(best or 0, int(v))
    return best


def extract_entities(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    upis = {m.group(0) for m in ENTITY_RX["upi"].finditer(text)}
    for k, rx in ENTITY_RX.items():
        vals = []
        for m in rx.finditer(text):
            v = m.group(0)
            if k == "email" and v in upis:
                continue
            if k == "account" and (re.fullmatch(r"[6-9]\d{9}", v)):
                continue
            vals.append(v)
        if vals:
            out[k] = sorted(set(vals))[:8]
    return out


# Notices that mention an OTP, a PIN or money without asking for them (field test: 5 of 8 real notices read as MEDIUM).
NOTICE_CREDENTIAL = re.compile(r"(do not|don'?t|never) share|never ask|will never|(otp|code)\b.{0,40}\bis:?\s*\d{4,}|"
                               r"share it with (your )?(driver|rider)|किसी के साथ साझा न", re.I)
NOTICE_PAYMENT = re.compile(r"\b(debited|credited|avl bal|available balance|statement .{0,20}ready|bill .{0,30}generated|"
                            r"processed successfully|has been shipped|not you\?|ignore if already paid|via the official app)\b", re.I)


def requested_action(text: str) -> tuple[str, float]:
    low = text.lower()
    for name, sens, pats in ACTIONS:
        if any(re.search(p, low, re.I) for p in pats):
            if name == "credential" and NOTICE_CREDENTIAL.search(low):
                continue  # an OTP notice or a "we never ask" reminder is not a request
            if name == "payment" and NOTICE_PAYMENT.search(low) and not re.search(r"\b(urgent|immediately|new account|transfer to)\b", low):
                continue  # a transaction alert or a bill reminder is not a payment request
            return name, sens
    return "none", 0.0


def tactic_spans(text: str) -> list[tuple[str, int, int, str]]:
    spans: list[tuple[str, int, int, str]] = []
    for tactic, rxs in _TACTIC_RX.items():
        for rx in rxs:
            for m in rx.finditer(text):
                spans.append((tactic, m.start(), m.end(), m.group(0)))
    spans.sort(key=lambda s: (s[1], -(s[2] - s[1])))
    merged: list[tuple[str, int, int, str]] = []
    for s in spans:  # drop spans nested inside an earlier span of the same tactic
        if merged and s[0] == merged[-1][0] and s[1] < merged[-1][2]:
            continue
        merged.append(s)
    return merged


def style_features(text: str) -> dict[str, float]:
    sents = [s for s in re.split(r"[.!?।]+", text) if s.strip()]
    words = re.findall(r"\w+", text.lower())
    n = max(len(words), 1)
    return {
        "avg_sentence_words": float(np.mean([len(s.split()) for s in sents])) if sents else 0.0,
        "hinglish_ratio": sum(w in HINGLISH_MARKERS for w in words) / n,
        "devanagari_ratio": len(re.findall(r"[ऀ-ॿ]", text)) / max(len(text), 1),
        "exclaim_rate": text.count("!") / max(len(sents), 1),
        "emoji_rate": len(re.findall(r"[\U0001F300-\U0001FAFF]", text)) / max(len(sents), 1),
        "greeting": 1.0 if re.match(r"\s*(hi|hello|dear|hey|namaste)\b", text, re.I) else 0.0,
        "signoff": 1.0 if re.search(r"(regards|thanks|cheers|best)\W*$", text.strip(), re.I) else 0.0,
        "lowercase_start": 1.0 if text[:1].islower() else 0.0,
    }


def style_drift(text: str, profile: dict | None) -> float | None:
    if not profile or len(text.split()) < 8:
        return None
    cur = style_features(text)
    scale = {"avg_sentence_words": 10, "hinglish_ratio": 0.15, "devanagari_ratio": 0.2, "exclaim_rate": 0.5,
             "emoji_rate": 0.5, "greeting": 1, "signoff": 1, "lowercase_start": 1}
    d = [min(abs(cur[k] - profile.get(k, cur[k])) / s, 1.5) for k, s in scale.items()]
    return float(min(1.0, np.mean(d) * 1.4))


def lookalike_domains(urls: list[str]) -> list[str]:
    flagged = []
    for u in urls:
        host = re.sub(r"^https?://", "", u).split("/")[0].lower()
        norm = host.replace("rn", "m").replace("0", "o").replace("1", "l")
        for brand in LOOKALIKE:
            if brand in norm and not host.endswith(f"{brand}.in") and not host.endswith(f"{brand}.com"):
                flagged.append(host)
                break
            if brand in norm and host != norm:
                flagged.append(host)
                break
    return flagged


def _lg(v: float) -> float:
    v = min(max(float(v), 1e-4), 1 - 1e-4)
    return float(np.log(v / (1 - v)))


def res_lang_en(text: str) -> bool:
    """Mostly English (the phishing classifier is English-only)."""
    return not re.search(r"[ऀ-ॿ]", text) and style_features(text)["hinglish_ratio"] <= 0.06


def analyse(text: str, style_profile: dict | None = None, source: str = "message", t_offset: dict | None = None,
            live: bool = False) -> WitnessResult:
    res = WitnessResult(witness="words", model_version="tfidf-lr-calibrated@1.0 + tactic-lexicon@1.0")
    text = re.sub(r"\s*\.{2,}\s*|…", " ", (text or "")).strip()  # transcripts break phrases with ellipses
    if len(text) < 4:
        res.status = "not_applicable"
        res.summary = "No message text or transcript to read."
        return res
    with Timer() as t:
        clf = load_model("words_clf.joblib")
        p = float(clf.predict_proba([text])[0, 1])
        spans = tactic_spans(text)
        action, sens = requested_action(text)
        ents = extract_entities(text)
        amount = parse_amount(text)
        dl = DEADLINE_RX.search(text)
        drift = style_drift(text, style_profile)
        bad_domains = lookalike_domains(ents.get("url", []))

    tactics = sorted({s[0] for s in spans})
    from . import pretrained
    for tactic, a, b, frag in spans:
        res.evidence.append(Evidence(
            witness="words", kind=tactic, label=tactic.replace("_", " "), text=frag, span=[a, b],
            severity=3 if tactic in ("secrecy", "bypass", "channel_switch") else 2,
            detail=f"{tactic.replace('_', ' ').capitalize()} cue in the {source}.",
        ))
    if action != "none":
        res.evidence.append(Evidence(
            witness="words", kind="requested_action", label=f"requests {action.replace('_', ' ')}",
            severity=3 if sens >= 1.0 else 1,
            detail=f"The {source} asks the recipient to perform a {action.replace('_', ' ')} action"
                   + (f" of {fmt_inr(amount)}" if amount and action == "payment" else "") + ".",
        ))
    for host in bad_domains:
        res.evidence.append(Evidence(witness="words", kind="lookalike_domain", label="look-alike domain", text=host,
                                     severity=3, detail=f"{host} imitates a known brand or the organisation's domain."))
    if drift is not None and drift > 0.45:
        res.evidence.append(Evidence(witness="words", kind="style_drift", label="writing style drift", score=round(drift, 2),
                                     severity=2, detail="Sentence length, greeting and code-mix ratio differ from the claimed sender's baseline."))

    # Pretrained layers: an English phishing/scam classifier and a multilingual zero-shot intent reader. They replace
    # most of the template-trained TF-IDF score, which generalises weakly to real messages (ECE 0.18).
    with Timer() as t2:
        ph = pretrained.phishing_prob(text) if not live else None
        it = pretrained.intents(text) if not live else None
    # Logit-space blend chosen on public SMS / scam-call / Indian-SMS samples (scripts/benchmark_models.py): our TF-IDF
    # 0.5, phishing model 0.3 (0.12 off-English) recentred at its 0.99 operating point, zero-shot intent 0.2 at 0.8.
    # An optional Claude judge joins at weight 0.6 when ANTHROPIC_API_KEY is set.
    from ..agents import llm

    judge = llm.judge_message(text) if not live else None
    parts = [(0.5, _lg(p))]
    if ph is not None:
        parts.append((0.3 if res_lang_en(text) else 0.12, _lg(ph) - _lg(0.99)))
    if it is not None:
        parts.append((0.2, _lg(pretrained.intent_scam_prob(it)) - _lg(0.8)))
    if judge:
        parts.append((0.6, _lg(judge["scam_probability"])))
    p_text = float(1 / (1 + np.exp(-sum(w * z for w, z in parts) / sum(w for w, _ in parts))))
    extra = ([pretrained.name("phishing")] if ph is not None else []) + ([pretrained.name("nli")] if it is not None else []) \
        + ([f"{judge['model']} judge"] if judge else [])
    if extra:
        res.model_version += " + " + " + ".join(extra)
    if judge:
        for tactic in judge["tactics"]:
            if tactic not in tactics:
                tactics.append(tactic)
                res.evidence.append(Evidence(witness="words", kind=tactic, label=tactic.replace("_", " "), severity=2,
                                             detail=f"{tactic.replace('_', ' ').capitalize()} read by the LLM judge: {judge['reason'][:160]}"))
        if action == "none" and judge["requested_action"] not in ("none", "info"):
            action, sens = judge["requested_action"], 1.0 if judge["requested_action"] != "data" else 0.6
    # Zero-shot intents add tactics the lexicon missed (paraphrases, Devanagari, other Indian languages), but only when
    # something else already says "scam": on its own the NLI model reads urgency and payment into harmless reminders
    # (demo_inputs/04_messages/05). Corroboration = a lexicon tactic, an extracted payment identifier, or p_text >= 0.5.
    # field test: the style score alone let the model read urgency and fear into harmless Hindi and Marathi family texts
    corroborated = bool(spans) or bool(ents.get("upi") or ents.get("account") or bad_domains) or (p_text >= 0.5 and action != "none")
    if it and corroborated:
        for lever, tactic in (("urgency", "urgency"), ("secrecy", "secrecy"), ("impersonation", "authority"), ("threat", "fear"), ("reward", "reward")):
            if it.get(lever, 0) >= 0.9 and tactic not in tactics:
                tactics.append(tactic)
                res.evidence.append(Evidence(witness="words", kind=tactic, label=tactic.replace("_", " "), score=it[lever], severity=2,
                                             detail=f"{tactic.capitalize()} intent read by the multilingual model ({it[lever]:.2f}), "
                                                    f"without a fixed phrase."))
        notice = NOTICE_PAYMENT.search(text) or NOTICE_CREDENTIAL.search(text)
        if action == "none" and not notice:  # a transaction alert or OTP notice is never read as a request
            ask = max(("payment", "credential", "remote_access"), key=lambda k: it.get(k, 0))
            if it.get(ask, 0) >= 0.9:
                action, sens = ask, 1.0
                res.evidence.append(Evidence(witness="words", kind="requested_action", label=f"requests {ask.replace('_', ' ')}",
                                             score=it[ask], severity=3,
                                             detail=f"The multilingual model reads a {ask.replace('_', ' ')} request ({it[ask]:.2f})."))
    tactic_weight = min(1.0, 0.18 * len(tactics) + 0.12 * sum(t in tactics for t in ("secrecy", "bypass", "channel_switch")))
    score = 1 - (1 - p_text * 0.85) * (1 - tactic_weight) * (1 - (0.35 if bad_domains else 0))
    res.score = round(float(score), 4)
    res.confidence = round(0.55 + 0.4 * abs(p - 0.5) * 2 * min(1.0, len(text.split()) / 25), 3)
    res.latency_ms = t.ms + t2.ms
    res.details = {
        "classifier_p": round(p, 4), "text_p": round(p_text, 4), "phishing_p": round(ph, 4) if ph is not None else None,
        "intents": it, "llm_judge": judge, "tactics": tactics, "requested_action": action, "sensitivity": sens,
        "amount_inr": amount, "deadline": dl.group(0) if dl else None, "entities": ents, "style_drift": drift,
        "language": "devanagari" if re.search(r"[ऀ-ॿ]", text) else
                    ("hinglish" if style_features(text)["hinglish_ratio"] > 0.06 else "english"),
        "text": text, "source": source,
    }
    parts = []
    if tactics:
        parts.append(f"{len(tactics)} manipulation tactic{'s' if len(tactics) > 1 else ''} ({', '.join(t.replace('_', ' ') for t in tactics)})")
    if action != "none":
        parts.append(f"{_article(action)} {action.replace('_', ' ')} request" + (f" for {fmt_inr(amount)}" if amount and action == 'payment' else ""))
    res.summary = ("Found " + " and ".join(parts) + f"; scam-language probability {p_text:.2f}.") if parts else \
        f"No manipulation tactics found; scam-language probability {p_text:.2f}."
    return res

"""Synthetic multilingual message corpus for the Words witness.

No labelled Indian-language BEC/scam corpus is public, so we generate one from templates written to match patterns
documented in CERT-In advisories, RBI/MHA public warnings and I4C (1930) case summaries. Every slot is randomised and
messages are mixed across English, romanised Hindi (Hinglish) and Devanagari. Legitimate messages deliberately include
money, urgency and authority words used *innocently* so the model cannot learn "money word = scam".

Labels: 1 = social-engineering attempt, 0 = legitimate.
"""
from __future__ import annotations

import random
from dataclasses import dataclass

NAMES = ["Rajesh Mehta", "Priya Nair", "Arjun Rao", "Kavita Shah", "Vikram Desai", "Ananya Iyer", "Rohan Kapoor",
         "Sneha Kulkarni", "Imran Sheikh", "Meera Joshi", "Aditya Verma", "Pooja Menon"]
ROLES = ["CFO", "CEO", "MD", "Finance Head", "HR Director", "IT Admin", "Director", "VP Operations"]
VENDORS = ["Zenith Logistics", "Apex Infra Pvt Ltd", "NovaChem Traders", "Orbit Supplies", "Sunrise Exports",
           "BlueLine Consulting"]
AMOUNTS = ["₹48,50,000", "₹18.5 lakh", "₹9,80,000", "Rs 2,40,000", "₹75,000", "INR 12,00,000", "₹3.2 crore",
           "Rs. 49,999", "₹1,20,000", "₹25,000"]
UPIS = ["refund.help@okaxis", "vendorpay2026@ybl", "rk.urgent@paytm", "safeacct.rbi@oksbi", "family.help@ibl",
        "zenith.pay@okhdfcbank"]
DEADLINES = ["before 4 PM", "in the next 30 minutes", "by EOD today", "within 1 hour", "right now",
             "before the bank closes", "aaj hi", "abhi turant"]
RELATIVES = ["Papa", "Mummy", "Beta", "Bhaiya", "Didi", "Chacha"]
DOMAINS_BAD = ["acme-corp-payments.com", "rnirage-finance.in", "kyc-update-sbi.co", "hdfc-secure-login.net",
               "it-helpdesk-reset.org"]


@dataclass
class Sample:
    text: str
    label: int
    family: str
    lang: str
    template: str  # template id, used for group splits so test templates are never seen in training


def _fill(t: str) -> str:
    return t.format(
        name=random.choice(NAMES), first=random.choice(NAMES).split()[0], role=random.choice(ROLES),
        vendor=random.choice(VENDORS), amount=random.choice(AMOUNTS), upi=random.choice(UPIS),
        deadline=random.choice(DEADLINES), rel=random.choice(RELATIVES), dom=random.choice(DOMAINS_BAD),
        otp=random.randint(100000, 999999), acct=random.randint(10**10, 10**11),
        ifsc=random.choice(["HDFC0001234", "SBIN0004567", "ICIC0007890"]), mins=random.choice([10, 15, 30, 45]),
        phone="+91 " + str(random.randint(70000, 99999)) + " " + str(random.randint(10000, 99999)),
    )


SCAM: dict[str, dict[str, list[str]]] = {
    "ceo_fraud": {
        "en": [
            "Hi, it's {first}. I'm in a board meeting and can't take calls. Please process {amount} to the new vendor account {deadline}. Keep this between us until the deal is announced.",
            "This is {name}, {role}. I need you to wire {amount} to {vendor} {deadline}. Don't loop in audit, I'll sign the approval later.",
            "Urgent and confidential: transfer {amount} to account {acct} IFSC {ifsc} {deadline}. I am travelling, message me on WhatsApp only.",
            "{first} here. Can't talk now. Need a favour, process the payment to {vendor} today, the usual approvals will slow us down. Reply once done.",
            "Are you at your desk? I need a quick confidential task done. Wire {amount} {deadline}. Do not discuss with anyone in finance.",
        ],
        "hinglish": [
            "Hi, {first} bol raha hoon. Meeting mein hoon, call nahi utha sakta. {amount} naye vendor account mein {deadline} transfer kar do. Audit wale ko abhi mat batana.",
            "{role} here. Bhai urgent hai, {amount} {vendor} ko bhej do {deadline}. Approval baad mein sign kar dunga, kisi ko mat batao.",
            "Yaar ek confidential kaam hai, {amount} account {acct} mein daal do {deadline}. WhatsApp pe hi reply karna.",
        ],
        "hi": [
            "मैं {first} बोल रहा हूँ, मीटिंग में हूँ। {amount} नए वेंडर खाते में {deadline} भेज दीजिए। यह बात किसी को मत बताइए।",
            "तुरंत {amount} ट्रांसफर करें, अप्रूवल मैं बाद में दूँगा। ऑडिट को अभी कुछ न बताएं।",
        ],
    },
    "vendor_bec": {
        "en": [
            "Dear Accounts, please note our bank details have changed. Kindly update and release the pending invoice of {amount} to the new account {acct} IFSC {ifsc} {deadline}.",
            "Following our call, attached is the revised invoice from {vendor}. Payment must reach the updated account {deadline} to avoid a penalty.",
            "Our previous account is under audit. Please route {amount} to our new beneficiary account immediately. Regards, {vendor} billing.",
        ],
        "hinglish": [
            "Sir, {vendor} ka bank account change ho gaya hai. Pending {amount} naye account {acct} mein bhej dijiye {deadline}, warna penalty lagegi.",
        ],
        "hi": ["{vendor} का बैंक खाता बदल गया है। कृपया {amount} नए खाते {acct} में {deadline} भेजें।"],
    },
    "credential": {
        "en": [
            "IT Helpdesk: we are resetting your account. Share the OTP you just received to finish the reset, otherwise you will be locked out in {mins} minutes.",
            "This is {first} from IT. Your mailbox will be suspended. Verify your password at https://{dom}/login {deadline}.",
            "Security alert: unusual sign-in detected. Reply with the 6-digit code sent to your phone so we can block the attacker.",
            "Hi, I'm the new IT admin. Please install AnyDesk and share the access code so I can fix your VPN issue.",
        ],
        "hinglish": [
            "IT team se bol raha hoon, aapka account reset ho raha hai. Jo OTP aaya hai woh bata do jaldi, {mins} minute mein lock ho jayega.",
            "Sir aapka password expire ho gaya hai, is link pe verify karo https://{dom}/login abhi turant.",
        ],
        "hi": ["आपका खाता बंद होने वाला है। जो OTP आया है वह तुरंत बताइए।"],
    },
    "family_emergency": {
        "en": [
            "{rel}, it's me. I've had an accident and my phone broke, this is a friend's number. Please send {amount} to {upi} right now, don't tell anyone at home.",
            "Mom I'm in trouble, police stopped me. I need {amount} urgently on {upi}. Please don't call, just send.",
        ],
        "hinglish": [
            "{rel} main hoon, accident ho gaya hai, phone toot gaya. Paise abhi bhejo {upi} pe, kisi ko mat batana please.",
            "{rel} please jaldi {amount} bhej do {upi} pe, hospital mein hoon. Call mat karna, baat nahi kar sakta.",
            "Beta main hoon, naye number se message kar raha hoon. Turant {amount} chahiye, ghar pe kisi ko mat batana.",
        ],
        "hi": ["{rel}, मैं मुसीबत में हूँ। तुरंत {amount} {upi} पर भेज दो, घर पर किसी को मत बताना।"],
    },
    "digital_arrest": {
        "en": [
            "This is Inspector Sharma from CBI Cyber Cell. A parcel in your name contains illegal items. You are under digital arrest. Stay on this video call and transfer {amount} for verification.",
            "Notice from Mumbai Police: your Aadhaar is linked to money laundering. Do not disconnect or inform anyone. Pay the security deposit of {amount} to clear your name.",
        ],
        "hinglish": [
            "Main CBI officer bol raha hoon, aapke naam pe case hai. Video call disconnect mat karna, kisi ko mat batana, {amount} verification ke liye bhejo.",
        ],
        "hi": ["आप डिजिटल अरेस्ट में हैं। कॉल न काटें, किसी को न बताएं और {amount} सत्यापन के लिए जमा करें।"],
    },
    "kyc": {
        "en": [
            "Dear customer, your KYC has expired and your account will be blocked today. Update now at https://{dom}/kyc.",
            "Your electricity connection will be disconnected tonight at 9:30 PM. Call our officer at {phone} immediately.",
        ],
        "hinglish": ["Aapka KYC expire ho gaya hai, account aaj band ho jayega. Abhi update karo https://{dom}/kyc."],
        "hi": ["आपका KYC समाप्त हो गया है, आज खाता बंद हो जाएगा। तुरंत अपडेट करें।"],
    },
    "job_reward": {
        "en": [
            "Congratulations! You have been selected for a work-from-home role earning ₹8,000 per day. Pay a registration fee of ₹2,500 to {upi} to start.",
            "You won a lucky draw worth {amount}. Pay the processing fee to {upi} within 1 hour to claim.",
        ],
        "hinglish": ["Badhai ho! Aapko ghar baithe job mili hai. ₹2,500 registration fee {upi} pe bhejo aaj hi."],
        "hi": ["बधाई हो, आपने {amount} जीते हैं। दावा करने के लिए शुल्क {upi} पर भेजें।"],
    },
}

LEGIT: dict[str, dict[str, list[str]]] = {
    "work": {
        "en": [
            "Hi team, reminder that the quarterly review is on Thursday at 11. Please update your slides by Wednesday.",
            "The invoice from {vendor} for {amount} has been approved by {name} and {first} in the payment portal. It will go out in Friday's run.",
            "Urgent: the client demo moved to 3 PM today. Can everyone join the Teams link in the calendar invite?",
            "As per policy, I've raised the PO for {vendor} in SAP. Second approval is pending with the {role}.",
            "Please call me back on my desk extension when you get a moment, I want to discuss the audit findings.",
            "Payroll will be processed on the 28th. Contact HR through the portal if your bank details changed.",
            "Thanks for the quick turnaround on the report. Let's discuss the budget numbers in tomorrow's stand-up.",
            "The {role} asked me to share the board deck. It's on the shared drive under Q3, nothing to action yet.",
            "Can you check the vendor master entry for {vendor}? Their GST number looks outdated. No payment needed now.",
            "Board meeting is running late, I'll call you on your directory number after 6 to approve the transfer properly.",
        ],
        "hinglish": [
            "Hi team, kal 11 baje review meeting hai. Slides Wednesday tak update kar dena please.",
            "{vendor} ka invoice portal pe approve ho gaya hai, Friday ke payment run mein jayega.",
            "Bhai urgent hai, client demo 3 baje shift ho gaya. Sab log Teams link join kar lena.",
            "Audit ke baare mein baat karni hai, free ho toh desk pe call kar lena.",
        ],
        "hi": [
            "टीम, गुरुवार 11 बजे तिमाही समीक्षा है। कृपया अपनी स्लाइड्स बुधवार तक अपडेट करें।",
            "{vendor} का इनवॉइस पोर्टल पर स्वीकृत हो गया है, शुक्रवार को भुगतान होगा।",
        ],
    },
    "personal": {
        "en": [
            "Happy Diwali to you and your family! Have a wonderful year ahead.",
            "Reached home safely. Will call you after dinner.",
            "Can you pick up milk on the way back? Also I've paid the electricity bill through the app.",
            "Sent you ₹500 for the movie tickets, check your GPay.",
            "Mom's flight lands at 7. I'll pick her up, you book the cab back from the station.",
        ],
        "hinglish": [
            "Diwali ki bahut shubhkamnayein! Ghar pe sabko pranam.",
            "Ghar pahunch gaya, khana khake call karta hoon.",
            "Movie tickets ke ₹500 GPay kar diye, check kar lena.",
            "Papa ki train late hai, main station se le aaunga.",
        ],
        "hi": ["दिवाली की हार्दिक शुभकामनाएं!", "घर पहुँच गया, खाना खाकर फोन करता हूँ।"],
    },
    "service": {
        "en": [
            "Your OTP for login is {otp}. Do not share it with anyone. Bank staff will never ask for your OTP.",
            "Your order has been shipped and will arrive by Tuesday. Track it in the app.",
            "Your monthly statement is ready. Log in to the official app to view it.",
            "Reminder: your car insurance renews next month. No action needed if auto-renew is on.",
        ],
        "hinglish": ["Aapka order ship ho gaya hai, Tuesday tak aa jayega. App mein track karein."],
        "hi": ["आपका लॉगिन OTP {otp} है। इसे किसी के साथ साझा न करें।"],
    },
}

_NOISE = ["", "", "", " Thanks.", " Regards.", " Sent from my iPhone", " 🙏", " pls", " ASAP", " ok?"]


def _variant(text: str) -> str:
    r = random.random()
    if r < 0.15:
        text = text.lower()
    elif r < 0.22:
        text = text.replace(".", "..")
    return text + random.choice(_NOISE)


def generate(n_per_family: int = 220, seed: int = 7) -> list[Sample]:
    random.seed(seed)
    out: list[Sample] = []
    for label, bank in ((1, SCAM), (0, LEGIT)):
        for family, by_lang in bank.items():
            k = n_per_family if label == 1 else int(n_per_family * len(SCAM) / len(LEGIT))
            for _ in range(k):
                lang = random.choices(list(by_lang), weights=[0.55, 0.3, 0.15][: len(by_lang)])[0]
                idx = random.randrange(len(by_lang[lang]))
                text = _variant(_fill(by_lang[lang][idx]))
                out.append(Sample(text, label, family, lang, f"{family}:{lang}:{idx}"))
    random.shuffle(out)
    return out


if __name__ == "__main__":
    data = generate()
    print(len(data), sum(s.label for s in data), "positives")
    for s in data[:8]:
        print(s.label, s.family, s.lang, "|", s.text)

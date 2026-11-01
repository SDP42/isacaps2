"""The assistant's local intent router, trained on this machine in seconds.

Three views of each question vote: a logistic regression on multilingual MiniLM sentence vectors (paraphrase and
Hinglish meaning), the nearest training phrasings in that same space (few-shot: one close paraphrase is strong
evidence), and a logistic regression on character and word n-grams (typos, half-words, transliteration). All are
trained on catalog.py augmented with typo noise. Without MiniLM (CI) the n-gram model works alone.

When the router is unsure, an optional local LLM (Ollama, on CPU so it never competes with the detectors for GPU
memory) may only pick one of the router's top candidates or say none. It never writes the answer.
"""
from __future__ import annotations

import functools
import json
import logging
import os
import random
import re
import time
import urllib.request

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, make_pipeline

from ..config import settings
from ..witnesses import pretrained
from .catalog import INTENTS, PRONOUNS, SUBJECT

log = logging.getLogger("mirage.assistant")
PATH = settings.models_dir / "assistant_router.joblib"
VERSION = 4
UNSURE = 0.42


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().strip())


def _typos(s: str, rng: random.Random) -> str:
    """Drop, double or swap one letter: the noise of fast typing in a live demo."""
    if len(s) < 6:
        return s
    i = rng.randrange(1, len(s) - 1)
    op = rng.choice(("drop", "double", "swap"))
    if op == "drop":
        return s[:i] + s[i + 1:]
    if op == "double":
        return s[:i] + s[i] + s[i:]
    return s[:i - 1] + s[i] + s[i - 1] + s[i + 1:]


def training_set() -> tuple[list[str], list[str]]:
    rng = random.Random(7)
    X, y = [], []
    for key, spec in INTENTS.items():
        for ex in spec["examples"]:
            for v in {ex, _norm(ex), _norm(ex).rstrip("?"), _typos(_norm(ex), rng), _typos(_norm(ex), rng)}:
                X.append(v)
                y.append(key)
    return X, y


def _chars():
    return make_pipeline(
        FeatureUnion([("c", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True)),
                      ("w", TfidfVectorizer(analyzer="word", ngram_range=(1, 2), sublinear_tf=True))]),
        LogisticRegression(C=12, max_iter=3000, class_weight="balanced"))


def train() -> dict:
    X, y = training_set()
    t = time.time()
    chars = _chars().fit(X, y)
    emb_clf, bank = None, None
    E = pretrained.sentence_embeddings(X)
    if E is not None:
        emb_clf = LogisticRegression(C=20, max_iter=4000, class_weight="balanced").fit(E, y)
        bank = (E.astype(np.float16), np.array(y))
    bundle = {"version": VERSION, "chars": chars, "emb": emb_clf, "bank": bank, "n": len(X), "intents": len(INTENTS),
              "seconds": round(time.time() - t, 1)}
    joblib.dump(bundle, PATH)
    return bundle


@functools.cache
def model() -> dict:
    try:
        b = joblib.load(PATH)
        if b.get("version") == VERSION and (b["emb"] is not None or not pretrained.available("minilm")):
            return b
    except Exception:
        pass
    log.info("training the assistant router")
    return train()


def probs(text: str) -> dict[str, float]:
    b = model()
    q = _norm(text)
    pc = b["chars"].predict_proba([q])[0]
    classes = list(b["chars"].classes_)
    p = dict(zip(classes, pc))
    if b["emb"] is not None and (e := pretrained.sentence_embeddings([q])) is not None:
        pe = dict(zip(b["emb"].classes_, b["emb"].predict_proba(e)[0]))
        E, labels = b["bank"]
        sims = E.astype(np.float32) @ e[0]
        near = {}
        for k in classes:  # mean of the two closest phrasings of each intent
            top = np.sort(sims[labels == k])[-2:]
            near[k] = float(top.mean())
        z = np.array([near[k] for k in classes]) * 25
        pk = dict(zip(classes, np.exp(z - z.max()) / np.exp(z - z.max()).sum()))
        p = {k: 0.4 * pe.get(k, 0) + 0.35 * pk[k] + 0.25 * p.get(k, 0) for k in classes}
    return p


# ---- entities --------------------------------------------------------------------------------------------------------

CASE_ID = re.compile(r"\b(?:MRG[-\s]?)?(0?[4-9]\d{2})\b", re.I)
SCENARIOS = {"cfo_wire": ("a", "cfo", "wire"), "video_meeting": ("b", "meeting", "video call", "zoom"),
             "it_otp": ("c", "otp", "help desk", "helpdesk", " it "), "real_voice_fraud": ("d", "genuine voice", "real voice"),
             "harmless_avatar": ("e", "avatar", "harmless", "townhall"), "papa_emergency": ("f", "papa", "family", "emergency"),
             "digital_arrest": ("g", "digital arrest", "cbi", "police"), "vendor_headshot": ("h", "vendor", "headshot", "bec")}
MODEL_ALIASES = {"df_arena": ("df arena", "dfarena", "df_arena", "arena"), "nii": ("nii", "antideepfake", "anti deepfake", "wav2vec"),
                 "wavlm": ("wavlm", "voiceprint model", "speaker verification model"), "commfor": ("community forensics", "commfor"),
                 "swinv2": ("swin", "swinv2"), "gend": ("gend", "clip"), "gend_pe": ("perception encoder", "gend pe", "pe-l"),
                 "yunet": ("yunet", "face detector"), "syncnet": ("syncnet", "lip sync", "lipsync", "lip-sync"),
                 "phishing": ("distilbert", "phishing model", "phishing classifier"),
                 "nli": ("mdeberta", "deberta", "zero shot", "zero-shot", "nli"), "minilm": ("minilm", "sentence transformer")}
TACTICS = {"urgency": ("urgent", "urgency", "jaldi", "immediately", "rush"), "authority": ("authority", "boss", "officer"),
           "secrecy": ("secret", "secrecy", "don't tell", "dont tell", "kisi ko mat"), "fear": ("fear", "threat", "scared", "arrest"),
           "reward": ("reward", "prize", "lottery", "won"), "channel_switch": ("channel switch", "switch to whatsapp", "personal number"),
           "bypass": ("bypass", "skip approval", "skip the process")}
SCAMS = {"digital_arrest": ("digital arrest", "cbi", "customs", "narcotics", "police call"),
         "payment_fraud": ("ceo fraud", "cfo", "business email", "bec", "vendor", "invoice", "wire"),
         "family_emergency": ("family", "papa", "mummy", "son", "daughter", "accident", "grandparent"),
         "credential_theft": ("otp", "kyc", "password", "pin", "login"),
         "reward_scam": ("lottery", "prize", "investment", "job", "refund", "trading", "crypto", "stock tip"),
         "remote_access": ("anydesk", "teamviewer", "screen share", "remote"),
         "gift_card": ("gift card", "giftcard", "amazon card", "google play card"),
         "sextortion": ("sextortion", "nude", "morphed")}
PAGES = {"/app/voice": ("voice check", "voice page", "check voices", "check a voice"), "/app/redteam": ("red team", "attack lab"),
         "/app/dashboard": ("command centre", "command center", "dashboard"), "/app/trustbook": ("trustbook",),
         "/app/shield": ("live call", "call shield", "shield page"), "/app/liveness": ("liveness",),
         "/app/cases": ("cases",), "/app/system": ("models page", "models & audit", "audit", "settings"),
         "/app/lab": ("scenario lab",), "/app/drills": ("drill",), "/app/casebook": ("casebook",),
         "/app/tribunal": ("tribunal",), "/app/investigate": ("investigation page", "investigate", "upload a file", "new investigation"),
         "/app/safety": ("personal safety", "safety page"), "/app/identity": ("identity graph",),
         "/app/attack-chain": ("attack chain",), "/app/replay": ("replay",), "/app/challenge": ("spot the fake",)}


def _find(text: str, table: dict[str, tuple]) -> str | None:
    t = f" {text.lower()} "
    best = None
    for key, words in table.items():
        for w in words:
            if (len(w) == 1 and re.search(rf"\b(scenario|case)\s+{w}\b", t)) or (len(w) > 1 and w in t):
                if not best or len(w) > best[1]:
                    best = (key, len(w))
    return best[0] if best else None


def entities(text: str) -> dict:
    t = text.lower()
    out = {"scenario": _find(text, SCENARIOS), "model": _find(text, MODEL_ALIASES), "tactic": _find(text, TACTICS),
           "scam": _find(text, SCAMS), "page": _find(text, PAGES)}
    if m := re.search(r"\bMRG[-\s]?(\d{3,4})\b", text, re.I):
        out["case_id"] = f"MRG-{int(m.group(1)):04d}"
    elif m := re.search(r"\bcase\s+(?:no\.?\s*|#)?(\d{3,4})\b", t):
        out["case_id"] = f"MRG-{int(m.group(1)):04d}"
    out["pronoun"] = any(re.search(rf"\b{re.escape(p)}\b", t) for p in PRONOUNS)
    out["payload"] = payload(text)
    return out


CHECK = re.compile(r"\b(check|scan|analy[sz]e|verify|test|legit|genuine|scam|fraud|phishing|fake)\b", re.I)
QUOTED = re.compile(r"[\"“'‘](.{12,})[\"”'’]", re.S)


def payload(text: str) -> str | None:
    """The message to check, when the user pasted one: quoted text, or what follows a colon, or a long message."""
    if m := QUOTED.search(text):
        return m.group(1).strip()
    if ":" in text:
        head, _, tail = text.partition(":")
        if len(tail.strip()) >= 12 and len(head) < 80 and not head.lower().startswith("http"):
            return tail.strip()
    if len(text) >= 140:
        return text.strip()
    return None


# ---- routing ---------------------------------------------------------------------------------------------------------

def _llm_pick(text: str, candidates: list[str]) -> str | None:
    model_name = os.getenv("MIRAGE_ASSISTANT_LLM", "off")
    if model_name == "off":
        return None
    host = os.getenv("OLLAMA_HOST_URL", settings.ollama_url or "http://127.0.0.1:11434").rstrip("/")
    menu = "\n".join(f"- {k}: {INTENTS[k]['desc']}" for k in candidates)
    prompt = (f"A user asked a security assistant: \"{text}\"\nWhich ONE topic below matches best? Reply with JSON "
              f"{{\"intent\": \"<key>\"}} using a key from the list, or {{\"intent\": \"none\"}}.\n{menu}")
    body = {"model": model_name, "stream": False, "format": "json", "keep_alive": "30m",
            "options": {"num_gpu": 0, "num_ctx": 1024, "temperature": 0, "num_predict": 20},  # CPU: GPU is the detectors'
            "messages": [{"role": "user", "content": prompt}]}
    try:
        req = urllib.request.Request(f"{host}/api/chat", json.dumps(body).encode(), {"content-type": "application/json"})
        out = json.loads(json.load(urllib.request.urlopen(req, timeout=float(os.getenv("MIRAGE_ASSISTANT_LLM_TIMEOUT", "12"))))["message"]["content"])
        pick = out.get("intent")
        return pick if pick in candidates else None
    except Exception as exc:
        log.info("tie-break LLM unavailable: %s", exc)
        return None


GLOBAL = {"accuracy", "limitations", "about", "how_overall", "compare_tools", "assistant_how", "model_list", "no_training"}


def route(text: str, has_subject: bool) -> dict:
    """Pick an intent. Returns {intent, confidence, method, alternatives, entities}."""
    ent = entities(text)
    p = probs(text)
    ranked = sorted(p.items(), key=lambda kv: -kv[1])
    intent, conf = ranked[0]
    method = "router"
    words = len(re.findall(r"\w+", text))

    # deterministic signals that beat the classifier
    if ent.get("case_id") and intent not in ("why", "score_math", "what_now", "report"):
        intent, conf, method = "open_case", max(conf, 0.9), "entity"
    elif ent["payload"] and len(ent["payload"]) >= 40 and intent not in ("scammed_help",) and \
            (intent == "analyse_text" or p.get("analyse_text", 0) > 0.05 or len(text) >= 140):
        intent, conf, method = "analyse_text", max(conf, 0.85), "payload"
    elif intent == "analyse_text" and not ent["payload"] and len(text) < 100 and not CHECK.search(text):
        # "is this just chatgpt?" reads like a pasted message to the classifier, but there is no message in it
        intent, conf = next((k, v) for k, v in ranked if k != "analyse_text")
        method = "router (no message to check)"
    elif has_subject and INTENTS[intent].get("kind") != SUBJECT and not (intent in GLOBAL and conf >= 0.35) and \
            ((words <= 7 and conf < 0.6) or conf < 0.35):
        # a follow-up ("so it's fake?", "should I buy the cards or not") is about what we just looked at
        sub = max((kv for kv in ranked if INTENTS[kv[0]].get("kind") == SUBJECT), key=lambda kv: kv[1])
        if sub[1] >= 0.8 * conf or (conf < 0.35 and sub[1] >= 0.1) or (ent["pronoun"] and sub[1] >= 0.15 and conf < 0.35):
            intent, conf, method = sub[0], max(sub[1], 0.5), "follow-up"

    if conf < UNSURE and method == "router":
        cands = [k for k, _ in ranked[:5]]
        if (pick := _llm_pick(text, cands)) is not None:
            intent, conf, method = pick, max(p[pick], UNSURE), "router + local LLM tie-break"
    return {"intent": intent, "confidence": round(float(conf), 3), "method": method,
            "alternatives": [{"intent": k, "p": round(float(v), 3)} for k, v in ranked[1:4]], "entities": ent}

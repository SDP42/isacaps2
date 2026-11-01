"""The assistant's skills: each intent becomes an answer made of visual blocks.

Facts come from the detectors' own outputs (voice, media and text checks, full cases), the model registry, the measured
benchmark, the latest red-team campaign and the case database. Prose is written here, around those facts; nothing is
generated freely, so a twisted question can at worst get the right answer to a neighbouring question, never an
invented number. The frontend renders the block types in components/assistant/Blocks.tsx.
"""
from __future__ import annotations

import re
import time
from pathlib import Path

from sqlalchemy import select

from ..fusion import response as resp
from ..models import Case
from ..serializers import case_detail
from ..storage import store
from ..witnesses import pretrained
from . import knowledge as K

ROOT = K.ROOT
SEV_TONE = {"CRITICAL": "crimson", "HIGH": "crimson", "MEDIUM": "amber", "INCONCLUSIVE": "violet", "LOW": "mint"}
TACTIC_INFO = {
    "urgency": ("Urgency", "A deadline so you act before you think: \"before 4 PM\", \"in 10 minutes\"."),
    "authority": ("Authority", "A boss, officer, bank or agency, so questioning feels like insubordination."),
    "secrecy": ("Secrecy", "\"Don't tell anyone\": it stops the one call that would expose the scam."),
    "fear": ("Fear", "Arrest, account block or an accident: fear narrows attention to obeying."),
    "reward": ("Reward", "A prize, refund, job or return that is too good, with a fee first."),
    "channel_switch": ("Channel switch", "Moving you to a personal number or app, away from logged channels."),
    "bypass": ("Bypassed control", "Asking you to skip approvals, the vendor master or a callback."),
}
ACTION_LABEL = {"payment": "a payment", "credential": "an OTP, PIN or password", "remote_access": "remote access to your device",
                "data": "sensitive data", "info": "information", "none": "nothing"}
SAMPLES = {
    "ai_cfo_voice": ("demo_inputs/01_voice_check/01_ai_cfo_wire_whatsapp.ogg", "AI voice of a 'CFO' asking for a wire, sent as a WhatsApp voice note"),
    "ai_family_voice": ("demo_inputs/01_voice_check/02_ai_family_emergency_hinglish.ogg", "Hindi AI voice: 'Papa, accident…' family emergency"),
    "ai_harmless_voice": ("demo_inputs/01_voice_check/03_ai_townhall_announcement_harmless.mp3", "AI voice announcing a townhall: synthetic but harmless"),
    "human_voice": ("demo_inputs/01_voice_check/04_human_voice_audiobook_librispeech.wav", "A real human reading (LibriSpeech, CC BY 4.0)"),
    "noisy_ai_voice": ("demo_inputs/01_voice_check/05_ai_otp_helpdesk_noisy_street.wav", "AI 'help desk' voice asking for an OTP, buried in street noise"),
    "ai_image": ("demo_inputs/02_image_check/01_ai_police_officer_portrait.jpg", "AI-generated 'police officer' portrait (digital-arrest prop)"),
    "real_image": ("demo_inputs/02_image_check/04_real_photo_astronaut_nasa.jpg", "A real NASA photograph"),
    "ai_video": ("demo_inputs/03_video_check/01_ai_avatar_digital_arrest_officer.mp4", "AI avatar 'officer' with a cloned voice (digital arrest)"),
    "lipsync_video": ("demo_inputs/03_video_check/03_ai_meeting_lipsync_drift.mp4", "Meeting clip with lip-sync drift and a synthetic voice"),
    "real_video": ("demo_inputs/03_video_check/04_real_face_human_voice_benign.mp4", "Real photo over a real human reading"),
}


# ---- small block helpers ---------------------------------------------------------------------------------------------

def lead(text: str) -> dict:
    return {"type": "lead", "text": text}


def para(text: str) -> dict:
    return {"type": "text", "text": text}


def facts(items: list[tuple], title: str | None = None) -> dict:
    return {"type": "facts", "title": title, "items": [{"label": a, "value": b, **({"tone": c[0]} if c else {})}
                                                      for a, b, *c in items]}


def bars(title: str, items: list[dict], caption: str | None = None) -> dict:
    return {"type": "bars", "title": title, "items": items, "caption": caption}


def steps(title: str, items: list[str], tone: str = "cyan") -> dict:
    return {"type": "steps", "title": title, "items": items, "tone": tone}


def bullets(title: str | None, items: list, tone: str = "cyan") -> dict:
    return {"type": "list", "title": title, "items": [i if isinstance(i, dict) else {"text": i, "tone": tone} for i in items]}


def callout(tone: str, title: str, text: str) -> dict:
    return {"type": "callout", "tone": tone, "title": title, "text": text}


def flow(title: str, items: list[tuple[str, str]], active: int | None = None) -> dict:
    return {"type": "flow", "title": title, "items": [{"title": a, "detail": b} for a, b in items], "active": active}


def table(columns: list[str], rows: list[list], title: str | None = None) -> dict:
    return {"type": "table", "title": title, "columns": columns, "rows": rows}


def actions(*items: dict) -> dict:
    return {"type": "actions", "items": list(items)}


def go(label: str, to: str) -> dict:
    return {"label": label, "to": to}


def ask(label: str, prompt: str | None = None) -> dict:
    return {"label": label, "prompt": prompt or label}


def pct(x: float | None, digits: int = 0) -> str:
    return "—" if x is None else f"{100 * x:.{digits}f}%"


def fix(s: str) -> str:
    """Repair UTF-8 text that was decoded as Windows-1252 somewhere upstream ("â‚¹" -> "₹")."""
    if "â" in s or "Ã" in s:
        try:
            return s.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def inr(n) -> str:
    if not n:
        return "—"
    n = int(n)
    if n >= 10_000_000:
        return f"₹{n / 10_000_000:.2f} crore"
    if n >= 100_000:
        return f"₹{n / 100_000:.2f} lakh"
    return f"₹{n:,}"


def bench_bar(label: str, model: str, ds: str, note: str | None = None, key: str = "auc") -> dict | None:
    v = K.metric(model, ds, key)
    n = K.metric(model, ds, "n")
    if v is None:
        return None
    return {"label": label, "value": v, "max": 1, "display": f"{v:.3f}" if key == "auc" else pct(v, 1),
            "tone": "mint" if v >= 0.9 else "amber" if v >= 0.75 else "crimson", "note": note or (f"n = {n}" if n else None)}


# ---- subjects: one view over every kind of result ------------------------------------------------------------------

def view(sub: dict) -> dict:
    kind, d = sub["kind"], sub["data"]
    v: dict = {"kind": kind, "title": sub.get("label", ""), "tactics": [], "action": "none", "spans": [], "words": [],
               "windows": [], "models": None, "meta": None, "text": "", "synthetic": None, "noisy": False}
    if kind == "voice":
        s1, s2, s3 = d["stage1"], d["stage2"], d["stage3"]
        sem = s2.get("semantics") or {}
        v.update(severity=s3["severity"], synthetic=s1["verdict"], synth_score=s1["score"], synth_label=s1["label"],
                 confidence=s1["confidence"], models=s1.get("models"), meta=s1.get("meta"), agree=s1.get("agree"),
                 tactics=sem.get("tactics", []), action=sem.get("action", "none"), amount=sem.get("amount_inr"),
                 category=d["response"]["category"], category_label=d["response"]["category_label"],
                 text=s2.get("transcript") or "", words=s2.get("words") or [], spans=sem.get("spans", []),
                 language=s2.get("language"), windows=s1.get("windows") or [], peaks=s1.get("waveform"),
                 duration=s1.get("duration_s"), noisy=s1.get("noisy"), channel=s1.get("channel") or {},
                 why=s3["why"], kind_code=s3["kind"], response=d["response"], summary=s1["summary"],
                 sensitive=s3["sensitive"])
    elif kind == "media":
        s = d["score"]
        v.update(severity=d["response"]["severity"], synthetic="ai" if s >= 0.7 else "human" if s <= 0.3 else "uncertain",
                 synth_score=s, synth_label=d["label"], confidence=None, models=d.get("models"), meta=d.get("meta"),
                 category=d["response"]["category"], category_label=d["response"]["category_label"],
                 response=d["response"], summary=d["summary"], evidence=d.get("evidence", []), media=d["kind"])
    elif kind == "text":
        sem = d["semantics"]
        v.update(severity=d["severity"], synth_score=None, confidence=None, tactics=sem["tactics"], action=sem["action"],
                 amount=sem.get("amount_inr"), category=sem["category"], category_label=sem["category_label"],
                 text=sub.get("text", ""), spans=sem.get("spans", []), response=d["response"], summary=sem["summary"],
                 score=sem["score"], entities=sem.get("entities", {}), deadline=sem.get("deadline"))
    elif kind == "case":
        vd = d["verdict"] or {}
        words_f = next((f for f in d["findings"] if f["witness"] == "words"), None)
        media = [f for f in d["findings"] if f["witness"] in ("voice", "face", "provenance") and f["score"] is not None]
        top = max(media, key=lambda f: f["score"], default=None)
        pre = (top or {}).get("details", {}).get("pretrained") or {}
        v.update(severity=sub["severity"], risk=vd.get("risk"), band=vd.get("band"), rule=vd.get("rule_fired"),
                 contributions=vd.get("contributions"), dims=vd.get("dims"), reasons=[fix(r["text"]) for r in vd.get("reasons", [])],
                 tactics=(words_f or {}).get("details", {}).get("tactics", []), action=vd.get("requested_action", "none"),
                 amount=(words_f or {}).get("details", {}).get("amount_inr"), text=d.get("message_text") or "",
                 synth_score=(top or {}).get("score"), synthetic="ai" if "LIKELY_SYNTHETIC" in (vd.get("tags") or []) else None,
                 models=pre.get("models") if isinstance(pre.get("models"), dict) else None, meta=pre.get("meta"),
                 category=sub["response"]["category"], category_label=sub["response"]["category_label"],
                 response=sub["response"], summary=fix(vd.get("summary", "")), evidence=d["evidence"], case_id=d["id"],
                 findings=d["findings"], plan=vd.get("verification_plan") or [])
    if v["models"] and isinstance(next(iter(v["models"].values())), list):  # per-window lists -> mean per model
        v["models"] = {k: round(sum(x) / len(x), 3) for k, x in v["models"].items() if x}
    if v["models"]:  # witnesses report models by display name; skills work with registry keys
        v["models"] = {_KEY.get(k, k): s for k, s in v["models"].items()}
        v["meta"] = {_KEY.get(k, k): m for k, m in (v.get("meta") or {}).items()} or None
    return v


_KEY = {pretrained.name(k): k for k in pretrained.MODELS}


def _marks(v: dict) -> list[dict]:
    return [{"start": s["span"][0], "end": s["span"][1], "kind": s["kind"]} for s in v.get("spans", []) if s.get("span")]


def quote(v: dict, label: str) -> dict | None:
    if not v.get("text"):
        return None
    return {"type": "quote", "label": label, "text": v["text"], "marks": _marks(v)}


def jury(v: dict, compact: bool = True) -> dict | None:
    if not v.get("models"):
        return None
    meta = v.get("meta") or pretrained.meta(v["models"].keys())
    named = {pretrained.name(k) if k in pretrained.MODELS else k: s for k, s in v["models"].items()}
    meta_named = {pretrained.name(k) if k in pretrained.MODELS else k: m for k, m in (meta or {}).items()}
    return {"type": "jury", "models": named, "meta": meta_named, "consensus": v.get("synth_score"),
            "fake_word": "AI-generated" if v["kind"] != "voice" else "synthetic", "compact": compact}


def timeline(v: dict) -> dict | None:
    if v["kind"] != "voice" or not v.get("duration"):
        return None
    return {"type": "timeline", "duration": v["duration"], "peaks": v.get("peaks"), "windows": v.get("windows"),
            "words": v.get("words"), "spans": [{"kind": s["kind"], "span": s["span"]} for s in v.get("spans", []) if s.get("span")],
            "threshold": 0.5, "src": v.get("src")}


def verdict_block(v: dict) -> dict:
    sev = v["severity"]
    r = v.get("response") or {}
    score, label = v.get("synth_score"), v.get("synth_label")
    if v["kind"] == "case":
        score, label = (v.get("risk") or 0) / 100, f"Risk {v.get('risk', 0):.0f}/100"
    elif v["kind"] == "text":
        score, label = v.get("score"), "Scam likelihood"
    return {"type": "verdict", "severity": sev, "tone": SEV_TONE.get(sev, "cyan"), "title": r.get("headline", sev),
            "subtitle": v.get("category_label"), "score": score, "score_label": label,
            "chips": [x for x in [v.get("synth_label") if v["kind"] in ("voice", "media") else None,
                                  f"Asks for {ACTION_LABEL.get(v['action'], v['action'])}" if v.get("action") not in (None, "none") else "Asks for nothing sensitive",
                                  f"Amount {inr(v['amount'])}" if v.get("amount") else None,
                                  "Noisy audio: weaker evidence" if v.get("noisy") else None] if x]}


def matrix_block(v: dict, hypo: dict | None = None) -> dict | None:
    if v["kind"] != "voice":
        return None
    return {"type": "matrix", "synthetic": v["synthetic"], "sensitive": bool(v.get("sensitive")), "hypo": hypo}


def tactic_chips(v: dict) -> dict | None:
    if not v.get("tactics"):
        return None
    return {"type": "chips", "title": "Pressure tactics found", "items": [
        {"label": TACTIC_INFO.get(t, (t, ""))[0], "detail": TACTIC_INFO.get(t, ("", ""))[1], "tone": "amber", "kind": t}
        for t in v["tactics"]]}


def follow_ups(v: dict) -> list[str]:
    s = ["Why?", "How sure are you?", "What should I do now?"]
    if v["kind"] == "media":
        s.append("How was the score calculated?")
    if v["kind"] == "voice":
        s.insert(1, "Which part sounds fake?")
        s.append("What if it was a real person?")
    if v.get("tactics"):
        s.append("What tricks are they using?")
    if v["kind"] == "case":
        s.append("How was the score calculated?")
    if v.get("models"):
        s.append("Did all the models agree?")
    return s[:5]


def card(v: dict, intro: str) -> list[dict]:
    blocks = [lead(intro), verdict_block(v), matrix_block(v), jury(v), timeline(v),
              quote(v, "Transcript" if v["kind"] == "voice" else "Message") if v["kind"] in ("voice", "text") else None,
              tactic_chips(v)]
    r = v.get("response") or {}
    if r.get("do_now") and v["severity"] != "LOW":
        blocks.append(steps("Do this now", r["do_now"][:3], SEV_TONE.get(v["severity"], "cyan")))
    if v["kind"] == "case":
        blocks.append(actions(go("Open the case", f"/app/cases/{v['case_id']}"), go("Run the cure", f"/app/cases/{v['case_id']}/respond"),
                              go("See the Tribunal", f"/app/tribunal/{v['case_id']}")))
    return [b for b in blocks if b]


def intro_for(v: dict) -> str:
    sev = v["severity"]
    if v["kind"] == "voice":
        who = {"ai": "a machine-generated voice", "human": "a human voice", "uncertain": "a voice the detectors cannot vouch for"}[v["synthetic"]]
        ask_ = ACTION_LABEL.get(v["action"], v["action"])
        return f"**{sev}.** This is {who} ({v['synth_score']:.2f} on the synthetic scale) and it asks for {ask_}. {v['why']}"
    if v["kind"] == "media":
        return f"**{v['synth_label']}** ({v['synth_score']:.2f}). {v['summary']}"
    if v["kind"] == "text":
        return f"**{sev}.** {v['summary']}"
    return f"**{v['band']} · {v['risk']:.0f}/100.** {v['summary']}"


# ---- subject skills -----------------------------------------------------------------------------------------------

def need_subject(ctx) -> dict:
    return {"blocks": [lead("I need something to look at first. Drop a voice note, call recording, image, video or "
                            "email here, paste a message, or try one of the samples below."),
                       sample_menu()],
            "suggestions": ["Show me how you catch a voice clone", "Run scenario A", "Open the latest case"]}


def sample_menu() -> dict:
    return {"type": "samples", "items": [{"key": k, "label": lbl, "kind": Path(p).suffix.lstrip(".")} for k, (p, lbl) in SAMPLES.items()]}


def s_why(ctx) -> dict:
    v = ctx.view
    blocks: list = []
    if v["kind"] == "voice":
        pts = []
        if v["synthetic"] == "ai":
            pts.append({"text": f"The anti-spoofing detectors score the voice {v['synth_score']:.2f} (AI from 0.70): {v['summary']}", "tone": "crimson"})
        elif v["synthetic"] == "human":
            pts.append({"text": f"The detectors score the voice {v['synth_score']:.2f}, which is human territory (0.30 or below).", "tone": "mint"})
        else:
            pts.append({"text": f"The voice scores {v['synth_score']:.2f}, in the uncertain band"
                                + (", widened because the audio is noisy" if v.get("noisy") else "") + ".", "tone": "violet"})
        if v.get("agree") is not None and v.get("models"):
            n = len(v["models"])
            pts.append({"text": f"{n} detector{'s' if n > 1 else ''} voted" + (" and agree." if v["agree"] else ", and they disagree, which lowers confidence."), "tone": "cyan"})
        if v["action"] != "none":
            pts.append({"text": f"The transcript asks for {ACTION_LABEL[v['action']]}" + (f" ({inr(v['amount'])})" if v.get("amount") else "") + ".", "tone": "amber"})
        for t in v["tactics"]:
            pts.append({"text": f"{TACTIC_INFO.get(t, (t, ''))[0]}: {TACTIC_INFO.get(t, ('', ''))[1]}", "tone": "amber"})
        if v.get("noisy"):
            snr = (v.get("channel") or {}).get("snr_db")
            pts.append({"text": f"Background noise (SNR {snr} dB) hides synthesis artefacts, so only the most noise-robust model (DF_Arena) votes and the evidence is marked weak.", "tone": "violet"})
        blocks = [lead(f"Two questions decide it: **who is speaking** and **what they want**. {v['why']}"),
                  matrix_block(v), bullets("What the evidence says", pts), jury(v)]
    elif v["kind"] == "media":
        ev = [{"text": f"{e['label']}: {e['detail']}", "tone": "crimson" if e.get("severity", 0) >= 2 else "amber"} for e in v.get("evidence", [])]
        blocks = [lead(f"{v['summary']}"), jury(v, compact=False), bullets("Evidence", ev) if ev else None]
    elif v["kind"] == "text":
        blocks = [lead(v["summary"]), quote(v, "Where it shows"), tactic_chips(v),
                  facts([("Asks for", ACTION_LABEL.get(v["action"], v["action"])), ("Scam likelihood", f"{v['score']:.2f}"),
                         ("Category", v["category_label"])])]
    else:
        blocks = [lead(v["summary"]), bullets("Reasons the risk engine gave", [{"text": r, "tone": "crimson" if i == 0 and v.get("rule") else "amber"}
                                                                           for i, r in enumerate(v["reasons"])]),
                  callout("violet", "Policy rule", f"“{v['rule'].replace('_', ' ')}” fired before the score: a money or access request with no verification is never left to statistics.")
                  if v.get("rule") else None, contrib_bars(v)]
    return {"blocks": [b for b in blocks if b], "suggestions": follow_ups(v)}


def s_where(ctx) -> dict:
    v = ctx.view
    if v["kind"] == "voice":
        hot = sorted((w for w in v.get("windows") or [] if w.get("score", 0) >= 0.5), key=lambda w: -w["score"])
        txt = (f"{len(hot)} of {len(v['windows'])} four-second windows score synthetic; the strongest is "
               f"{hot[0]['t0']:.1f}–{hot[0]['t1']:.1f} s at {hot[0]['score']:.2f}." if hot else
               "No window crosses 0.5: no part of the clip looks synthetic.") if v.get("windows") else "This clip was scored as a whole."
        if v.get("spans"):
            txt += " Tactic words are marked on the transcript lane."
        return {"blocks": [lead(txt + " Drag the playhead to hear each part."), timeline(v), tactic_chips(v)],
                "suggestions": ["Why is that part fake?", "What did the caller say?", "How sure are you?"]}
    if v["kind"] in ("text", "case") and v.get("text"):
        return {"blocks": [lead("The highlighted phrases are what the words witness flagged; hover one for the tactic."),
                           quote(v, "Flagged phrases"), tactic_chips(v)], "suggestions": ["What tricks are they using?", "What should I do now?"]}
    ev = v.get("evidence") or []
    return {"blocks": [lead("Image and face detectors score the whole picture or every face crop; they do not draw a mask. "
                            "These are the findings that pushed the score:"),
                       bullets(None, [{"text": f"{e['label']}: {e['detail']}", "tone": "amber"} for e in ev[:5]]) if ev else None, jury(v)],
            "suggestions": ["How sure are you?", "Which models checked this?"]}


def s_confidence(ctx) -> dict:
    v = ctx.view
    pts, tiles = [], []
    if v.get("synth_score") is not None and v["kind"] in ("voice", "media"):
        s = v["synth_score"]
        margin = abs(s - 0.5)
        tiles += [("Synthetic score", f"{s:.2f}", "crimson" if s >= 0.7 else "mint" if s <= 0.3 else "violet"),
                  ("Distance from the 0.5 line", f"{margin:.2f}")]
        if v.get("confidence") is not None:
            tiles.append(("Witness confidence", pct(v["confidence"])))
        if v.get("models"):
            yes = sum(1 for k, x in v["models"].items() if x >= (v.get("meta") or {}).get(k, {}).get("threshold", 0.5))
            tiles.append(("Models agreeing", f"{max(yes, len(v['models']) - yes)} of {len(v['models'])}"))
    if v["kind"] == "voice":
        auc, n = K.metric("ensemble", "audio_df"), K.metric("ensemble", "audio_df", "n")
        if auc is not None:
            pts.append({"text": f"On the voice benchmark ({n} clips) the ensemble's AUC is {auc:.3f}.", "tone": "mint"})
        camp = K.latest_campaign("audio")
        if camp:
            caught = sum(c["caught"] for c in camp["cells"])
            pts.append({"text": f"The latest red-team campaign caught {caught} of {len(camp['cells'])} laundered fake voices.", "tone": "mint"})
        if v.get("noisy"):
            pts.append({"text": "This audio is noisy: in the noise study about 1 in 40 real voices was flagged at 10 dB SNR, so treat this as weaker evidence.", "tone": "violet"})
    elif v["kind"] == "media":
        mod = "face" if v.get("media") == "video" else "image"
        if mod == "image" and (auc := K.metric("ensemble", "img_modern")) is not None:
            pts.append({"text": f"AI-image benchmark AUC {auc:.3f} on {K.metric('ensemble', 'img_modern', 'n')} images.", "tone": "mint"})
        else:
            for ds, lbl in (("face_ff", "FaceForensics++"), ("face_openforensics", "OpenForensics (in the wild)")):
                if (auc := K.metric("face_ensemble", ds)) is not None:
                    pts.append({"text": f"Face benchmark {lbl}: AUC {auc:.3f}.", "tone": "mint" if auc >= 0.85 else "amber"})
            pts.append({"text": "In-the-wild face swaps are MIRAGE's weakest area, so a clean face result on a video is not proof.", "tone": "violet"})
    elif v["kind"] in ("text", "case"):
        if (auc := K.metric("words_witness", "india_sms")) is not None:
            pts.append({"text": f"The words witness scores {auc:.3f} AUC on Indian scam SMS.", "tone": "mint"})
        if v["kind"] == "case" and v.get("dims"):
            iv = (ctx.subject["data"]["verdict"] or {}).get("interval")
            if iv:
                tiles.append(("Risk interval", f"{iv[0]:.0f}–{iv[1]:.0f}"))
    if v["kind"] in ("voice", "media"):
        pts.append({"text": "Ask “how accurate is MIRAGE overall?” for every benchmark.", "tone": "cyan"})
    pts.append({"text": "No detector is proof on its own. That is why MIRAGE weighs what is being asked: a sensitive request is always verified on a known number, whatever the score.", "tone": "cyan"})
    return {"blocks": [lead("How much weight this result can carry:"), facts(tiles) if tiles else None, bullets("Track record", pts)],
            "suggestions": ["Which models checked this?", "Could a real voice score like this?" if v["kind"] == "voice" else "What are the limitations?",
                            "What should I do now?"]}


def s_models(ctx) -> dict:
    v = ctx.view
    if not v.get("models"):
        return {"blocks": [lead("This result came from the text and request analysis, not from media detectors."),
                           facts([("Scam likelihood", f"{v.get('score', 0):.2f}"), ("Asks for", ACTION_LABEL.get(v["action"], v["action"]))])],
                "suggestions": ["How do you detect scam messages?", "Why?"]}
    reg = {r["key"]: r for r in K.models()}
    rows = [[pretrained.name(k) if k in pretrained.MODELS else k, f"{s:.2f}", f"{pretrained.THRESHOLDS.get(k, 0.5)}",
             "synthetic" if s >= pretrained.THRESHOLDS.get(k, 0.5) else "real", reg.get(k, {}).get("published", "")]
            for k, s in v["models"].items()]
    return {"blocks": [lead("Each detector votes against its own measured threshold; the ensemble averages them in logit space with fixed weights."),
                       jury(v, compact=False), table(["Model", "Score", "Threshold", "Vote", "Published result"], rows)],
            "suggestions": ["What is DF Arena?", "How sure are you?", "Why?"]}


def s_transcript(ctx) -> dict:
    v = ctx.view
    if not v.get("text"):
        return {"blocks": [lead("There is no speech transcript for this item" + (" (it is an image or video frame check)." if v["kind"] == "media" else "."))],
                "suggestions": ["Why?", "How sure are you?"]}
    lang = v.get("language")
    return {"blocks": [lead(f"Transcribed locally with faster-whisper{f' ({lang})' if lang else ''}. Tactic phrases are highlighted."),
                       quote(v, "Transcript" if v["kind"] == "voice" else "Message"),
                       facts([("Asks for", ACTION_LABEL.get(v["action"], v["action"])), ("Amount", inr(v.get("amount"))),
                              ("Tactics", str(len(v["tactics"])))])],
            "suggestions": ["What tricks are they using?", "Which part sounds fake?", "What should I do now?"]}


def s_tactics(ctx) -> dict:
    v = ctx.view
    if not v.get("tactics"):
        return {"blocks": [lead("No pressure tactics were found: no urgency, secrecy, authority, fear, reward, channel switch or bypassed control."),
                           quote(v, "Text checked") if v.get("text") else None],
                "suggestions": ["Why?", "What should I do now?"]}
    return {"blocks": [lead(f"{len(v['tactics'])} social-engineering lever{'s' if len(v['tactics']) > 1 else ''} at work. Each one is there to stop you verifying."),
                       tactic_chips(v), quote(v, "Where they appear")],
            "suggestions": ["What should I do now?", "What should I ask to verify?", "What is the category of this scam?"]}


def s_what_now(ctx) -> dict:
    v = ctx.view
    r = v["response"]
    blocks = [lead(f"**{r['headline']}.**" + (f" This matches: {r['category_label']}." if r["category"] not in ("benign",) else "")),
              steps("Do this now", r["do_now"], SEV_TONE.get(r["severity"], "cyan"))]
    if r.get("say_this"):
        blocks.append(callout("cyan", "Say this", f"“{r['say_this']}”"))
    if r.get("dont"):
        blocks.append(bullets("Don't", r["dont"], "crimson"))
    if r.get("report_to"):
        blocks.append({"type": "contacts", "items": r["report_to"]})
    if r.get("if_paid"):
        blocks.append({"type": "disclosure", "title": "If money already moved", "items": r["if_paid"]})
    if v["kind"] == "case":
        blocks.append(actions(go("Open the Cure Console", f"/app/cases/{v['case_id']}/respond")))
    return {"blocks": blocks, "suggestions": ["How do I report this?", "What should I ask to verify?", "I already paid"]}


def s_what_if(ctx) -> dict:
    v = ctx.view
    t = ctx.text.lower()
    if v["kind"] == "voice":
        from ..routers.triage import _decide

        hypo_synth = "human" if any(w in t for w in ("human", "real", "genuine", "asli", "actual")) else v["synthetic"]
        hypo_sens = not any(w in t for w in ("no money", "didn't ask", "did not ask", "nothing", "harmless", "no payment", "not ask", "no request"))
        if hypo_synth == v["synthetic"] and hypo_sens == bool(v.get("sensitive")):
            hypo_synth = "human" if v["synthetic"] != "human" else "ai"
        sem = ctx.subject["data"]["stage2"].get("semantics")
        fake_sem = dict(sem or {"tactics": [], "action": "none", "category": "benign"})
        if not hypo_sens:
            fake_sem.update(action="none", category="benign")
        sev, kind, why = _decide(hypo_synth, fake_sem if sem or hypo_sens else None)
        who = {"ai": "machine-generated", "human": "human", "uncertain": "uncertain"}[hypo_synth]
        return {"blocks": [lead(f"With a **{who}** voice{' and the same request' if hypo_sens else ' and no sensitive request'}, the verdict becomes **{sev}**. {why}"),
                           matrix_block(v, {"synthetic": hypo_synth, "sensitive": hypo_sens}),
                           callout("cyan", "The point", "MIRAGE judges the request as much as the voice. A real voice asking for money from a new account is still verified; a synthetic voice asking for nothing is not an emergency.")],
                "suggestions": ["What should I do now?", "How is risk calculated?"]}
    if v["kind"] == "case":
        from ..fusion.whatif import recompute
        from ..db import SessionLocal

        with SessionLocal() as db:
            c = db.get(Case, v["case_id"])
            media = [w for w in ("voice", "face", "provenance") if any(f["witness"] == w for f in v["findings"])]
            off = set(media) if any(w in t for w in ("real", "human", "genuine", "not ai", "authentic")) else {"words"} if "no money" in t or "nothing" in t else set(media) or {"words"}
            r = recompute(c, off)
        note = "" if "voice" in media or "voice" not in t else "This case has no voice recording, so I removed the media evidence instead. "
        return {"blocks": [lead(f"{note}Switching off the {', '.join(sorted(off))} evidence moves the verdict from {v['band']} {v['risk']:.0f} to "
                                f"**{r.get('band')} {r.get('risk', 0):.0f}**."),
                           bars("Risk before and after", [
                               {"label": "Now", "value": v["risk"] / 100, "max": 1, "display": f"{v['risk']:.0f}", "tone": SEV_TONE.get(v["band"], "cyan")},
                               {"label": "Without " + ", ".join(sorted(off)), "value": (r.get("risk") or 0) / 100, "max": 1,
                                "display": f"{r.get('risk', 0):.0f}", "tone": SEV_TONE.get(r.get("band"), "cyan")}]),
                           callout("cyan", "Why it may not drop", "A sensitive request with no verification triggers a policy rule on its own, so removing the deepfake evidence alone rarely makes a payment request safe.")],
                "suggestions": ["How was the score calculated?", "What should I do now?"]}
    return {"blocks": [lead("Without a sensitive request the same content would be LOW; with one, MIRAGE asks you to verify on a known number whatever the media says.")],
            "suggestions": ["Why?", "What should I do now?"]}


def contrib_bars(v: dict) -> dict | None:
    c = (v.get("contributions") or {}).get("witnesses") or {}
    if not c:
        return None
    tot = sum(c.values()) or 1
    return bars("Share of the risk, by witness (Shapley)", [
        {"label": k.title(), "value": val / tot, "max": 1, "display": f"{val:.1f} pts", "tone": "crimson" if val == max(c.values()) else "cyan"}
        for k, val in sorted(c.items(), key=lambda kv: -kv[1])], "Shapley values split the final risk fairly between the witnesses that produced it.")


def s_score_math(ctx) -> dict:
    v = ctx.view
    if v["kind"] == "case":
        d = v.get("dims") or {}
        return {"blocks": [lead(f"The risk of {v['risk']:.0f}/100 is a calibrated noisy-OR of three lenses, each scaled by how sensitive the request is (S = {d.get('sensitivity', 0):.2f})."),
                           {"type": "formula", "text": "risk = 100 · σ( logit(1 − (1 − A·S)(1 − M·S)(1 − C)) / T )",
                            "legend": [f"A authenticity (media is synthetic) = {d.get('authenticity', 0):.2f}",
                                       f"M manipulation (pressure + request) = {d.get('manipulation', 0):.2f}",
                                       f"C context (identity, beneficiary, timing) = {d.get('context', 0):.2f}",
                                       f"T temperature = {d.get('temperature', 1.65)} (calibration)"]},
                           contrib_bars(v),
                           callout("violet", "Rule first", f"Policy rule fired: {v['rule'].replace('_', ' ')}.") if v.get("rule") else None],
                "suggestions": ["What if it was a real person?", "Why?", "What should I do now?"]}
    if v["kind"] == "voice" and v.get("models"):
        return {"blocks": [lead("For a voice check, each detector's probability is re-centred on its own threshold, then they are averaged in logit space with fixed weights; the result is the synthetic score."),
                           {"type": "formula", "text": "score = σ( Σ wᵢ · (logit pᵢ − logit tᵢ) )",
                            "legend": [f"{pretrained.name(k)}: p = {s:.2f}, threshold t = {pretrained.THRESHOLDS.get(k, 0.5)}, weight w = {pretrained.WEIGHTS.get(k, 1)}"
                                       for k, s in v["models"].items()]},
                           facts([("Synthetic score", f"{v['synth_score']:.2f}"), ("AI from", "0.70" if not v.get("noisy") else "0.90 (noisy)"),
                                  ("Human below", "0.30" if not v.get("noisy") else "0.10 (noisy)")]), matrix_block(v)],
                "suggestions": ["Which part sounds fake?", "What if it was a real person?"]}
    if v["kind"] == "media" and v.get("models"):
        return {"blocks": [lead("Each image detector's probability is re-centred on its own measured threshold, then the two are averaged in logit space with fixed weights; C2PA, EXIF and markers adjust the evidence around it."),
                           {"type": "formula", "text": "score = σ( Σ wᵢ · (logit pᵢ − logit tᵢ) )",
                            "legend": [f"{pretrained.name(k)}: p = {s:.3f}, threshold t = {pretrained.THRESHOLDS.get(k, 0.5)}, weight w = {pretrained.WEIGHTS.get(k, 1)}"
                                       for k, s in v["models"].items()]},
                           facts([("Score", f"{v['synth_score']:.2f}"), ("AI from", "0.70"), ("Authentic below", "0.30")]), jury(v)],
                "suggestions": ["Why?", "How sure are you?"]}
    return {"blocks": [lead(f"The words witness blends its models in logit space: MIRAGE's own TF-IDF classifier, the phishing DistilBERT, "
                            f"the multilingual zero-shot intent model (only when corroborated) and, if configured, a Claude judge. This message scores {v.get('score', 0):.2f}.")],
            "suggestions": ["What tricks are they using?", "Why?"]}


def s_report(ctx) -> dict:
    v = ctx.view
    r = v["response"]
    items = r.get("report_to") or [{"id": k, **resp.HELPLINES[k]} for k in ("1930", "portal", "sancharsaathi", "bank")]
    blocks = [lead("Report in this order. The first hour matters most if money moved."), {"type": "contacts", "items": items},
              bullets("Keep this evidence", r.get("preserve") or ["Keep the original audio, video, screenshots and chat.", "Note the number, UPI ID or account and the time."], "cyan")]
    if v["kind"] == "case":
        blocks.append(actions(go("Pre-filled complaint drafts", f"/app/cases/{v['case_id']}/respond"), go("Incident report (PDF)", f"/app/cases/{v['case_id']}")))
    return {"blocks": blocks, "suggestions": ["I already paid", "What should I do now?"]}


def s_summary(ctx) -> dict:
    v = ctx.view
    plain = {
        "CRITICAL": "Don't do what it asks. It looks like a scam and the request is dangerous.",
        "HIGH": "Treat it as a scam until you have verified it on a number you already know.",
        "MEDIUM": "Probably fine, but check with the person directly before acting.",
        "INCONCLUSIVE": "There isn't enough evidence either way; a quick call settles it.",
        "LOW": "Nothing here asks you to act. It looks safe.",
    }[v["severity"]]
    who = {"ai": "The voice or picture is machine-made.", "human": "The voice or picture looks real.",
           "uncertain": "The detectors can't vouch for the media."}.get(v.get("synthetic") or "", "")
    return {"blocks": [verdict_block(v), lead(f"**In one line:** {plain} {who}")], "suggestions": ["Why?", "What should I do now?"]}


CHALLENGES = {
    "family_emergency": ["Ask the family code word.", "Ask something only they know: the name of the first pet, what you ate together last weekend.",
                         "Hang up and call them, or another relative who is with them, on the saved number."],
    "payment_fraud": ["Call the CFO or vendor on the number in the Trustbook or vendor master, never the one in the message.",
                      "Ask for the request through the normal approval workflow; a real executive will not mind.",
                      "Ask a detail only the real person would know: the last board meeting date, an internal project name."],
    "digital_arrest": ["Real agencies never arrest over video or ask for deposits. End the call.",
                       "Look up the police station's number yourself and call it.", "Report the number on Sanchar Saathi · Chakshu."],
    "credential_theft": ["Banks and IT never ask for an OTP. Call the official helpline from the card or the intranet.",
                         "Open the app or portal yourself instead of using a link."],
}


def s_verify(ctx) -> dict:
    v = ctx.view
    cat = v.get("category", "payment_fraud")
    items = CHALLENGES.get(cat, CHALLENGES["payment_fraud"])
    claimed = (ctx.subject.get("claimed") or (ctx.subject["data"].get("claimed_sender") if v["kind"] == "case" else None))
    blocks = [lead(f"Verify out of band: a channel the attacker does not control{f', to reach {claimed}' if claimed else ''}. A cloned voice can't answer a question it was never trained on."),
              steps("How to verify", items, "cyan"),
              callout("violet", "Why not just listen harder?", "Neural voices fool people; studies find listeners near chance on short clips. A callback on a known number is the check that does not depend on your ears.")]
    if v["kind"] == "case":
        blocks.append(actions(go("Simulate the callback in the Cure Console", f"/app/cases/{v['case_id']}/respond")))
    return {"blocks": blocks, "suggestions": ["What should I do now?", "How do I report this?"]}


# ---- actions ----------------------------------------------------------------------------------------------------------

def analyse_path(path: Path, name: str, claimed: str = "") -> dict:
    """Run the matching check on a stored file and return a new subject."""
    from ..routers.triage import media_core, text_core, voice_core

    data = path.read_bytes()
    sf = store(data, name)
    if sf.kind == "audio":
        d = voice_core(path, sf, claimed)
        return {"kind": "voice", "label": name, "data": d, "claimed": claimed}
    if sf.kind in ("image", "video"):
        d = media_core(path, sf)
        return {"kind": "media", "label": name, "data": d}
    text = data.decode("utf-8", errors="replace")
    if name.lower().endswith(".eml"):
        import email
        from email import policy

        msg = email.message_from_bytes(data, policy=policy.default)
        body = msg.get_body(preferencelist=("plain", "html"))
        text = f"Subject: {msg.get('subject', '')}\n{body.get_content() if body else ''}"
    d = text_core(text)
    return {"kind": "text", "label": name, "data": d, "text": text}


def s_analyse_text(ctx) -> dict:
    from ..routers.triage import text_core

    text = ctx.ent.get("payload") or ctx.text
    if not ctx.ent.get("payload") and len(text) < 60:
        return {"blocks": [lead("Paste the message you want checked (after a colon or in quotes), or attach the email, screenshot or voice note."),
                           para("For example: is this a scam: 'Your SIM will be blocked today, call 1800-XXX to verify'")],
                "suggestions": ["is this a scam: 'Dear customer, your KYC expired. Share the OTP to avoid account block.'", "Show me a demo"]}
    d = text_core(text)
    sub = {"kind": "text", "label": "Pasted message", "data": d, "text": text}
    ctx.set_subject(sub)
    v = view(sub)
    return {"blocks": card(v, intro_for(v)), "suggestions": follow_ups(v)}


def pick_sample(t: str, key: str | None) -> str:
    if key in SAMPLES:
        return key
    t = t.lower()
    if "video" in t or "call" in t and "video" in t or "meeting" in t:
        return "lipsync_video" if "lip" in t or "meeting" in t else "real_video" if "real" in t else "ai_video"
    if any(w in t for w in ("image", "photo", "picture", "pic", "headshot", "portrait")):
        return "real_image" if any(w in t for w in ("real", "genuine", "authentic")) else "ai_image"
    if "nois" in t or "street" in t:
        return "noisy_ai_voice"
    if any(w in t for w in ("real voice", "human", "genuine", "comparison", "authentic")):
        return "human_voice"
    if any(w in t for w in ("hindi", "hinglish", "family", "papa")):
        return "ai_family_voice"
    if "harmless" in t or "announcement" in t:
        return "ai_harmless_voice"
    return "ai_cfo_voice"


def s_analyse_sample(ctx) -> dict:
    key = pick_sample(ctx.text, ctx.sample)
    rel, label = SAMPLES[key]
    path = ROOT / rel
    if not path.exists():
        return {"blocks": [lead(f"The sample file {rel} is missing from this checkout."), sample_menu()]}
    sub = analyse_path(path, path.name, "Rajesh Mehta (CFO)" if key == "ai_cfo_voice" else "")
    sub["sample"] = key
    sub["src"] = f"/v1/assistant/sample/{key}"
    ctx.set_subject(sub)
    v = view(sub)
    v["src"] = sub["src"]
    blocks = card(v, f"Sample: *{label}*.\n\n" + intro_for(v))
    blocks.append(sample_menu())
    return {"blocks": blocks, "suggestions": follow_ups(v)}


def case_subject(db, case_id: str) -> dict | None:
    c = db.get(Case, case_id)
    if not c or not c.verdict:
        return None
    d = case_detail(c)
    v = c.verdict
    tactics = set(next((f.details_json.get("tactics", []) for f in c.findings if f.witness == "words"), []))
    synthetic = "LIKELY_SYNTHETIC" in (v.tags or [])
    category = resp.categorise(v.requested_action, tactics, resp.case_text(c))
    if synthetic and category == "benign":
        category = "synthetic_benign"
    sensitive = v.requested_action in ("payment", "credential", "remote_access")
    severity = "CRITICAL" if v.band == "HIGH" and synthetic and sensitive else v.band
    return {"kind": "case", "label": f"{c.id} · {c.title}", "data": d, "severity": severity,
            "response": resp.build(category, severity, synthetic, claimed=c.claimed_sender or None, org=True)}


def s_open_case(ctx) -> dict:
    db = ctx.db
    cid = ctx.ent.get("case_id")
    t = ctx.text.lower()
    if not cid:
        stmt = select(Case).where(Case.status == "complete").order_by(Case.created_at.desc())
        cases = db.scalars(stmt.limit(200)).all()
        if any(w in t for w in ("high", "critical", "worst", "dangerous", "risky")):
            cases = [c for c in cases if c.verdict and c.verdict.band == "HIGH"]
        cid = cases[0].id if cases else None
    sub = case_subject(db, cid) if cid else None
    if not sub:
        return {"blocks": [lead(f"I can't find a finished case {cid or ''}. Run a scenario or upload evidence to create one.")],
                "suggestions": ["Run scenario A", "How many cases are there?"]}
    ctx.set_subject(sub)
    v = view(sub)
    blocks = card(v, intro_for(v))
    blocks.insert(2, contrib_bars(v))
    return {"blocks": [b for b in blocks if b], "suggestions": follow_ups(v)}


def s_run_scenario(ctx) -> dict:
    from .. import pipeline
    from ..routers.cases import create_case
    from ..samples import SAMPLES_DIR, SCENARIOS, ensure_samples
    from datetime import datetime, timezone

    key = ctx.ent.get("scenario") or "cfo_wire"
    sc = next(s for s in SCENARIOS if s.key == key)
    ensure_samples()
    files = [(f, (SAMPLES_DIR / f).read_bytes()) for f in sc.files]
    now = datetime.now(timezone.utc).replace(hour=sc.received_hour, minute=12)
    case = create_case(ctx.db, ctx.user, files, sc.message, sc.claimed_sender, sc.channel, sc.sender_contact, now,
                       title=f"Scenario {sc.code} · {sc.title}", scenario=sc.key)
    cid = case.id
    pipeline.submit(cid, pace=0.0)
    t0 = time.time()
    while time.time() - t0 < 150:
        ctx.db.expire_all()
        c = ctx.db.get(Case, cid)
        if c.status in ("complete", "failed"):
            break
        time.sleep(0.8)
    sub = case_subject(ctx.db, cid)
    if not sub:
        return {"blocks": [lead(f"Scenario {sc.code} is still running as {cid}; open it to watch the witnesses live."),
                           actions(go("Watch it live", f"/app/cases/{cid}"))]}
    ctx.set_subject(sub)
    v = view(sub)
    blocks = card(v, f"**Scenario {sc.code}: {sc.title}.** {sc.story} Expected {sc.expected}; MIRAGE says "
                     f"**{v['band']} {v['risk']:.0f}/100** in {time.time() - t0:.0f} s.\n\n{v['summary']}")
    blocks.insert(2, contrib_bars(v))
    return {"blocks": [b for b in blocks if b], "suggestions": follow_ups(v)}


def s_stats(ctx) -> dict:
    from ..routers.misc import dashboard

    d = dashboard(user=ctx.user, db=ctx.db)
    t = d["totals"]
    tac = sorted(d["tactics"].items(), key=lambda kv: -kv[1])
    mx = max([v for _, v in tac] or [1])
    ch = sorted(d["channels"].items(), key=lambda kv: -kv[1])
    return {"blocks": [lead(f"{t['completed']} investigations finished; {t['high']} rated HIGH, {t['open_incidents']} still open."),
                       facts([("Cases", str(t["cases"])), ("High risk", str(t["high"]), "crimson"), ("Medium", str(t["medium"]), "amber"),
                              ("Low", str(t["low"]), "mint"), ("Payments stopped", inr(t["amount_at_risk_inr"]), "mint"),
                              ("Verified out of band", str(t["verified"]))]),
                       bars("Most common pressure tactics", [{"label": TACTIC_INFO.get(k, (k,))[0], "value": v / mx, "max": 1, "display": str(v), "tone": "amber"} for k, v in tac[:6]]),
                       bars("Channels attacked", [{"label": k, "value": v / (ch[0][1] or 1), "max": 1, "display": str(v), "tone": "cyan"} for k, v in ch[:6]]),
                       table(["Most impersonated", "Role", "Times"], [[p["name"], p["role"], p["count"]] for p in d["most_impersonated"]]) if d["most_impersonated"] else None,
                       actions(go("Open the command centre", "/app/dashboard"))],
            "suggestions": ["Open the latest high risk case", "Red team results", "Which models do you use?"]}


def s_navigate(ctx) -> dict:
    to = ctx.ent.get("page") or "/app/dashboard"
    names = {"/app/voice": "Voice check", "/app/redteam": "Red-team lab", "/app/dashboard": "Command centre", "/app/trustbook": "Trustbook",
             "/app/shield": "Live call shield", "/app/liveness": "Liveness check", "/app/cases": "Cases", "/app/system": "Models & audit",
             "/app/lab": "Scenario lab", "/app/drills": "Drill mode", "/app/casebook": "Casebook", "/app/tribunal": "Tribunal",
             "/app/investigate": "New investigation", "/app/safety": "Personal safety", "/app/identity": "Identity graph",
             "/app/attack-chain": "Attack chains", "/app/replay": "Attack replay", "/app/challenge": "Spot the fake"}
    return {"blocks": [lead(f"Opening **{names.get(to, to)}**."), actions(go(f"Go to {names.get(to, to)}", to))], "go": to,
            "suggestions": ["What can I do on this page?", "Help"]}


def s_redteam_results(ctx) -> dict:
    blocks = [lead("The red-team lab attacks MIRAGE with its own synthetic scams, then launders them the way crews do (phone line, WhatsApp, MP3, reverb, noise, replay) and checks what still gets caught.")]
    for mod in ("audio", "image"):
        c = K.latest_campaign(mod)
        if not c:
            continue
        cells = c["cells"]
        caught = sum(x["caught"] for x in cells)
        blocks.append(facts([(f"{mod.title()} campaign", f"{caught} / {len(cells)} caught", "mint" if caught / len(cells) >= 0.9 else "amber"),
                             ("Attacks", str(len(c["attacks"]))), ("Laundering channels", str(len(c["launders"])))]))
        blocks.append({"type": "heatmap", "title": f"{mod.title()}: score per attack × laundering", "rows": c["attacks"], "cols": c["launders"],
                       "values": [[next(((x["score"], x["caught"]) for x in cells if x["attack"] == a and x["launder"] == l), None) for l in c["launders"]] for a in c["attacks"]]})
        if c.get("insights"):
            blocks.append(bullets("What it found", [fix(str(i.get("text", i)) if isinstance(i, dict) else str(i)) for i in c["insights"]][:4], "amber"))
    blocks.append(actions(go("Open the red-team lab", "/app/redteam")))
    return {"blocks": blocks, "suggestions": ["How do you handle noisy audio?", "What are the limitations?", "How do attackers evade detectors?"]}


# ---- scenario forge -------------------------------------------------------------------------------------------------

CHANNEL_LABEL = {"phone": "Phone call", "voice_note": "WhatsApp voice note", "video": "Video call", "whatsapp": "WhatsApp message",
                 "sms": "SMS", "email": "Email"}


def s_simulate(ctx) -> dict:
    """Build the described situation as a real case (attacker script, synthetic evidence, full pipeline), then explain
    what MIRAGE did and what would have happened without it."""
    import tempfile
    from datetime import datetime, timezone

    from .. import pipeline
    from ..routers.cases import create_case
    from . import forge

    base = ctx.session.get("forge")
    spec = forge.parse(ctx.text, forge.Spec(**base) if base and forge.is_modifier(ctx.text) else None)
    with tempfile.TemporaryDirectory() as d:
        files, message, info = forge.build(spec, Path(d))
    if spec.real_voice:
        message = info["script"]  # a real recording cannot say the scam words, so the request travels as the message
    case = create_case(ctx.db, ctx.user, files, message, forge.claimed(spec), forge.CHANNEL[spec.channel],
                       forge.sender_contact(spec), datetime.now(timezone.utc), title=f"Simulated · {spec.title}", scenario="forge")
    cid = case.id
    pipeline.submit(cid, pace=0.0)
    t0 = time.time()
    while time.time() - t0 < 180:
        ctx.db.expire_all()
        if ctx.db.get(Case, cid).status in ("complete", "failed"):
            break
        time.sleep(0.8)
    ctx.session["forge"] = spec.as_dict()
    sub = case_subject(ctx.db, cid)
    media = [{"id": a["id"], "kind": a["kind"], "filename": a["filename"]} for a in (sub or {}).get("data", {}).get("artifacts", [])]
    scenario = {"type": "scenario", "title": spec.title, "channel": CHANNEL_LABEL[spec.channel], "claimed": forge.claimed(spec),
                "contact": forge.sender_contact(spec), "ask": spec.ask, "amount": spec.amount, "language": spec.language,
                "assumptions": spec.assumptions, "script": info["script"], "engine": info["engine"], "laundering": info["laundering"],
                "image_engine": info["image_engine"], "case_id": cid, "media": media, "real_voice": spec.real_voice}
    if not sub:
        return {"blocks": [lead(f"I built the scenario as case {cid}, but the investigation is still running."), scenario,
                           actions(go("Watch it live", f"/app/cases/{cid}"))], "suggestions": ["Open the latest case"]}
    ctx.set_subject(sub)
    v = view(sub)
    audio = next((m for m in media if m["kind"] == "audio"), None)
    if audio:
        v["src"] = f"/v1/cases/{cid}/artifacts/{audio['id']}"
    r = v["response"]
    took = time.time() - t0
    intro = (f"I turned your description into a real attack and ran it through MIRAGE as case **{cid}** ({took:.0f} s, full "
             f"pipeline: custody, five witnesses, risk engine, Tribunal). **Verdict: {v['band']} {v['risk']:.0f}/100.** {v['summary']}")
    blocks = [lead(intro), scenario]
    blocks += [b for b in card(v, "") if b.get("type") not in ("lead", "actions")]
    blocks.append({"type": "versus", "without": forge.ATTACK.get(spec.category, forge.ATTACK["payment_fraud"]),
                   "with": [f"Flagged {v['band']} ({v['risk']:.0f}/100): {r['category_label']}",
                            *(r["do_now"][:2] if v["band"] != "LOW" else ["Nothing to do: it asks for nothing risky"]),
                            "Report path ready: 1930, cybercrime.gov.in, the bank" if r.get("report_to") else "No report needed"]})
    blocks.append(actions(go("Open the case", f"/app/cases/{cid}"), go("Run the cure", f"/app/cases/{cid}/respond"),
                          go("See the Tribunal", f"/app/tribunal/{cid}")))
    sug = ["Why?", "What should I do now?"]
    sug += [x for x in ("Make it a video call", "Try it in Hindi", "What if it was really them?", "Make it a WhatsApp message")
            if not (x.endswith("video call") and spec.channel == "video") and not (x.endswith("Hindi") and spec.language == "hi")]
    return {"blocks": blocks, "suggestions": sug[:5]}


# ---- knowledge ---------------------------------------------------------------------------------------------------

def k_about(ctx) -> dict:
    return {"blocks": [
        lead("**MIRAGE** stops deepfake-enabled social engineering: the cloned CFO voice note, the fake 'CBI officer' on video, the AI headshot on a vendor email. It was built by Team Outliers (DJSCE) for D3COY 1.0, problem statement PS-02."),
        flow("What it does", [("Detect", "Is the voice, face or image synthetic?"), ("Understand", "What is being asked, with which pressure?"),
                              ("Decide", "Request-aware risk with reasons"), ("Respond", "The Cure Console: contain, verify, recover, report")]),
        para("The key idea: a deepfake is only dangerous when it asks for something. So MIRAGE scores **who is speaking and what they want together**, and always ends with what to do next."),
        actions(ask("How does it work?"), ask("Show me a demo", "Show me how you catch a voice clone"), ask("How accurate is it?"))],
        "suggestions": ["How does it work end to end?", "What makes it different?", "What are the limitations?"]}


def k_how(ctx) -> dict:
    return {"blocks": [
        lead("From evidence to action in five steps. Every step leaves a trace you can inspect."),
        flow("The pipeline", [("1 · Custody", "Files are type-sniffed and SHA-256 hashed; the audit log is hash-chained."),
                              ("2 · Five witnesses", "Voice, face, provenance, words and identity examine the evidence in parallel."),
                              ("3 · Risk engine", "Policy rules first, then a calibrated noisy-OR scaled by how sensitive the request is."),
                              ("4 · Tribunal", "Agents argue for and against, each claim citing evidence IDs."),
                              ("5 · Cure Console", "Contain → verify → recover → report → immunise, for this scam type.")]),
        table(["Witness", "Question it answers"], [["Voice", "Is the speech synthetic? Does it match the claimed person's voiceprint?"],
                                                   ["Face", "Is a face swapped or re-enacted? Do the lips follow the voice?"],
                                                   ["Provenance", "Was the image generated or edited? Does it carry C2PA credentials?"],
                                                   ["Words", "Which tactics, which request, how much, by when?"],
                                                   ["Identity", "Is the sender, channel, hour and beneficiary normal for this person?"]]),
        actions(ask("Run scenario A to see it live", "Run scenario A"), go("New investigation", "/app/investigate"))],
        "suggestions": ["How is risk calculated?", "What is the Tribunal?", "What happens after detection?"]}


def k_witnesses(ctx) -> dict:
    reg = K.models()
    by = {}
    for r in reg:
        by.setdefault(r["witness"], []).append(r["model"].split("/")[-1])
    rows = [["Voice", "AI speech, voiceprint, channel and noise", ", ".join(by.get("voice", []))],
            ["Face", "Face swaps, re-enactment, lip-sync", ", ".join(by.get("face", []))],
            ["Provenance", "AI-generated or edited images, C2PA", ", ".join(by.get("provenance", []))],
            ["Words", "Tactics, request, amount, deadline; email headers", ", ".join(by.get("words", []))],
            ["Identity", "Trustbook: usual channel, hours, limits, beneficiaries", "Rules + history"]]
    return {"blocks": [lead("Five independent witnesses, each with its own models. Independence matters: one fooled detector cannot carry the verdict."),
                       table(["Witness", "Checks", "Models"], rows)], "suggestions": ["How do you detect a cloned voice?", "How is risk calculated?"]}


def k_voice(ctx) -> dict:
    rows = [b for b in [bench_bar("Ensemble · deepfake audio", "ensemble", "audio_df"), bench_bar("DF_Arena alone", "df_arena", "audio_df"),
                        bench_bar("NII alone", "nii", "audio_df"), bench_bar("Ensemble · neural TTS", "ensemble", "audio_tts", key="acc@0.5")] if b]
    camp = K.latest_campaign("audio")
    caught = f"{sum(c['caught'] for c in camp['cells'])} of {len(camp['cells'])}" if camp else None
    return {"blocks": [
        lead("A **two-stage voice check**. Stage 1 asks *is this voice machine-made?* Stage 2 asks *what does it want?* The answer combines both."),
        flow("Voice check", [("Channel", "Bandwidth, codec, SNR: is this a phone line, WhatsApp, noisy?"),
                             ("Anti-spoofing", "DF_Arena 500M, NII Wav2Vec2-Large and the multilingual NII MMS-300M score each 4 s window"),
                             ("Speech to text", "faster-whisper, Hinglish kept in Roman script"),
                             ("Semantics", "Tactics, request, amount, category"),
                             ("Decision", "2×2: synthetic × sensitive → severity and plan")]),
        bars("Measured (AUC, or accuracy for TTS)", rows, f"Red-team: {caught} laundered fakes caught in the latest campaign." if caught else None),
        callout("violet", "Noise", "Below 19 dB SNR only DF_Arena votes (it degraded least in the noise study) and the evidence is marked weak."),
        actions(ask("Try it on a cloned voice", "Show me how you catch a voice clone"), ask("Try a real voice", "Analyse a real human voice sample"))],
        "suggestions": ["What about background noise?", "What is DF Arena?", "Could a real voice score like this?"]}


def k_image(ctx) -> dict:
    rows = [b for b in [bench_bar("Ensemble", "ensemble", "img_modern"), bench_bar("Community Forensics", "commfor", "img_modern"),
                        bench_bar("SwinV2", "swinv2", "img_modern")] if b]
    camp = K.latest_campaign("image")
    return {"blocks": [
        lead("The **provenance witness** asks whether pixels were generated. Two detectors trained on very different generator families vote; C2PA content credentials are validated when present."),
        bars("AI-image benchmark (AUC)", rows, f"Red-team image campaign: {sum(c['caught'] for c in camp['cells'])} of {len(camp['cells'])} caught after JPEG, resize, screenshot and social re-encoding." if camp else None),
        bullets("Also checked", ["C2PA manifests: valid, tampered or AI-declared", "EXIF and generator markers", "Error-level analysis grid", "Faces in the image go to GenD as well"]),
        actions(ask("Test an AI image", "Analyse an AI image sample"), ask("Test a real photo", "Analyse a real photo sample"))],
        "suggestions": ["How do you detect face swaps?", "What are the limitations?"]}


def k_face(ctx) -> dict:
    rows = [b for b in [bench_bar("Face ensemble · FaceForensics++", "face_ensemble", "face_ff"),
                        bench_bar("Face ensemble · OpenForensics (in the wild)", "face_ensemble", "face_openforensics")] if b]
    sync = K.bench().get("syncnet", {}).get("av_sync_check", {})
    return {"blocks": [
        lead("Video goes through the **face witness**: YuNet finds faces, two GenD detectors (CLIP ViT-L/14 and Perception Encoder) score each crop, and SyncNet checks whether the lips follow the voice. The audio track is also judged by the voice check."),
        bars("Face benchmarks (AUC)", rows),
        facts([("Lip-sync threshold", str(sync.get("threshold", 3.0))), ("Genuine speech", f"{sync.get('synced_conf', ['?'])[0]}–{sync.get('synced_conf', ['?', '?'])[-1]}", "mint"),
               ("Swapped audio", f"{sync.get('mismatch_conf', ['?'])[0]}–{sync.get('mismatch_conf', ['?', '?'])[-1]}", "crimson")], "SyncNet sanity check") if sync else None,
        callout("amber", "Honest limit", "In-the-wild face swaps are the weakest area (OpenForensics AUC above). A still photo over a cloned voice is caught through the audio, and reported as a still picture."),
        actions(ask("Test an AI avatar video", "Analyse an AI video sample"))],
        "suggestions": ["Can it detect a fake video call?", "What are the limitations?"]}


def k_text(ctx) -> dict:
    rows = [b for b in [bench_bar("Indian scam SMS", "words_witness", "india_sms"), bench_bar("Scam call dialogues", "words_witness", "scam_dialogue"),
                        bench_bar("Indian multilingual", "words_witness", "india_multi"), bench_bar("UCI SMS spam", "words_witness", "sms_uci")] if b]
    return {"blocks": [
        lead("The **words witness** reads messages, emails and transcripts in English, Hindi and Hinglish. It finds the tactics, the request, the amount and the deadline, then blends four views in logit space."),
        table(["Layer", "Role"], [["MIRAGE TF-IDF classifier", "Fast lexical model on Indian scam patterns (own, already trained)"],
                                  ["Phishing DistilBERT", "Phishing and scam language"], ["mDeBERTa zero-shot", "Intent in 100 languages, used only when corroborated"],
                                  ["Claude judge (optional)", "Structured verdict when an API key is set"], ["Email forensics", "SPF / DKIM / DMARC, Reply-To, look-alike domains"]]),
        bars("Words witness (AUC)", rows),
        actions(ask("Check a sample scam SMS", "is this a scam: 'Your account will be blocked today. Share the OTP sent to you to keep it active. - SBI'"))],
        "suggestions": ["What pressure tactics do you look for?", "Can you read Hinglish?"]}


def k_risk(ctx) -> dict:
    return {"blocks": [
        lead("Risk is **request-aware**: a perfect deepfake asking for nothing is LOW; an ordinary-looking message asking to wire money from a new account is not."),
        flow("Order of decisions", [("Policy rules", "e.g. sensitive request + unverified sender → HIGH; harmless synthetic → LOW"),
                                    ("Three lenses", "Authenticity (A), manipulation (M), context (C)"), ("Sensitivity S", "How dangerous the request is: payment, OTP, remote access…"),
                                    ("Calibrated fusion", "Noisy-OR with temperature T = 1.65"), ("Shapley", "Fair share of the risk per witness")]),
        {"type": "formula", "text": "risk = 100 · σ( logit(1 − (1 − A·S)(1 − M·S)(1 − C)) / T )",
         "legend": ["A and M are multiplied by S, so media and pressure only matter when something sensitive is asked", "C (context) counts more when the request is sensitive: c × (0.25 + 0.75·S)"]},
        facts([("HIGH", "act only after verification", "crimson"), ("MEDIUM", "verify first", "amber"), ("LOW", "no action needed", "mint"), ("INCONCLUSIVE", "too little evidence", "violet")])],
        "suggestions": ["Open the latest high risk case", "What is the Tribunal?"]}


def k_tribunal(ctx) -> dict:
    return {"blocks": [lead("The **Tribunal** is a LangGraph debate: agents argue the case for and against, and every claim must cite an evidence ID. It explains the verdict; it never sets the risk."),
                       flow("Who speaks", [("Witnesses", "Present their findings with evidence IDs"), ("Prosecutor", "Argues it is an attack"),
                                           ("Defender", "Argues the innocent reading"), ("Judge", "Weighs both, states the verification plan")]),
                       actions(go("Open the Tribunal", "/app/tribunal"))], "suggestions": ["How is risk calculated?", "Open the latest case"]}


def k_cure(ctx) -> dict:
    from .. import cure

    st = [(s.get("title", s.get("id", "")) if isinstance(s, dict) else str(s), s.get("detail", s.get("why", "")) if isinstance(s, dict) else "") for s in cure.STAGES]
    return {"blocks": [lead("Detection is half the job. The **Cure Console** (the Respond tab on each case) turns the verdict into a scenario-specific incident response that updates as you act."),
                       flow("Five stages", st or [("Contain", ""), ("Verify", ""), ("Recover", ""), ("Report", ""), ("Immunise", "")]),
                       bullets("What it does live", ["Exposure meter: money and access still at risk", "Golden-hour clock once you mark 'already paid'",
                                                     "Simulated bank hold, session revoke, SOC ticket (clearly labelled as simulations)",
                                                     "Pre-filled cybercrime.gov.in, 1930, bank recall, Chakshu and CERT-In drafts",
                                                     "Evidence pack ZIP with hashes; identifier blocklist; who else was targeted; a red-team drill of the same attack"]),
                       actions(ask("Open a case and run the cure", "Open the latest high risk case"))],
            "suggestions": ["I already paid, what now?", "How do I report a scam?"]}


def k_redteam(ctx) -> dict:
    return {"blocks": [lead("You can't build an antidote without studying the poison. The **red-team lab** generates the scams crews use (cloned voices, AI officers, avatar videos), launders them like attackers do, and measures what still gets caught."),
                       bullets("Guardrails", ["Synthetic and fictional only: neural TTS voices, no real person's likeness or voice", "Every image is stamped “MIRAGE RED TEAM · SYNTHETIC”",
                                              "Outputs stay inside the lab and feed detection tests and drills"], "violet"),
                       bullets("How crews evade detectors", ["Phone-line band-limiting and codecs", "WhatsApp / MP3 re-encoding", "Room reverb and replay through a speaker",
                                                             "Street noise (the hardest case for voice)", "Screenshots, resizing and social re-encoding for images"], "amber"),
                       actions(ask("Show me the red team results", "Red team results"), go("Open the lab", "/app/redteam"))],
            "suggestions": ["Which laundering beats you?", "What about background noise?"]}


def k_extension(ctx) -> dict:
    return {"blocks": [lead("**MIRAGE Shield** brings the checks into the browser (Chrome, Manifest V3)."),
                       table(["Where", "What it does"], [["Any page", "Right-click a selection, image or audio: check it with MIRAGE"],
                                                         ["Calls in a tab", "Tab audio is captured in 3 s chunks and scored live"],
                                                         ["Gmail", "A banner on the open email with the verdict"], ["WhatsApp Web", "A chip on voice notes"]]),
                       callout("amber", "Status", "Built and API-tested; not yet run inside a real Chrome profile. Load extension/ unpacked from chrome://extensions."),
                       actions(go("Live call shield in the app", "/app/shield"))], "suggestions": ["How does the live call shield work?"]}


def k_live(ctx) -> dict:
    return {"blocks": [lead("The **live call shield** listens in 3-second chunks (microphone or a browser tab) and draws a risk river: the voice score and the script's pressure, rising as the caller adds secrecy, a payment and a deadline. The plan slides in at HIGH."),
                       actions(go("Open the live call shield", "/app/shield"))], "suggestions": ["How do you detect a cloned voice?"]}


def k_liveness(ctx) -> dict:
    return {"blocks": [lead("The **liveness check** asks for three random head movements on the webcam, scores them from YuNet landmarks with a reaction-time floor, and runs GenD on the face. A replayed recording fails, because it cannot follow random prompts."),
                       actions(go("Open the liveness check", "/app/liveness"))], "suggestions": ["How do you detect face swaps?"]}


def k_trustbook(ctx) -> dict:
    return {"blocks": [lead("The **Trustbook** is who your organisation trusts: people, their usual channels and hours, approval limits, known beneficiaries and (with consent) a WavLM voiceprint. The identity witness compares every request against it."),
                       bullets(None, ["Guided enrolment: three consented takes that must agree (cosine ≥ 0.75), recorded in the audit chain",
                                      "A cloned voice may sound right but still fail the voiceprint, the channel, the hour and the beneficiary checks",
                                      "Seeded demo prints are flagged as simulator prints"]),
                       actions(go("Open the Trustbook", "/app/trustbook"))], "suggestions": ["What is the identity witness?", "How do you detect a cloned voice?"]}


def k_drills(ctx) -> dict:
    return {"blocks": [lead("**Drill mode** sends consented, simulated attacks from the red-team playbook to a persona's MIRAGE inbox and records what they did (complied, verified, reported or ignored) and how fast."),
                       actions(go("Open drill mode", "/app/drills"))], "suggestions": ["What is the red team lab?"]}


def k_accuracy(ctx) -> dict:
    rows = [b for b in [bench_bar("Voice · deepfake audio", "ensemble", "audio_df"), bench_bar("Images · modern generators", "ensemble", "img_modern"),
                        bench_bar("Faces · FaceForensics++", "face_ensemble", "face_ff"), bench_bar("Faces · in the wild (OpenForensics)", "face_ensemble", "face_openforensics"),
                        bench_bar("Text · Indian scam SMS", "words_witness", "india_sms"), bench_bar("Text · scam call dialogues", "words_witness", "scam_dialogue")] if b]
    tiles = []
    for mod in ("audio", "image"):
        if c := K.latest_campaign(mod):
            tiles.append((f"Red team · {mod}", f"{sum(x['caught'] for x in c['cells'])} / {len(c['cells'])}", "mint"))
    rt = K.router_eval().get("router", {})
    if rt:
        tiles.append(("This assistant · held-out questions", pct(rt.get("accuracy"), 1), "cyan"))
    return {"blocks": [lead("Measured on public benchmark sets with `scripts/benchmark_models.py` (AUC: 1.0 is perfect, 0.5 is chance). Weak spots are shown, not hidden."),
                       bars("Benchmark AUC", rows), facts(tiles) if tiles else None, actions(go("ROC curves and calibration", "/app/system"))],
            "suggestions": ["What are the limitations?", "How do you handle noisy audio?", "Did you train the models?"]}


def k_limits(ctx) -> dict:
    ff = K.metric("face_ensemble", "face_openforensics")
    return {"blocks": [lead("Where MIRAGE is weak, plainly:"),
                       bullets(None, [
                           {"text": f"In-the-wild face swaps and fully generated video (OpenForensics AUC {ff:.2f})." if ff else "In-the-wild face swaps and fully generated video.", "tone": "crimson"},
                           {"text": "Heavy background noise on voice: below 19 dB SNR only DF_Arena votes; it catches most noisy fakes but flags about 1 in 40 real voices at 10 dB.", "tone": "amber"},
                           {"text": "Lip-sync generators (Wav2Lip and descendants) can pass SyncNet by design; its threshold rests on a 15-clip sanity check.", "tone": "amber"},
                           {"text": "The Chrome extension and Android share target have not been tried on real devices yet.", "tone": "amber"},
                           {"text": "Trustbook voiceprints in the demo are simulator prints until real people enrol with consent.", "tone": "violet"},
                           {"text": "Cure connectors (bank hold, SOC ticket) are simulated; demo authentication only.", "tone": "violet"}]),
                       callout("cyan", "The safety net", "Because risk is request-aware, a missed deepfake that asks for money still meets the policy rule: verify on a known number first.")],
            "suggestions": ["How accurate is it?", "What about background noise?"]}


def k_noise(ctx) -> dict:
    nr = K.bench().get("noise_robustness", {})
    auc = nr.get("auc", {})
    items = []
    for cond, label in (("street@10", "Street noise 10 dB"), ("street@5", "Street noise 5 dB"), ("white@10", "White noise 10 dB")):
        if cond in auc:
            for m, lbl in (("df_arena", "DF_Arena"), ("nii", "NII")):
                if m in auc[cond]:
                    v = auc[cond][m]
                    items.append({"label": f"{label} · {lbl}", "value": v, "max": 1, "display": f"{v:.3f}", "tone": "mint" if v >= 0.9 else "amber" if v >= 0.75 else "crimson"})
    return {"blocks": [lead("Noise is the hardest case for voice detection: it hides the artefacts detectors look for. MIRAGE measured it instead of guessing."),
                       bars(f"Noise study: AUC on {nr.get('n', 90)} clips", items, "DF_Arena degrades least, so below 19 dB SNR it votes alone."),
                       bullets("What MIRAGE does with noisy audio", ["Measures SNR on every clip", "Below 19 dB: DF_Arena alone, evidence marked weak (confidence −0.25)",
                                                                     "Voice check widens the uncertain band to 0.1–0.9", "The request still decides: a sensitive ask from an uncertain voice is HIGH, unverified"]),
                       actions(ask("Try the noisy sample", "Analyse the noisy street voice sample"))],
            "suggestions": ["What are the limitations?", "Red team results"]}


def k_models(ctx) -> dict:
    reg = K.models()
    key = ctx.ent.get("model")
    if key and (r := next((x for x in reg if x["key"] == key), None)):
        b = r.get("benchmark") or {}
        rows = [{"label": ds, "value": m.get("auc") or m.get("acc@0.5") or 0, "max": 1,
                 "display": f"{m['auc']:.3f} AUC" if m.get("auc") is not None else pct(m.get("acc@0.5")), "tone": "mint", "note": f"n = {m.get('n')}"}
                for ds, m in b.items() if isinstance(m, dict) and (m.get("auc") is not None or m.get("acc@0.5") is not None)]
        return {"blocks": [lead(f"**{r['model']}**: {r['role']} in the {r['witness']} witness."),
                           facts([("Published", r["published"]), ("Threshold here", str(pretrained.THRESHOLDS.get(key, "—"))),
                                  ("Ensemble weight", str(pretrained.WEIGHTS.get(key, "—"))), ("Installed", "yes" if r["installed"] else "no", "mint" if r["installed"] else "crimson")]),
                           bars("Measured here", rows) if rows else None],
                "suggestions": ["Which models do you use?", "Did you train the models?"]}
    return {"blocks": [lead(f"{len(reg)} pretrained models, each with a measured threshold. None was trained here; MIRAGE combines and calibrates them."),
                       table(["Model", "Witness", "Role", "Published result"], [[r["model"].split("/")[-1], r["witness"], r["role"], r["published"]] for r in reg]),
                       actions(go("Models & audit", "/app/system"))],
            "suggestions": ["What is DF Arena?", "Did you train the models?", "How accurate is it?"]}


def k_no_training(ctx) -> dict:
    return {"blocks": [lead("No detector was trained or fine-tuned for MIRAGE. It uses **pretrained, published models** (trained by their authors on large deepfake corpora) and adds the engineering around them."),
                       bullets("What MIRAGE adds", ["A measured decision threshold per model, so scores are comparable", "Logit-space ensembles with fixed weights; agreement sets confidence",
                                                    "Noise-conditional voting from a measured noise study", "Request-aware fusion and policy rules", "Small own models (TF-IDF words classifier, request anomaly) shipped pre-trained"]),
                       callout("cyan", "Why", "Training credible deepfake detectors needs data and compute a hackathon doesn't have; published models generalise better than a model fitted to a few hundred local clips. Model code that would need remote execution was vendored and reviewed instead.")],
            "suggestions": ["Which models do you use?", "How accurate is it?"]}


def k_privacy(ctx) -> dict:
    from ..config import settings

    return {"blocks": [lead("Everything runs **on this machine**: detectors, speech-to-text, OCR and this assistant. No evidence leaves it unless you configure the optional Claude judge."),
                       facts([("Claude judge", "on" if settings.anthropic_api_key else "off (no key)", "amber" if settings.anthropic_api_key else "mint"),
                              ("Evidence storage", "local, SHA-256 hashed"), ("Audit log", "hash-chained"), ("Voiceprints", "only with recorded consent")]),
                       bullets(None, ["Uploads are type-sniffed; executables and archives are rejected", "Every action is written to a tamper-evident audit chain",
                                      "Red-team content is synthetic and stamped", "Drills run only on consenting personas"])],
            "suggestions": ["What is the Trustbook?", "How does this assistant work?"]}


def k_stack(ctx) -> dict:
    return {"blocks": [lead("Built to run on one laptop (an 8 GB GPU is enough; CPU works, slower)."),
                       table(["Layer", "Technology"], [["API", "FastAPI, SQLAlchemy 2 (SQLite), server-sent events"], ["Agents", "LangGraph Tribunal"],
                                                       ["ML", "PyTorch, ONNX Runtime, transformers, timm, faster-whisper, RapidOCR"],
                                                       ["Frontend", "React, Vite, TypeScript, Tailwind, React Three Fiber"], ["Extension", "Chrome Manifest V3"],
                                                       ["Assistant", "Local MiniLM + n-gram router, grounded skills, doc retrieval"]]),
                       para("Run it: `uvicorn app.main:app --port 8000` in backend, `npm run dev` in frontend; models via `scripts/download_models.py`.")],
            "suggestions": ["Which models do you use?", "Is my data private?"]}


SCAM_INFO = {
    "digital_arrest": ("Digital arrest", "A caller posing as CBI, customs, narcotics or police claims a parcel or account is linked to a crime, keeps the victim on a video call (sometimes with an AI 'officer'), and demands a 'verification deposit'.",
                       ["No Indian agency arrests or collects money over video", "Threats, uniforms and fake documents on screen", "You are told not to disconnect or tell anyone"]),
    "payment_fraud": ("Executive / vendor impersonation (BEC)", "A cloned CFO voice note or a look-alike vendor email asks finance to pay a new account urgently and confidentially.",
                      ["New bank details over chat or email", "Urgency plus secrecy", "Bypassing the normal approval or callback"]),
    "family_emergency": ("Family emergency", "A cloned voice of a child or parent claims an accident or arrest and asks for money to a new UPI ID.",
                         ["A familiar voice from an unknown number", "Panic and a deadline", "\"Don't tell anyone\""]),
    "credential_theft": ("OTP / KYC credential theft", "A 'bank' or 'IT help desk' message or call asks for the OTP, PIN or password to 'keep the account active'.",
                         ["Any request to read out an OTP", "Look-alike links", "Account-block threats"]),
    "reward_scam": ("Prize, investment or job lure", "A prize, refund, job or guaranteed-return scheme, often endorsed by an AI avatar of a celebrity or 'analyst', asks for a fee first.",
                    ["Pay to receive", "Guaranteed returns", "WhatsApp 'investment groups'"]),
    "remote_access": ("Remote-access scam", "A caller has you install AnyDesk or a screen-sharing app 'to help', then drains the account.",
                      ["Install requests from support you didn't call", "Screen sharing during banking"]),
    "gift_card": ("Gift-card scam", "An 'executive' asks you to buy gift cards urgently and send the codes.", ["Gift cards as payment", "Reply-To that isn't the company domain"]),
    "sextortion": ("Sextortion with morphed media", "A morphed or AI-generated intimate image is used to threaten and extort.", ["Threats to share images", "Demands for payment to delete"]),
}


def k_scam(ctx) -> dict:
    key = ctx.ent.get("scam")
    if key in SCAM_INFO:
        title, how, flags = SCAM_INFO[key]
        cat = key if key in resp.CATEGORIES else "payment_fraud"
        plan = resp.build(cat, "HIGH", None)
        return {"blocks": [lead(f"**{title}.** {how}"), bullets("Red flags", flags, "amber"), steps("If it happens to you", plan["do_now"][:4], "cyan")],
                "suggestions": ["How does MIRAGE catch it?", "I already paid", "What scams do you cover?"]}
    return {"blocks": [lead("The scam patterns MIRAGE is built for (Indian context first):"),
                       {"type": "chips", "title": None, "items": [{"label": v[0], "detail": v[1], "tone": "amber", "prompt": f"What is {v[0].lower()}?"} for v in SCAM_INFO.values()]}],
            "suggestions": ["What is digital arrest?", "Explain CEO fraud", "Family emergency scam"]}


def k_scammed(ctx) -> dict:
    plan = resp.build("payment_fraud", "HIGH", None)
    return {"blocks": [callout("crimson", "Call 1930 now", "The National Cyber Crime Helpline. In the first hour, money in transit can still be frozen across banks."),
                       steps("Then, in this order", plan["if_paid"], "crimson"),
                       {"type": "contacts", "items": [{"id": k, **resp.HELPLINES[k]} for k in ("1930", "portal", "bank", "sancharsaathi")]},
                       bullets("If you shared an OTP or installed an app", ["Change banking and email passwords from another device", "Uninstall AnyDesk / TeamViewer and disconnect", "Ask the bank to block cards and UPI"], "amber"),
                       actions(ask("Help me file the complaint", "How do I report this?"))],
            "suggestions": ["How do I report this?", "What evidence should I keep?"]}


def k_casebook(ctx) -> dict:
    from ..rag.index import casebook

    cb = casebook()
    docs = sorted({c.title for c in cb.chunks})
    return {"blocks": [lead("The **casebook** is MIRAGE's guidance library: CERT-In and joint-agency deepfake guidance, Indian scam patterns, payment and IT policies, case studies and MITRE ATT&CK techniques. The Tribunal and the case Q&A cite it."),
                       flow("Hybrid retrieval", [("BM25", "Exact words"), ("TF-IDF characters", "Hinglish spelling variants"),
                                                 ("MiniLM vectors", "Paraphrases and other languages"), ("Rank fusion", "Reciprocal rank fusion, then cited sentences")]),
                       bullets(f"{len(docs)} documents, {len(cb.chunks)} sections", docs[:10]), actions(go("Open the casebook", "/app/casebook"))],
            "suggestions": ["What is the Tribunal?", "How does this assistant work?"]}


def k_compare(ctx) -> dict:
    return {"blocks": [lead("Most tools answer one question: *is this media fake?* MIRAGE answers the one that matters: *is this a scam, and what do I do now?*"),
                       table(["", "Typical detector", "Caller-ID / spam app", "MIRAGE"],
                             [["Voice, face, image, text", "one modality", "number only", "all four + identity"],
                              ["Knows what is being asked", "no", "no", "yes: request-aware risk"],
                              ["Explains the verdict", "a score", "a label", "evidence IDs, Tribunal, Shapley"],
                              ["What to do next", "no", "block", "Cure Console: contain → report"],
                              ["Tested against laundering", "rarely", "n/a", "red-team lab, measured"],
                              ["Runs locally", "often cloud", "cloud", "yes"]]),
                       actions(ask("Show me a live demo", "Show me how you catch a voice clone"))],
            "suggestions": ["What are the limitations?", "How accurate is it?"]}


def k_help(ctx) -> dict:
    return {"blocks": [lead("I'm the **MIRAGE copilot**. I run the detectors for you and explain every result. Try:"),
                       {"type": "capabilities", "items": [
                           {"title": "Check evidence", "detail": "Drop a voice note, call, image, video or .eml, or paste a message", "prompt": "Show me how you catch a voice clone"},
                           {"title": "Cross-question", "detail": "Why? Which part? How sure? What if it was real?", "prompt": "Why?"},
                           {"title": "Run a scenario", "detail": "Eight full investigations, A to H", "prompt": "Run scenario B"},
                           {"title": "Respond", "detail": "What to do now, who to call, if you already paid", "prompt": "I already paid"},
                           {"title": "Prove it", "detail": "Benchmarks, red-team results, limitations", "prompt": "How accurate is it?"},
                           {"title": "Drive the app", "detail": "Open any screen or case", "prompt": "Open the latest high risk case"}]},
                       sample_menu()],
            "suggestions": ["What is MIRAGE?", "How does it work?", "Run scenario A"]}


def k_assistant(ctx) -> dict:
    ev = K.router_eval()
    rt, n = ev.get("router", {}), ev.get("trained_on")
    return {"blocks": [lead("I am **not a chatbot that makes things up**. A small model trained on this laptop works out what you are asking; the answer is then built from MIRAGE's own data."),
                       flow("How I answer", [("Understand", f"MiniLM sentence vectors + character n-grams, trained locally on {n or '2,600+'} phrasings of {ev.get('intents', 50)} intents"),
                                             ("Resolve", "Follow-ups like 'why?' attach to what you just analysed"),
                                             ("Act", "Run the real detectors, open cases, read the benchmark"),
                                             ("Compose", "Numbers come from data at answer time, never from free text"),
                                             ("Fallback", "Anything else: retrieval over the project docs, with citations")]),
                       facts([("Held-out accuracy", pct(rt.get("accuracy"), 1), "mint"), ("Held-out questions", str(rt.get("n", "—"))),
                              ("Routing time", f"{rt.get('ms_per_question', '—')} ms")]) if rt else None,
                       callout("violet", "Measured, not assumed", "A local Phi-3 tie-breaker was tested on the same held-out questions and lowered accuracy (88.9 % against 91.7 % for the router alone in that run), so it is off. Local Llama 3.1 and Phi-3 also misstated simple facts given to them in tests, which is why no LLM writes my answers.")],
            "suggestions": ["How accurate is it?", "What can you do?"]}


def k_greet(ctx) -> dict:
    return {"blocks": [lead("Hi, I'm the MIRAGE copilot. Drop a suspicious voice note, image, video or message, or ask me anything about how MIRAGE works."), sample_menu()],
            "suggestions": ["Show me how you catch a voice clone", "What is MIRAGE?", "Run scenario A"]}


def k_thanks(ctx) -> dict:
    return {"blocks": [lead("Anytime. Verify on a known number before you pay or share a code.")], "suggestions": ["What else can you do?"]}


def k_out(ctx) -> dict:
    return {"blocks": [lead("That's outside what I do. I'm here for deepfakes, scams and MIRAGE itself: checking evidence, explaining verdicts and what to do next.")],
            "suggestions": ["What can you do?", "Show me a demo", "What is digital arrest?"]}


def k_docs(ctx, alternatives: list[dict]) -> dict:
    a = K.docs().answer(ctx.text)
    sents = [s for s in a["sentences"] if "|" not in s["text"]]
    if not sents or a.get("best", 0) < 0.6:  # measured: on-topic questions score about 0.7, off-topic 0.5 or less
        return {"blocks": [lead("I'm not sure that's something I cover. I answer questions about deepfakes, scams and MIRAGE itself. Did you mean one of these?")],
                "suggestions": [INTENT_PROMPTS.get(x["intent"], x["intent"]) for x in alternatives] + ["What can you do?"]}
    text = " ".join(re.sub(r"\s+", " ", s["text"]) for s in sents)
    return {"blocks": [lead("From the MIRAGE documentation:"), para(text),
                       {"type": "sources", "items": [{"doc": s["doc"], "heading": s["heading"]} for s in sents]}],
            "suggestions": [INTENT_PROMPTS.get(x["intent"], x["intent"]) for x in alternatives[:3]]}


INTENT_PROMPTS = {
    "simulate": "Simulate a scenario",
    "why": "Why?", "where": "Which part is fake?", "confidence": "How sure are you?", "models": "Which models checked it?",
    "transcript": "What did they say?", "tactics": "What tricks are they using?", "what_now": "What should I do now?",
    "what_if": "What if it was a real person?", "score_math": "How was the score calculated?", "report": "How do I report this?",
    "summary": "Is it a scam or not?", "verify_callback": "How do I verify it's really them?", "analyse_text": "Check a message",
    "analyse_sample": "Show me a demo", "run_scenario": "Run scenario A", "open_case": "Open the latest case", "stats": "How many cases are there?",
    "navigate": "Open the command centre", "redteam_results": "Red team results", "about": "What is MIRAGE?", "how_overall": "How does it work?",
    "witnesses": "What are the witnesses?", "voice_how": "How do you detect a cloned voice?", "image_how": "How do you detect AI images?",
    "face_how": "How do you detect face swaps?", "text_how": "How do you detect scam messages?", "risk_engine": "How is risk calculated?",
    "tribunal": "What is the Tribunal?", "cure": "What happens after detection?", "redteam_how": "What is the red team lab?",
    "extension": "Tell me about the Chrome extension", "live_shield": "How does the live call shield work?", "liveness": "How does the liveness check work?",
    "trustbook": "What is the Trustbook?", "drills": "What is drill mode?", "accuracy": "How accurate is it?", "limitations": "What are the limitations?",
    "noise": "What about background noise?", "model_list": "Which models do you use?", "no_training": "Did you train the models?",
    "privacy": "Is my data private?", "stack": "What is the tech stack?", "scam_types": "What scams do you cover?", "scammed_help": "I already paid",
    "compare_tools": "What makes it different?", "casebook": "What is the casebook?", "help": "What can you do?", "assistant_how": "How do you work?",
}

SUBJECT_SKILLS = {"why": s_why, "where": s_where, "confidence": s_confidence, "models": s_models, "transcript": s_transcript,
                  "tactics": s_tactics, "what_now": s_what_now, "what_if": s_what_if, "score_math": s_score_math, "report": s_report,
                  "summary": s_summary, "verify_callback": s_verify}
SKILLS = {"simulate": s_simulate, "analyse_text": s_analyse_text, "analyse_sample": s_analyse_sample, "run_scenario": s_run_scenario, "open_case": s_open_case,
          "stats": s_stats, "navigate": s_navigate, "redteam_results": s_redteam_results, "about": k_about, "how_overall": k_how,
          "witnesses": k_witnesses, "voice_how": k_voice, "image_how": k_image, "face_how": k_face, "text_how": k_text,
          "risk_engine": k_risk, "tribunal": k_tribunal, "cure": k_cure, "redteam_how": k_redteam, "extension": k_extension,
          "live_shield": k_live, "liveness": k_liveness, "trustbook": k_trustbook, "drills": k_drills, "accuracy": k_accuracy,
          "limitations": k_limits, "noise": k_noise, "model_list": k_models, "no_training": k_no_training, "privacy": k_privacy,
          "stack": k_stack, "scam_types": k_scam, "scammed_help": k_scammed, "compare_tools": k_compare, "casebook": k_casebook, "help": k_help,
          "assistant_how": k_assistant, "greet": k_greet, "thanks": k_thanks, "out_of_scope": k_out}
# general answers for subject questions asked with nothing analysed ("why do you flag voices?")
GENERAL = {"why": k_how, "where": k_voice, "confidence": k_accuracy, "models": k_models, "transcript": k_voice, "tactics": k_text,
           "what_now": k_scammed, "what_if": k_risk, "score_math": k_risk, "report": k_scammed, "summary": k_about, "verify_callback": None}

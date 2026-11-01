"""One conversation turn: route the question, resolve it against what the user is looking at, run the skill.

A session remembers its subject (the last thing analysed: a voice check, image or video check, pasted message or case),
so "why?", "which part?" and "what if it was real?" are answered about that thing. Opening the assistant on a case
page makes that case the subject.
"""
from __future__ import annotations

import logging
import tempfile
import time
import uuid
from collections import OrderedDict
from pathlib import Path

from fastapi import HTTPException

from . import router, skills
from .catalog import INTENTS, SUBJECT

log = logging.getLogger("mirage.assistant")
SESSIONS: "OrderedDict[str, dict]" = OrderedDict()
SIDE_EFFECTS = {"run_scenario", "analyse_sample", "navigate", "open_case"}  # do something, so they need a clear ask
MAX_SESSIONS = 300


def session(sid: str | None) -> dict:
    if sid and sid in SESSIONS:
        SESSIONS.move_to_end(sid)
        return SESSIONS[sid]
    sid = sid or uuid.uuid4().hex[:12]
    SESSIONS[sid] = {"id": sid, "subject": None, "history": []}
    while len(SESSIONS) > MAX_SESSIONS:
        SESSIONS.popitem(last=False)
    return SESSIONS[sid]


class Ctx:
    def __init__(self, text: str, ent: dict, sess: dict, user, db, sample: str | None = None):
        self.text, self.ent, self.session, self.user, self.db, self.sample = text, ent, sess, user, db, sample

    @property
    def subject(self) -> dict | None:
        return self.session["subject"]

    @property
    def view(self) -> dict:
        return skills.view(self.subject)

    def set_subject(self, sub: dict) -> None:
        self.session["subject"] = sub


def _subject_info(sub: dict | None) -> dict | None:
    if not sub:
        return None
    v = skills.view(sub)
    return {"kind": sub["kind"], "label": sub.get("label"), "severity": v.get("severity"), "case_id": v.get("case_id")}


def reply(text: str, sid: str | None, user, db, *, upload: tuple[str, bytes] | None = None, sample: str | None = None,
          page_case: str | None = None) -> dict:
    t0 = time.time()
    sess = session(sid)
    text = (text or "").strip()
    trace: list[str] = []
    if page_case and (not sess["subject"] or skills.view(sess["subject"]).get("case_id") != page_case) and not upload and not sample:
        if sub := skills.case_subject(db, page_case):
            sess["subject"] = sub
            trace.append(f"Context: you are on case {page_case}")
    route = {"intent": None, "confidence": 1.0, "method": "attachment", "alternatives": [], "entities": router.entities(text)}
    ctx = Ctx(text, route["entities"], sess, user, db, sample)
    try:
        if upload:
            name, data = upload
            with tempfile.TemporaryDirectory() as d:
                p = Path(d) / f"in{Path(name).suffix or '.bin'}"
                p.write_bytes(data)
                sub = skills.analyse_path(p, name, ctx.ent.get("claimed") or "")
            sess["subject"] = sub
            v = skills.view(sub)
            route["intent"] = f"analyse_{sub['kind']}"
            trace.append({"voice": "Ran the two-stage voice check", "media": "Ran the image / video detectors",
                          "text": "Ran the message analysis"}[sub["kind"]] + f" on {name}")
            out = {"blocks": skills.card(v, skills.intro_for(v)), "suggestions": skills.follow_ups(v)}
        elif sample:
            route.update(intent="analyse_sample", method="sample")
            out = skills.s_analyse_sample(ctx)
            trace.append(f"Ran the detectors on the built-in sample '{sample}'")
        else:
            if not text:
                raise HTTPException(422, "Ask a question, paste a message or attach a file.")
            route = router.route(text, has_subject=sess["subject"] is not None)
            ctx.ent = route["entities"]
            intent = route["intent"]
            trace.append(f"Understood as “{INTENTS[intent]['desc']}” ({route['confidence']:.0%}, {route['method']})")
            low_subject = INTENTS[intent].get("kind") == SUBJECT and sess["subject"] is not None
            if route["confidence"] < 0.3 and route["method"] == "router" and intent not in ("greet", "thanks") and not low_subject:
                out = skills.k_docs(ctx, route["alternatives"] + [{"intent": intent}])
                trace.append("Low confidence: answered from the documentation instead")
                route["intent"] = "docs"
            elif intent in SIDE_EFFECTS and route["confidence"] < 0.6 and route["method"] == "router":
                prompt = skills.INTENT_PROMPTS.get(intent, intent)
                out = {"blocks": [skills.lead(f"Did you want me to **{prompt.lower().rstrip('?')}**? I only run actions when I'm sure; tap it to go ahead.")],
                       "suggestions": [prompt] + [skills.INTENT_PROMPTS[a["intent"]] for a in route["alternatives"] if a["intent"] in skills.INTENT_PROMPTS][:3]}
                trace.append("Not confident enough to run an action: asked first")
            elif INTENTS[intent].get("kind") == SUBJECT:
                if sess["subject"]:
                    trace.append(f"About: {sess['subject'].get('label')}")
                    out = skills.SUBJECT_SKILLS[intent](ctx)
                elif skills.GENERAL.get(intent):
                    trace.append("Nothing analysed yet: answered in general")
                    out = skills.GENERAL[intent](ctx)
                else:
                    out = skills.need_subject(ctx)
            else:
                out = skills.SKILLS[intent](ctx)
    except HTTPException as exc:
        out = {"blocks": [skills.callout("amber", "I couldn't run that", str(exc.detail))], "suggestions": ["What can you do?"]}
    except Exception as exc:  # a demo must never show a stack trace
        log.exception("assistant turn failed")
        out = {"blocks": [skills.callout("amber", "Something went wrong on my side", f"{type(exc).__name__}: {exc}")],
               "suggestions": ["Try again", "What can you do?"]}
    blocks = [b for b in out.get("blocks", []) if b]
    sess["history"].append({"q": text or (upload[0] if upload else sample), "intent": route["intent"], "at": time.time()})
    alts = [skills.INTENT_PROMPTS[a["intent"]] for a in route.get("alternatives", []) if a["intent"] in skills.INTENT_PROMPTS]
    return {"session_id": sess["id"], "intent": route["intent"], "confidence": route["confidence"], "method": route["method"],
            "did_you_mean": alts[:3] if route["confidence"] < 0.55 and route["method"] == "router" else [],
            "blocks": blocks, "suggestions": out.get("suggestions", [])[:5], "go": out.get("go"),
            "subject": _subject_info(sess["subject"]), "trace": trace, "ms": int(1000 * (time.time() - t0))}

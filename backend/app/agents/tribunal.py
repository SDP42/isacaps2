"""The Tribunal: a LangGraph state machine in which specialist agents testify from witness findings, the Casebook agent
retrieves matching precedents, a Skeptic argues the innocent explanation, a Judge explains the (already computed)
verdict, the Verifier builds the plan and the Reporter writes the case summary.

Every message carries evidence references; text may only cite evidence IDs that exist in the case.
"""
from __future__ import annotations

import re
import time
from collections.abc import Callable
from typing import Any, TypedDict

from ..fusion import playbooks
from ..fusion.risk import Assessment
from ..rag.index import casebook
from ..witnesses.base import Evidence, WitnessResult
from ..witnesses.words import fmt_inr
from . import llm

try:
    from langgraph.graph import END, StateGraph

    HAS_LANGGRAPH = True
except Exception:  # pragma: no cover
    HAS_LANGGRAPH = False

AGENTS = {
    "planner": {"name": "Planner", "role": "Chooses which witnesses to call"},
    "voice": {"name": "Voice Analyst", "role": "Synthetic speech & voiceprint"},
    "face": {"name": "Face Analyst", "role": "Face artefacts & lip-sync"},
    "provenance": {"name": "Provenance Examiner", "role": "Image origin & credentials"},
    "linguist": {"name": "Linguist", "role": "Manipulation tactics & requests"},
    "identity": {"name": "Identity Officer", "role": "Trustbook & context"},
    "casebook": {"name": "Casebook Clerk", "role": "Precedents & policy (RAG)"},
    "skeptic": {"name": "Skeptic", "role": "Argues the innocent explanation"},
    "judge": {"name": "Judge", "role": "Rules; cannot change the score"},
    "verifier": {"name": "Verifier", "role": "Builds the verification plan"},
    "reporter": {"name": "Reporter", "role": "Writes the case record"},
}


class State(TypedDict, total=False):
    case: dict
    results: dict[str, WitnessResult]
    evidence: list[Evidence]
    assessment: Assessment
    hits: list[dict]
    messages: list[dict]
    plan: list[dict]
    summary: str


Emit = Callable[[dict], None]


def _cite(ids: list[str]) -> str:
    return " ".join(f"[{i}]" for i in ids if i)


def _ev(state: State, witness: str, exculpatory: bool | None = None) -> list[Evidence]:
    return [e for e in state["evidence"] if e.witness == witness and (exculpatory is None or e.exculpatory == exculpatory)]


def _clean(text: str, valid: set[str]) -> str:
    return re.sub(r"\[(E\d+)\]", lambda m: m.group(0) if m.group(1) in valid else "", text).strip()


def make_message(state: State, agent: str, stance: str, draft: str, supporting: list[str] | None = None,
                 contradicting: list[str] | None = None, responds_to: int | None = None) -> dict:
    valid = {e.id for e in state["evidence"]}
    text = _clean(llm.narrate(AGENTS[agent]["name"], draft), valid)
    sup = [i for i in (supporting or []) if i in valid]
    con = [i for i in (contradicting or []) if i in valid]
    msg = {
        "seq": len(state.get("messages", [])) + 1, "agent": agent, "agent_name": AGENTS[agent]["name"],
        "agent_role": AGENTS[agent]["role"], "stance": stance, "content": text, "supporting": sup,
        "contradicting": con, "evidence_refs": sorted(set(sup + con + re.findall(r"E\d+", text)),
                                                      key=lambda x: int(x[1:])),
        "responds_to": responds_to,
    }
    state.setdefault("messages", []).append(msg)
    return msg


def planner_message(state: State, kinds: list[str], witnesses: list[str]) -> dict:
    inputs = ", ".join(sorted(set(kinds))) or "no files"
    draft = (f"Received {inputs}. Calling the {', '.join(witnesses)} witness{'es' if len(witnesses) != 1 else ''}"
             f"{' in parallel' if len(witnesses) > 1 else ''}; the Identity Officer will check the claimed sender "
             "against the Trustbook.")
    return make_message(state, "planner", "neutral", draft)


# ---- specialist testimony -------------------------------------------------------------------------------------------

def _specialist(state: State, witness: str, agent: str) -> State:
    r = state["results"].get(witness)
    if not r or r.status == "not_applicable":
        return state
    inc = sorted(_ev(state, witness, False), key=lambda e: -e.severity)
    exc = _ev(state, witness, True)
    if r.status in ("insufficient", "error"):
        make_message(state, agent, "neutral", f"{r.summary} I cannot testify either way.")
        return state
    lead = {
        "voice": lambda: f"Synthetic-speech score {r.score:.2f}.",
        "face": lambda: f"Face artefact score {r.score:.2f} over {r.details.get('frames_sampled', 0)} frames.",
        "provenance": lambda: f"AI-generation probability {r.details.get('ai_probability', 0):.2f}.",
        "words": lambda: f"Scam-language probability {r.details.get('classifier_p', 0):.2f}.",
        "identity": lambda: r.summary,
    }[witness]()
    points = []
    for e in inc[:3]:
        where = f" at {e.t0:.1f}–{e.t1:.1f}s" if e.t0 is not None and e.t1 is not None else ""
        quote = f" “{e.text}”" if e.text and witness == "words" else ""
        points.append(f"{e.label}{where}{quote} [{e.id}]")
    body = ("I observe " + "; ".join(points) + ".") if points else "I found nothing incriminating."
    if witness == "words" and r.details.get("requested_action") not in (None, "none"):
        act = r.details["requested_action"].replace("_", " ")
        amt = r.details.get("amount_inr")
        body += f" The message asks for {act}" + (f" of {fmt_inr(amt)}" if amt and act == "payment" else "") + \
                (f", deadline “{r.details['deadline']}”" if r.details.get("deadline") else "") + "."
    stance = "incriminating" if (r.score or 0) >= 0.5 or any(e.severity >= 3 for e in inc) else "neutral"
    make_message(state, agent, stance, f"{lead} {body}", supporting=[e.id for e in inc[:4]],
                 contradicting=[e.id for e in exc[:2]])
    return state


def voice_node(state: State) -> State:
    return _specialist(state, "voice", "voice")


def face_node(state: State) -> State:
    return _specialist(state, "face", "face")


def provenance_node(state: State) -> State:
    return _specialist(state, "provenance", "provenance")


def linguist_node(state: State) -> State:
    return _specialist(state, "words", "linguist")


def identity_node(state: State) -> State:
    return _specialist(state, "identity", "identity")


def casebook_node(state: State) -> State:
    words = state["results"].get("words")
    text = (words.details.get("text") if words and words.status == "ok" else "") or ""
    tactics = " ".join(words.details.get("tactics", [])) if words and words.status == "ok" else ""
    action = state["assessment"].requested_action
    query = f"{text} {tactics} {action} {state['case'].get('channel', '')} impersonation deepfake verification"
    hits = casebook().search(query, k=5)
    state["hits"] = hits
    if not hits:
        return state
    top = hits[0]
    policy = next((h for h in hits if h["kind"] == "policy"), None)
    draft = (f"Closest precedent: “{top['title']} — {top['heading']}” (match {top['score']:.2f}, {top['id']}).")
    if policy and policy is not top:
        draft += f" Applicable policy: {policy['title']} — {policy['heading']} ({policy['id']})."
    msg = make_message(state, "casebook", "neutral", draft)
    msg["citations"] = [{"id": h["id"], "title": h["title"], "heading": h["heading"], "score": h["score"]} for h in hits[:3]]
    return state


def skeptic_node(state: State) -> State:
    a = state["assessment"]
    excul = [e for e in state["evidence"] if e.exculpatory]
    points, refs = [], []
    for e in excul[:3]:
        points.append(f"{e.detail} [{e.id}]")
        refs.append(e.id)
    for name in ("voice", "face", "provenance", "words"):
        r = state["results"].get(name)
        if r and r.status == "ok" and r.confidence < 0.55:
            points.append(f"the {name} witness's confidence is only {r.confidence:.2f}")
    if a.requested_action in ("none", "info") and a.band != "LOW":
        points.append("nothing irreversible is being requested")
    target = next((m["seq"] for m in sorted(state.get("messages", []), key=lambda m: -len(m["supporting"]))
                   if m["stance"] == "incriminating"), None)
    if points:
        draft = "Consider the innocent explanation: " + "; ".join(points) + "."
        if a.band == "HIGH" and a.rule_fired:
            draft += " Even so, none of this explains the request itself, so I do not object to the ruling."
        elif a.band in ("MEDIUM", "INCONCLUSIVE"):
            draft += " I ask the Judge to recommend verification rather than an accusation."
    else:
        draft = "I looked for innocent explanations (codec noise, a poor microphone, a known contact) and found none in the evidence."
    make_message(state, "skeptic", "exculpatory", draft, contradicting=refs, responds_to=target)
    return state


BAND_WORDS = {"HIGH": "HIGH risk — do not act until verified", "MEDIUM": "MEDIUM risk — verify before acting",
              "LOW": "LOW risk", "INCONCLUSIVE": "INCONCLUSIVE — verify anyway"}


def judge_node(state: State) -> State:
    a = state["assessment"]
    reasons = [r for r in a.reasons if r["kind"] != "mitigating"][:3]
    parts = []
    for r in reasons:
        cite = _cite(r["evidence_ids"])
        parts.append(f"{r['text'].rstrip('.')}{' ' + cite if cite else ''}")
    tag = " Tagged synthetic but harmless." if "SYNTHETIC_MEDIA" in a.tags else ""
    draft = (f"Ruling: {BAND_WORDS[a.band]} ({a.risk:.0f}/100, interval {a.interval[0]:.0f}–{a.interval[1]:.0f}). "
             + (" ".join(f"({i + 1}) {p}." for i, p in enumerate(parts))) + tag
             + " The score comes from the fusion engine; this court explains it and does not change it.")
    make_message(state, "judge", "ruling", draft, supporting=[i for r in reasons for i in r["evidence_ids"]])
    return state


def verifier_node(state: State) -> State:
    a = state["assessment"]
    ident = state["results"].get("identity")
    person = ident.details.get("resolved") if ident else None
    words = state["results"].get("words")
    tactics = set(words.details.get("tactics", [])) if words and words.status == "ok" else set()
    kinds = {e.kind for e in state["evidence"] if e.witness == "identity"}
    state["plan"] = playbooks.plan(a.band, a.requested_action, a.rule_fired, tactics, kinds, person,
                                   state["case"].get("scenario_hint"))
    steps = "; ".join(s["title"] for s in state["plan"][:4])
    make_message(state, "verifier", "neutral", f"Verification plan: {steps}.")
    return state


def reporter_node(state: State) -> State:
    a = state["assessment"]
    strong = sorted((e for e in state["evidence"] if not e.exculpatory and e.severity >= 2), key=lambda e: -e.severity)
    clauses, used = [], set()
    for e in strong:
        if e.witness in used:
            continue
        used.add(e.witness)
        when = f" at {e.t0:.0f}–{e.t1:.0f}s" if e.t0 is not None and e.t1 is not None else ""
        clauses.append(f"{e.label}{when} [{e.id}]")
        if len(clauses) == 3:
            break
    if "SYNTHETIC_MEDIA" in a.tags:
        media = next((e for e in state["evidence"] if e.witness in ("voice", "face", "provenance") and not e.exculpatory), None)
        summary = (f"MIRAGE rates this {a.band} ({a.risk:.0f}/100): the media looks synthetic"
                   + (f" [{media.id}]" if media else "") + " but nothing is requested and no pressure tactics were found, "
                   "so it is tagged, not alarmed.")
    elif clauses:
        summary = f"MIRAGE rates this {a.band} ({a.risk:.0f}/100): " + ", ".join(clauses) + "."
    else:
        summary = f"MIRAGE rates this {a.band} ({a.risk:.0f}/100) with no strong indicators."
    if state.get("plan"):
        summary += f" Next step: {state['plan'][0]['title'].lower()}."
    state["summary"] = _clean(summary, {e.id for e in state["evidence"]})
    make_message(state, "reporter", "neutral", state["summary"])
    return state


ORDER = [("voice", voice_node), ("face", face_node), ("provenance", provenance_node), ("linguist", linguist_node),
         ("identity", identity_node), ("casebook", casebook_node), ("skeptic", skeptic_node), ("judge", judge_node),
         ("verifier", verifier_node), ("reporter", reporter_node)]


def run(state: State, emit: Emit, pace: float = 0.0) -> State:
    """Run the Tribunal, emitting each new message as soon as its agent finishes."""
    def wrap(fn):
        def node(s: State) -> State:
            before = len(s.get("messages", []))
            s = fn(s)
            for m in s.get("messages", [])[before:]:
                emit(m)
                if pace:
                    time.sleep(pace)
            return s
        return node

    if HAS_LANGGRAPH:
        g = StateGraph(State)
        for name, fn in ORDER:
            g.add_node(name, wrap(fn))
        g.set_entry_point(ORDER[0][0])
        for (a, _), (b, _) in zip(ORDER, ORDER[1:]):
            g.add_edge(a, b)
        g.add_edge(ORDER[-1][0], END)
        return g.compile().invoke(state)
    for _, fn in ORDER:
        state = wrap(fn)(state)
    return state


def ask(question: str, case: dict, evidence: list[dict], verdict: dict | None, messages: list[dict]) -> dict:
    """Ask MIRAGE about a case: answer from the case's own evidence first, then from the casebook, with citations."""
    q = question.lower()
    picked: list[dict] = []
    words = set(re.findall(r"\w+", q))
    for e in evidence:
        blob = f"{e.get('label', '')} {e.get('detail', '')} {e.get('kind', '')} {e.get('witness', '')}".lower()
        overlap = len(words & set(re.findall(r"\w+", blob)))
        if overlap >= 1:
            picked.append((overlap + e.get("severity", 0) * 0.3, e))
    picked.sort(key=lambda x: -x[0])
    lines = [f"{e['detail'] or e['label']} [{e['id']}]" for _, e in picked[:3]]
    if verdict and any(w in q for w in ("why", "high", "risk", "score", "verdict", "low", "medium")):
        lines.insert(0, f"The verdict is {verdict['band']} at {verdict['risk']:.0f}/100" +
                     (f" because of the policy rule “{verdict['rule_fired'].replace('_', ' ')}”" if verdict.get("rule_fired") else "") + ".")
    rag = casebook().answer(question)
    if rag["sentences"]:
        lines.append("From the casebook: " + " ".join(f"{s['text']} [{s['cite']}]" for s in rag["sentences"][:2]))
    answer = " ".join(lines) if lines else "I don't have evidence in this case that answers that."
    return {"answer": llm.narrate("Ask MIRAGE", answer) if llm.available() else answer,
            "evidence": [e for _, e in picked[:3]], "citations": rag["citations"][:3]}

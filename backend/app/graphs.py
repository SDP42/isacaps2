"""Graph builders for the Identity Graph, per-case attack chains and cross-channel campaigns.

Edge states follow the storyline convention: observed (seen in evidence), matched (agrees with the Trustbook),
verified (confirmed by a verification step), inferred (MIRAGE's conclusion), unknown.
"""
from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Beneficiary, Case, Person

CHANNEL_ORDER = {"email": 0, "sms": 1, "whatsapp": 2, "phone": 3, "teams": 3, "video": 4, "portal": 5, "unknown": 6}


def identity_graph(db: Session) -> dict:
    people = db.scalars(select(Person)).all()
    nodes, edges = [], []
    nodes.append({"id": "org", "type": "org", "data": {"label": "Acme Fintech Pvt Ltd", "sub": "acmefintech.in"}})
    nodes.append({"id": "family", "type": "org", "data": {"label": "Panchal family", "sub": "Personal circle"}})
    shown = [p for p in people if p.voiceprint is not None or p.circle == "family" or p.approval_limit_inr >= 1_000_000]
    shown_ids = {p.id for p in shown}
    for p in shown:
        nodes.append({"id": f"p{p.id}", "type": "person", "data": {
            "label": p.name, "role": p.role, "circle": p.circle, "limit": p.approval_limit_inr,
            "channels": p.usual_channels, "voiceprint": p.voiceprint is not None, "code_word": p.code_word_set,
            "impersonations": p.impersonation_count, "phone": p.phone}})
        if p.reports_to and p.reports_to in shown_ids:
            edges.append({"id": f"r{p.id}", "source": f"p{p.reports_to}", "target": f"p{p.id}", "kind": "reports_to"})
        elif p.circle == "org" and not p.reports_to:
            edges.append({"id": f"o{p.id}", "source": "org", "target": f"p{p.id}", "kind": "member"})
        elif p.circle == "family":
            edges.append({"id": f"f{p.id}", "source": "family", "target": f"p{p.id}", "kind": "member"})
    channels = sorted({c for p in shown for c in p.usual_channels})
    for ch in channels + ["whatsapp", "sms"]:
        if f"ch-{ch}" not in {n["id"] for n in nodes}:
            nodes.append({"id": f"ch-{ch}", "type": "channel", "data": {"label": ch}})
    for p in shown:
        for ch in p.usual_channels[:2]:
            edges.append({"id": f"c{p.id}{ch}", "source": f"p{p.id}", "target": f"ch-{ch}", "kind": "uses"})
    for b in db.scalars(select(Beneficiary)):
        nodes.append({"id": f"b{b.id}", "type": "beneficiary", "data": {"label": b.label, "identifier": b.identifier,
                                                                         "trust": b.trust_level}})
        if b.linked_person_id and b.linked_person_id in shown_ids:
            edges.append({"id": f"bl{b.id}", "source": f"p{b.linked_person_id}", "target": f"b{b.id}", "kind": "owns"})
        elif b.trust_level == "trusted":
            edges.append({"id": f"bo{b.id}", "source": "org", "target": f"b{b.id}", "kind": "pays"})

    # suspicious connections from high-risk cases: impostor contact -> impersonated person -> beneficiary
    impostors = {}
    for c in db.scalars(select(Case).where(Case.status == "complete")):
        v = c.verdict
        if not v or v.band != "HIGH":
            continue
        idf = next((f for f in c.findings if f.witness == "identity"), None)
        resolved = (idf.details_json.get("resolved") if idf else None) or {}
        pid = resolved.get("id")
        if not pid or pid not in shown_ids:
            continue
        key = c.sender_contact or f"{c.channel}:{c.claimed_sender}"
        nid = f"x-{abs(hash(key)) % 10**8}"
        if nid not in impostors:
            impostors[nid] = {"id": nid, "type": "impostor", "data": {"label": c.sender_contact or "unverified sender",
                                                                       "channel": c.channel, "cases": []}}
        impostors[nid]["data"]["cases"].append(c.id)
        edges.append({"id": f"s{c.id}", "source": nid, "target": f"p{pid}", "kind": "impersonates", "suspicious": True,
                      "case": c.id})
        for b in (idf.details_json.get("beneficiaries", []) if idf else []):
            if b["state"] in ("new", "flagged"):
                bid = f"nb-{b['id']}"
                if bid not in {n["id"] for n in nodes}:
                    nodes.append({"id": bid, "type": "beneficiary", "data": {"label": "Unknown beneficiary",
                                                                              "identifier": b["id"], "trust": b["state"]}})
                edges.append({"id": f"sb{c.id}{b['id']}", "source": nid, "target": bid, "kind": "requests_payment_to",
                              "suspicious": True, "case": c.id})
    nodes += list(impostors.values())
    seen, uniq = set(), []
    for e in edges:
        if e["id"] not in seen:
            seen.add(e["id"])
            uniq.append(e)
    return {"nodes": nodes, "edges": uniq}


def case_chain(db: Session, c: Case) -> dict:
    idf = next((f for f in c.findings if f.witness == "identity"), None)
    words = next((f for f in c.findings if f.witness == "words"), None)
    resolved = (idf.details_json.get("resolved") if idf else None) or {}
    ev = [e for f in c.findings for e in f.evidence_json]
    kinds = {e["kind"] for e in ev}
    nodes, edges = [], []
    nodes.append({"id": "claim", "type": "claim", "data": {"label": c.claimed_sender or "Unknown sender",
                                                            "sub": resolved.get("role", "claimed identity")}})
    nodes.append({"id": "channel", "type": "channel", "data": {"label": c.channel, "sub": c.sender_contact or ""}})
    edges.append({"id": "e1", "source": "claim", "target": "channel",
                  "state": "inferred" if "contact_mismatch" in kinds or "unusual_channel" in kinds else
                  ("matched" if "contact_match" in kinds else "observed")})
    for a in c.artifacts:
        f = next((x for x in c.findings if x.artifact_id == a.id and x.witness in ("voice", "face", "provenance")), None)
        nodes.append({"id": f"a{a.id}", "type": "media", "data": {"label": a.filename, "kind": a.kind,
                                                                   "score": f.score if f else None}})
        edges.append({"id": f"ea{a.id}", "source": "channel", "target": f"a{a.id}",
                      "state": "inferred" if f and (f.score or 0) >= 0.6 else "observed"})
    if c.message_text:
        nodes.append({"id": "msg", "type": "message", "data": {"label": "Message", "sub": c.message_text[:90],
                                                                "tactics": (words.details_json.get("tactics", []) if words else [])}})
        edges.append({"id": "em", "source": "channel", "target": "msg", "state": "observed"})
    action = c.verdict.requested_action if c.verdict else "none"
    if action and action != "none":
        nodes.append({"id": "action", "type": "action", "data": {"label": action.replace("_", " "),
                                                                  "sub": (f"₹{words.details_json.get('amount_inr'):,}" if words and words.details_json.get("amount_inr") else "")}})
        src = "msg" if c.message_text else (f"a{c.artifacts[0].id}" if c.artifacts else "channel")
        edges.append({"id": "eac", "source": src, "target": "action", "state": "observed"})
        for b in (idf.details_json.get("beneficiaries", []) if idf else []):
            nodes.append({"id": f"b-{b['id']}", "type": "beneficiary", "data": {"label": b["id"], "trust": b["state"]}})
            edges.append({"id": f"eb{b['id']}", "source": "action", "target": f"b-{b['id']}",
                          "state": "inferred" if b["state"] != "trusted" else "matched"})
    if resolved:
        nodes.append({"id": "trust", "type": "person", "data": {"label": resolved.get("name"), "role": resolved.get("role"),
                                                                "phone": resolved.get("directory_phone")}})
        verified = any(v.outcome == "done" and "call" in v.step for v in c.verifications)
        edges.append({"id": "et", "source": "trust", "target": "claim",
                      "state": "verified" if verified else ("unknown" if "contact_mismatch" in kinds else "matched")})
    for m in (idf.details_json.get("pattern_matches", []) if idf else [])[:4]:
        nodes.append({"id": f"c-{m['case_id']}", "type": "case", "data": {"label": m["case_id"], "sub": ", ".join(m["matches"])[:40]}})
        edges.append({"id": f"ec{m['case_id']}", "source": "channel", "target": f"c-{m['case_id']}", "state": "matched"})
    return {"nodes": nodes, "edges": edges}


def campaigns(db: Session) -> list[dict]:
    """Cluster cases that share identifiers (sender contact, UPI, account) into cross-channel campaigns."""
    cases = [c for c in db.scalars(select(Case).where(Case.status == "complete"))
             if c.verdict and c.verdict.band in ("HIGH", "MEDIUM")]
    # a Trustbook contact links genuine messages, not a campaign
    trusted = {p.phone.lower() for p in db.scalars(select(Person)) if p.phone} | \
              {p.email.lower() for p in db.scalars(select(Person)) if p.email}
    parent = {c.id: c.id for c in cases}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    owners: dict[str, str] = {}
    for c in cases:
        keys = set()
        if c.sender_contact:
            keys.add(c.sender_contact.lower())
        for f in c.findings:
            if f.witness == "words":
                for k in ("upi", "account", "iban", "url"):
                    keys.update(v.lower() for v in f.details_json.get("entities", {}).get(k, []))
        for k in keys - trusted:
            if k in owners:
                parent[find(c.id)] = find(owners[k])
            else:
                owners[k] = c.id
    groups: dict[str, list[Case]] = defaultdict(list)
    for c in cases:
        groups[find(c.id)].append(c)
    out = []
    for root, members in groups.items():
        if len(members) < 2:
            continue
        members.sort(key=lambda c: (c.received_at or c.created_at))
        stages = []
        for i, c in enumerate(members):
            stages.append({"case_id": c.id, "channel": c.channel, "title": c.title, "band": c.verdict.band,
                           "risk": c.verdict.risk, "action": c.verdict.requested_action,
                           "at": (c.received_at or c.created_at).isoformat(), "claimed_sender": c.claimed_sender,
                           "kinds": sorted({a.kind for a in c.artifacts} | ({"text"} if c.message_text else set())),
                           "summary": c.verdict.summary})
        shared = sorted(k for k, v in owners.items() if find(v) == root)
        out.append({"id": f"CMP-{root[-4:]}", "stages": stages, "shared_identifiers": shared[:8],
                    "max_risk": max(s["risk"] for s in stages), "channels": [s["channel"] for s in stages]})
    out.sort(key=lambda x: (-len(set(x["channels"])), -len(x["stages"])))
    return out

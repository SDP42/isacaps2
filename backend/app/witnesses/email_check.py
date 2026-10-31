"""Email header forensics for .eml evidence: authentication results, Reply-To and Return-Path mismatches,
display-name spoofing and look-alike sender domains."""
from __future__ import annotations

import re
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
from pathlib import Path

from .base import Evidence

ORG_DOMAINS = {"acmefintech.in"}


def looks_like_eml(raw: bytes) -> bool:
    head = raw[:4000].decode("utf-8", "ignore")
    return bool(re.search(r"^(From|Received|Return-Path|Message-ID):", head, re.M)) and "Subject:" in head


def parse(path: Path) -> dict | None:
    raw = path.read_bytes()
    if not looks_like_eml(raw):
        return None
    msg = BytesParser(policy=policy.default).parsebytes(raw)
    body = msg.get_body(preferencelist=("plain", "html"))
    text = body.get_content() if body else ""
    text = re.sub(r"<[^>]+>", " ", text)
    name, addr = parseaddr(str(msg.get("From", "")))
    _, reply = parseaddr(str(msg.get("Reply-To", "")))
    _, ret = parseaddr(str(msg.get("Return-Path", "")))
    auth = str(msg.get("Authentication-Results", "")).lower()
    res = {k: (re.search(rf"{k}=(\w+)", auth).group(1) if re.search(rf"{k}=(\w+)", auth) else "none")
           for k in ("spf", "dkim", "dmarc")}
    return {"from_name": name, "from": addr.lower(), "reply_to": reply.lower(), "return_path": ret.lower(),
            "subject": str(msg.get("Subject", "")), "auth": res, "body": text.strip()[:20000]}


def evidence(info: dict, artifact_id: int | None, claimed: str = "") -> list[Evidence]:
    out: list[Evidence] = []
    dom = info["from"].split("@")[-1] if "@" in info["from"] else ""
    for k, v in info["auth"].items():
        if v in ("fail", "softfail", "none", "permerror"):
            out.append(Evidence(witness="words", kind=f"{k}_{'fail' if v != 'none' else 'missing'}",
                                label=f"{k.upper()} {v}", severity=3 if v == "fail" and k == "dmarc" else 2,
                                observed=f"{k}={v}", artifact_id=artifact_id,
                                detail=f"The message did not pass {k.upper()} ({v}); the sending domain is not authenticated."))
    if info["reply_to"] and info["reply_to"].split("@")[-1] != dom:
        out.append(Evidence(witness="words", kind="reply_to_mismatch", label="Reply-To mismatch", severity=3,
                            expected=info["from"], observed=info["reply_to"], artifact_id=artifact_id,
                            detail=f"Replies go to {info['reply_to']}, not the sender's domain {dom}."))
    if info["return_path"] and info["return_path"].split("@")[-1] not in (dom, ""):
        out.append(Evidence(witness="words", kind="return_path_mismatch", label="Return-Path mismatch", severity=2,
                            observed=info["return_path"], artifact_id=artifact_id,
                            detail=f"The bounce address {info['return_path']} is on a different domain from the sender."))
    name = info["from_name"].lower()
    if name and any(w in name for w in ("ceo", "cfo", "director", "md", "accounts", "finance")) and dom not in ORG_DOMAINS:
        out.append(Evidence(witness="words", kind="display_name_spoof", label="display-name spoofing", severity=2,
                            observed=f"\"{info['from_name']}\" <{info['from']}>", artifact_id=artifact_id,
                            detail="An authority display name is attached to an external address."))
    norm = dom.replace("rn", "m").replace("1", "l").replace("0", "o")
    for good in ORG_DOMAINS:
        base = good.split(".")[0]
        if dom != good and (base in norm.replace("-", "") or norm.startswith(base[:5])):
            out.append(Evidence(witness="words", kind="lookalike_domain", label="look-alike sender domain", severity=3,
                                expected=good, observed=dom, artifact_id=artifact_id,
                                detail=f"{dom} imitates the organisation's domain {good}."))
    return out

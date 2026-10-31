"""Request-aware risk engine.

    authenticity A = noisy-OR of media witnesses (voice, face, provenance), each weighted by its confidence
    manipulation M = Words witness score
    context      C = Identity witness score
    sensitivity  S = 0.1 none · 0.3 info · 0.6 data · 1.0 payment / credential / remote access

    raw  = 1 − (1 − A·S)(1 − M·S)(1 − C)          # noisy-OR: one strong independent flag is enough,
    risk = 100 · σ(logit(raw) / T)                  #   weak flags do not stack into a false alarm

Hard policy rules run first and set floors (or a ceiling for harmless synthetic media), so an uncertain detector can
never talk a dangerous request down. Per-lens contributions are exact Shapley values of `raw`.
"""
from __future__ import annotations

import itertools
import json
import math
from dataclasses import dataclass, field

from ..config import settings
from ..witnesses.base import Evidence, WitnessResult

SENSITIVITY = {"none": 0.1, "info": 0.3, "data": 0.6, "payment": 1.0, "credential": 1.0, "remote_access": 1.0}
MEDIA = ("voice", "face", "provenance")
LOW_MAX, MED_MAX = 35.0, 70.0


def _temperature() -> float:
    try:
        return float(json.loads((settings.models_dir / "fusion.json").read_text())["temperature"])
    except Exception:
        return 1.0


@dataclass
class Assessment:
    risk: float
    band: str
    tags: list[str]
    interval: list[float]
    dims: dict
    contributions: dict
    reasons: list[dict]
    rule_fired: str | None
    requested_action: str
    sensitivity: float
    witness_bars: dict = field(default_factory=dict)


def _combine(a: float, m: float, c: float, s: float) -> float:
    return 1 - (1 - a * s) * (1 - m * s) * (1 - c)


def _calibrate(raw: float, T: float) -> float:
    raw = min(max(raw, 1e-4), 1 - 1e-4)
    return 100 / (1 + math.exp(-math.log(raw / (1 - raw)) / T))


def _band(r: float) -> str:
    return "LOW" if r < LOW_MAX else "MEDIUM" if r < MED_MAX else "HIGH"


def _shapley(a: float, m: float, c: float, s: float) -> dict[str, float]:
    players = {"authenticity": a, "manipulation": m, "context": c}
    names = list(players)
    phi = {n: 0.0 for n in names}
    perms = list(itertools.permutations(names))
    for order in perms:
        cur = {n: 0.0 for n in names}
        prev = _combine(0, 0, 0, s)
        for n in order:
            cur[n] = players[n]
            val = _combine(cur["authenticity"], cur["manipulation"], cur["context"], s)
            phi[n] += (val - prev) / len(perms)
            prev = val
    return phi


def authenticity(results: dict[str, WitnessResult]) -> tuple[float, dict[str, float], bool]:
    p = 1.0
    parts: dict[str, float] = {}
    usable = False
    for name in MEDIA:
        r = results.get(name)
        if not r or r.status != "ok" or r.score is None:
            continue
        usable = True
        w = 0.35 + 0.65 * r.confidence  # low-confidence witnesses are shrunk toward 0
        eff = r.score * w
        if name == "voice" and any(e.kind == "voiceprint_mismatch" for e in r.evidence):
            eff = 1 - (1 - eff) * 0.8  # voiceprint is a weak witness (EER in metrics.json)
        parts[name] = eff
        p *= 1 - eff
    return 1 - p, parts, usable


def assess(results: dict[str, WitnessResult], evidence: list[Evidence]) -> Assessment:
    words = results.get("words")
    ident = results.get("identity")
    action = (words.details.get("requested_action") if words and words.status == "ok" else None) or "none"
    tactics = set(words.details.get("tactics", [])) if words and words.status == "ok" else set()
    amount = (words.details.get("amount_inr") if words else None) or 0
    s = SENSITIVITY.get(action, 0.1)

    a, media_parts, media_ok = authenticity(results)
    m = words.score if words and words.status == "ok" and words.score is not None else 0.0
    c = ident.score if ident and ident.status == "ok" and ident.score is not None else 0.0
    T = _temperature()
    raw = _combine(a, m, c, s)
    risk = _calibrate(raw, T)

    # uncertainty interval: perturb each lens by its witness's (1 - confidence)
    def spread(r: WitnessResult | None) -> float:
        return 0.35 * (1 - r.confidence) if r and r.status == "ok" else 0.0

    da = max((spread(results.get(n)) for n in MEDIA), default=0.0)
    dm, dc = spread(words), spread(ident)
    lo = _calibrate(_combine(max(a - da, 0), max(m - dm, 0), max(c - dc, 0), s), T)
    hi = _calibrate(_combine(min(a + da, 1), min(m + dm, 1), min(c + dc, 1), s), T)

    sev3 = {e.kind for e in evidence if e.witness == "identity" and e.severity >= 3 and not e.exculpatory}
    tags: list[str] = []
    rule = None

    insufficient_media = all(results.get(n) is None or results[n].status in ("insufficient", "not_applicable", "error")
                             for n in MEDIA)
    any_insufficient = any(results.get(n) and results[n].status == "insufficient" for n in MEDIA)
    no_text = not words or words.status != "ok"
    no_context = not ident or ident.status != "ok"

    if insufficient_media and no_text and no_context:
        band, rule = "INCONCLUSIVE", "insufficient_evidence"
        risk = min(risk, 50)
    elif action in ("credential", "remote_access"):
        band, rule = "HIGH", "credential_request"
        risk = max(risk, 85)
    elif s >= 1.0 and (sev3 & {"contact_mismatch", "new_beneficiary", "above_authority", "flagged_beneficiary"}
                       or tactics & {"secrecy", "bypass"}):
        band, rule = "HIGH", "sensitive_action_unverified"
        risk = max(risk, 78)
    elif a >= 0.8 and s >= 0.6:
        band, rule = "HIGH", "synthetic_media_with_sensitive_ask"
        risk = max(risk, 80)
    elif a >= 0.75 and action == "none" and not tactics and c < 0.3:
        band, rule = "LOW", "synthetic_no_fraud_indicators"
        risk = min(risk, 30)
        tags.append("SYNTHETIC_MEDIA")
    else:
        band = _band(risk)
        if "new_beneficiary" in sev3 and amount >= 1_000_000 and band == "LOW":
            band, rule, risk = "MEDIUM", "new_beneficiary_large_amount", max(risk, LOW_MAX + 5)
        # thin evidence only: honest "verify anyway" band
        if rule is None and any_insufficient and no_text and (hi - lo) > 30:
            band, rule = "INCONCLUSIVE", "uncertain_interval"

    if a >= 0.75 and "SYNTHETIC_MEDIA" not in tags:
        tags.append("LIKELY_SYNTHETIC")
    if action in ("payment",):
        tags.append("FINANCIAL")
    if action in ("credential", "remote_access"):
        tags.append("CREDENTIAL")

    phi = _shapley(a, m, c, s)
    total = sum(phi.values()) or 1.0
    contrib = {k: round(v / total * risk, 1) for k, v in phi.items()}
    media_total = sum(-math.log(1 - min(v, 0.999)) for v in media_parts.values()) or 1.0
    witness_bars = {n: round(contrib["authenticity"] * (-math.log(1 - min(v, 0.999)) / media_total), 1)
                    for n, v in media_parts.items()}
    witness_bars["words"] = contrib["manipulation"]
    witness_bars["identity"] = contrib["context"]

    return Assessment(
        risk=round(float(risk), 1), band=band, tags=tags, interval=[round(lo, 1), round(hi, 1)],
        dims={"authenticity": round(a, 3), "manipulation": round(m, 3), "context": round(c, 3), "sensitivity": s,
              "raw": round(raw, 4), "temperature": T, "media_available": media_ok},
        contributions=contrib, reasons=reasons(evidence, rule, action, amount), rule_fired=rule,
        requested_action=action, sensitivity=s, witness_bars=witness_bars,
    )


RULE_TEXT = {
    "credential_request": "It asks for a password, OTP or remote access. That is high risk whatever the voice or face looks like.",
    "sensitive_action_unverified": "A money or access request is combined with secrecy, a bypassed control or an unverified sender.",
    "synthetic_media_with_sensitive_ask": "Likely synthetic media is being used to push a sensitive request.",
    "synthetic_no_fraud_indicators": "The media looks synthetic but asks for nothing and shows no pressure tactics.",
    "new_beneficiary_large_amount": "A large payment to a never-seen beneficiary is at least medium risk by policy.",
    "insufficient_evidence": "There is not enough reliable evidence. Add the message text or the sender's number.",
    "uncertain_interval": "The evidence is too weak to decide either way, so verify anyway.",
}


def reasons(evidence: list[Evidence], rule: str | None, action: str, amount: int) -> list[dict]:
    out = []
    if rule:
        out.append({"text": RULE_TEXT[rule], "evidence_ids": [], "kind": "policy", "rule": rule})
    strong = sorted((e for e in evidence if not e.exculpatory and e.severity >= 2),
                    key=lambda e: (-e.severity, -(e.score or 0)))
    seen = set()
    for e in strong:
        if e.kind in seen:
            continue
        seen.add(e.kind)
        out.append({"text": e.detail or e.label, "evidence_ids": [e.id], "kind": e.witness})
        if len(out) >= 4:
            break
    excul = [e for e in evidence if e.exculpatory]
    if excul:
        out.append({"text": "In mitigation: " + excul[0].detail, "evidence_ids": [excul[0].id], "kind": "mitigating"})
    return out

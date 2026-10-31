"""Counterfactual re-fusion: recompute the verdict with some exhibits withdrawn. No media is re-analysed, so the
answer is instant; witness scores are re-derived from the evidence that remains."""
from __future__ import annotations

from ..models import Case
from ..witnesses.base import Evidence, WitnessResult
from .risk import assess

SEV_P = {0: 0.0, 1: 0.12, 2: 0.3, 3: 0.55}
TEXT_TACTICS = {"urgency", "authority", "secrecy", "fear", "reward", "channel_switch", "bypass"}


def _ev(d: dict) -> Evidence:
    fields = Evidence.__dataclass_fields__
    return Evidence(**{k: v for k, v in d.items() if k in fields})


def recompute(case: Case, disabled: set[str]) -> dict:
    results: dict[str, WitnessResult] = {}
    evidence: list[Evidence] = []
    for f in case.findings:
        kept = [_ev(e) for e in f.evidence_json if e.get("id") not in disabled]
        removed = [e for e in f.evidence_json if e.get("id") in disabled and not e.get("exculpatory")]
        details = dict(f.details_json)
        score = f.score
        if f.status == "ok" and score is not None:
            if f.witness == "identity":
                p = 1.0
                for e in kept:
                    if not e.exculpatory:
                        p *= 1 - SEV_P.get(e.severity, 0)
                score = 1 - p
            elif f.witness == "words":
                tactics = sorted({e.kind for e in kept if e.kind in TEXT_TACTICS})
                details["tactics"] = tactics
                if any(e.get("kind") == "requested_action" for e in removed):
                    details["requested_action"] = "none"
                    details["amount_inr"] = None
                cp = float(details.get("classifier_p", score))
                # language evidence fades with the tactics removed
                cp *= 0.35 ** len([e for e in removed if e.get("kind") in TEXT_TACTICS])
                tw = min(1.0, 0.18 * len(tactics) + 0.12 * sum(t in tactics for t in ("secrecy", "bypass", "channel_switch")))
                other = 1.0
                for e in kept:
                    if e.kind not in TEXT_TACTICS and e.kind != "requested_action" and not e.exculpatory:
                        other *= 1 - SEV_P.get(e.severity, 0) * 0.5
                score = 1 - (1 - cp * 0.85) * (1 - tw) * other
            elif removed and not any(not e.exculpatory and e.severity >= 2 for e in kept):
                score = score * 0.2  # every incriminating media exhibit withdrawn
        results[f.witness] = WitnessResult(witness=f.witness, status=f.status, score=score, confidence=f.confidence,
                                           evidence=kept, details=details)
        evidence += kept
    a = assess(results, evidence)
    return {"risk": a.risk, "band": a.band, "rule_fired": a.rule_fired, "tags": a.tags, "interval": a.interval,
            "dims": a.dims, "contributions": {"lenses": a.contributions, "witnesses": a.witness_bars},
            "reasons": a.reasons, "requested_action": a.requested_action, "disabled": sorted(disabled)}

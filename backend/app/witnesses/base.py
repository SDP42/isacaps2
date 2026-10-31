"""Shared witness contract. Every witness returns a WitnessResult; evidence items get case-unique IDs (E1, E2...) later
so the Tribunal and the UI can cite them."""
from __future__ import annotations

import functools
import time
from dataclasses import asdict, dataclass, field
from typing import Any

import joblib

from ..config import settings


@dataclass
class Evidence:
    witness: str
    kind: str
    label: str
    detail: str = ""
    score: float | None = None
    severity: int = 1  # 0 info, 1 weak, 2 moderate, 3 strong
    t0: float | None = None
    t1: float | None = None
    span: list[int] | None = None
    text: str | None = None
    artifact_id: int | None = None
    expected: str | None = None
    observed: str | None = None
    exculpatory: bool = False  # evidence that argues for innocence
    id: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class WitnessResult:
    witness: str
    status: str = "ok"  # ok | not_applicable | insufficient | error
    score: float | None = None  # 0..1, probability the evidence indicates manipulation for this witness
    confidence: float = 0.5
    summary: str = ""
    evidence: list[Evidence] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)
    model_version: str = ""
    latency_ms: int = 0
    artifact_id: int | None = None


@functools.cache
def load_model(name: str):
    path = settings.models_dir / name
    if not path.exists():
        raise FileNotFoundError(f"{name} not found. Run `python -m ml.train_all` in backend/.")
    return joblib.load(path)


class Timer:
    def __enter__(self):
        self.t = time.perf_counter()
        return self

    def __exit__(self, *exc):
        self.ms = int((time.perf_counter() - self.t) * 1000)

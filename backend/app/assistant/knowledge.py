"""What the assistant knows, and where each fact comes from.

Numbers are never typed into answers: they are read at answer time from the model registry (witnesses/pretrained.py),
the measured benchmark (models_store/benchmark.json), the latest red-team campaign, and the case database. Prose
questions the intents do not cover are answered from the project's own documentation (README and docs/*.md) by hybrid
retrieval, with every sentence citing its section.
"""
from __future__ import annotations

import functools
import json
import re
from dataclasses import dataclass

import numpy as np
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..config import settings
from ..witnesses import pretrained

ROOT = settings.models_dir.parent.parent  # repository root
DOCS = ["README.md", "docs/SYSTEM_OVERVIEW.md", "docs/DETECTION.md", "docs/HOW_IT_WORKS.md", "docs/ARCHITECTURE.md",
        "docs/CURE.md", "docs/RED_TEAM.md", "docs/ATTACKER_PLAYBOOK.md", "docs/AFTER_DETECTION.md", "docs/EXTENSION.md",
        "docs/FEATURES.md", "docs/LIMITATIONS_AND_RESPONSE.md", "docs/MODEL_CARDS.md", "docs/PROBLEM_STATEMENT.md",
        "docs/USE_CASES.md", "docs/SETUP.md", "docs/API.md"]
_TOK = re.compile(r"[\wऀ-ॿ]+")


@dataclass
class Section:
    id: str
    doc: str
    heading: str
    text: str


def _tok(s: str) -> list[str]:
    return [t.lower() for t in _TOK.findall(s)]


def _clean(md: str) -> str:
    md = re.sub(r"```.*?```", " ", md, flags=re.S)
    md = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", md)
    md = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", md)
    md = re.sub(r"<[^>]+>", " ", md)
    md = re.sub(r"^\|?[-:| ]+\|?$", " ", md, flags=re.M)
    return re.sub(r"[ \t]+", " ", md).strip()


class DocIndex:
    def __init__(self) -> None:
        self.sections: list[Section] = []
        for rel in DOCS:
            p = ROOT / rel
            if not p.exists():
                continue
            raw = p.read_text(encoding="utf-8", errors="replace")
            for i, part in enumerate(re.split(r"^#{2,3} ", raw, flags=re.M)):
                head, _, body = part.partition("\n")
                body = _clean(body)
                if len(body) < 80:
                    continue
                self.sections.append(Section(f"{p.stem}#{i}", rel, head.strip("# ").strip()[:90], body[:4000]))
        docs = [f"{s.heading}. {s.text}" for s in self.sections]
        self.bm25 = BM25Okapi([_tok(d) for d in docs])
        self.vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        self.mat = self.vec.fit_transform(docs)
        self.dense = pretrained.sentence_embeddings([f"{s.heading}. {s.text[:600]}" for s in self.sections])

    def search(self, q: str, k: int = 4) -> list[tuple[Section, float]]:
        lists = [self.bm25.get_scores(_tok(q)), cosine_similarity(self.vec.transform([q]), self.mat)[0]]
        if self.dense is not None and (e := pretrained.sentence_embeddings([q])) is not None:
            lists.append(self.dense @ e[0])
        rrf = np.zeros(len(self.sections))
        for s in lists:
            for rank, i in enumerate(np.argsort(-s)):
                rrf[i] += 1 / (60 + rank)
        order = np.argsort(-rrf)[:k]
        return [(self.sections[i], float(rrf[i] / rrf[order[0]])) for i in order]

    def answer(self, q: str, k: int = 4) -> dict:
        """Extractive: the sentences that best match the question, each citing its section."""
        hits = self.search(q, k)
        qt = set(_tok(q)) - STOP
        dq = pretrained.sentence_embeddings([q])
        cands = []
        for sec, sc in hits:
            for pos, sent in enumerate(re.split(r"(?<=[.!?])\s+(?=[A-Z])", sec.text)):
                sent = sent.strip(" -*")
                if 30 <= len(sent) <= 420:
                    cands.append((sent, sec, sc, pos))
        if not cands:
            return {"sentences": [], "sources": []}
        lex = np.array([len(qt & set(_tok(c[0]))) for c in cands], float)
        dense = np.zeros(len(cands))
        if dq is not None and (E := pretrained.sentence_embeddings([c[0] for c in cands])) is not None:
            dense = E @ dq[0]
        score = 0.6 * dense + 0.12 * lex + 0.3 * np.array([c[2] for c in cands]) - 0.01 * np.array([c[3] for c in cands])
        picked, used = [], set()
        for i in np.argsort(-score):
            s, sec = cands[i][0], cands[i][1]
            if s in used or (picked and score[i] < score[np.argsort(-score)[0]] * 0.7):
                continue
            used.add(s)
            picked.append({"text": s, "cite": sec.id, "doc": sec.doc, "heading": sec.heading})
            if len(picked) >= 3:
                break
        best = float(score.max())
        return {"sentences": picked, "best": best, "sources": [
            {"id": s.id, "doc": s.doc, "heading": s.heading, "snippet": s.text[:220], "score": round(sc, 2)} for s, sc in hits]}


STOP = {"the", "a", "an", "is", "are", "what", "how", "why", "do", "does", "i", "you", "it", "this", "to", "of", "and",
        "in", "on", "for", "can", "me", "my", "be", "with", "that", "your", "about", "tell", "explain", "mirage"}


@functools.cache
def docs() -> DocIndex:
    return DocIndex()


# ---- live facts ----------------------------------------------------------------------------------------------------

def bench() -> dict:
    try:
        return json.loads((settings.models_dir / "benchmark.json").read_text())
    except FileNotFoundError:
        return {}


def metric(model: str, dataset: str, key: str = "auc"):
    return (bench().get(model, {}).get(dataset) or {}).get(key)


def latest_campaign(modality: str = "audio") -> dict | None:
    from .. import redteam

    for f in sorted(redteam.ROOT.glob("camp-*.json"), key=lambda q: q.stat().st_mtime, reverse=True):
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        if d.get("modality") == modality and d.get("status") == "done" and d.get("cells"):
            return d
    return None


def models() -> list[dict]:
    return pretrained.registry()


def router_eval() -> dict:
    try:
        return json.loads((settings.models_dir / "assistant_eval.json").read_text())
    except FileNotFoundError:
        return {}

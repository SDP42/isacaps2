"""Hybrid retrieval over the casebook: BM25 (lexical) + TF-IDF character vectors (handles Hinglish spelling variants)
+ dense multilingual sentence vectors (paraphrases and other languages, when the MiniLM encoder is installed), fused
with Reciprocal Rank Fusion. Chunks are heading-aware so every citation points at one coherent passage.

Answers are extractive by default: the best sentences from retrieved chunks, each tagged with its chunk ID. If an LLM is
configured, it rewrites them but may only use the retrieved text and must keep the citations.
"""
from __future__ import annotations

import functools
import re
from dataclasses import dataclass

import numpy as np
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ..config import settings

_TOKEN = re.compile(r"[\wऀ-ॿ]+")


@dataclass
class Chunk:
    id: str
    doc: str
    title: str
    heading: str
    source: str
    kind: str
    text: str


def _tok(s: str) -> list[str]:
    return [t.lower() for t in _TOKEN.findall(s)]


def load_corpus() -> list[Chunk]:
    chunks: list[Chunk] = []
    for path in sorted(settings.corpus_dir.glob("*.md")):
        raw = path.read_text()
        meta = dict(re.findall(r"^(\w+):\s*(.+)$", raw.split("---")[1], re.M)) if raw.startswith("---") else {}
        body = raw.split("---", 2)[2] if raw.startswith("---") else raw
        for i, sec in enumerate(re.split(r"^# ", body, flags=re.M)):
            sec = sec.strip()
            if not sec:
                continue
            heading, _, text = sec.partition("\n")
            chunks.append(Chunk(
                id=f"{path.stem}#{i}", doc=path.stem, title=meta.get("title", path.stem), heading=heading.strip(),
                source=meta.get("source", ""), kind=meta.get("kind", "doc"), text=text.strip(),
            ))
    return chunks


class Casebook:
    def __init__(self, extra: list[Chunk] | None = None) -> None:
        self.chunks = load_corpus() + (extra or [])
        docs = [f"{c.title}. {c.heading}. {c.text}" for c in self.chunks]
        self.bm25 = BM25Okapi([_tok(d) for d in docs])
        self.vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        self.mat = self.vec.fit_transform(docs)
        # dense multilingual vectors join the fusion when the MiniLM encoder is installed: they match a Hinglish or
        # paraphrased question to a passage that shares no words with it
        from ..witnesses import pretrained

        self.dense = pretrained.sentence_embeddings(docs)

    def search(self, query: str, k: int = 5, kinds: set[str] | None = None) -> list[dict]:
        if not query.strip():
            return []
        bm = self.bm25.get_scores(_tok(query))
        cs = cosine_similarity(self.vec.transform([query]), self.mat)[0]
        lists = [bm, cs]
        dn = None
        if self.dense is not None:
            from ..witnesses import pretrained

            q = pretrained.sentence_embeddings([query])
            if q is not None:
                dn = self.dense @ q[0]
                lists.append(dn)
        rrf = np.zeros(len(self.chunks))
        for scores in lists:
            for rank, idx in enumerate(np.argsort(-scores)):
                rrf[idx] += 1.0 / (60 + rank)
        order = [i for i in np.argsort(-rrf) if not kinds or self.chunks[i].kind in kinds][:k]
        top = rrf[order[0]] if order else 1.0
        return [{
            "id": self.chunks[i].id, "title": self.chunks[i].title, "heading": self.chunks[i].heading,
            "source": self.chunks[i].source, "kind": self.chunks[i].kind, "text": self.chunks[i].text,
            "score": round(float(rrf[i] / top), 3), "bm25": round(float(bm[i]), 3), "cosine": round(float(cs[i]), 3),
            "dense": None if dn is None else round(float(dn[i]), 3),
        } for i in order]

    def answer(self, question: str, context_hits: list[dict] | None = None, k: int = 4) -> dict:
        hits = context_hits if context_hits is not None else self.search(question, k=k)
        qtok = set(_tok(question)) - {"the", "a", "is", "what", "how", "why", "do", "i", "should", "this", "it", "to", "of"}
        scored = []
        for h in hits:
            head_bonus = 1.5 * len(qtok & set(_tok(h["heading"])))
            for pos, sent in enumerate(re.split(r"(?<=[.!?])\s+", h["text"])):
                overlap = len(qtok & set(_tok(sent)))
                if overlap or head_bonus:
                    scored.append((overlap + head_bonus + h["score"] - 0.05 * pos, sent.strip(), h["id"]))
        scored.sort(key=lambda x: -x[0])
        best = scored[0][0] if scored else 0
        picked, used = [], set()
        for sc, sent, cid in scored:
            if sc < best * 0.5:  # drop weakly related sentences rather than pad the answer
                break
            if sent in used:
                continue
            used.add(sent)
            picked.append({"text": sent, "cite": cid})
            if len(picked) >= 4:
                break
        if not picked and hits:
            first = re.split(r"(?<=[.!?])\s+", hits[0]["text"])[0]
            picked = [{"text": first, "cite": hits[0]["id"]}]
        return {"answer": " ".join(f"{p['text']} [{p['cite']}]" for p in picked) or
                          "The casebook has nothing on that yet.",
                "sentences": picked, "citations": hits}


@functools.cache
def casebook() -> Casebook:
    return Casebook()

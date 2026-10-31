"""Optional LLM narration. MIRAGE never lets an LLM decide risk; it may only rephrase testimony that already cites
evidence. Configure ANTHROPIC_API_KEY (Claude) or OLLAMA_URL (local Llama); otherwise templates are used."""
from __future__ import annotations

import re

import httpx

from ..config import settings

SYSTEM = (
    "You are an agent in MIRAGE's forensic Tribunal. Rewrite the draft testimony in at most two plain sentences for a "
    "non-expert. Use only facts in the draft. Keep every evidence tag like [E3] exactly as written. Do not add numbers, "
    "names or claims that are not in the draft. Do not change the verdict."
)


def available() -> str | None:
    if settings.anthropic_api_key:
        return "anthropic"
    if settings.ollama_url:
        return "ollama"
    return None


def _guard(draft: str, out: str) -> str:
    """Reject rewrites that drop or invent evidence tags or introduce new numbers."""
    tags_in = set(re.findall(r"\[E\d+\]", draft))
    tags_out = set(re.findall(r"\[E\d+\]", out))
    nums_in = set(re.findall(r"\d+(?:\.\d+)?", draft))
    nums_out = set(re.findall(r"\d+(?:\.\d+)?", out)) - {n.strip("E") for n in tags_out}
    if tags_out != tags_in or not nums_out <= nums_in or len(out) > 600:
        return draft
    return out.strip()


def narrate(agent: str, draft: str) -> str:
    provider = available()
    if not provider:
        return draft
    try:
        if provider == "anthropic":
            r = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01"},
                json={"model": settings.anthropic_model, "max_tokens": 220, "system": SYSTEM,
                      "messages": [{"role": "user", "content": f"Agent: {agent}\nDraft: {draft}"}]},
                timeout=20,
            )
            r.raise_for_status()
            text = "".join(b.get("text", "") for b in r.json().get("content", []))
        else:
            r = httpx.post(f"{settings.ollama_url.rstrip('/')}/api/generate", json={
                "model": settings.ollama_model, "system": SYSTEM, "stream": False,
                "prompt": f"Agent: {agent}\nDraft: {draft}"}, timeout=30)
            r.raise_for_status()
            text = r.json().get("response", "")
        return _guard(draft, text) if text else draft
    except Exception:
        return draft

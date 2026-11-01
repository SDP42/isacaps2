"""Train the assistant's intent router locally and measure it on held-out twisted questions.

    python scripts/train_assistant.py          # writes models_store/assistant_router.joblib and assistant_eval.json

The held-out set (app/assistant/eval_set.py) is never used for training. Accuracy is reported with and without the
local LLM tie-break, so the router's own number is honest.
"""
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.assistant import router  # noqa: E402
from app.assistant.catalog import INTENTS, SUBJECT  # noqa: E402
from app.assistant.eval_set import HELD_OUT  # noqa: E402
from app.config import settings  # noqa: E402

b = router.train()
router.model.cache_clear()
print(f"trained on {b['n']} phrasings, {b['intents']} intents in {b['seconds']} s "
      f"({'MiniLM + characters' if b['emb'] is not None else 'characters only'})")


def run(llm: bool) -> dict:
    os.environ["MIRAGE_ASSISTANT_LLM"] = os.getenv("EVAL_LLM", "phi3:mini") if llm else "off"
    ok, misses, t0 = 0, [], time.time()
    for q, want in HELD_OUT:
        r = router.route(q, has_subject=INTENTS[want].get("kind") == SUBJECT)
        if r["intent"] == want:
            ok += 1
        else:
            misses.append({"q": q, "want": want, "got": r["intent"], "p": r["confidence"], "method": r["method"]})
    return {"accuracy": round(ok / len(HELD_OUT), 3), "n": len(HELD_OUT), "misses": misses,
            "ms_per_question": round(1000 * (time.time() - t0) / len(HELD_OUT), 1)}


res = {"router": run(False)}
print(f"held-out accuracy, router alone: {res['router']['accuracy']:.1%} ({res['router']['ms_per_question']} ms/q)")
if "--llm" in sys.argv:
    res["router+llm"] = run(True)
    print(f"held-out accuracy, with local LLM tie-break: {res['router+llm']['accuracy']:.1%}")
for m in res["router"]["misses"]:
    print(f"  miss: {m['q']!r} want {m['want']} got {m['got']} ({m['p']})")
res.update({"trained_on": b["n"], "intents": b["intents"], "features": "MiniLM + char/word n-grams" if b["emb"] is not None else "char/word n-grams",
            "by_intent": dict(Counter(w for _, w in HELD_OUT))})
(settings.models_dir / "assistant_eval.json").write_text(json.dumps(res, indent=1))

"""Measure the optional Claude judge on the text benchmark, alone and inside the Words witness.

    ANTHROPIC_API_KEY=... python scripts/measure_claude_judge.py <data_dir> [--limit 120]

Runs every <data_dir>/text/*.jsonl set (the layout scripts/fetch_benchmark.py writes) twice: once with the judge
(the key set) and once without it, through the same words.analyse() the app uses, and records
"claude_judge" (the judge's scam_probability on its own) and "words_witness+judge" next to the existing rows in
models_store/benchmark.json. Nothing is trained; one API call per message.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import settings  # noqa: E402
from app.witnesses import words  # noqa: E402
from scripts.benchmark_models import metrics  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("data", type=Path)
    ap.add_argument("--limit", type=int, default=120, help="messages per set (cost control)")
    a = ap.parse_args()
    if not settings.anthropic_api_key:
        sys.exit("Set ANTHROPIC_API_KEY first: without it the judge is skipped and there is nothing to measure.")
    key = settings.anthropic_api_key
    results: dict[str, dict] = {"claude_judge": {}, "words_witness+judge": {}}
    t0 = time.time()
    for f in sorted((a.data / "text").glob("*.jsonl")):
        rows = [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()][: a.limit]
        y, judge, fused, missing = [], [], [], 0
        for r in rows:
            settings.anthropic_api_key = key
            w = words.analyse(r["text"])
            if w.status != "ok":
                continue
            j = w.details.get("llm_judge")
            if not j:
                missing += 1
            y.append(int(r["label"] == "fake"))
            judge.append(j["scam_probability"] if j else np.nan)
            fused.append(w.score)
        y_arr, j_arr = np.array(y), np.array(judge, dtype=float)
        ok = ~np.isnan(j_arr)
        if ok.sum() > 1:
            results["claude_judge"][f.stem] = {**metrics(y_arr[ok], j_arr[ok]), "model": settings.anthropic_model}
        results["words_witness+judge"][f.stem] = {**metrics(y_arr, np.array(fused)), "model": settings.anthropic_model}
        print(f"{f.stem:<16} judge AUC {results['claude_judge'].get(f.stem, {}).get('auc')} · witness+judge AUC "
              f"{results['words_witness+judge'][f.stem].get('auc')} · {missing} calls failed or refused", flush=True)
    out = Path(__file__).resolve().parent.parent / "models_store" / "benchmark.json"
    old = json.loads(out.read_text()) if out.exists() else {}
    for k, v in results.items():
        old.setdefault(k, {}).update(v)
    out.write_text(json.dumps(old, indent=1))
    print(f"{time.time() - t0:.0f}s · wrote {out}")


if __name__ == "__main__":
    main()

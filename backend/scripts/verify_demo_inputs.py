"""Run every file in demo_inputs/ through the running MIRAGE API and print / save the actual results.

    python scripts/verify_demo_inputs.py        # writes demo_inputs/RESULTS.md
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2] / "demo_inputs"
c = httpx.Client(base_url="http://localhost:8000", timeout=300)
H = {"authorization": "Bearer " + c.post("/v1/auth/login", json={"persona_id": "analyst"}).json()["token"]}
rows: list[tuple[str, str, str]] = []


def add(folder: str, name: str, result: str) -> None:
    rows.append((folder, name, result))
    print(f"{folder}/{name}: {result}")


def wait_case(cid: str) -> dict:
    for _ in range(600):
        d = c.get(f"/v1/cases/{cid}", headers=H).json()
        if d.get("status") in ("complete", "failed"):
            return d
        time.sleep(0.5)
    raise TimeoutError(cid)


def triage(p: Path) -> str:
    r = c.post("/v1/voice/triage", headers=H, files={"file": (p.name, p.read_bytes())}).json()
    s1, s3 = r["stage1"], r["stage3"]
    sem = r["stage2"]["semantics"] or {}
    return (f"{s1['label']} ({(s1['score'] or 0):.2f}{', noisy' if s1.get('noisy') else ''}) · asks {sem.get('action', 'none')} · "
            f"{s3['severity']} {s3['kind'].replace('_', ' ')}")


for p in sorted((ROOT / "01_voice_check").glob("*.*")):
    add("01_voice_check", p.name, triage(p))
for p in sorted((ROOT / "07_live_call_shield").glob("*.*")):
    add("07_live_call_shield", p.name, triage(p))
for folder in ("02_image_check", "03_video_check"):
    for p in sorted((ROOT / folder).glob("*.*")):
        r = c.post("/v1/quick/media", headers=H, files={"file": (p.name, p.read_bytes())}).json()
        add(folder, p.name, f"{r['label']} ({r['score']:.2f})")
for p in sorted((ROOT / "04_messages").glob("*.txt")):
    r = c.post("/v1/quick/text", headers=H, json={"text": p.read_text(encoding="utf-8")}).json()
    add("04_messages", p.name, f"{r['severity']} · {r['semantics']['category_label']} · tactics {', '.join(r['semantics']['tactics']) or 'none'}")


def case(files: list[Path], message: str = "", meta: dict | None = None) -> dict:
    meta = meta or {}
    data = {"message": message, "claimed_sender": meta.get("claimed_sender", ""), "channel": meta.get("channel", "unknown"),
            "sender_contact": meta.get("sender_contact", "")}
    cid = c.post("/v1/cases", headers=H, data=data, files=[("files", (f.name, f.read_bytes())) for f in files]).json()["id"]
    return wait_case(cid)


for p in sorted((ROOT / "04_messages").glob("*.png")):
    d = case([p], meta={"channel": "whatsapp", "claimed_sender": "Rajesh Mehta (CFO)"})
    add("04_messages", p.name, f"case {d['id']} → {d['verdict']['band']} {round(d['verdict']['risk'])}")
for p in sorted((ROOT / "05_emails").glob("*.eml")):
    d = case([p], meta={"channel": "email"})
    add("05_emails", p.name, f"case {d['id']} → {d['verdict']['band']} {round(d['verdict']['risk'])}")
for cd in sorted((ROOT / "06_full_investigations").iterdir()):
    meta = json.loads((cd / "case.json").read_text(encoding="utf-8"))
    msg = (cd / "message.txt").read_text(encoding="utf-8") if (cd / "message.txt").exists() else ""
    files = [f for f in cd.iterdir() if f.name not in ("case.json", "message.txt")]
    d = case(files, msg, meta)
    add("06_full_investigations", cd.name, f"case {d['id']} → {d['verdict']['band']} {round(d['verdict']['risk'])} (expected {meta['expected']})")

out = ["# Measured results", "", "Produced by `backend/scripts/verify_demo_inputs.py` against the running API "
       f"({time.strftime('%d %b %Y')}).", "", "| Folder | Input | MIRAGE result |", "|---|---|---|"]
out += [f"| {f} | `{n}` | {r} |" for f, n, r in rows]
(ROOT / "RESULTS.md").write_text("\n".join(out) + "\n", encoding="utf-8")
print("wrote", ROOT / "RESULTS.md")

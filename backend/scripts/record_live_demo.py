"""Record the Live Call Shield demo replay: frontend/src/pages/app/liveDemo.ts.

Voice scores come from the running API (/v1/live/chunk on each 3 s window of the sample). The transcript is the script
the sample was generated from, because Whisper garbles 3 s Hinglish slices; the words witness then reads the transcript
so far, window by window, exactly as live mode does.

    python scripts/record_live_demo.py            (API on 127.0.0.1:8000)
"""
import io
import json
import sys
import wave
from pathlib import Path

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.samples import SAMPLES_DIR, SPOKEN  # noqa: E402
from app.witnesses import dsp, words  # noqa: E402

API = "http://127.0.0.1:8000"
OUT = Path(__file__).resolve().parents[2] / "frontend/src/pages/app/liveDemo.ts"
CALLS = {"cfo_voice_note.wav": "cfo", "papa_voice_note.wav": "papa", "it_helpdesk.wav": "it", "townhall_avatar.wav": "townhall"}
DIGITS = {"forty eight lakh fifty thousand": "48,50,000", "seventy five thousand": "₹75,000", "ten minute": "10 minute"}


def spoof_windows(f: str, headers: dict) -> tuple[float, list]:
    x = dsp.load_audio(SAMPLES_DIR / f)
    n, out = dsp.SR * 3, []
    for i in range(0, len(x), n):
        b = io.BytesIO()
        with wave.open(b, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(dsp.SR)
            w.writeframes((np.clip(x[i:i + n], -1, 1) * 32767).astype(np.int16).tobytes())
        r = requests.post(f"{API}/v1/live/chunk", headers=headers, files={"file": ("c.wav", b.getvalue(), "audio/wav")}).json()
        out.append(r.get("spoof"))
    return round(len(x) / dsp.SR, 2), out


def main() -> None:
    pid = requests.get(f"{API}/v1/auth/personas").json()[0]["id"]
    headers = {"Authorization": f"Bearer {requests.post(f'{API}/v1/auth/login', json={'persona_id': pid}).json()['token']}"}
    calls = {}
    for f, key in CALLS.items():
        seconds, spoofs = spoof_windows(f, headers)
        text = SPOKEN[key][0]
        for a, b in DIGITS.items():
            text = text.replace(a, b)  # a transcript writes digits
        toks, n = text.split(), len(spoofs)
        cuts = [round(len(toks) * (i + 1) / n) for i in range(n)]  # words spread evenly over the speech
        rows, prev, rolling = [], 0, ""
        for i, s in enumerate(spoofs):
            part = " ".join(toks[prev:cuts[i]])
            prev = cuts[i]
            rolling = f"{rolling} {part}".strip()
            r = words.analyse(rolling, live=True)
            ok = r.status == "ok"
            rows.append({"spoof": s, "text": part, "tactics": r.details["tactics"] if ok else [],
                         "action": r.details["requested_action"] if ok else "none",
                         "manipulation": round(r.score, 3) if ok else 0.0,
                         "amount": r.details.get("amount_inr") if ok else None,
                         "spans": [{"kind": e.kind, "text": e.text} for e in r.evidence if e.text]})
        calls[f] = {"seconds": seconds, "windows": rows}
        print(f, [(w["action"], w["manipulation"]) for w in rows])
    head = OUT.read_text(encoding="utf-8").split("export const DEMO_CALLS")[0]
    OUT.write_text(head + "export const DEMO_CALLS: Record<string, DemoCall> = "
                   + json.dumps(calls, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()

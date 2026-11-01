"""End-to-end answer-quality test for the copilot, against the running API.

    python scripts/check_assistant.py            # API on localhost:8000

Each conversation is a list of (question, expected intents, checks). It reports wrong intents, empty or failed answers,
answers missing an expected block type or phrase, and slow turns. Questions here are new phrasings, not copies of
catalog.py or eval_set.py.
"""
import json
import sys
import time
import urllib.request
import uuid
from pathlib import Path

BASE = "http://127.0.0.1:8000"  # "localhost" costs ~1.4 s per request on Windows (IPv6 first)
ROOT = Path(__file__).resolve().parents[2]


def call(fields, file=None, token=""):
    b = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    if file:
        body += (f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{file.name}\"\r\n"
                 "Content-Type: application/octet-stream\r\n\r\n").encode() + file.read_bytes() + b"\r\n"
    body += f"--{b}--\r\n".encode()
    req = urllib.request.Request(f"{BASE}/v1/assistant/chat", body, {"content-type": f"multipart/form-data; boundary={b}",
                                                                      "authorization": f"Bearer {token}"})
    return json.load(urllib.request.urlopen(req, timeout=300))


# (input, accepted intents, required block types, required phrases in the answer text)
CONVERSATIONS = {
    "voice clone, cross-examined": [
        ("@demo_inputs/01_voice_check/01_ai_cfo_wire_whatsapp.ogg", {"analyse_voice"}, {"verdict", "timeline", "jury"}, ["CRITICAL"]),
        ("ok and what exactly is fake about it", {"why", "where"}, set(), []),
        ("at which second does it start sounding robotic", {"where"}, {"timeline"}, []),
        ("are both detectors on the same page", {"models"}, {"jury"}, []),
        ("write down what he says", {"transcript"}, {"quote"}, []),
        ("would a genuine recording of the CFO with the same words be safe?", {"what_if"}, {"matrix"}, ["HIGH"]),
        ("how did you arrive at 0.97", {"score_math", "why"}, set(), []),
        ("give me a one-liner for my manager", {"summary"}, {"verdict"}, []),
        ("what do I say if he calls again", {"what_now", "verify_callback"}, set(), []),
        ("whom do I report this to", {"report"}, {"contacts"}, []),
    ],
    "human voice": [
        ("@demo_inputs/01_voice_check/04_human_voice_audiobook_librispeech.wav", {"analyse_voice"}, {"verdict"}, ["LOW"]),
        ("so it's a real person?", {"summary", "why", "confidence"}, set(), []),
        ("could you be wrong here", {"confidence"}, {"facts"}, []),
    ],
    "noisy voice": [
        ("@demo_inputs/01_voice_check/05_ai_otp_helpdesk_noisy_street.wav", {"analyse_voice"}, {"verdict"}, []),
        ("does the traffic noise affect your call", {"noise", "confidence", "why"}, set(), []),
    ],
    "image and video": [
        ("@demo_inputs/02_image_check/04_real_photo_astronaut_nasa.jpg", {"analyse_media"}, {"verdict", "jury"}, ["authentic"]),
        ("which detector looked at it", {"models"}, {"table"}, []),
        ("@demo_inputs/03_video_check/03_ai_meeting_lipsync_drift.mp4", {"analyse_media"}, {"verdict"}, []),
        ("why do you think the video is fake", {"why"}, set(), []),
    ],
    "messages and email": [
        ("can u check: 'Congratulations! You have won Rs 25 lakh in KBC lottery. Pay Rs 15,000 GST to claim. WhatsApp 98xxxxxx12'", {"analyse_text"}, {"verdict"}, ["HIGH"]),
        ("which lines are suspicious", {"where", "tactics"}, {"quote"}, []),
        ("explain this scam type", {"scam_types", "why", "tactics"}, set(), []),
        ("@demo_inputs/04_messages/05_benign_meeting_reminder.txt", {"analyse_text"}, {"verdict"}, ["LOW"]),
        ("so nothing to worry about?", {"summary", "why", "what_now"}, set(), []),
        ("@demo_inputs/05_emails/01_vendor_bank_change_bec.eml", {"analyse_text"}, {"verdict"}, ["HIGH"]),
        ("vendor says the bank changed, how do I confirm", {"verify_callback", "what_now"}, {"steps"}, []),
    ],
    "cases and scenarios": [
        ("run the papa emergency scenario", {"run_scenario"}, {"verdict"}, ["Scenario F"]),
        ("why did it get that score", {"why", "score_math"}, set(), []),
        ("suppose the voice was genuine", {"what_if"}, {"bars"}, []),
        ("pull up the latest high risk incident", {"open_case"}, {"verdict"}, []),
        ("how many incidents do we have overall", {"stats"}, {"facts"}, []),
        ("show me MRG-0412", {"open_case"}, {"verdict"}, ["MRG-0412"]),
    ],
    "judge questions, cold": [
        ("in one breath, what is this", {"about"}, {"flow"}, []),
        ("explain the system design end to end", {"how_overall"}, {"flow"}, []),
        ("how do you spot an AI generated voice", {"voice_how"}, {"bars"}, []),
        ("can you detect AI photos from midjourney or dall-e", {"image_how"}, {"bars"}, []),
        ("what about deepfake zoom calls", {"face_how"}, set(), []),
        ("how does the risk number get computed", {"risk_engine"}, {"formula"}, []),
        ("what do the agents in the tribunal do", {"tribunal"}, set(), []),
        ("after you detect a scam what happens next", {"cure"}, {"flow"}, []),
        ("isn't building deepfakes yourself unethical", {"redteam_how"}, set(), []),
        ("how did your own attacks do", {"redteam_results"}, {"heatmap"}, []),
        ("is there a browser plugin", {"extension"}, set(), []),
        ("can it protect a live phone call", {"live_shield"}, set(), []),
        ("give me the accuracy numbers", {"accuracy"}, {"bars"}, []),
        ("what are its blind spots", {"limitations"}, {"list"}, []),
        ("which neural nets are inside", {"model_list"}, {"table"}, []),
        ("tell me about syncnet", {"model_list", "face_how"}, set(), ["SyncNet"]),
        ("did you guys train anything", {"no_training"}, set(), []),
        ("is anything uploaded to a server", {"privacy"}, set(), []),
        ("what tech is it built on", {"stack"}, {"table"}, []),
        ("what is a digital arrest scam", {"scam_types"}, set(), ["Digital arrest"]),
        ("my dad just transferred 2 lakh to a fraudster", {"scammed_help"}, {"callout"}, ["1930"]),
        ("why is this better than other tools", {"compare_tools"}, {"table"}, []),
        ("how do you answer my questions", {"assistant_how"}, set(), []),
        ("what's the capital of france", {"out_of_scope"}, set(), []),
        ("what can you do for me", {"help"}, set(), []),
        ("how do i enrol a voiceprint", {"trustbook"}, set(), []),
        ("does a recorded video fool the liveness check", {"liveness"}, set(), []),
        ("open the trustbook", {"navigate"}, set(), []),
    ],
}


def text_of(r):
    out = []
    for b in r["blocks"]:
        for k in ("text", "title", "subtitle", "severity", "label"):
            if isinstance(b.get(k), str):
                out.append(b[k])
        for it in b.get("items", []) if isinstance(b.get("items"), list) else []:
            if isinstance(it, dict):
                out += [str(v) for v in it.values() if isinstance(v, str)]
            elif isinstance(it, str):
                out.append(it)
        if b["type"] == "table":
            out += [str(c) for row in b["rows"] for c in row]
    return " ".join(out)


def main():
    tok = json.load(urllib.request.urlopen(urllib.request.Request(f"{BASE}/v1/auth/login", json.dumps({"persona_id": "analyst"}).encode(),
                                                                  {"content-type": "application/json"})))["token"]
    issues, n, ok, times, server_ms = [], 0, 0, [], []
    for name, turns in CONVERSATIONS.items():
        sid = ""
        for q, intents, blocks, phrases in turns:
            n += 1
            t0 = time.time()
            if q.startswith("@"):
                r = call({"session_id": sid}, ROOT / q[1:], tok)
            else:
                r = call({"message": q, "session_id": sid}, None, tok)
            dt = time.time() - t0
            times.append((dt, q))
            server_ms.append(r["ms"])
            sid = r["session_id"]
            types = {b["type"] for b in r["blocks"]}
            txt = text_of(r)
            probs = []
            if r["intent"] not in intents:
                probs.append(f"intent {r['intent']} ({r['confidence']}, {r['method']}), want {sorted(intents)}")
            if not r["blocks"]:
                probs.append("empty answer")
            if any(b["type"] == "callout" and "wrong" in b.get("title", "").lower() for b in r["blocks"]) or "couldn't run" in txt.lower():
                probs.append("error: " + txt[:160])
            if missing := blocks - types:
                probs.append(f"missing blocks {sorted(missing)}")
            for ph in phrases:
                if ph.lower() not in txt.lower():
                    probs.append(f"missing phrase {ph!r}")
            if probs:
                issues.append((name, q, probs, txt[:220]))
            else:
                ok += 1
    print(f"\n{ok}/{n} turns fully correct")
    for name, q, probs, txt in issues:
        print(f"- [{name}] {q[:80]!r}\n    " + "\n    ".join(probs) + f"\n    answer: {txt}")
    slow = sorted(times, reverse=True)[:5]
    print("\nslowest:", ", ".join(f"{t:.1f}s {q[:40]!r}" for t, q in slow))
    text_turns = [t for t, q in times if not q.startswith("@") and "scenario" not in q]
    print(f"median text turn: {sorted(text_turns)[len(text_turns) // 2] * 1000:.0f} ms wall, "
          f"{sorted(server_ms)[len(server_ms) // 2]} ms on the server (all turns)")
    return 0 if not issues else 1


if __name__ == "__main__":
    sys.exit(main())

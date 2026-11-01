/**
 * The three cases the technical demonstration follows. Every number is copied from a real MIRAGE run on
 * 1 November 2026 (cases MRG-0518, MRG-0519 and MRG-0522, from demo_inputs/06_full_investigations), not invented.
 */
export type CaseKey = "cfo" | "police" | "townhall";
export type Stage = "input" | "custody" | "dissect" | "voice" | "face" | "provenance" | "words" | "identity" | "risk" | "tribunal" | "cure";

export const STAGES: { id: Stage; label: string; group: string; file: string }[] = [
  { id: "input", label: "Input", group: "Intake", file: "routers/cases.py · POST /v1/cases" },
  { id: "custody", label: "Custody", group: "Intake", file: "storage.py · audit.py" },
  { id: "dissect", label: "Dissection", group: "Dissect", file: "witnesses/transcribe.py · dsp.py" },
  { id: "voice", label: "Voice", group: "Witnesses", file: "witnesses/voice.py · pretrained.py" },
  { id: "face", label: "Face", group: "Witnesses", file: "witnesses/face.py · syncnet.py" },
  { id: "provenance", label: "Provenance", group: "Witnesses", file: "witnesses/provenance.py" },
  { id: "words", label: "Words", group: "Witnesses", file: "witnesses/words.py" },
  { id: "identity", label: "Identity", group: "Witnesses", file: "witnesses/identity.py" },
  { id: "risk", label: "Risk engine", group: "Decide", file: "fusion/risk.py" },
  { id: "tribunal", label: "Tribunal", group: "Explain", file: "agents/tribunal.py" },
  { id: "cure", label: "Cure", group: "Respond", file: "fusion/response.py · cure.py" },
];

export interface DemoCase {
  key: CaseKey;
  id: string;
  label: string;
  short: string;
  story: string;
  file: { name: string; kind: "audio" | "video"; mime: string; bytes: number; sha: string /* first 16 hex of the real SHA-256 */; magic: string; magicText: string; duration: number };
  sender: string; channel: string; contact: string;
  message: string;
  transcript: string;
  language: string;
  windows: number[];             // per-window synthetic score shown on the strip
  voice: { score: number; conf: number; snr: number; speech: number; codec: string; bandwidth: number; models: [string, number, number, number][] };
  face?: { score: number; frames: number; faces: number; gend: [string, number][]; frame: [string, number][]; sync: number; motion: number };
  words: { score: number; action: string; amount?: string; deadline?: string; tactics: string[]; ids: string[]; marks: [string, string][] };
  identity: { score: number; resolved?: string; directory?: string; limit?: string; flags: [string, string, "bad" | "ok" | "info"][] };
  dims: { A: number; M: number; C: number; S: number };
  risk: number; band: "HIGH" | "MEDIUM" | "LOW"; rule: string; severity: string; category: string;
  shap: [string, number][];
  tribunal: [string, string][];
  plan: string[];
}

export const CASES: Record<CaseKey, DemoCase> = {
  cfo: {
    key: "cfo", id: "MRG-0518", label: "Cloned CFO voice note", short: "CFO voice note",
    story: "A WhatsApp voice note in the CFO's voice asks Accounts Payable to wire ₹48.5 lakh to a new vendor before 4 PM.",
    file: { name: "cfo_voice_note.ogg", kind: "audio", mime: "audio/ogg", bytes: 45575, sha: "76804f5c9ce590d9",
            magic: "4F 67 67 53 00 02 00 00", magicText: "OggS", duration: 17.62 },
    sender: "Rajesh Mehta (CFO)", channel: "WhatsApp", contact: "+91 70451 88213",
    message: "Rajesh: urgent, process 48.5 lakh to new vendor account 918273645501 IFSC HDFC0001234 before 4 PM. Keep this between us.",
    transcript: "Hi, it's Rajesh from the CFO office. I'm in a board meeting and can't take calls. Please wire 48 lakh rupees to the new vendor account before 4 pm it's urgent and confidential. Don't loop in audit.",
    language: "en",
    windows: [0.99, 0.98, 0.97, 0.99, 0.96, 0.98, 0.97, 0.95],
    voice: { score: 0.971, conf: 0.73, snr: 87.3, speech: 0.962, codec: "compressed voice note (Opus, WhatsApp-like)", bandwidth: 7400,
             models: [["DF_Arena 500M", 0.993, 0.5, 0.5], ["NII Wav2Vec2-Large", 0.735, 0.5, 0.2], ["NII MMS-300M", 0.835, 0.3, 0.65]] },
    words: { score: 1.0, action: "payment", amount: "₹48,50,000", deadline: "before 4 PM", tactics: ["authority", "urgency", "secrecy", "bypass", "channel switch"],
             ids: ["account 918273645501", "IFSC HDFC0001234"],
             marks: [["CFO office", "authority"], ["board meeting", "authority"], ["can't take calls", "channel switch"], ["urgent", "urgency"],
                     ["confidential", "secrecy"], ["Don't loop in audit", "bypass"], ["Keep this between us", "secrecy"], ["before 4 PM", "urgency"]] },
    identity: { score: 0.952, resolved: "Rajesh Mehta · CFO", directory: "+91 98200 11002", limit: "₹1,00,00,000",
                flags: [["Incoming number", "+91 70451 88213 ≠ directory +91 98200 11002", "bad"], ["Beneficiary", "918273645501 flagged in an earlier fraud", "bad"],
                        ["Channel", "WhatsApp voice note: not his usual channel for payments", "bad"], ["Request anomaly", "0.49 against 12 months of requests", "info"],
                        ["Voiceprint", "0.61 to the enrolled print (simulator print, weak evidence)", "info"]] },
    dims: { A: 0.8, M: 1.0, C: 0.952, S: 1.0 },
    risk: 99.6, band: "HIGH", rule: "sensitive_action_unverified", severity: "CRITICAL", category: "Payment fraud · executive impersonation",
    shap: [["Words", 37.6], ["Identity", 34.8], ["Voice", 27.2]],
    tribunal: [
      ["Planner", "Received audio, text. Calling the voice and words witnesses in parallel; the Identity Officer checks the Trustbook."],
      ["Voice", "Synthetic-speech score 0.97. I observe synthetic-speech artefacts at 0.0–17.6 s [E1]."],
      ["Linguist", "Scam-language probability 1.00. Secrecy “Keep this between us” [E6]; bypass “Don't loop in audit” [E13]."],
      ["Identity", "Matched Rajesh Mehta (CFO); the number is not on record and the account is flagged [E28]."],
      ["Skeptic", "Innocent reading: speaker similarity 0.61 to the enrolled print. But the request itself breaks policy."],
      ["Judge", "HIGH 99.6. A payment to a flagged account with secrecy and a bypassed control. Next step: end the call, call back on +91 98200 11002."],
    ],
    plan: ["Freeze the payment; a second approver confirms through the vendor master", "Call Rajesh on the Trustbook number, not the one that reached you",
           "Block account 918273645501 and warn finance", "Report: SOC ticket, CERT-In within 6 hours, cybercrime.gov.in"],
  },
  police: {
    key: "police", id: "MRG-0519", label: "AI 'CBI officer' video call", short: "Digital arrest video",
    story: "A video call from an 'Inspector, CBI Cyber Cell' says a parcel in your name held illegal items and demands ₹2.4 lakh within 30 minutes.",
    file: { name: "video_call.mp4", kind: "video", mime: "video/mp4", bytes: 378965, sha: "c82097dc6a47d230",
            magic: "00 00 00 20 66 74 79 70", magicText: "....ftyp", duration: 23.1 },
    sender: "CBI Cyber Cell", channel: "Video call", contact: "+91 88001 23456",
    message: "This is Inspector R. Sharma, CBI Cyber Cell. A parcel booked on your Aadhaar contains illegal items. An arrest warrant is issued. Stay on video call and do not disconnect. Transfer Rs 2,40,000 to the RBI verification account safeacct.rbi@oksbi within 30 minutes to avoid arrest. Do not tell anyone.",
    transcript: "This is Inspector Sharma from the CBI cyber cell. A parcel in your name has illegal items and an arrest warrant is issued. Stay on the video call, do not disconnect…",
    language: "en",
    windows: [0.99, 0.99, 0.98, 0.97, 0.99, 0.98, 0.99, 0.97, 0.98, 0.99, 0.96],
    voice: { score: 0.981, conf: 0.91, snr: 87.7, speech: 0.926, codec: "wideband / studio", bandwidth: 8000,
             models: [["DF_Arena 500M", 0.996, 0.5, 0.5], ["NII Wav2Vec2-Large", 0.752, 0.5, 0.2], ["NII MMS-300M", 0.738, 0.3, 0.65]] },
    face: { score: 0.81, frames: 33, faces: 33, gend: [["GenD CLIP ViT-L/14", 0.242], ["GenD Perception-Encoder L", 0.092]],
            frame: [["Community Forensics ViT-S/384", 1.0], ["SwinV2 AI-image detector", 0.999]], sync: 0.13, motion: 0.011 },
    words: { score: 1.0, action: "payment", amount: "₹2,40,000", deadline: "within 30 minutes", tactics: ["authority", "fear", "secrecy", "urgency", "channel switch"],
             ids: ["UPI safeacct.rbi@oksbi"],
             marks: [["Inspector R. Sharma, CBI Cyber Cell", "authority"], ["arrest warrant", "fear"], ["illegal items", "fear"], ["do not disconnect", "secrecy"],
                     ["Stay on video call", "channel switch"], ["within 30 minutes", "urgency"], ["Do not tell anyone", "secrecy"]] },
    identity: { score: 0.78, flags: [["Sender", "Not in the Trustbook", "bad"], ["Beneficiary", "safeacct.rbi@oksbi flagged in an earlier fraud", "bad"],
                                     ["Policy", "No Indian agency collects money or 'arrests' over video", "bad"]] },
    dims: { A: 0.98, M: 1.0, C: 0.779, S: 1.0 },
    risk: 99.6, band: "HIGH", rule: "sensitive_action_unverified", severity: "CRITICAL", category: "Digital arrest · fake police or agency",
    shap: [["Words", 37.4], ["Identity", 26.1], ["Voice", 24.0], ["Face", 12.1]],
    tribunal: [
      ["Planner", "Received text, video. Calling the face, voice and words witnesses in parallel."],
      ["Voice", "Synthetic-speech score 0.98. Artefacts across 0.0–23.1 s [E1]."],
      ["Face", "Video score 0.81: every frame looks AI-generated [E3]; the mouth never moves with the speech, a still picture over audio [E2]."],
      ["Linguist", "Five tactics: authority, fear, secrecy “do not disconnect” at 12.9 s [E10], urgency, channel switch."],
      ["Identity", "Sender not in the Trustbook; the UPI ID is flagged [E28]."],
      ["Judge", "HIGH 99.6, digital arrest. End the call, verify at the nearest police station, report the number on Sanchar Saathi."],
    ],
    plan: ["End the call: no agency arrests or collects deposits over video", "Do not transfer anything to 'verify' your account",
           "Report the number on Sanchar Saathi · Chakshu", "If money moved: call 1930 within the golden hour"],
  },
  townhall: {
    key: "townhall", id: "MRG-0522", label: "AI townhall announcement", short: "Harmless AI voice",
    story: "Internal Comms sends a townhall reminder read by an AI presenter. Synthetic, but it asks for nothing.",
    file: { name: "townhall.mp3", kind: "audio", mime: "audio/mpeg", bytes: 97100, sha: "e6d8bbfd37a6f671",
            magic: "49 44 33 04 00 00 00 00", magicText: "ID3", duration: 12.0 },
    sender: "Internal Comms", channel: "Email", contact: "comms@acmefintech.in",
    message: "Reminder: the quarterly townhall moves to Friday 4 PM. This announcement uses our AI presenter.",
    transcript: "Good morning team. The quarterly town hall moves to Friday at 4pm in the main auditorium. Snacks will be served. See you there.",
    language: "en",
    windows: [0.99, 0.99, 0.98, 0.99, 0.99],
    voice: { score: 0.989, conf: 0.68, snr: 82.2, speech: 0.892, codec: "compressed voice note (Opus, WhatsApp-like)", bandwidth: 7400,
             models: [["DF_Arena 500M", 0.999, 0.5, 0.5], ["NII Wav2Vec2-Large", 0.263, 0.5, 0.2], ["NII MMS-300M", 0.945, 0.3, 0.65]] },
    words: { score: 0.002, action: "none", tactics: [], ids: [], marks: [] },
    identity: { score: 0.51, flags: [["Sender", "Not in the Trustbook", "info"], ["History", "Seen in other cases", "info"]] },
    dims: { A: 0.785, M: 0.002, C: 0.166, S: 0.1 },
    risk: 30, band: "LOW", rule: "synthetic_no_fraud_indicators", severity: "LOW", category: "Synthetic media, harmless request",
    shap: [["Identity", 20.6], ["Voice", 9.3], ["Words", 0.0]],
    tribunal: [
      ["Voice", "Synthetic-speech score 0.99. The voice is machine-generated [E1]."],
      ["Linguist", "Scam-language probability 0.06. I found nothing incriminating."],
      ["Skeptic", "The audio passed through a compressed voice-note codec; the message itself declares an AI presenter."],
      ["Judge", "LOW 30. Synthetic, but it asks for nothing and applies no pressure. No action needed."],
    ],
    plan: ["Nothing to do: it asks for nothing", "Stay alert if a follow-up asks for money or codes"],
  },
};

export const RULES: { id: string; when: string; sets: string }[] = [
  { id: "insufficient_evidence", when: "No usable media, text or context", sets: "INCONCLUSIVE" },
  { id: "credential_request", when: "Asks for an OTP, password or remote access", sets: "HIGH ≥ 85" },
  { id: "sensitive_action_unverified", when: "S = 1 and an identity flag, secrecy or a bypass", sets: "HIGH ≥ 78" },
  { id: "synthetic_media_with_sensitive_ask", when: "A ≥ 0.8 and S ≥ 0.6", sets: "HIGH ≥ 80" },
  { id: "synthetic_media_with_pressure", when: "A ≥ 0.8, ≥ 2 tactics, M ≥ 0.7", sets: "HIGH ≥ 75" },
  { id: "synthetic_speech_unread", when: "AI voice, words could not be read", sets: "MEDIUM" },
  { id: "synthetic_no_fraud_indicators", when: "A ≥ 0.6, nothing asked, words read", sets: "LOW ≤ 30" },
];

export const TACTIC_COLOR: Record<string, string> = {
  authority: "#a78bfa", urgency: "#fbbf24", secrecy: "#fb7185", fear: "#f97316", reward: "#6ee7b7", "channel switch": "#67e8f9", bypass: "#f472b6",
};

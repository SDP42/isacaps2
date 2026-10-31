import { Mic, PhoneOff, Play, Radio, ShieldAlert, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getToken } from "@/lib/api";
import { micError } from "@/lib/recorder";
import { BAND_COLOR, cx } from "@/lib/format";
import { simulate, type Action } from "@/lib/risk";

const CHUNK_S = 3;
const SAMPLES = [
  { file: "cfo_voice_note.wav", label: "“CFO” asks for a wire", caller: "+91 70451 88213" },
  { file: "papa_voice_note.wav", label: "“Papa” emergency (Hinglish)", caller: "+91 73040 99812" },
  { file: "it_helpdesk.wav", label: "“IT helpdesk” wants the OTP", caller: "+91 88002 31109" },
  { file: "townhall_avatar.wav", label: "AI townhall announcement", caller: "Acme Events" },
];
const CHALLENGES = [
  "Ask for this week's verification phrase.",
  "Ask them to turn their head left and touch their ear on video.",
  "Ask something only they would know: where did you two last have lunch?",
  "Say you'll call back on their saved number, and hang up.",
  "Ask for the family code word.",
];
const TACTIC_COLOR: Record<string, string> = { urgency: "#fbbf24", authority: "#93c5fd", secrecy: "#a78bfa", fear: "#fb7185", channel_switch: "#67e8f9", bypass: "#f0abfc", reward: "#6ee7b7" };

interface Chunk { i: number; spoof: number | null; risk: number; text: string }
interface Rolling { tactics: string[]; action: string; manipulation: number; spans: { kind: string; text: string }[]; amount: number | null }

function encodeWav(x: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + x.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
  return new Blob([buf], { type: "audio/wav" });
}

function downsample(x: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return x;
  const r = from / to;
  const out = new Float32Array(Math.floor(x.length / r));
  for (let i = 0; i < out.length; i++) out[i] = x[Math.floor(i * r)];
  return out;
}

/** Live Call Shield: rolling deepfake and manipulation risk while a call is happening. */
export default function LiveShield() {
  const [running, setRunning] = useState<null | "mic" | string>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [rolling, setRolling] = useState<Rolling>({ tactics: [], action: "none", manipulation: 0, spans: [], amount: null });
  const [transcript, setTranscript] = useState("");
  const [level, setLevel] = useState<number[]>(Array(32).fill(0));
  const [alert, setAlert] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const textRef = useRef("");
  const idx = useRef(0);
  const langRef = useRef<string | null>(null);
  const caller = SAMPLES.find((s) => s.file === running)?.caller ?? "Unknown caller";

  const reset = () => {
    setChunks([]); setTranscript(""); textRef.current = ""; idx.current = 0; langRef.current = null; setAlert(null); setSecs(0);
    setRolling({ tactics: [], action: "none", manipulation: 0, spans: [], amount: null });
  };

  const send = async (pcm16k: Float32Array) => {
    const fd = new FormData();
    fd.append("file", encodeWav(pcm16k, 16000), "chunk.wav");
    fd.append("context", textRef.current);
    if (langRef.current) fd.append("lang", langRef.current);
    const i = idx.current++;
    try {
      const r = await fetch("/v1/live/chunk", { method: "POST", body: fd, headers: { authorization: `Bearer ${getToken() ?? ""}` } }).then((x) => x.json());
      if (r.text && r.lang && !langRef.current) langRef.current = r.lang;
      if (r.text) {
        textRef.current = `${textRef.current} ${r.text}`.trim();
        setTranscript(textRef.current);
      }
      setRolling({ tactics: r.tactics ?? [], action: r.action ?? "none", manipulation: r.manipulation ?? 0, spans: r.spans ?? [], amount: r.amount ?? null });
      const action = (["payment", "credential", "data", "info"].includes(r.action) ? r.action : "none") as Action;
      const risk = simulate(r.spoof ?? 0, r.manipulation ?? 0, 0.35, action, (r.tactics ?? []).some((t: string) => t === "secrecy" || t === "bypass")).risk;
      setChunks((c) => [...c, { i, spoof: r.spoof, risk, text: r.text }]);
      if ((r.action === "payment" || r.action === "credential") && risk >= 70) {
        setAlert((a) => a ?? CHALLENGES[Math.floor(Math.random() * (r.action === "credential" ? 4 : CHALLENGES.length))]);
      }
    } catch {
      /* drop a chunk rather than stall the call */
    }
  };

  const meter = (analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setLevel(Array.from({ length: 32 }, (_, k) => data[Math.floor((k / 32) * data.length * 0.6)] / 255));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  };

  const startMic = async () => {
    reset();
    // Chrome suspends an AudioContext created after an await, so create it now, in the click
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      let buf: number[] = [];
      proc.onaudioprocess = (e) => {
        buf.push(...e.inputBuffer.getChannelData(0));
        if (buf.length >= ctx.sampleRate * CHUNK_S) {
          send(downsample(Float32Array.from(buf), ctx.sampleRate));
          buf = [];
        }
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      const stopMeter = meter(analyser);
      const timer = setInterval(() => setSecs((s) => s + 1), 1000);
      stopRef.current = () => { stopMeter(); clearInterval(timer); proc.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close(); };
      setRunning("mic");
    } catch (e) {
      ctx.close().catch(() => {});
      toast.error(micError(e) + " You can also use “Play a suspicious call”.");
    }
  };

  const startSample = async (file: string) => {
    reset();
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    await ctx.resume();
    const ab = await fetch(`/v1/samples/${file}`).then((r) => r.arrayBuffer());
    const audio = await ctx.decodeAudioData(ab);
    const node = ctx.createBufferSource();
    node.buffer = audio;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    node.connect(analyser);
    analyser.connect(ctx.destination);
    const stopMeter = meter(analyser);
    const data = audio.getChannelData(0);
    const n = Math.floor(audio.sampleRate * CHUNK_S);
    let pos = 0;
    // emit each 3-second slice as it finishes playing, exactly like a live call
    const step = setInterval(() => {
      if (pos >= data.length) return;
      send(downsample(data.slice(pos, pos + n), audio.sampleRate));
      pos += n;
    }, CHUNK_S * 1000);
    const timer = setInterval(() => setSecs((s) => s + 1), 1000);
    node.onended = () => {
      if (pos < data.length) send(downsample(data.slice(pos), audio.sampleRate));
      setTimeout(() => stop(), 600);
    };
    node.start();
    stopRef.current = () => { stopMeter(); clearInterval(step); clearInterval(timer); try { node.stop(); } catch { /* already ended */ } ctx.close(); };
    setRunning(file);
  };

  const stop = () => {
    stopRef.current();
    stopRef.current = () => {};
    setRunning(null);
    setLevel(Array(32).fill(0));
  };
  useEffect(() => () => stopRef.current(), []);

  const current = chunks.length ? chunks[chunks.length - 1].risk : 0;
  const peak = chunks.reduce((m, c) => Math.max(m, c.risk), 0);
  const band = peak >= 70 ? "HIGH" : peak >= 35 ? "MEDIUM" : "LOW";
  const spoofAvg = chunks.filter((c) => c.spoof != null).reduce((s, c, _, a) => s + (c.spoof ?? 0) / a.length, 0);

  // highlight tactic spans inside the live transcript
  const parts: { s: string; k?: string }[] = [];
  {
    let rest = transcript;
    const spans = [...rolling.spans].filter((x) => x.text && TACTIC_COLOR[x.kind]);
    while (rest) {
      let best: { at: number; len: number; k: string } | null = null;
      for (const sp of spans) {
        const at = rest.toLowerCase().indexOf(sp.text.toLowerCase());
        if (at >= 0 && (!best || at < best.at)) best = { at, len: sp.text.length, k: sp.kind };
      }
      if (!best) { parts.push({ s: rest }); break; }
      if (best.at > 0) parts.push({ s: rest.slice(0, best.at) });
      parts.push({ s: rest.slice(best.at, best.at + best.len), k: best.k });
      rest = rest.slice(best.at + best.len);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-medium tracking-tight"><Radio size={20} className="text-cyan" />Live call shield</h1>
          <p className="text-[13.5px] text-muted">MIRAGE listens while the call happens: synthetic-voice score, live transcript and pressure tactics every {CHUNK_S} seconds.</p>
        </div>
        {running && <button onClick={stop} className="flex h-9 items-center gap-2 rounded-lg border border-crimson/40 px-3 text-[13px] text-crimson"><Square size={12} className="fill-current" />Stop</button>}
      </div>

      {!running && (
        <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
          <button onClick={startMic} className="panel flex items-center gap-4 p-5 text-left transition-colors hover:border-cyan/40">
            <span className="grid size-12 place-items-center rounded-full bg-cyan/15 text-cyan"><Mic size={20} /></span>
            <span><span className="block text-[15px] text-fg">Listen with the microphone</span><span className="text-[12.5px] text-muted">Play a call on a phone speaker, or speak yourself</span></span>
          </button>
          <div className="panel p-4">
            <p className="label mb-2">Or play a suspicious call through the shield</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SAMPLES.map((s) => (
                <button key={s.file} onClick={() => startSample(s.file)} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-left text-[13px] text-silver hover:border-cyan/40 hover:text-fg">
                  <Play size={12} className="fill-current text-cyan" />{s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* call window */}
        <section className={cx("panel relative overflow-hidden p-6 text-center", band === "HIGH" && chunks.length > 0 && "border-crimson/40")}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-60 transition-colors duration-700"
            style={{ background: `radial-gradient(ellipse at top, ${chunks.length ? BAND_COLOR[band as "HIGH"] : "#67e8f9"}22, transparent 70%)` }} />
          <p className="relative font-mono text-[10.5px] tracking-[0.16em] text-dim">{running ? "CALL IN PROGRESS" : "IDLE"}</p>
          <div className="relative mx-auto mt-6 grid size-20 place-items-center rounded-full bg-ink-3 text-xl text-fg">{running ? "?" : "—"}</div>
          <p className="relative mt-3 text-[16px] text-fg">{running ? caller : "No call"}</p>
          <p className="tnum relative font-mono text-[12px] text-muted">{String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</p>
          <div className="relative mt-6 flex h-14 items-center justify-center gap-[3px]">
            {level.map((l, k) => <span key={k} className="w-[5px] rounded-full bg-cyan/80 transition-[height] duration-75" style={{ height: 4 + l * 52 }} />)}
          </div>
          <div className="relative mt-6 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl border border-line bg-ink-1 p-3">
              <p className="label !text-[9.5px]">Synthetic voice</p>
              <p className="tnum mt-1 text-[22px]" style={{ color: spoofAvg >= 0.6 ? "#fb7185" : "#6ee7b7" }}>{chunks.length ? spoofAvg.toFixed(2) : "—"}</p>
            </div>
            <div className="rounded-xl border border-line bg-ink-1 p-3">
              <p className="label !text-[9.5px]">Call risk</p>
              <p className="tnum mt-1 text-[22px]" style={{ color: chunks.length ? BAND_COLOR[band as "HIGH"] : undefined }}>{chunks.length ? Math.round(current) : "—"}</p>
            </div>
          </div>
          {running && <button onClick={stop} className="relative mx-auto mt-6 grid size-14 place-items-center rounded-full bg-crimson-deep text-white" aria-label="Hang up"><PhoneOff size={20} /></button>}
        </section>

        <div className="space-y-4">
          {/* risk ribbon */}
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <p className="label">Risk ribbon · every {CHUNK_S} s</p>
              <span className="font-mono text-[11px] text-dim">peak {Math.round(peak)} · {chunks.length} windows</span>
            </div>
            <div className="mt-4 flex h-20 items-end gap-1 overflow-x-auto">
              {chunks.map((c) => {
                const b = c.risk >= 70 ? "HIGH" : c.risk >= 35 ? "MEDIUM" : "LOW";
                return (
                  <motion.div key={c.i} initial={{ height: 0, opacity: 0 }} animate={{ height: `${Math.max(8, c.risk)}%`, opacity: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="w-7 shrink-0 rounded-t" style={{ background: BAND_COLOR[b as "HIGH"] }} title={`${Math.round(c.risk)} · ${c.text}`} />
                );
              })}
              {chunks.length === 0 && <p className="self-center text-[13px] text-dim">Start a call to see the ribbon.</p>}
            </div>
          </section>

          {/* transcript */}
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <p className="label">Live transcript</p>
              <div className="flex flex-wrap gap-1">
                {rolling.tactics.map((t) => <span key={t} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ color: TACTIC_COLOR[t], borderColor: `${TACTIC_COLOR[t]}55` }}>{t.replace("_", " ")}</span>)}
                {rolling.action !== "none" && <span className="rounded-full border border-crimson/40 px-2 py-0.5 text-[11px] text-crimson">asks: {rolling.action}</span>}
              </div>
            </div>
            <p className="mt-3 min-h-[90px] text-[17px] leading-relaxed text-silver">
              {parts.length ? parts.map((p, k) => p.k ? <span key={k} className="rounded px-0.5" style={{ color: TACTIC_COLOR[p.k], background: `${TACTIC_COLOR[p.k]}22` }}>{p.s}</span> : <span key={k}>{p.s}</span>)
                : <span className="text-dim">{running ? "Listening…" : "The transcript appears here as the caller speaks."}</span>}
              {running && <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-cyan align-middle" />}
            </p>
          </section>

          {/* alert */}
          <AnimatePresence>
            {alert && (
              <motion.section initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
                className="relative overflow-hidden rounded-2xl border border-crimson/50 bg-crimson/[0.08] p-5">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 shrink-0 text-crimson" size={22} />
                  <div className="flex-1">
                    <p className="font-mono text-[11px] tracking-[0.16em] text-crimson">MIRAGE · LIVE ALERT</p>
                    <p className="mt-1 text-[17px] leading-snug text-fg">
                      {rolling.action === "credential" ? "A one-time code was just requested" : "Money was just requested"}
                      {spoofAvg >= 0.6 ? " in a voice that sounds synthetic." : "."}
                    </p>
                    <p className="mt-3 text-[13px] text-muted">Challenge the caller before anything else:</p>
                    <p className="mt-1 text-[16px] text-cyan">{alert}</p>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

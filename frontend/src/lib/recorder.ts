import { useCallback, useEffect, useRef, useState } from "react";

/** Pick a container the browser can actually record: Opus WebM (Chrome, Firefox, Edge) or AAC MP4 (Safari). */
function pickFormat(): { mime: string; ext: string } {
  const options = [
    { mime: "audio/webm;codecs=opus", ext: "weba" },
    { mime: "audio/webm", ext: "weba" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  ];
  for (const o of options) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(o.mime)) return o;
  }
  return { mime: "", ext: "webm" };
}

export function micError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (!window.isSecureContext) return "The microphone needs https or localhost. Open MIRAGE on http://localhost:5173.";
  if (name === "NotAllowedError") return "Microphone permission was blocked. Allow it from the address-bar icon and try again.";
  if (name === "NotFoundError") return "No microphone was found on this device.";
  if (name === "NotReadableError") return "The microphone is busy in another app (a call or meeting). Close it and retry.";
  return "The microphone could not start.";
}

/**
 * Recorder with a live input meter. `start()` must be called from a click so the browser grants the mic and
 * audio playback; `stop()` resolves with a correctly named File.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState<number[]>(Array(24).fill(0));
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cleanup = useRef<() => void>(() => {});
  const resolver = useRef<((f: File | null) => void) | null>(null);

  const start = useCallback(async () => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); // created inside the click
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    await ctx.resume();
    const fmt = pickFormat();
    const rec = new MediaRecorder(stream, fmt.mime ? { mimeType: fmt.mime } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || fmt.mime || "audio/webm";
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "weba";
      const blob = new Blob(chunks.current, { type });
      resolver.current?.(blob.size > 800 ? new File([blob], `voice-note-${Date.now()}.${ext}`, { type }) : null);
      resolver.current = null;
    };
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setLevel(Array.from({ length: 24 }, (_, k) => data[Math.floor((k / 24) * data.length * 0.7)] / 255));
      raf = requestAnimationFrame(tick);
    };
    tick();
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    cleanup.current = () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      setLevel(Array(24).fill(0));
    };
    rec.start(250); // small timeslices so a short recording still produces data
    mr.current = rec;
    setSeconds(0);
    setRecording(true);
  }, []);

  const stop = useCallback(() => new Promise<File | null>((resolve) => {
    resolver.current = resolve;
    if (mr.current && mr.current.state !== "inactive") mr.current.stop();
    else resolve(null);
    cleanup.current();
    setRecording(false);
  }), []);

  useEffect(() => () => cleanup.current(), []);
  return { recording, seconds, level, start, stop };
}

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, secs } from "@/lib/format";

export interface TWord { w: string; t0: number; t1: number }
export interface TWindow { t0: number; t1: number; score: number }
export interface TSpan { kind: string; span: [number, number] }

const TACTIC: Record<string, string> = {
  urgency: "#fbbf24", authority: "#a78bfa", secrecy: "#fb7185", fear: "#f97316", reward: "#6ee7b7", channel_switch: "#67e8f9", bypass: "#f472b6",
};

/**
 * Evidence on one clock. Every lane shares the same time axis and playhead: the waveform, the synthetic-speech score
 * per window, each transcribed word, and the pressure tactics the Words witness found (mapped from character spans
 * onto the words that carry them). Click or drag anywhere to seek; arrow keys step a second.
 */
export function EvidenceTimeline({
  duration, peaks, windows = [], words = [], spans = [], src, threshold = 0.5,
}: {
  duration: number;
  peaks?: number[] | null;
  windows?: TWindow[];
  words?: TWord[];
  spans?: TSpan[];
  src?: string;
  threshold?: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const dur = Math.max(duration || 0, words.at(-1)?.t1 ?? 0, windows.at(-1)?.t1 ?? 0, 0.1);
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / dur) * 100))}%`;

  // character offsets of each word in the space-joined transcript, so tactic spans land on seconds
  const tagged = useMemo(() => {
    let pos = 0;
    return words.map((w) => {
      const a = pos;
      pos += w.w.length + 1;
      const hit = spans.find((s) => s.span && s.span[0] < a + w.w.length && s.span[1] > a);
      return { ...w, kind: hit?.kind };
    });
  }, [words, spans]);
  const tacticRuns = useMemo(() => {
    const runs: { kind: string; t0: number; t1: number; text: string }[] = [];
    for (const w of tagged) {
      if (!w.kind) continue;
      const last = runs.at(-1);
      if (last && last.kind === w.kind && w.t0 - last.t1 < 0.6) { last.t1 = w.t1; last.text += ` ${w.w}`; }
      else runs.push({ kind: w.kind, t0: w.t0, t1: w.t1, text: w.w });
    }
    return runs;
  }, [tagged]);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    let raf = 0;
    const loop = () => { setT(a.currentTime); raf = requestAnimationFrame(loop); };
    const on = () => { setPlaying(true); raf = requestAnimationFrame(loop); };
    const off = () => { setPlaying(false); cancelAnimationFrame(raf); setT(a.currentTime); };
    a.addEventListener("play", on);
    a.addEventListener("pause", off);
    a.addEventListener("ended", off);
    return () => { cancelAnimationFrame(raf); a.removeEventListener("play", on); a.removeEventListener("pause", off); a.removeEventListener("ended", off); };
  }, [src]);

  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur));
  };
  const seek = (s: number) => {
    setT(s);
    if (audio.current) audio.current.currentTime = s;
  };
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setPlaying(false)); else a.pause();
  };
  const active = tagged.findIndex((w) => t >= w.t0 && t < w.t1);
  const bars = peaks?.length ? peaks : null;

  return (
    <div className="rounded-xl border border-line bg-ink-1/50">
      {src && <audio ref={audio} src={src} preload="metadata" />}
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <button onClick={toggle} disabled={!src} aria-label={playing ? "Pause" : "Play"}
          className="grid size-7 place-items-center rounded-full bg-cyan text-ink-0 transition-opacity disabled:opacity-30">
          {playing ? <Pause size={13} /> : <Play size={13} className="translate-x-px" />}
        </button>
        <span className="tnum font-mono text-[11px] text-silver">{secs(t)} <span className="text-dim">/ {secs(dur)}</span></span>
        <span className="ml-auto hidden gap-3 font-mono text-[10px] text-dim sm:flex">
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-crimson/80" />synthetic window</span>
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-amber/70" />tactic</span>
        </span>
      </div>

      <div className="grid grid-cols-[64px_1fr] gap-x-2 px-3 py-3">
        <div className="space-y-2 pt-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-dim">
          <p className="flex h-12 items-center">Audio</p>
          <p className="flex h-5 items-center">Synthetic</p>
          {words.length > 0 && <p className="flex h-9 items-center">Words</p>}
          {tacticRuns.length > 0 && <p className="flex h-5 items-center">Tactics</p>}
        </div>

        <div ref={track} role="slider" tabIndex={0} aria-label="Evidence timeline" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
          aria-valuetext={`${secs(t)} of ${secs(dur)}${active >= 0 ? `, word ${tagged[active].w}` : ""}`}
          className="relative cursor-crosshair select-none space-y-2 focus-visible:outline-offset-4"
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); seek(at(e.clientX)); }}
          onPointerMove={(e) => { setHover(at(e.clientX)); if (e.buttons === 1) seek(at(e.clientX)); }}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); seek(Math.min(dur, t + 1)); }
            if (e.key === "ArrowLeft") { e.preventDefault(); seek(Math.max(0, t - 1)); }
            if (e.key === " ") { e.preventDefault(); toggle(); }
          }}>
          {/* waveform */}
          <div className="relative flex h-12 items-center gap-px overflow-hidden">
            {bars ? bars.map((p, i) => {
              const s = (i / bars.length) * dur;
              const w = windows.find((x) => s >= x.t0 && s < x.t1);
              const hot = w && w.score >= threshold;
              return <span key={i} className="flex-1 rounded-full" style={{ height: `${Math.max(6, p * 100)}%`, background: s <= t ? (hot ? "var(--color-crimson)" : "var(--color-cyan)") : hot ? "rgb(251 113 133 / 0.45)" : "rgb(148 163 184 / 0.35)" }} />;
            }) : <span className="h-px w-full bg-line-2" />}
          </div>
          {/* synthetic windows */}
          <div className="relative h-5 overflow-hidden rounded bg-ink-3/60">
            {windows.map((w, i) => (
              <span key={i} title={`${secs(w.t0)}–${secs(w.t1)} · synthetic ${Math.round(w.score * 100)}`}
                className="absolute inset-y-0 border-r border-ink-1"
                style={{ left: pct(w.t0), width: `calc(${pct(w.t1 - w.t0)} )`, background: `color-mix(in oklab, ${w.score >= threshold ? "var(--color-crimson)" : "var(--color-mint)"} ${Math.round(18 + Math.abs(w.score - threshold) * 140)}%, transparent)` }} />
            ))}
          </div>
          {/* words */}
          {words.length > 0 && (
            <div className="relative h-9 overflow-hidden">
              {tagged.map((w, i) => (
                <span key={i} className={cx("absolute top-0 truncate rounded-[3px] px-0.5 text-[11px] leading-[18px] transition-colors",
                  i === active ? "bg-cyan text-ink-0" : w.kind ? "text-fg" : "text-muted")}
                  style={{ left: pct(w.t0), maxWidth: pct(Math.max(0.25, w.t1 - w.t0) + 0.6), top: i % 2 ? 18 : 0,
                    background: i !== active && w.kind ? `color-mix(in oklab, ${TACTIC[w.kind] ?? "#fbbf24"} 30%, transparent)` : undefined }}>
                  {w.w}
                </span>
              ))}
            </div>
          )}
          {/* tactic runs */}
          {tacticRuns.length > 0 && (
            <div className="relative h-5">
              {tacticRuns.map((r, i) => (
                <span key={i} title={`${r.kind.replace("_", " ")}: “${r.text}”`} className="absolute inset-y-0 flex items-center overflow-hidden rounded px-1 font-mono text-[9.5px] text-ink-0"
                  style={{ left: pct(r.t0), width: pct(Math.max(0.3, r.t1 - r.t0)), background: TACTIC[r.kind] ?? "#fbbf24" }}>
                  {r.kind.replace("_", " ")}
                </span>
              ))}
            </div>
          )}

          {hover != null && <span className="pointer-events-none absolute -inset-y-1 w-px bg-silver/30" style={{ left: pct(hover) }} />}
          <span className="pointer-events-none absolute -inset-y-1 w-[2px] -translate-x-1/2 rounded-full bg-fg shadow-[0_0_0_3px_rgb(4_6_11/0.6)]" style={{ left: pct(t) }} />
        </div>
      </div>
    </div>
  );
}

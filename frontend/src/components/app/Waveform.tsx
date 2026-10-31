import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx, secs } from "@/lib/format";

export interface Region {
  id: string;
  t0: number;
  t1: number;
  color?: string;
  label?: string;
}

/**
 * Waveform with evidence regions. Bars come from server-computed peaks (or a client decode), regions shade the
 * seconds a witness flagged, and clicking seeks the real audio element.
 */
export function Waveform({
  peaks,
  duration,
  src,
  regions = [],
  activeRegion,
  onRegion,
  windows,
  height = 96,
}: {
  peaks: number[];
  duration: number;
  src?: string;
  regions?: Region[];
  activeRegion?: string | null;
  onRegion?: (id: string) => void;
  windows?: { t0: number; t1: number; score: number }[];
  height?: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setT(a.currentTime);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [src]);

  useEffect(() => {
    const r = regions.find((x) => x.id === activeRegion);
    if (r && audio.current) {
      audio.current.currentTime = r.t0;
      setT(r.t0);
    }
  }, [activeRegion, regions]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const time = ((e.clientX - r.left) / r.width) * duration;
    if (audio.current) audio.current.currentTime = time;
    setT(time);
    const hit = regions.find((x) => time >= x.t0 && time <= x.t1);
    if (hit) onRegion?.(hit.id);
  };

  const n = peaks.length || 1;
  const inRegion = (i: number) => {
    const time = (i / n) * duration;
    return regions.find((r) => time >= r.t0 && time <= r.t1);
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        {src && (
          <button onClick={toggle} className="grid size-9 shrink-0 place-items-center rounded-full border border-line-2 text-fg transition-colors hover:border-cyan/50 hover:text-cyan" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
        )}
        <div className="relative flex-1 cursor-pointer select-none" style={{ height }} onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={t} aria-label="Audio position">
          {regions.map((r) => (
            <button key={r.id} onClick={(e) => { e.stopPropagation(); onRegion?.(r.id); }}
              className={cx("absolute inset-y-0 rounded-sm transition-colors", activeRegion === r.id ? "bg-crimson/25 ring-1 ring-crimson/60" : "bg-crimson/10 hover:bg-crimson/20")}
              style={{ left: `${(r.t0 / duration) * 100}%`, width: `${Math.max(0.6, ((r.t1 - r.t0) / duration) * 100)}%` }}
              aria-label={`Evidence ${r.id} from ${secs(r.t0)} to ${secs(r.t1)}`}>
              <span className="absolute -top-0.5 left-1 font-mono text-[9.5px] text-crimson">{r.id}</span>
            </button>
          ))}
          <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {peaks.map((p, i) => {
              const h = Math.max(2, p * 92);
              const red = inRegion(i);
              const past = (i / n) * duration <= t;
              return <rect key={i} x={i + 0.18} y={50 - h / 2} width={0.64} height={h} rx={0.3}
                fill={red ? "#fb7185" : "#67e8f9"} fillOpacity={past ? 1 : 0.55} />;
            })}
          </svg>
          <span className="pointer-events-none absolute inset-y-0 w-px bg-fg/80" style={{ left: `${(t / Math.max(duration, 0.001)) * 100}%` }} />
        </div>
      </div>
      {windows && windows.length > 1 && (
        <div className={cx("mt-1.5 flex h-2 overflow-hidden rounded-sm", src && "ml-12")} aria-label="Per-window synthetic-speech score">
          {windows.map((w, i) => (
            <span key={i} className="h-full flex-1" style={{ background: `color-mix(in oklab, #fb7185 ${Math.round(w.score * 100)}%, #18233b)` }} title={`${secs(w.t0)}–${secs(w.t1)} · ${w.score.toFixed(2)}`} />
          ))}
        </div>
      )}
      <div className={cx("mt-1.5 flex justify-between font-mono text-[10.5px] text-dim", src && "ml-12")}>
        <span>{secs(t)}</span>
        <span>{secs(duration)}</span>
      </div>
      {src && <audio ref={audio} src={src} preload="metadata" />}
    </div>
  );
}

/** Decode a local audio/video file in the browser to peaks, for the upload preview. */
export async function decodePeaks(file: File, n = 160): Promise<{ peaks: number[]; duration: number } | null> {
  try {
    const buf = await file.arrayBuffer();
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const data = audio.getChannelData(0);
    const step = Math.floor(data.length / n) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) m = Math.max(m, Math.abs(data[j]));
      peaks.push(m);
    }
    const max = Math.max(...peaks) || 1;
    ctx.close();
    return { peaks: peaks.map((p) => p / max), duration: audio.duration };
  } catch {
    return null;
  }
}

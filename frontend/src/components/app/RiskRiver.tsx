import { useState } from "react";

export interface RiverPoint { i: number; risk: number; spoof: number | null; text: string; tactics?: string[] }

/**
 * Rolling call risk over time: the filled river is fused call risk (0–100), the cyan line is the synthetic-voice
 * score per chunk, the dashed lines are the MEDIUM (35) and HIGH (70) bands. Hover reads out a chunk with its words.
 */
export function RiskRiver({ points, seconds = 3, height = 150 }: { points: RiverPoint[]; seconds?: number; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(points.length, 12); // keep a stable scale for short calls
  const W = 600;
  const x = (k: number) => (k / Math.max(1, n - 1)) * W;
  const y = (v: number) => height - (v / 100) * (height - 8) - 4;
  const risk = points.map((p, k) => `${x(k)},${y(p.risk)}`).join(" ");
  const area = points.length ? `M0,${height} L${risk.split(" ").join(" L")} L${x(points.length - 1)},${height} Z` : "";
  const spoof = points.filter((p) => p.spoof != null).map((p) => `${x(points.indexOf(p))},${y((p.spoof ?? 0) * 100)}`).join(" ");
  const last = points[points.length - 1];
  const color = !last ? "var(--color-cyan)" : last.risk >= 70 ? "var(--color-crimson)" : last.risk >= 35 ? "var(--color-amber)" : "var(--color-mint)";
  const h = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <div className="mb-2 flex h-5 items-center gap-4 font-mono text-[10.5px] text-muted">
        {h ? (
          <span className="truncate text-silver">{(hover! * seconds).toFixed(0)}s · risk {Math.round(h.risk)} · voice {h.spoof == null ? "–" : h.spoof.toFixed(2)} · “{h.text || "…"}”</span>
        ) : (
          <>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: color, opacity: 0.6 }} />call risk</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-cyan" />synthetic voice</span>
          </>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (!points.length) return;
          const r = e.currentTarget.getBoundingClientRect();
          const k = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
          setHover(k < points.length ? Math.max(0, k) : null);
        }}>
        <defs>
          <linearGradient id="river" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.55" />
            <stop offset="1" stopColor={color} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[35, 70].map((t) => (
          <g key={t}>
            <line x1="0" x2={W} y1={y(t)} y2={y(t)} stroke={t === 70 ? "var(--color-crimson)" : "var(--color-amber)"} strokeOpacity="0.45" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {area && <path d={area} fill="url(#river)" />}
        {points.length > 1 && <polyline points={risk} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        {spoof && <polyline points={spoof} fill="none" stroke="var(--color-cyan)" strokeWidth="1.5" strokeDasharray="1 0" vectorEffect="non-scaling-stroke" opacity="0.9" />}
        {points.map((p, k) => (p.tactics?.length ? <circle key={p.i} cx={x(k)} cy={y(p.risk)} r="3.5" fill="var(--color-amber)" vectorEffect="non-scaling-stroke" /> : null))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={height} stroke="var(--color-fg)" strokeOpacity="0.35" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-dim">
        <span>0s</span><span className="text-crimson/70">— 70 HIGH</span><span>{((n - 1) * seconds).toFixed(0)}s</span>
      </div>
      {!points.length && <p className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-dim">Start a call to see the risk river.</p>}
    </div>
  );
}

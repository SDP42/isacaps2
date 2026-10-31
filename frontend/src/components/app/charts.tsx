import { motion } from "motion/react";
import { useState } from "react";
import { BAND_COLOR } from "@/lib/format";
import type { Band } from "@/lib/types";

type Day = { date: string } & Record<Band, number>;

/** 30-day stacked columns by band, with a hover readout. */
export function BandTimeline({ days, height = 150 }: { days: Day[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.HIGH + d.MEDIUM + d.LOW + d.INCONCLUSIVE));
  const order: Band[] = ["HIGH", "MEDIUM", "LOW", "INCONCLUSIVE"];
  const w = 100 / days.length;
  const h = hover != null ? days[hover] : null;
  return (
    <div className="relative">
      <div className="mb-2 flex h-5 items-center gap-4 font-mono text-[10.5px] text-muted">
        {h ? (
          <>
            <span className="text-silver">{new Date(h.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
            {order.map((b) => <span key={b} style={{ color: BAND_COLOR[b] }}>{b.slice(0, 3)} {h[b]}</span>)}
          </>
        ) : (
          order.map((b) => (
            <span key={b} className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: BAND_COLOR[b] }} />{b.toLowerCase()}</span>
          ))
        )}
      </div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2="100" y1={height * f} y2={height * f} stroke="rgb(148 163 184 / 0.07)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />)}
        {days.map((d, i) => {
          let y = height;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={i * w} y={0} width={w} height={height} fill={hover === i ? "rgb(148 163 184 / 0.06)" : "transparent"} />
              {order.map((b) => {
                const v = d[b];
                if (!v) return null;
                const bh = (v / max) * (height - 6);
                y -= bh;
                return (
                  <motion.rect key={b} x={i * w + w * 0.18} width={w * 0.64} rx={0.4} fill={BAND_COLOR[b]} fillOpacity={b === "INCONCLUSIVE" ? 0.5 : 0.85}
                    initial={{ y: height, height: 0 }} animate={{ y, height: Math.max(0, bh - 0.6) }}
                    transition={{ duration: 0.8, delay: i * 0.012, ease: [0.16, 1, 0.3, 1] }} />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-dim">
        <span>30 days ago</span><span>today</span>
      </div>
    </div>
  );
}

/** Risk score histogram; bins are tinted by the band they fall in. */
export function RiskHistogram({ bins, height = 110 }: { bins: number[]; height?: number }) {
  const max = Math.max(1, ...bins);
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {bins.map((v, i) => {
          const band: Band = i < 3.5 ? "LOW" : i < 7 ? "MEDIUM" : "HIGH";
          return (
            <div key={i} className="group relative flex-1">
              <motion.div className="w-full rounded-t-sm" style={{ background: BAND_COLOR[band], opacity: 0.25 + 0.75 * (v / max) }}
                initial={{ height: 0 }} animate={{ height: (v / max) * height }} transition={{ duration: 0.8, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }} />
              <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[10px] text-silver opacity-0 transition-opacity group-hover:opacity-100">{v}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-dim"><span>0</span><span>50</span><span>100</span></div>
    </div>
  );
}

export function HBars({ data, color = "var(--color-cyan)", format }: { data: Record<string, number>; color?: string; format?: (k: string) => string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <ul className="space-y-2.5">
      {entries.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[96px_1fr_32px] items-center gap-3 text-[12.5px]">
          <span className="truncate capitalize text-muted">{format ? format(k) : k.replace(/_/g, " ")}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-ink-4">
            <motion.span className="block h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
          </span>
          <span className="tnum text-right font-mono text-[11.5px] text-silver">{v}</span>
        </li>
      ))}
    </ul>
  );
}

export function MiniRing({ risk, band, size = 38 }: { risk: number; band: Band; size?: number }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink-4)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BAND_COLOR[band]} strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - risk / 100)} strokeLinecap="round" />
      </svg>
      <span className="tnum absolute font-mono text-[10.5px]" style={{ color: BAND_COLOR[band] }}>{Math.round(risk)}</span>
    </span>
  );
}

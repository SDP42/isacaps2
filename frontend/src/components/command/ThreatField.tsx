import { useEffect, useMemo, useRef, useState } from "react";
import { BAND_COLOR, inrShort } from "@/lib/format";
import type { Band } from "@/lib/types";
import { BANDS, type Fact, type Range, ts } from "./data";

const BUCKET: Record<Range, number> = { "24h": 36e5, "7d": 6 * 36e5, "30d": 864e5 };
const PAD = { l: 34, r: 12, t: 14 };
const FIELD_H = 230;
const LANE_H = 54;
const GAP = 22;

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function tick(t: number, range: Range) {
  const d = new Date(t);
  return range === "24h"
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * The threat field: every investigation as a dot at (when it arrived, calibrated risk), radius by the amount asked
 * for, hollow once closed. The lane below stacks volume per bucket on the same clock. Drag across either to brush a
 * time window that filters the whole command centre; the bands' decision lines sit at 35 and 70. The lane uses a
 * square-root scale so one busy day does not flatten the rest.
 */
export function ThreatField({
  facts, span, range, window, onWindow, selected, onSelect, fresh, hiddenBands,
}: {
  facts: Fact[];
  span: [number, number];
  range: Range;
  window: [number, number] | null;
  onWindow: (w: [number, number] | null) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  fresh: Set<string>;
  hiddenBands: Band[];
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ x: number; fact: Fact | null } | null>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const W = Math.max(width, 320);
  const iw = W - PAD.l - PAD.r;
  const H = PAD.t + FIELD_H + GAP + LANE_H + 18;
  const laneY = PAD.t + FIELD_H + GAP;

  const x = (t: number) => PAD.l + ((t - span[0]) / (span[1] - span[0])) * iw;
  const tAt = (px: number) => span[0] + ((px - PAD.l) / iw) * (span[1] - span[0]);
  const y = (r: number) => PAD.t + FIELD_H - (r / 100) * FIELD_H;
  const maxAmt = useMemo(() => Math.max(1, ...facts.map((f) => f.amount_inr)), [facts]);
  const rad = (a: number) => (a > 0 ? 3.5 + 5.5 * Math.sqrt(a / maxAmt) : 3.2);

  const buckets = useMemo(() => {
    const size = BUCKET[range];
    const n = Math.ceil((span[1] - span[0]) / size);
    const out = Array.from({ length: n }, (_, i) => ({ t0: span[0] + i * size, counts: { HIGH: 0, MEDIUM: 0, LOW: 0, INCONCLUSIVE: 0 } as Record<Band, number> }));
    for (const f of facts) {
      const i = Math.floor((ts(f) - span[0]) / size);
      if (out[i]) out[i].counts[f.band]++;
    }
    return out;
  }, [facts, span, range]);
  const peak = Math.max(1, ...buckets.map((b) => BANDS.reduce((s, k) => s + b.counts[k], 0)));
  const bw = iw / Math.max(1, buckets.length);

  const ticks = useMemo(() => {
    const n = W < 640 ? 4 : 7;
    return Array.from({ length: n }, (_, i) => span[0] + ((span[1] - span[0]) * i) / (n - 1));
  }, [span, W]);

  const local = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { px: ((e.clientX - r.left) / r.width) * W, py: ((e.clientY - r.top) / r.height) * H };
  };
  const nearest = (px: number, py: number) => {
    let best: Fact | null = null;
    let bd = 14 * 14;
    for (const f of facts) {
      const dx = x(ts(f)) - px;
      const dy = y(f.risk) - py;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  };

  const onDown = (e: React.PointerEvent) => {
    const { px } = local(e);
    if (px < PAD.l) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag([px, px]);
  };
  const onMove = (e: React.PointerEvent) => {
    const { px, py } = local(e);
    if (drag) setDrag([drag[0], Math.max(PAD.l, Math.min(W - PAD.r, px))]);
    setHover({ x: px, fact: py < PAD.t + FIELD_H + 4 ? nearest(px, py) : null });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const [a, b] = [Math.min(...drag), Math.max(...drag)];
    setDrag(null);
    if (b - a < 6) {
      const { px, py } = local(e);
      const f = nearest(px, py);
      if (f) onSelect(f.id);
      return;
    }
    onWindow([tAt(a), tAt(b)]);
  };

  const shade = drag ? [Math.min(...drag), Math.max(...drag)] : window ? [x(window[0]), x(window[1])] : null;
  const inWin = (f: Fact) => !window || (ts(f) >= window[0] && ts(f) <= window[1]);
  const tip = hover?.fact;

  return (
    <div ref={box} className="relative select-none">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block touch-none"
        role="img" aria-label={`Threat field: ${facts.length} investigations plotted by time and risk. Drag to filter a time window.`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { setHover(null); }}
        onDoubleClick={() => onWindow(null)}>
        <defs>
          <linearGradient id="tf-high" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-crimson)" stopOpacity="0.09" />
            <stop offset="1" stopColor="var(--color-crimson)" stopOpacity="0.015" />
          </linearGradient>
        </defs>
        {/* decision zones */}
        <rect x={PAD.l} y={y(100)} width={iw} height={y(70) - y(100)} fill="url(#tf-high)" />
        {[35, 70].map((r) => (
          <g key={r}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(r)} y2={y(r)} stroke={r === 70 ? "var(--color-crimson)" : "var(--color-amber)"} strokeOpacity={0.35} strokeDasharray="3 4" />
            <text x={W - PAD.r - 2} y={y(r) - 5} textAnchor="end" className="fill-dim font-mono text-[9.5px]">{r === 70 ? "DO NOT ACT" : "VERIFY FIRST"}</text>
          </g>
        ))}
        {[0, 35, 70, 100].map((r) => (
          <text key={r} x={PAD.l - 8} y={y(r) + 3} textAnchor="end" className="tnum fill-dim font-mono text-[10px]">{r}</text>
        ))}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={laneY + LANE_H} stroke="rgb(148 163 184 / 0.06)" />
            <text x={x(t)} y={H - 4} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} className="fill-dim font-mono text-[10px]">{tick(t, range)}</text>
          </g>
        ))}

        {/* brush */}
        {shade && (
          <g pointerEvents="none">
            <rect x={shade[0]} y={PAD.t} width={Math.max(1, shade[1] - shade[0])} height={laneY + LANE_H - PAD.t} fill="var(--color-cyan)" fillOpacity={0.06} />
            <line x1={shade[0]} x2={shade[0]} y1={PAD.t} y2={laneY + LANE_H} stroke="var(--color-cyan)" strokeOpacity={0.6} />
            <line x1={shade[1]} x2={shade[1]} y1={PAD.t} y2={laneY + LANE_H} stroke="var(--color-cyan)" strokeOpacity={0.6} />
          </g>
        )}

        {/* volume lane */}
        {buckets.map((b, i) => {
          let acc = 0;
          return (
            <g key={i}>
              {(["LOW", "INCONCLUSIVE", "MEDIUM", "HIGH"] as Band[]).map((k) => {
                const v = b.counts[k];
                if (!v || hiddenBands.includes(k)) return null;
                const h = (Math.sqrt(v) / Math.sqrt(peak)) * LANE_H;
                acc += h;
                return <rect key={k} className="mark-rise" x={PAD.l + i * bw + 1} y={laneY + LANE_H - acc} width={Math.max(1, bw - 2)} height={h} rx={1.5} fill={BAND_COLOR[k]} fillOpacity={0.75} />;
              })}
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={laneY + LANE_H + 0.5} y2={laneY + LANE_H + 0.5} stroke="var(--color-line-2)" />
        <text x={PAD.l - 8} y={laneY + 9} textAnchor="end" className="tnum fill-dim font-mono text-[10px]">{peak}</text>

        {/* cases */}
        {facts.map((f) => {
          const cx = x(ts(f));
          const cy = y(f.risk);
          const c = BAND_COLOR[f.band];
          const on = inWin(f);
          const sel = f.id === selected;
          return (
            <g key={f.id} opacity={on ? 1 : 0.18}>
              {fresh.has(f.id) && <circle cx={cx} cy={cy} r={rad(f.amount_inr)} fill="none" stroke={c} className="tf-ping" />}
              <circle cx={cx} cy={cy} r={rad(f.amount_inr)} fill={f.closed ? "var(--color-ink-1)" : c} fillOpacity={f.closed ? 1 : 0.82}
                stroke={c} strokeWidth={f.closed ? 1.25 : 0} />
              {sel && <circle cx={cx} cy={cy} r={rad(f.amount_inr) + 4.5} fill="none" stroke="var(--color-fg)" strokeWidth={1.5} />}
            </g>
          );
        })}

        {/* crosshair */}
        {hover && !drag && hover.x > PAD.l && hover.x < W - PAD.r && (
          <g pointerEvents="none">
            <line x1={tip ? x(ts(tip)) : hover.x} x2={tip ? x(ts(tip)) : hover.x} y1={PAD.t} y2={laneY + LANE_H} stroke="var(--color-silver)" strokeOpacity={0.25} />
            {tip && <circle cx={x(ts(tip))} cy={y(tip.risk)} r={rad(tip.amount_inr) + 3} fill="none" stroke="var(--color-fg)" strokeOpacity={0.7} />}
          </g>
        )}
      </svg>

      {tip && (
        <div className="pointer-events-none absolute z-10 w-[260px] rounded-lg border border-line-2 bg-ink-2/95 p-3 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.8)] backdrop-blur"
          style={{ left: Math.min(Math.max(0, x(ts(tip)) / W * (width || W) - 130), (width || W) - 260), top: Math.max(0, y(tip.risk) - 104) }}>
          <div className="flex items-center justify-between font-mono text-[10.5px]">
            <span className="text-muted">{tip.id} · {tip.channel}</span>
            <span style={{ color: BAND_COLOR[tip.band] }}>{tip.band} {Math.round(tip.risk)}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-fg">{tip.title}</p>
          <p className="mt-1.5 font-mono text-[10.5px] text-dim">
            {new Date(tip.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {tip.amount_inr > 0 && <> · asks {inrShort(tip.amount_inr)}</>}{tip.closed && <> · closed</>}
          </p>
        </div>
      )}
    </div>
  );
}

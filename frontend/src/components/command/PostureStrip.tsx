import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cx, inrShort } from "@/lib/format";
import { posture } from "./data";

export interface Metric {
  id: string;
  label: string;
  value: number;
  prev: number | null;
  format?: (v: number) => string;
  series: number[];
  color: string;
  /** Up is bad for threats, good for triage. */
  upIsBad?: boolean;
  hint: string;
  onClick?: () => void;
  active?: boolean;
}

const LEVELS = ["Calm", "Guarded", "Elevated", "Severe"];

function Delta({ v, prev, upIsBad }: { v: number; prev: number | null; upIsBad?: boolean }) {
  if (prev == null) return null;
  const d = v - prev;
  if (!d) return <span className="font-mono text-[10.5px] text-dim">no change</span>;
  const bad = upIsBad ? d > 0 : d < 0;
  const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
  const pct = prev ? Math.round((Math.abs(d) / prev) * 100) : null;
  return (
    <span className={cx("inline-flex items-center gap-0.5 font-mono text-[10.5px]", bad ? "text-crimson" : "text-mint")}>
      <Icon size={11} />{pct != null ? `${pct}%` : "new"}
    </span>
  );
}

function Bars({ series, color }: { series: number[]; color: string }) {
  const max = Math.max(1, ...series);
  return (
    <span className="flex h-5 items-end gap-[2px]" aria-hidden>
      {series.map((v, i) => (
        <span key={i} className="w-[3px] rounded-[1px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: v ? (i === series.length - 1 ? 1 : 0.55) : 0.15 }} />
      ))}
    </span>
  );
}

/** Threat condition plus the five numbers a shift lead reads first; each is a filter and carries its trend. */
export function PostureStrip({ open, metrics, compareLabel }: { open: number; metrics: Metric[]; compareLabel: string }) {
  const p = posture(open);
  return (
    <section className="panel grid overflow-hidden lg:grid-cols-[230px_1fr]">
      <div className="relative border-b border-line px-5 py-4 lg:border-b-0 lg:border-r">
        <p className="label">Threat condition</p>
        <p className="mt-1.5 text-[24px] font-medium tracking-tight" style={{ color: p.color }}>{p.name}</p>
        <div className="mt-3 grid grid-cols-4 gap-1" role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={p.level} aria-valuetext={p.name}>
          {LEVELS.map((l, i) => (
            <span key={l} className="h-1.5 rounded-full transition-colors" title={l}
              style={{ background: i <= p.level ? (i >= 2 ? "var(--color-crimson)" : i === 1 ? "var(--color-amber)" : "var(--color-mint)") : "var(--color-ink-4)" }} />
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-muted">{open} unresolved HIGH case{open === 1 ? "" : "s"}. Severe at 12.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((m, i) => (
          <button key={m.id} onClick={m.onClick} disabled={!m.onClick} aria-pressed={m.onClick ? Boolean(m.active) : undefined}
            className={cx("group relative flex flex-col justify-between gap-2 border-line px-4 py-3.5 text-left transition-colors",
              i > 0 && "border-l", i >= 2 && "max-xl:border-t", m.onClick && "hover:bg-white/[0.025]", m.active && "bg-cyan/[0.05]")}>
            {m.active && <span className="absolute inset-x-0 top-0 h-px bg-cyan" />}
            <span className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-muted group-hover:text-silver">{m.label}</span>
              <Delta v={m.value} prev={m.prev} upIsBad={m.upIsBad} />
            </span>
            <span className="flex items-end justify-between gap-3">
              <span className="tnum whitespace-nowrap text-[24px] font-medium leading-none tracking-tight" style={{ color: m.color }}>
                {m.format ? m.format(m.value) : m.value.toLocaleString("en-IN")}
              </span>
              <Bars series={m.series} color={m.color} />
            </span>
            <span className="truncate text-[11px] text-dim" title={`${m.hint} · vs ${compareLabel}`}>{m.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export const fmt = { inr: (v: number) => (v ? inrShort(v) : "₹0"), pct: (v: number) => `${Math.round(v)}%` };

import { PanelHead } from "@/components/ui/primitives";
import { BAND_COLOR, cx } from "@/lib/format";
import type { Verdict } from "@/lib/types";

const LENS = [
  { k: "authenticity", label: "Authenticity", sub: "voice, face, image models", color: "#67e8f9" },
  { k: "manipulation", label: "Manipulation", sub: "words witness", color: "#fbbf24" },
  { k: "context", label: "Identity & context", sub: "Trustbook", color: "#fb7185" },
] as const;

/** How the score was built: baseline, then each lens's exact Shapley contribution, then any policy floor, ending at
 * the final risk. Bars share one 0–100 axis so the step sizes are directly comparable. */
export function RiskWaterfall({ v }: { v: Verdict }) {
  const parts = LENS.map((l) => ({ ...l, value: v.contributions.lenses[l.k] ?? 0, dim: v.dims[l.k] ?? 0 }));
  const sum = parts.reduce((a, p) => a + p.value, 0);
  const base = Math.max(0, Math.min(v.risk, v.risk - sum));
  const floor = v.rule_fired && v.risk - (base + sum) > 0.5 ? v.risk - (base + sum) : 0;
  const rows: { label: string; sub: string; from: number; to: number; color: string; note: string }[] = [];
  let acc = base;
  rows.push({ label: "Baseline", sub: "nothing suspicious", from: 0, to: base, color: "#5d6880", note: base.toFixed(1) });
  for (const p of parts) {
    rows.push({ label: p.label, sub: `${p.sub} · signal ${p.dim.toFixed(2)}`, from: acc, to: acc + p.value, color: p.color, note: `+${p.value.toFixed(1)}` });
    acc += p.value;
  }
  if (floor) rows.push({ label: "Policy floor", sub: v.rule_fired!.replace(/_/g, " "), from: acc, to: v.risk, color: "#a78bfa", note: `+${floor.toFixed(1)}` });
  const band = BAND_COLOR[v.band];

  return (
    <section className="panel">
      <PanelHead title="How the score was built" meta="exact Shapley contributions" />
      <div className="space-y-2.5 p-5">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[minmax(0,130px)_1fr_44px] items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] text-fg">{r.label}</p>
              <p className="truncate text-[10.5px] text-dim">{r.sub}</p>
            </div>
            <div className="relative h-5 rounded bg-ink-3">
              {[35, 70].map((t) => <span key={t} className="absolute inset-y-0 w-px bg-line-2" style={{ left: `${t}%` }} />)}
              <span className="mark-grow absolute inset-y-1 rounded-sm"
                style={{ left: `${Math.min(r.from, r.to)}%`, width: `${Math.max(0.6, Math.abs(r.to - r.from))}%`, background: r.color }} />
            </div>
            <span className="tnum text-right font-mono text-[11.5px] text-silver">{r.note}</span>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,130px)_1fr_44px] items-center gap-3 border-t border-line pt-3">
          <p className="text-[13px] font-medium text-fg">Final risk</p>
          <div className="relative h-6 rounded bg-ink-3">
            <span className="mark-grow absolute inset-y-1 left-0 rounded-sm" style={{ width: `${v.risk}%`, background: band }} />
            <span className="absolute -top-4 font-mono text-[9.5px] text-dim" style={{ left: "35%" }}>35</span>
            <span className="absolute -top-4 font-mono text-[9.5px] text-dim" style={{ left: "70%" }}>70</span>
          </div>
          <span className={cx("tnum text-right font-mono text-[13px]")} style={{ color: band }}>{Math.round(v.risk)}</span>
        </div>
        <p className="pt-1 text-[11.5px] text-muted">
          Request sensitivity <span className="font-mono text-violet">S = {v.sensitivity}</span> ({v.requested_action.replace("_", " ")}) scales the
          media and manipulation lenses: the same fake voice matters more when it asks for money.
        </p>
      </div>
    </section>
  );
}

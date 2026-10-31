import { cx } from "@/lib/format";

export interface JuryMeta { threshold: number; weight: number }

const short = (m: string) => m.split("/").pop()!.replace(/-deploy$/, "").replace(/_V_1$/, "");

/**
 * Each pretrained detector as a juror: its score on a 0–1 track, its own decision threshold as a tick (models are
 * calibrated differently, so 0.5 is not everyone's line), and which side it lands on. The header says how many
 * jurors agree, so a split decision is visible instead of averaged away.
 */
export function ModelJury({ models, meta, consensus, fakeWord = "synthetic", compact = false }: {
  models: Record<string, number>;
  meta?: Record<string, JuryMeta> | null;
  consensus?: number | null;
  fakeWord?: string;
  compact?: boolean;
}) {
  const rows = Object.entries(models).map(([name, score]) => {
    const t = meta?.[name]?.threshold ?? 0.5;
    return { name, score, t, weight: meta?.[name]?.weight, fake: score >= t };
  });
  if (!rows.length) return null;
  const yes = rows.filter((r) => r.fake).length;
  const unanimous = yes === 0 || yes === rows.length;
  const totalW = rows.reduce((a, r) => a + (r.weight ?? 1), 0);

  return (
    <div className={cx("rounded-xl border border-line bg-ink-1/60", compact ? "p-3" : "p-4")}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12.5px] text-fg">
          <span className={yes ? "text-crimson" : "text-mint"}>{yes} of {rows.length}</span> models say {fakeWord}
        </p>
        <span className={cx("rounded-full border px-2 py-0.5 font-mono text-[10px]", unanimous ? "border-mint/30 text-mint" : "border-amber/40 text-amber")}>
          {unanimous ? "unanimous" : "split decision"}{consensus != null && ` · ensemble ${consensus.toFixed(2)}`}
        </span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.name} className="grid grid-cols-[minmax(0,150px)_1fr_auto] items-center gap-3">
            <span className="truncate font-mono text-[11px] text-silver" title={r.name}>{short(r.name)}</span>
            <span className="relative h-4" aria-label={`${short(r.name)} score ${r.score.toFixed(2)}, threshold ${r.t}`}>
              <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-4" />
              <span className="mark-grow absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                style={{ left: 0, width: `${r.score * 100}%`, background: r.fake ? "var(--color-crimson)" : "var(--color-mint)", opacity: 0.55 }} />
              <span className="absolute inset-y-0 w-px bg-fg/70" style={{ left: `${r.t * 100}%` }} title={`decision threshold ${r.t}`} />
              <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-1"
                style={{ left: `${r.score * 100}%`, background: r.fake ? "var(--color-crimson)" : "var(--color-mint)" }} />
            </span>
            <span className="flex items-center gap-2 font-mono text-[10.5px]">
              <span className={r.fake ? "text-crimson" : "text-mint"}>{r.score.toFixed(2)}</span>
              {!compact && r.weight != null && <span className="text-dim">w {Math.round((r.weight / totalW) * 100)}%</span>}
            </span>
          </li>
        ))}
      </ul>
      {!compact && <p className="mt-3 text-[10.5px] text-dim">Tick = each model's own decision threshold, measured on public benchmarks.</p>}
    </div>
  );
}

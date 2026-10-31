import { useMemo } from "react";
import { WITNESS_META, cx } from "@/lib/format";
import { FIRED, WITNESSES, countBy, label, type Fact } from "./data";

/** Facet bars counted over every other active filter; clicking a row toggles it as a filter for the whole page. */
export function FacetBars({
  all, active, onPick, color, limit = 7, format = label,
}: {
  all: [string, number][];
  active: string | null;
  onPick: (k: string | null) => void;
  color: string;
  limit?: number;
  format?: (k: string) => string;
}) {
  const max = Math.max(1, ...all.map(([, v]) => v));
  return (
    <ul className="space-y-0.5">
      {all.slice(0, limit).map(([k, v]) => {
        const on = active === k;
        const dim = active != null && !on;
        return (
          <li key={k}>
            <button onClick={() => onPick(on ? null : k)} aria-pressed={on}
              className={cx("group grid w-full grid-cols-[minmax(0,1fr)_32px] items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                on ? "bg-white/[0.05]" : "hover:bg-white/[0.03]")}>
              <span className="min-w-0">
                <span className={cx("block truncate text-[12.5px] capitalize transition-colors", dim ? "text-dim" : "text-silver group-hover:text-fg", on && "text-fg")}>{format(k)}</span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-ink-4">
                  <span className="mark-grow block h-full rounded-full transition-[width] duration-300" style={{ width: `${(v / max) * 100}%`, background: color, opacity: dim ? 0.3 : 1 }} />
                </span>
              </span>
              <span className={cx("tnum text-right font-mono text-[11.5px]", dim ? "text-dim" : "text-muted")}>{v}</span>
            </button>
          </li>
        );
      })}
      {!all.length && <li className="px-2 py-4 text-[12.5px] text-muted">Nothing in this slice.</li>}
    </ul>
  );
}

/** Which witness catches what, per channel: share of that channel's cases where the witness fired (score ≥ 0.6). */
export function ChannelMatrix({
  facts, channel, witness, onPick,
}: {
  facts: Fact[];
  channel: string | null;
  witness: string | null;
  onPick: (channel: string | null, witness: string | null) => void;
}) {
  const rows = useMemo(() => countBy(facts, (f) => f.channel).slice(0, 7), [facts]);
  const cell = (ch: string, w: string) => {
    const xs = facts.filter((f) => f.channel === ch);
    const ran = xs.filter((f) => f.witnesses[w] != null);
    const hit = ran.filter((f) => (f.witnesses[w] ?? 0) >= FIRED).length;
    return { ran: ran.length, hit, share: ran.length ? hit / ran.length : 0 };
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] table-fixed border-separate border-spacing-[3px] text-[12px]">
        <thead>
          <tr>
            <th className="w-[84px]" />
            {WITNESSES.map((w) => (
              <th key={w} className="pb-1 font-normal">
                <button onClick={() => onPick(channel, witness === w ? null : w)} aria-pressed={witness === w}
                  className={cx("font-mono text-[10px] tracking-[0.1em] transition-colors hover:text-fg", witness === w ? "text-fg" : "text-dim")}>
                  {WITNESS_META[w].short}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([ch, n]) => (
            <tr key={ch}>
              <th className="pr-2 text-left font-normal">
                <button onClick={() => onPick(channel === ch ? null : ch, witness)} aria-pressed={channel === ch}
                  className={cx("flex w-full items-baseline justify-between gap-2 capitalize transition-colors hover:text-fg", channel === ch ? "text-fg" : "text-silver")}>
                  <span className="truncate">{ch}</span><span className="tnum font-mono text-[10px] text-dim">{n}</span>
                </button>
              </th>
              {WITNESSES.map((w) => {
                const c = cell(ch, w);
                const on = (channel === ch || !channel) && (witness === w || !witness);
                const col = WITNESS_META[w].color;
                return (
                  <td key={w} className="p-0">
                    <button onClick={() => onPick(ch, w)} title={c.ran ? `${WITNESS_META[w].label} fired on ${c.hit} of ${c.ran} ${ch} cases` : `${WITNESS_META[w].label} did not run on ${ch}`}
                      className={cx("grid h-8 w-full place-items-center rounded-[5px] font-mono text-[10.5px] transition-[opacity,outline] hover:outline hover:outline-1 hover:outline-fg/40", !on && "opacity-30")}
                      style={c.ran
                        ? { background: `color-mix(in oklab, ${col} ${Math.round(8 + c.share * 72)}%, var(--color-ink-2))`, color: c.share > 0.55 ? "var(--color-ink-0)" : "var(--color-silver)" }
                        : { border: "1px dashed var(--color-line)", color: "var(--color-dim)" }}>
                      {c.ran ? `${Math.round(c.share * 100)}` : "·"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * When attacks land: weekday × hour, HIGH cases only, with the working day (09–19) shaded. Hours are read on the
 * clock the case was recorded in, the same one the identity witness uses for its out-of-hours check.
 */
export function AttackClock({ facts, hour, onHour }: { facts: Fact[]; hour: number | null; onHour: (h: number | null) => void }) {
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    for (const f of facts) {
      if (f.band !== "HIGH") continue;
      const d = new Date(f.at);
      g[(d.getUTCDay() + 6) % 7][d.getUTCHours()]++;
    }
    return g;
  }, [facts]);
  const max = Math.max(1, ...grid.flat());
  const after = facts.filter((f) => f.band === "HIGH").filter((f) => { const h = new Date(f.at).getUTCHours(); return h < 9 || h >= 19; }).length;
  const high = facts.filter((f) => f.band === "HIGH").length;
  return (
    <div>
      <div className="grid grid-cols-[30px_repeat(24,minmax(0,1fr))] gap-[2px]">
        {grid.map((row, d) => (
          <div key={d} className="contents">
            <span className="pr-1 text-right font-mono text-[9.5px] leading-[14px] text-dim">{DAYS[d]}</span>
            {row.map((v, h) => (
              <span key={h} className={cx("h-[14px] rounded-[2px]", (hour != null && hour !== h) && "opacity-25")}
                title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 · ${v} HIGH`}
                style={{ background: v ? `color-mix(in oklab, var(--color-crimson) ${Math.round(18 + (v / max) * 82)}%, var(--color-ink-2))` : (h >= 9 && h < 19 ? "rgb(148 163 184 / 0.07)" : "rgb(148 163 184 / 0.03)") }} />
            ))}
          </div>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <button key={h} onClick={() => onHour(hour === h ? null : h)} aria-pressed={hour === h} aria-label={`Filter to ${h}:00`}
            className={cx("pt-1 text-center font-mono text-[9px] transition-colors hover:text-fg", hour === h ? "text-cyan" : "text-dim")}>
            {h % 3 === 0 ? String(h).padStart(2, "0") : "·"}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">
        {high ? <><span className="tnum text-fg">{Math.round((after / high) * 100)}%</span> of HIGH cases arrived outside 09:00–19:00, when fewer colleagues are around to check.</> : "No HIGH cases in this slice."}
      </p>
    </div>
  );
}

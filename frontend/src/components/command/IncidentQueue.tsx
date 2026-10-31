import { ArrowDown, ArrowUp, AudioLines, Image as ImageIcon, MessageSquareText, Video } from "lucide-react";
import { useEffect, useRef } from "react";
import { BAND_COLOR, WITNESS_META, ago, cx, inrShort } from "@/lib/format";
import { WITNESSES, label, type Fact } from "./data";

export type SortKey = "risk" | "at" | "amount_inr";

const KIND: Record<string, React.ReactNode> = {
  audio: <AudioLines size={12} />, video: <Video size={12} />, image: <ImageIcon size={12} />, text: <MessageSquareText size={12} />,
};

/** Five cells, one per witness, each tinted by how strongly that witness fired. The case's fingerprint at a glance. */
export function WitnessSignature({ f }: { f: Fact }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={WITNESSES.map((w) => `${w} ${f.witnesses[w] != null ? Math.round(f.witnesses[w] * 100) : "not run"}`).join(", ")}>
      {WITNESSES.map((w) => {
        const s = f.witnesses[w];
        const c = WITNESS_META[w].color;
        return (
          <span key={w} title={`${WITNESS_META[w].label}: ${s != null ? Math.round(s * 100) : "not run"}`}
            className="h-3.5 w-2 rounded-[2px]"
            style={s == null
              ? { border: "1px dashed var(--color-line-2)" }
              : { background: `color-mix(in oklab, ${c} ${Math.round(12 + s * 78)}%, var(--color-ink-3))` }} />
        );
      })}
    </span>
  );
}

function Th({ k, sort, dir, onSort, children, className }: { k?: SortKey; sort: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void; children: React.ReactNode; className?: string }) {
  const on = k === sort;
  return (
    <th className={cx("py-2 font-normal", className)} aria-sort={on ? (dir === -1 ? "descending" : "ascending") : undefined}>
      {k ? (
        <button onClick={() => onSort(k)} className={cx("inline-flex items-center gap-1 transition-colors hover:text-silver", on && "text-silver")}>
          {children}{on && (dir === -1 ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
        </button>
      ) : children}
    </th>
  );
}

export function IncidentQueue({
  rows, selected, onSelect, sort, dir, onSort,
}: {
  rows: Fact[];
  selected: string | null;
  onSelect: (id: string) => void;
  sort: SortKey;
  dir: 1 | -1;
  onSort: (k: SortKey) => void;
}) {
  const body = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    if (!selected) return;
    body.current?.querySelector<HTMLElement>(`[data-id="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="max-h-[440px] overflow-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="sticky top-0 z-[1] bg-ink-2">
          <tr className="border-b border-line text-left font-mono text-[10.5px] tracking-[0.1em] text-dim">
            <Th k="risk" sort={sort} dir={dir} onSort={onSort} className="w-[92px] pl-4">RISK</Th>
            <Th sort={sort} dir={dir} onSort={onSort}>CASE</Th>
            <Th sort={sort} dir={dir} onSort={onSort} className="w-[92px]">WITNESSES</Th>
            <Th k="amount_inr" sort={sort} dir={dir} onSort={onSort} className="w-[118px]">ASKS FOR</Th>
            <Th k="at" sort={sort} dir={dir} onSort={onSort} className="w-[84px] pr-4 text-right">ARRIVED</Th>
          </tr>
        </thead>
        <tbody ref={body}>
          {rows.map((f) => {
            const sel = f.id === selected;
            const c = BAND_COLOR[f.band];
            return (
              <tr key={f.id} data-id={f.id} onClick={() => onSelect(f.id)} aria-selected={sel}
                className={cx("cursor-pointer border-b border-line/60 transition-colors last:border-0", sel ? "bg-cyan/[0.06]" : "hover:bg-white/[0.025]")}>
                <td className="py-2.5 pl-4">
                  <div className="flex items-center gap-2">
                    <span className="tnum w-6 text-right font-mono text-[13px] font-medium" style={{ color: c }}>{Math.round(f.risk)}</span>
                    <span className="h-1 w-10 overflow-hidden rounded-full bg-ink-4"><span className="block h-full rounded-full" style={{ width: `${f.risk}%`, background: c }} /></span>
                  </div>
                </td>
                <td className="max-w-0 py-2.5 pr-4">
                  <p className={cx("truncate", f.closed ? "text-muted" : "text-fg")}>{f.title}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10.5px] text-dim">
                    <span className={sel ? "text-cyan" : undefined}>{f.id}</span>·<span>{f.channel}</span>
                    <span className="flex gap-1 text-muted">{f.kinds.map((k) => <span key={k}>{KIND[k]}</span>)}</span>
                    {f.sender && <>· <span className="truncate">{f.sender}</span></>}
                    {f.closed && <span className="rounded border border-line-2 px-1 text-[9.5px] text-silver">{label(f.outcome ?? "closed")}</span>}
                  </p>
                </td>
                <td className="py-2.5"><WitnessSignature f={f} /></td>
                <td className="py-2.5 text-[12.5px]">
                  <span className="capitalize text-silver">{f.action === "none" ? "nothing" : label(f.action)}</span>
                  {f.amount_inr > 0 && <span className="tnum ml-1.5 font-mono text-[11.5px] text-amber">{inrShort(f.amount_inr)}</span>}
                </td>
                <td className="tnum py-2.5 pr-4 text-right font-mono text-[11px] text-dim">{ago(f.at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && (
        <p className="px-5 py-10 text-center text-[13px] text-muted">No case matches these filters. Widen the time range or clear a filter above.</p>
      )}
    </div>
  );
}

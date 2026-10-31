import { motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AGENT_META, cx, WITNESS_META } from "@/lib/format";
import type { EvidenceItem, TribunalMessage } from "@/lib/types";

/**
 * The Tribunal as a connected flow: agents down a spine on the left, their testimony in the centre, and the exhibits
 * on the right. Curves link each statement to the exhibits it cites (solid when it incriminates, dashed when it
 * mitigates); the Skeptic's objection curves back to the testimony it answers.
 */
export function TribunalFlow({ messages, evidence, onCite }: { messages: TribunalMessage[]; evidence: EvidenceItem[]; onCite?: (id: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const exRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [paths, setPaths] = useState<{ d: string; key: string; color: string; dashed: boolean; seq: number; ex?: string }[]>([]);
  const [hoverSeq, setHoverSeq] = useState<number | null>(null);
  const [hoverEx, setHoverEx] = useState<string | null>(null);

  const cited = Array.from(new Set(messages.flatMap((m) => m.evidence_refs)));
  const exhibits = evidence.filter((e) => cited.includes(e.id));

  const measure = useCallback(() => {
    const root = wrap.current;
    if (!root || window.innerWidth < 1024) {
      setPaths([]);
      return;
    }
    const R = root.getBoundingClientRect();
    const out: typeof paths = [];
    for (const m of messages) {
      const card = cardRefs.current[m.seq];
      if (!card) continue;
      const c = card.getBoundingClientRect();
      const x1 = c.right - R.left, y1 = c.top - R.top + 22;
      for (const id of m.evidence_refs) {
        const ex = exRefs.current[id];
        if (!ex) continue;
        const e = ex.getBoundingClientRect();
        const x2 = e.left - R.left, y2 = e.top - R.top + e.height / 2;
        const mx = (x1 + x2) / 2;
        out.push({ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, key: `${m.seq}-${id}`, seq: m.seq, ex: id,
          color: AGENT_META[m.agent]?.color ?? "#8e99ad", dashed: m.contradicting.includes(id) || m.stance === "exculpatory" });
      }
      if (m.responds_to != null) {
        const target = cardRefs.current[m.responds_to];
        if (target) {
          const t = target.getBoundingClientRect();
          const xa = c.left - R.left, ya = c.top - R.top + 22;
          const xb = t.left - R.left, yb = t.top - R.top + 22;
          out.push({ d: `M${xa},${ya} C${xa - 70},${ya} ${xb - 70},${yb} ${xb},${yb}`, key: `obj-${m.seq}`, seq: m.seq, color: "#f0abfc", dashed: true });
        }
      }
    }
    setPaths(out);
  }, [messages]);

  useLayoutEffect(measure, [measure, exhibits.length]);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const lit = (seq: number, ex?: string) =>
    (hoverSeq == null && hoverEx == null) || hoverSeq === seq || (ex != null && hoverEx === ex);
  const ruling = messages.find((m) => m.agent === "judge");

  return (
    <div ref={wrap} className="relative">
      <svg className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible lg:block" aria-hidden>
        {paths.map((p) => (
          <motion.path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth={lit(p.seq, p.ex) ? 1.4 : 0.8}
            strokeOpacity={lit(p.seq, p.ex) ? 0.75 : 0.08} strokeDasharray={p.dashed ? "4 4" : undefined}
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
        ))}
      </svg>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-24">
        <ol className="relative space-y-3 pl-8">
          <span className="absolute bottom-3 left-[11px] top-3 w-px bg-gradient-to-b from-line-2 via-line to-transparent" />
          {messages.map((m, i) => {
            const meta = AGENT_META[m.agent] ?? { name: m.agent, role: "", color: "#8e99ad" };
            return (
              <motion.li key={m.seq} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative" onMouseEnter={() => setHoverSeq(m.seq)} onMouseLeave={() => setHoverSeq(null)}>
                <span className="absolute -left-8 top-3 grid size-6 place-items-center rounded-full border bg-ink-0" style={{ borderColor: meta.color }}>
                  <span className="size-2 rounded-full" style={{ background: meta.color }} />
                </span>
                <div ref={(el) => { cardRefs.current[m.seq] = el; }}
                  className={cx("rounded-xl border px-4 py-3 transition-colors",
                    m.stance === "ruling" ? "border-crimson/35 bg-crimson/[0.05]" :
                    m.stance === "exculpatory" ? "border-[#f0abfc]/30 bg-[#f0abfc]/[0.04]" :
                    m.stance === "incriminating" ? "border-line-2 bg-ink-1/80" : "border-line bg-ink-1/50",
                    !lit(m.seq) && "opacity-50")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[10.5px] tracking-[0.14em]" style={{ color: meta.color }}>{meta.name.toUpperCase()}</span>
                      <span className="text-[11.5px] text-dim">{meta.role}</span>
                    </span>
                    <span className={cx("font-mono text-[10px] tracking-[0.12em]",
                      m.stance === "incriminating" ? "text-crimson" : m.stance === "exculpatory" ? "text-[#f0abfc]" : m.stance === "ruling" ? "text-fg" : "text-dim")}>
                      {m.stance === "exculpatory" ? "OBJECTION · MITIGATING" : m.stance.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-silver">
                    {m.content.split(/(\[E\d+\])/).map((part, j) => {
                      const mm = part.match(/^\[(E\d+)\]$/);
                      return mm ? (
                        <button key={j} onClick={() => onCite?.(mm[1])} className="etag mx-0.5 align-[1px] hover:bg-cyan/20">{mm[1]}</button>
                      ) : <span key={j}>{part}</span>;
                    })}
                  </p>
                  {(m.supporting.length > 0 || m.contradicting.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px]">
                      {m.supporting.length > 0 && <span className="text-dim">supports <span className="text-crimson">{m.supporting.join(" ")}</span></span>}
                      {m.contradicting.length > 0 && <span className="text-dim">mitigates <span className="text-mint">{m.contradicting.join(" ")}</span></span>}
                    </div>
                  )}
                  {m.citations && (
                    <ul className="mt-2 space-y-0.5 border-t border-line pt-2 font-mono text-[10.5px] text-muted">
                      {m.citations.map((c) => <li key={c.id}>↳ {c.title} — {c.heading} <span className="text-dim">({c.score.toFixed(2)})</span></li>)}
                    </ul>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <p className="label mb-3">Exhibits cited · {exhibits.length}</p>
          <ul className="space-y-1.5">
            {exhibits.map((e) => (
              <li key={e.id}>
                <button ref={(el) => { exRefs.current[e.id] = el; }} onClick={() => onCite?.(e.id)}
                  onMouseEnter={() => setHoverEx(e.id)} onMouseLeave={() => setHoverEx(null)}
                  className={cx("flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12.5px] transition-colors",
                    hoverEx === e.id ? "border-cyan/40 bg-cyan/[0.06]" : "border-line bg-ink-1/60 hover:border-line-2")}>
                  <span className={cx("etag", e.exculpatory && "!border-mint/40 !bg-mint/10 !text-mint")}>{e.id}</span>
                  <span className="min-w-0 flex-1 truncate text-silver">{e.label}</span>
                  <span className="size-1.5 rounded-full" style={{ background: WITNESS_META[e.witness]?.color }} />
                </button>
              </li>
            ))}
          </ul>
          {ruling && (
            <div className="mt-5 rounded-xl border border-line bg-ink-1/60 p-3 text-[12px] leading-relaxed text-muted">
              The Judge explains the fused score but cannot change it. Every statement may cite only exhibits that exist in this case.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

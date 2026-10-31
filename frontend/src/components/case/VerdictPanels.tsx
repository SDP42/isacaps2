import { motion } from "motion/react";
import { BandPill, ETag, PanelHead, RiskRing } from "@/components/ui/primitives";
import { cx, WITNESS_META } from "@/lib/format";
import type { CaseDetail, EvidenceItem, Verdict } from "@/lib/types";

const RULE_LABEL: Record<string, string> = {
  credential_request: "Credential request",
  sensitive_action_unverified: "Sensitive action, unverified",
  synthetic_media_with_sensitive_ask: "Synthetic media + sensitive ask",
  synthetic_no_fraud_indicators: "Synthetic but harmless",
  new_beneficiary_large_amount: "Large amount, new beneficiary",
  insufficient_evidence: "Insufficient evidence",
  uncertain_interval: "Uncertain interval",
};

export function VerdictPanel({ v, onCite }: { v: Verdict; onCite: (id: string) => void }) {
  return (
    <section className="panel relative overflow-hidden">
      <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full blur-[90px]"
        style={{ background: `color-mix(in oklab, ${v.band === "HIGH" ? "#fb7185" : v.band === "MEDIUM" ? "#fbbf24" : v.band === "LOW" ? "#6ee7b7" : "#c7cfdd"} 18%, transparent)` }} />
      <PanelHead title="Fused risk" meta={`T=${v.dims.temperature} · ${v.policy_version}`} />
      <div className="relative flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-start">
        <RiskRing risk={v.risk} band={v.band} interval={v.interval} size={180} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <BandPill band={v.band} withCopy />
            {v.tags.map((t) => <span key={t} className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">{t.replace(/_/g, " ").toLowerCase()}</span>)}
          </div>
          <p className="text-[14.5px] leading-relaxed text-fg">
            {v.summary.split(/(\[E\d+\])/).map((part, i) => {
              const m = part.match(/^\[(E\d+)\]$/);
              return m ? <ETag key={i} id={m[1]} onClick={() => onCite(m[1])} /> : <span key={i}>{part}</span>;
            })}
          </p>
          <p className="font-mono text-[11px] text-dim">interval {v.interval[0].toFixed(0)}–{v.interval[1].toFixed(0)} · ask: {v.requested_action.replace("_", " ")} (S={v.sensitivity})</p>
          {v.rule_fired && (
            <p className="rounded-lg border border-cyan/20 bg-cyan/[0.05] px-3 py-2 text-[12.5px] text-silver">
              <span className="font-mono text-[10.5px] text-cyan">POLICY · {RULE_LABEL[v.rule_fired] ?? v.rule_fired}</span>
              <br />{v.reasons.find((r) => r.kind === "policy")?.text}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function WitnessPanel({ detail, onSelectWitness, active }: { detail: CaseDetail; onSelectWitness: (w: string | null) => void; active: string | null }) {
  const v = detail.verdict!;
  return (
    <section className="panel">
      <PanelHead title="Witness testimony" meta="score · confidence · weight" />
      <ul className="space-y-1 p-3">
        {(["voice", "face", "provenance", "words", "identity"] as const).map((w) => {
          const f = detail.findings.find((x) => x.witness === w);
          const meta = WITNESS_META[w];
          const contrib = v.contributions.witnesses[w] ?? 0;
          const off = !f || f.status === "not_applicable";
          return (
            <li key={w}>
              <button onClick={() => onSelectWitness(active === w ? null : w)} disabled={off}
                className={cx("w-full rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-35", active === w ? "bg-ink-3" : "hover:bg-white/[0.03]")}>
                <div className="flex items-center justify-between text-[13px]">
                  <span style={{ color: off ? undefined : meta.color }}>{meta.label}</span>
                  <span className="font-mono text-[11px] text-muted">
                    {off ? "not called" : f.status !== "ok" ? f.status : `${(f.score ?? 0).toFixed(2)} · c${f.confidence.toFixed(2)}`}
                  </span>
                </div>
                {!off && f.status === "ok" && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-4">
                      <motion.div className="h-full rounded-full" style={{ background: meta.color }} initial={{ width: 0 }} animate={{ width: `${(f.score ?? 0) * 100}%` }} transition={{ duration: 0.8 }} />
                    </div>
                    <span className="tnum w-10 text-right font-mono text-[10.5px] text-dim">+{contrib.toFixed(0)}</span>
                  </div>
                )}
                {!off && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted">{f.summary}</p>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function EvidenceLedger({ evidence, selected, onSelect, filter }: { evidence: EvidenceItem[]; selected: string | null; onSelect: (id: string) => void; filter: string | null }) {
  const list = evidence.filter((e) => !filter || e.witness === filter);
  return (
    <section className="panel flex max-h-[560px] flex-col">
      <PanelHead title="Evidence ledger" meta={`${list.length} exhibits${filter ? ` · ${filter}` : ""}`} />
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {list.map((e) => (
          <li key={e.id}>
            <button id={`ledger-${e.id}`} onClick={() => onSelect(e.id)}
              className={cx("grid w-full grid-cols-[auto_1fr] gap-3 rounded-lg px-2.5 py-2 text-left transition-colors", selected === e.id ? "bg-cyan/[0.08] ring-1 ring-cyan/30" : "hover:bg-white/[0.03]")}>
              <span className={cx("etag mt-0.5", e.exculpatory && "!border-mint/40 !bg-mint/10 !text-mint")}>{e.id}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[13px]">
                  <span className="truncate text-fg">{e.label}</span>
                  <span className="flex gap-0.5" aria-label={`severity ${e.severity}`}>
                    {[1, 2, 3].map((s) => <span key={s} className="h-2.5 w-1 rounded-sm" style={{ background: s <= e.severity ? (e.exculpatory ? "#6ee7b7" : "#fb7185") : "var(--color-ink-4)" }} />)}
                  </span>
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted">{e.detail}</span>
                {(e.expected || e.observed) && (
                  <span className="mt-1 block font-mono text-[10.5px]">
                    {e.expected && <span className="text-mint">expected {e.expected}</span>}
                    {e.expected && e.observed && <span className="text-dim"> · </span>}
                    {e.observed && <span className="text-crimson">observed {e.observed}</span>}
                  </span>
                )}
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: WITNESS_META[e.witness]?.color }}>{e.witness}{e.exculpatory ? " · mitigating" : ""}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

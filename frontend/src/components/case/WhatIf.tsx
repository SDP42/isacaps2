import { RotateCcw, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { BandPill, PanelHead, RiskRing } from "@/components/ui/primitives";
import { post } from "@/lib/api";
import { BAND_COLOR, cx, WITNESS_META } from "@/lib/format";
import type { Band, CaseDetail } from "@/lib/types";

interface WhatIfResult {
  risk: number;
  band: Band;
  rule_fired: string | null;
  dims: { authenticity: number; manipulation: number; context: number };
  reasons: { text: string; kind: string }[];
}

const PRESETS: { label: string; kinds: string[] }[] = [
  { label: "Number matches the Trustbook", kinds: ["contact_mismatch", "unusual_channel", "unknown_sender", "out_of_hours"] },
  { label: "Beneficiary already known", kinds: ["new_beneficiary", "flagged_beneficiary", "pattern_repeat", "request_anomaly", "above_authority"] },
  { label: "No secrecy or bypass", kinds: ["secrecy", "bypass"] },
  { label: "No pressure tactics", kinds: ["secrecy", "bypass", "urgency", "authority", "fear", "reward", "channel_switch"] },
  { label: "Media is authentic", kinds: ["synthetic_speech", "voiceprint_mismatch", "face_manipulation", "lip_sync_drift", "ai_generated_pixels", "generator_metadata", "track_jitter", "ela_inconsistency"] },
  { label: "Nothing is requested", kinds: ["requested_action", "credential_policy"] },
];

const RULE: Record<string, string> = {
  credential_request: "credential request",
  sensitive_action_unverified: "money + secrecy / unverified sender",
  synthetic_media_with_sensitive_ask: "synthetic media + sensitive ask",
  synthetic_no_fraud_indicators: "synthetic but harmless",
  new_beneficiary_large_amount: "large amount, new beneficiary",
  insufficient_evidence: "insufficient evidence",
};

/** Counterfactual lab: withdraw exhibits and watch the verdict re-fuse instantly. */
export function WhatIf({ detail }: { detail: CaseDetail }) {
  const v = detail.verdict!;
  const [off, setOff] = useState<Set<string>>(new Set());
  const [res, setRes] = useState<WhatIfResult | null>(null);
  const incriminating = useMemo(() => detail.evidence.filter((e) => !e.exculpatory && e.severity >= 1), [detail.evidence]);
  const presets = PRESETS.filter((p) => incriminating.some((e) => p.kinds.includes(e.kind)));

  useEffect(() => {
    if (!off.size) {
      setRes(null);
      return;
    }
    const id = setTimeout(() => {
      post<WhatIfResult>(`/v1/cases/${detail.id}/whatif`, { disabled: [...off] }).then(setRes).catch(() => {});
    }, 120);
    return () => clearTimeout(id);
  }, [off, detail.id]);

  const togglePreset = (kinds: string[]) => {
    const ids = incriminating.filter((e) => kinds.includes(e.kind)).map((e) => e.id);
    const allOff = ids.every((i) => off.has(i));
    const next = new Set(off);
    ids.forEach((i) => (allOff ? next.delete(i) : next.add(i)));
    setOff(next);
  };
  const toggle = (id: string) => {
    const next = new Set(off);
    next.has(id) ? next.delete(id) : next.add(id);
    setOff(next);
  };

  const cur = res ?? { risk: v.risk, band: v.band, rule_fired: v.rule_fired, dims: v.dims, reasons: v.reasons };
  const delta = cur.risk - v.risk;
  const lenses = [
    { k: "authenticity" as const, label: "Authenticity", c: "#67e8f9" },
    { k: "manipulation" as const, label: "Manipulation", c: "#fbbf24" },
    { k: "context" as const, label: "Context", c: "#fb7185" },
  ];

  return (
    <section className="panel overflow-hidden">
      <PanelHead title="What-if lab" meta="withdraw exhibits · instant re-fusion"
        right={off.size > 0 && <button onClick={() => setOff(new Set())} className="flex items-center gap-1 text-[12px] text-muted hover:text-fg"><RotateCcw size={12} />Reset</button>} />
      <div className="grid gap-6 p-5 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[13px] text-silver"><Sparkles size={13} className="text-violet" />What if…</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const ids = incriminating.filter((e) => p.kinds.includes(e.kind)).map((e) => e.id);
              const active = ids.length > 0 && ids.every((i) => off.has(i));
              return (
                <button key={p.label} onClick={() => togglePreset(p.kinds)}
                  className={cx("rounded-full border px-3 py-1.5 text-[12.5px] transition-colors", active ? "border-violet/60 bg-violet/15 text-violet" : "border-line-2 text-silver hover:border-violet/40 hover:text-fg")}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="label mb-2 mt-5">Exhibits in play</p>
          <div className="flex flex-wrap gap-1.5">
            {incriminating.map((e) => (
              <button key={e.id} onClick={() => toggle(e.id)} title={e.detail}
                className={cx("flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] transition-all",
                  off.has(e.id) ? "border-line text-dim line-through opacity-50" : "border-line-2 text-silver hover:border-cyan/40")}>
                <span className="size-1.5 rounded-full" style={{ background: off.has(e.id) ? "#5d6880" : WITNESS_META[e.witness]?.color }} />
                <span className="font-mono text-[10.5px] text-cyan/80">{e.id}</span>{e.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="relative">
            <RiskRing key={`${cur.band}-${Math.round(cur.risk)}`} risk={cur.risk} band={cur.band} size={170} stroke={9} />
            <AnimatePresence>
              {off.size > 0 && Math.abs(delta) >= 0.5 && (
                <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="absolute -right-6 top-2 rounded-full border px-2 py-0.5 font-mono text-[11px]"
                  style={{ color: delta < 0 ? "#6ee7b7" : "#fb7185", borderColor: delta < 0 ? "#6ee7b755" : "#fb718555" }}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(0)}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2 text-[12.5px]">
            <BandPill band={v.band} /><span className="text-dim">→</span><BandPill band={cur.band} />
          </div>
          <div className="w-full space-y-2">
            {lenses.map((l) => (
              <div key={l.k} className="grid grid-cols-[92px_1fr_38px] items-center gap-2 text-[12px]">
                <span className="text-muted">{l.label}</span>
                <span className="relative h-1.5 rounded-full bg-ink-4">
                  <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: l.c }} animate={{ width: `${(cur.dims[l.k] ?? 0) * 100}%` }} transition={{ duration: 0.5 }} />
                  <span className="absolute -top-1 h-3.5 w-px bg-fg/70" style={{ left: `${(v.dims[l.k] ?? 0) * 100}%` }} title="original" />
                </span>
                <span className="tnum text-right font-mono text-[11px] text-silver">{(cur.dims[l.k] ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className="w-full rounded-lg border border-line bg-ink-1 px-3 py-2 text-[12.5px] text-silver">
            <span className="font-mono text-[10.5px]" style={{ color: BAND_COLOR[cur.band] }}>RULE · </span>
            {cur.rule_fired ? RULE[cur.rule_fired] ?? cur.rule_fired : "none fired; calibrated score decides"}
            {off.size > 0 && cur.rule_fired !== v.rule_fired && <span className="text-dim"> (was {v.rule_fired ? RULE[v.rule_fired] : "none"})</span>}
          </p>
        </div>
      </div>
    </section>
  );
}

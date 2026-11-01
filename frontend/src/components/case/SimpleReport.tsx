import { AlertTriangle, ChevronDown, HelpCircle, Microscope, Phone, ShieldAlert, ShieldCheck } from "lucide-react";
import type { ResponsePlan } from "@/components/app/WhatNow";
import { useApi } from "@/lib/hooks";
import { HEADLINE, plainReasons, plainSeverity, type Tone } from "@/lib/plain";
import type { CaseDetail } from "@/lib/types";
import { setViewMode } from "@/lib/viewMode";

const TONE: Record<Tone, { color: string; icon: typeof ShieldAlert }> = {
  danger: { color: "var(--color-crimson)", icon: ShieldAlert },
  caution: { color: "var(--color-amber)", icon: AlertTriangle },
  safe: { color: "var(--color-mint)", icon: ShieldCheck },
  unsure: { color: "var(--color-violet)", icon: HelpCircle },
};

/**
 * The forensic report for the person who got the call: one answer, the reasons in everyday words, and what to do,
 * in large type. Everything comes from the same case data the expert view shows.
 */
export function SimpleReport({ detail }: { detail: CaseDetail }) {
  const { data: plan } = useApi<ResponsePlan>(`/v1/cases/${detail.id}/response`, [detail.id]);
  const sev = plainSeverity(detail);
  const h = HEADLINE[sev] ?? HEADLINE.INCONCLUSIVE;
  const t = TONE[h.tone];
  const reasons = plainReasons(detail);
  const urgent = h.tone === "danger";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="overflow-hidden rounded-3xl border-2 p-6 sm:p-8" style={{ borderColor: `color-mix(in oklab, ${t.color} 55%, transparent)`, background: `linear-gradient(160deg, color-mix(in oklab, ${t.color} 16%, transparent), transparent 70%)` }}>
        <div className="flex items-start gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, ${t.color} 20%, transparent)`, color: t.color }}>
            <t.icon size={34} />
          </span>
          <div>
            <h2 className="text-[clamp(1.6rem,3.4vw,2.2rem)] font-semibold leading-tight tracking-tight" style={{ color: t.color }}>{h.title}</h2>
            <p className="mt-2 text-[18px] leading-relaxed text-fg">{h.line}</p>
          </div>
        </div>
        {urgent && plan?.report_to.some((r) => r.id === "1930") && (
          <a href="tel:1930" className="mt-6 flex items-center justify-center gap-3 rounded-2xl bg-crimson-deep px-6 py-4 text-[19px] font-semibold text-white shadow-[0_10px_30px_-10px_var(--color-crimson)] hover:bg-crimson">
            <Phone size={22} /> If you already paid, call 1930 now
          </a>
        )}
      </section>

      <section className="panel p-6">
        <h3 className="text-[19px] font-semibold text-fg">Why we think so</h3>
        <ul className="mt-4 space-y-3">
          {reasons.map((r) => (
            <li key={r} className="flex gap-3 text-[17px] leading-relaxed text-silver">
              <span className="mt-2.5 size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />{r}
            </li>
          ))}
        </ul>
      </section>

      {plan && (
        <section className="panel p-6">
          <h3 className="text-[19px] font-semibold text-fg">What to do now</h3>
          <ol className="mt-4 space-y-3">
            {plan.do_now.slice(0, 4).map((s, i) => (
              <li key={i} className="flex gap-4 rounded-2xl border border-line bg-ink-1/60 p-4 text-[17px] leading-relaxed text-fg">
                <span className="grid size-9 shrink-0 place-items-center rounded-full text-[17px] font-semibold text-ink-0" style={{ background: t.color }}>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          {plan.say_this && (
            <div className="mt-4 rounded-2xl border border-cyan/30 bg-cyan/[0.07] p-4">
              <p className="text-[14px] font-medium text-cyan">If they call again, say:</p>
              <p className="mt-1 text-[18px] text-fg">“{plan.say_this}”</p>
            </div>
          )}
          {plan.if_paid.length > 0 && (
            <details className="group mt-4 rounded-2xl border border-line p-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[17px] font-medium text-fg">
                <ChevronDown size={18} className="transition-transform group-open:rotate-180" /> I already paid or shared a code
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-6 text-[16px] leading-relaxed text-silver">{plan.if_paid.map((s) => <li key={s}>{s}</li>)}</ol>
            </details>
          )}
        </section>
      )}

      <button onClick={() => setViewMode("expert")} className="mx-auto flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[13px] text-muted hover:border-line-2 hover:text-fg">
        <Microscope size={14} /> See the full forensic report
      </button>
    </div>
  );
}

import { AlertTriangle, Check, Copy, ExternalLink, Phone, ShieldAlert, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cx } from "@/lib/format";

export interface ResponsePlan {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INCONCLUSIVE";
  category: string;
  category_label: string;
  headline: string;
  do_now: string[];
  dont: string[];
  say_this: string | null;
  report_to: { id: string; label: string; href: string | null; why: string }[];
  if_paid: string[];
  preserve: string[];
}

export const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--color-crimson)",
  HIGH: "var(--color-crimson)",
  MEDIUM: "var(--color-amber)",
  LOW: "var(--color-mint)",
  INCONCLUSIVE: "var(--color-silver)",
};

/** The golden hour: money reported to 1930 within about an hour can often still be frozen in transit. */
function GoldenHour() {
  const [left, setLeft] = useState(60 * 60);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const m = String(Math.floor(left / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-crimson/40 bg-crimson/10 px-4 py-3">
      <Timer className="shrink-0 text-crimson" size={20} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-fg">Golden hour running</p>
        <p className="text-[12px] text-muted">Report before the clock runs out: banks can still freeze money in transit.</p>
      </div>
      <span className="tnum font-mono text-[22px] text-crimson">{m}:{s}</span>
    </div>
  );
}

export function WhatNow({ plan, compact = false }: { plan: ResponsePlan; compact?: boolean }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const [paid, setPaid] = useState(false);
  const color = SEVERITY_COLOR[plan.severity] ?? "var(--color-silver)";
  const urgent = plan.severity === "CRITICAL" || plan.severity === "HIGH";
  const toggle = (i: number) => setDone((d) => { const n = new Set(d); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <section className="panel overflow-hidden" style={{ borderColor: `color-mix(in oklab, ${color} 35%, transparent)` }}>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4" style={{ background: `color-mix(in oklab, ${color} 9%, transparent)` }}>
        {urgent ? <ShieldAlert style={{ color }} size={22} /> : <AlertTriangle style={{ color }} size={20} />}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10.5px] tracking-[0.14em]" style={{ color }}>WHAT NOW · {plan.severity}</p>
          <p className="text-[17px] font-medium text-fg">{plan.headline}</p>
          <p className="text-[12.5px] text-muted">{plan.category_label}</p>
        </div>
        {plan.report_to.find((r) => r.id === "1930") && (
          <a href="tel:1930" className="flex items-center gap-2 rounded-full bg-crimson-deep px-4 py-2 text-[13px] font-medium text-white hover:bg-crimson">
            <Phone size={14} /> Call 1930
          </a>
        )}
      </div>

      <div className={cx("grid gap-5 p-5", !compact && "lg:grid-cols-2")}>
        <div className="space-y-4">
          <div>
            <p className="label mb-2">Do this now</p>
            <ol className="space-y-2">
              {plan.do_now.map((s, i) => (
                <li key={i}>
                  <button onClick={() => toggle(i)} className="flex w-full items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-left transition-colors hover:border-line-2">
                    <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border text-[11px]",
                      done.has(i) ? "border-mint bg-mint text-ink-0" : "border-line-2 text-dim")}>
                      {done.has(i) ? <Check size={12} /> : i + 1}
                    </span>
                    <span className={cx("text-[13.5px] leading-snug", done.has(i) ? "text-dim line-through" : "text-silver")}>{s}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          {plan.say_this && (
            <div className="rounded-xl border border-cyan/30 bg-cyan/[0.05] p-3">
              <p className="label mb-1 !text-cyan">Say this, then hang up</p>
              <div className="flex items-start gap-2">
                <p className="flex-1 text-[15px] text-fg">"{plan.say_this}"</p>
                <button aria-label="Copy" className="text-dim hover:text-fg"
                  onClick={() => { navigator.clipboard?.writeText(plan.say_this!); toast.success("Copied"); }}>
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}
          {plan.dont.length > 0 && (
            <div>
              <p className="label mb-2">Don't</p>
              <ul className="space-y-1.5">
                {plan.dont.map((s, i) => <li key={i} className="flex gap-2 text-[13px] text-silver"><span className="text-crimson">✕</span>{s}</li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {plan.report_to.length > 0 && (
            <div>
              <p className="label mb-2">Report to</p>
              <div className="space-y-2">
                {plan.report_to.map((r) => (
                  <a key={r.id} href={r.href ?? undefined} target={r.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
                    className={cx("block rounded-lg border border-line px-3 py-2", r.href && "hover:border-cyan/40")}>
                    <span className="flex items-center gap-2 text-[13.5px] text-fg">{r.label}{r.href?.startsWith("http") && <ExternalLink size={12} className="text-dim" />}</span>
                    <span className="text-[12px] text-muted">{r.why}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          {plan.if_paid.length > 0 && (
            <div>
              <button onClick={() => setPaid((p) => !p)}
                className={cx("w-full rounded-xl border px-4 py-2.5 text-left text-[13.5px] transition-colors",
                  paid ? "border-crimson/50 bg-crimson/10 text-crimson" : "border-line-2 text-silver hover:border-crimson/40")}>
                {paid ? "Money already moved: follow these steps" : "Already paid or shared a code? Tap here"}
              </button>
              {paid && (
                <div className="mt-3 space-y-2">
                  <GoldenHour />
                  <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-silver">
                    {plan.if_paid.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              )}
            </div>
          )}
          {plan.preserve.length > 0 && (
            <div>
              <p className="label mb-2">Keep the evidence</p>
              <ul className="space-y-1 text-[12.5px] text-muted">{plan.preserve.map((s, i) => <li key={i}>· {s}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

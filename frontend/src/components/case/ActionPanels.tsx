import { Check, Download, FileText, LifeBuoy, Phone, Send, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { ETag, PanelHead, Segmented } from "@/components/ui/primitives";
import { downloadReport, post } from "@/lib/api";
import { bytes, clock, cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { CaseDetail } from "@/lib/types";

export function VerifyPanel({ detail, onChange, compact = false }: { detail: CaseDetail; onChange: (d: CaseDetail) => void; compact?: boolean }) {
  const v = detail.verdict!;
  const [mode, setMode] = useState<"verify" | "paid">("verify");
  const { data: paid } = useApi<{ id: string; title: string; why: string }[]>(mode === "paid" ? "/v1/playbooks/already-paid" : null, [mode]);
  const [busy, setBusy] = useState<string | null>(null);
  const done = v.verification_plan.filter((s) => s.done).length;

  const mark = async (step: string) => {
    setBusy(step);
    try {
      onChange(await post<CaseDetail>(`/v1/cases/${detail.id}/verify`, { step, outcome: "done" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const close = async (outcome: string) => {
    try {
      onChange(await post<CaseDetail>(`/v1/cases/${detail.id}/close`, { outcome }));
      toast.success(outcome === "confirmed_fraud" ? "Closed as fraud. Beneficiaries flagged for future cases." : "Case closed.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const call = v.verification_plan.find((s) => s.id === "call_directory");

  return (
    <section className={cx("panel", v.band === "HIGH" && "border-mint/20")}>
      <PanelHead title="Verify before you act" meta={`${done}/${v.verification_plan.length} done`}
        right={!compact && <Segmented value={mode} onChange={setMode} options={[{ value: "verify", label: "Verify" }, { value: "paid", label: "Already paid?" }]} />} />
      <div className="p-4">
        <AnimatePresence mode="wait">
          {mode === "verify" ? (
            <motion.ul key="v" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
              {v.verification_plan.map((s) => (
                <li key={s.id}>
                  <button disabled={s.done || busy !== null} onClick={() => mark(s.id)}
                    className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.03] disabled:cursor-default">
                    <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors", s.done ? "border-mint bg-mint text-ink-0" : "border-line-2 group-hover:border-mint/60")}>
                      {s.done ? <Check size={12} strokeWidth={3} /> : busy === s.id ? <span className="size-2 animate-ping rounded-full bg-mint" /> : null}
                    </span>
                    <span>
                      <span className={cx("block text-[13.5px]", s.done ? "text-muted line-through decoration-muted/40" : "text-fg")}>{s.title}</span>
                      {!compact && <span className="block text-[12px] leading-snug text-muted">{s.why}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          ) : (
            <motion.ol key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {(paid ?? []).map((s, i) => (
                <li key={s.id} className="flex gap-3 rounded-lg border border-amber/20 bg-amber/[0.04] px-3 py-2.5">
                  <span className="tnum font-mono text-[12px] text-amber">{i + 1}</span>
                  <span><span className="block text-[13.5px] text-fg">{s.title}</span><span className="block text-[12px] text-muted">{s.why}</span></span>
                </li>
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
        {call && mode === "verify" && (
          <Button variant="safe" className="mt-4 w-full" icon={<Phone size={15} />} onClick={() => mark("call_directory")} disabled={call.done}>
            {call.done ? "Callback recorded" : call.title}
          </Button>
        )}
        {!compact && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="label mb-2">Close the case</p>
            {detail.closed ? (
              <p className="text-[13px] text-muted">Closed · <span className="text-fg">{detail.outcome?.replace("_", " ")}</span></p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="danger" icon={<ShieldAlert size={13} />} onClick={() => close("confirmed_fraud")}>Confirmed fraud</Button>
                <Button size="sm" variant="outline" onClick={() => close("verified_genuine")}>Verified genuine</Button>
                <Button size="sm" variant="ghost" icon={<LifeBuoy size={13} />} onClick={() => close("already_paid")}>Already paid</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

interface AskAnswer { answer: string; citations: { id: string; title: string; heading: string }[]; evidence: { id: string }[] }

export function AskPanel({ caseId, onCite }: { caseId: string; onCite: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a?: AskAnswer }[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setLog((l) => [...l, { q: question }]);
    setQ("");
    setBusy(true);
    try {
      const a = await post<AskAnswer>(`/v1/cases/${caseId}/ask`, { question });
      setLog((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, a } : x)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel flex flex-col">
      <PanelHead title="Ask MIRAGE" meta="answers from this case + the casebook" />
      <div className="max-h-[380px] flex-1 space-y-4 overflow-y-auto p-4">
        {log.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {["Why is this high if the voice sounds real?", "What should I do right now?", "Is this beneficiary known?", "Which policy applies?"].map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-line-2 px-3 py-1.5 text-[12.5px] text-silver hover:border-cyan/40 hover:text-fg">{s}</button>
            ))}
          </div>
        )}
        {log.map((x, i) => (
          <div key={i} className="space-y-2">
            <p className="text-[13.5px] text-fg">› {x.q}</p>
            {x.a ? (
              <div className="rounded-lg border border-line bg-ink-1 p-3 text-[13.5px] leading-relaxed text-silver">
                {x.a.answer.split(/(\[[^\]]+\])/).map((part, j) => {
                  const m = part.match(/^\[(E\d+)\]$/);
                  if (m) return <ETag key={j} id={m[1]} onClick={() => onCite(m[1])} />;
                  const c = part.match(/^\[([a-z_]+#\d+)\]$/);
                  if (c) return <span key={j} className="mx-0.5 rounded border border-violet/30 bg-violet/10 px-1 font-mono text-[10px] text-violet">{c[1]}</span>;
                  return <span key={j}>{part}</span>;
                })}
              </div>
            ) : <div className="skeleton h-14" />}
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex gap-2 border-t border-line p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this case…" className="h-9 flex-1 rounded-lg border border-line bg-ink-1 px-3 text-[13.5px] outline-none placeholder:text-dim focus:border-cyan/50" />
        <Button size="sm" type="submit" loading={busy} icon={<Send size={13} />}>Ask</Button>
      </form>
    </section>
  );
}

export function ReportPanel({ detail }: { detail: CaseDetail }) {
  const v = detail.verdict!;
  const [busy, setBusy] = useState(false);
  const dl = async () => {
    setBusy(true);
    try {
      await downloadReport(detail.id);
      toast.success("Incident report downloaded.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="panel overflow-hidden">
        <PanelHead title="Incident report · preview" meta="CERT-In style · TLP:AMBER" right={<Button size="sm" icon={<Download size={13} />} loading={busy} onClick={dl}>Export PDF</Button>} />
        <article className="mx-auto max-w-3xl space-y-6 bg-[#f6f7f9] p-8 text-[13px] leading-relaxed text-[#0b1020] sm:m-5 sm:rounded-lg">
          <header className="border-b border-[#cbd5e1] pb-4">
            <p className="font-mono text-[10px] tracking-[0.14em] text-[#475569]">TLP:AMBER · MIRAGE INCIDENT REPORT</p>
            <h2 className="mt-1 text-xl font-semibold">{detail.id} — {detail.title}</h2>
            <p className="mt-1 font-mono text-[10.5px] text-[#475569]">{v.model_version} · {v.policy_version}</p>
          </header>
          <div className="flex items-start gap-4">
            <span className="rounded px-3 py-1.5 font-semibold text-white" style={{ background: v.band === "HIGH" ? "#e11d48" : v.band === "MEDIUM" ? "#d97706" : v.band === "LOW" ? "#059669" : "#64748b" }}>{v.band} · {v.risk.toFixed(0)}</span>
            <p>{v.summary}</p>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-[#0891b2]">Reasons</h3>
            <ul className="list-disc space-y-1 pl-5">{v.reasons.map((r, i) => <li key={i}>{r.text} {r.evidence_ids.map((e) => `[${e}]`).join(" ")}</li>)}</ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-[#0891b2]">Recommended response</h3>
            <ul className="space-y-1">{v.verification_plan.map((s) => <li key={s.id}>{s.done ? "☑" : "☐"} <b>{s.title}</b> — {s.why}</li>)}</ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-[#0891b2]">Tribunal record</h3>
            {detail.tribunal.map((m) => <p key={m.seq}><b className="capitalize">{m.agent}</b>: {m.content}</p>)}
          </div>
        </article>
      </section>
      <section className="panel h-fit">
        <PanelHead title="Chain of custody" meta="SHA-256" />
        <ul className="divide-y divide-line">
          {detail.artifacts.map((a) => (
            <li key={a.id} className="space-y-1 px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] text-fg"><FileText size={13} className="text-muted" />{a.filename}</p>
              <p className="break-all font-mono text-[10.5px] text-muted">{a.sha256}</p>
              <p className="font-mono text-[10.5px] text-dim">{a.kind} · {bytes(a.size_bytes)}</p>
            </li>
          ))}
          {detail.message_text && <li className="px-4 py-3 text-[12.5px] text-muted">Message text · {detail.message_text.length} characters</li>}
        </ul>
        <div className="border-t border-line p-4">
          <p className="label mb-2">Verification log</p>
          {detail.verifications.length ? detail.verifications.map((x, i) => (
            <p key={i} className="font-mono text-[11px] text-silver">{clock(x.ts)} · {x.step.replace(/_/g, " ")} · {x.outcome} <span className="text-dim">({x.actor})</span></p>
          )) : <p className="text-[12.5px] text-dim">No steps recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}

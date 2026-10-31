import { Check, Copy, Download, ExternalLink, FileText, Phone, PlugZap, RotateCcw, ShieldAlert, Swords, Timer, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { PanelHead, Skeleton } from "@/components/ui/primitives";
import { api, getToken, post } from "@/lib/api";
import { cx, inr } from "@/lib/format";

interface Action { id: string; title: string; why: string; kind: string; weight: number; status: "todo" | "done"; result: null | Record<string, any>; at: string | null; needs_payment: boolean; active: boolean }
interface Stage { id: string; title: string; subtitle: string; actions: Action[]; done: number; total: number }
interface Cure {
  case_id: string;
  context: { category: string; category_label: string; band: string; synthetic: boolean; amount_inr: number | null; upi: string[]; accounts: string[];
    person: null | { name: string; phone: string; circle: string }; claimed: string; org: boolean };
  stages: Stage[];
  paid: null | { amount_inr: number | null; at: string; txn: string; to: string; method: string };
  golden: null | { minutes: number; window: string; recall_chance: string; paid_at: string };
  exposure: { remaining_pct: number; amount_inr: number | null; remaining_inr: number | null; label: string };
  others: { case_id: string; title: string; submitted_by: string; shared: string[]; band: string | null }[];
  drill_attack: string | null;
}
type Drafts = Record<string, { title: string; text: string; link?: string }>;

const STAGE_COLOR: Record<string, string> = { contain: "#fb7185", verify: "#67e8f9", recover: "#fbbf24", report: "#a78bfa", immunise: "#6ee7b7" };

function GoldenClock({ paidAt }: { paidAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const elapsed = Math.max(0, (now - new Date(paidAt).getTime()) / 1000);
  const left = Math.max(0, 3600 - elapsed);
  const over = left === 0;
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className={cx("rounded-xl border px-4 py-3", over ? "border-amber/40 bg-amber/[0.06]" : "border-crimson/40 bg-crimson/[0.08]")}>
      <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.14em]" style={{ color: over ? "#fbbf24" : "#fb7185" }}><Timer size={12} />{over ? "GOLDEN HOUR PASSED" : "GOLDEN HOUR LEFT"}</p>
      <p className="tnum font-mono text-[34px] leading-tight" style={{ color: over ? "#fbbf24" : "#fb7185" }}>{over ? `+${fmt(elapsed - 3600)}` : fmt(left)}</p>
      <p className="text-[11.5px] text-muted">{over ? "Recovery is still possible the same day. Call 1930 and your bank now." : "Banks can still freeze money in transit. Recovery actions are unlocked below."}</p>
    </div>
  );
}

/** Exposure: share of money or access still at risk; falls as weighted response actions are completed. */
function Exposure({ e }: { e: Cure["exposure"] }) {
  const pct = e.remaining_pct;
  const color = pct > 66 ? "#fb7185" : pct > 33 ? "#fbbf24" : "#6ee7b7";
  const r = 46, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90 shrink-0">
        <circle cx="56" cy="56" r={r} fill="none" stroke="var(--color-ink-4)" strokeWidth="9" />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1), stroke 0.4s" }} />
      </svg>
      <div>
        <p className="font-mono text-[10.5px] tracking-[0.14em] text-dim">EXPOSURE</p>
        <p className="tnum text-[30px] font-semibold leading-none" style={{ color }}>{pct}%</p>
        <p className="mt-1 text-[12.5px] text-muted">{e.amount_inr ? <>{inr(e.remaining_inr ?? 0)} of {inr(e.amount_inr)} still at risk</> : e.label}</p>
      </div>
    </div>
  );
}

function PaidForm({ cure, onDone }: { cure: Cure; onDone: (c: Cure) => void }) {
  const [amount, setAmount] = useState(String(cure.context.amount_inr ?? ""));
  const [txn, setTxn] = useState("");
  const [to, setTo] = useState([...cure.context.upi, ...cure.context.accounts][0] ?? "");
  const [ago, setAgo] = useState("0");
  const submit = async () => {
    const at = new Date(Date.now() - Number(ago || 0) * 60000).toISOString();
    onDone(await post<Cure>(`/v1/cases/${cure.case_id}/cure/paid`, { amount_inr: amount ? Number(amount) : null, txn, to, at }));
    toast.error("Recovery mode: the golden-hour clock is running");
  };
  const field = "h-9 w-full rounded-lg border border-line-2 bg-ink-1 px-3 text-[13px] outline-none focus:border-crimson/60";
  return (
    <div className="space-y-2 rounded-xl border border-crimson/40 bg-crimson/[0.05] p-4">
      <p className="text-[13.5px] text-fg">Money already moved? Enter what you know: it fills every recovery document.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-muted">Amount (₹)<input className={field} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="text-[11px] text-muted">Minutes ago<input className={field} value={ago} onChange={(e) => setAgo(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="text-[11px] text-muted">Transaction / UTR<input className={field} value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="from the bank SMS" /></label>
        <label className="text-[11px] text-muted">Paid to<input className={field} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <Button variant="danger" size="sm" onClick={submit} icon={<Timer size={14} />}>Start recovery</Button>
    </div>
  );
}

export function CureConsole({ caseId }: { caseId: string }) {
  const nav = useNavigate();
  const [cure, setCure] = useState<Cure | null>(null);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [paidForm, setPaidForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const c = await api<Cure>(`/v1/cases/${caseId}/cure`);
    setCure(c);
    setDrafts(await api<Drafts>(`/v1/cases/${caseId}/cure/drafts`));
  }, [caseId]);
  useEffect(() => { load().catch((e) => toast.error((e as Error).message)); }, [load]);

  const refreshDrafts = async () => setDrafts(await api<Drafts>(`/v1/cases/${caseId}/cure/drafts`));
  const act = async (a: Action, body: Record<string, unknown> = {}) => {
    setBusy(a.id);
    try {
      const c = await post<Cure>(`/v1/cases/${caseId}/cure/actions/${a.id}`, body);
      setCure(c);
      const r = c.stages.flatMap((s) => s.actions).find((x) => x.id === a.id)?.result;
      if (r?.message && !body.undo) toast.success(r.message);
      refreshDrafts();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const downloadPack = async (a: Action) => {
    const res = await fetch(`/v1/cases/${caseId}/cure/evidence-pack`, { headers: { authorization: `Bearer ${getToken() ?? ""}` } });
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement("a"), { href: url, download: `${caseId}-evidence-pack.zip` }).click();
    URL.revokeObjectURL(url);
    if (a.status !== "done") act(a);
  };

  if (!cure) return <Skeleton className="h-[480px]" />;
  const all = cure.stages.flatMap((s) => s.actions);
  const done = all.filter((a) => a.status === "done").length;
  const draftFor: Record<string, string> = { challenge: "challenge", call_1930: "call_1930", bank_recall: "bank_recall", complaint: "complaint", chakshu: "chakshu", cert_in: "cert_in", warn_network: "warn_network" };
  const d = open && drafts?.[open];

  return (
    <div className="space-y-4">
      {/* header: what happened, what is still at risk, the clock */}
      <section className="panel overflow-hidden">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_auto_1fr] lg:items-center">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.14em] text-crimson"><ShieldAlert size={13} />CURE CONSOLE · {cure.context.band}</p>
            <h2 className="mt-1 text-[21px] font-medium text-fg">{cure.context.category_label}</h2>
            <p className="mt-1 text-[13px] text-muted">
              {cure.context.synthetic ? "Machine-generated media" : "Impersonation"} claiming to be <span className="text-silver">{cure.context.person?.name ?? cure.context.claimed}</span>.
              {" "}{done} of {all.length} response actions done.
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-4">
              <div className="h-full rounded-full bg-mint transition-[width] duration-700" style={{ width: `${(done / Math.max(1, all.length)) * 100}%` }} />
            </div>
          </div>
          <Exposure e={cure.exposure} />
          <div>
            {cure.golden ? (
              <div className="space-y-2">
                <GoldenClock paidAt={cure.golden.paid_at} />
                <button onClick={async () => setCure(await post<Cure>(`/v1/cases/${caseId}/cure/paid`, { clear: true }))} className="flex items-center gap-1 text-[11.5px] text-dim hover:text-fg"><RotateCcw size={11} />Nothing was paid after all</button>
              </div>
            ) : paidForm ? <PaidForm cure={cure} onDone={(c) => { setCure(c); setPaidForm(false); refreshDrafts(); }} /> : (
              <button onClick={() => setPaidForm(true)} className="w-full rounded-xl border border-crimson/40 px-4 py-4 text-left transition-colors hover:bg-crimson/[0.06]">
                <p className="text-[14px] text-crimson">Already paid or shared a code?</p>
                <p className="text-[12px] text-muted">Switch to recovery mode: starts the golden-hour clock and unlocks 1930 and bank recall.</p>
              </button>
            )}
          </div>
        </div>
        {/* stage rail */}
        <div className="grid grid-cols-5 border-t border-line">
          {cure.stages.map((s) => (
            <a key={s.id} href={`#stage-${s.id}`} className="border-r border-line px-3 py-2.5 last:border-r-0 hover:bg-white/[0.02]">
              <p className="font-mono text-[10px] tracking-[0.14em]" style={{ color: STAGE_COLOR[s.id] }}>{s.title.toUpperCase()}</p>
              <p className="tnum text-[12.5px] text-silver">{s.done}/{s.total}</p>
            </a>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {cure.stages.map((s) => (
            <section key={s.id} id={`stage-${s.id}`} className="panel scroll-mt-28">
              <div className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3">
                <p className="text-[14px] text-fg"><span className="mr-2 font-mono text-[11px]" style={{ color: STAGE_COLOR[s.id] }}>{s.title.toUpperCase()}</span>{s.subtitle}</p>
                <span className="font-mono text-[11px] text-dim">{s.done}/{s.total}</span>
              </div>
              <ul className="divide-y divide-line">
                {s.actions.map((a) => {
                  const isDone = a.status === "done";
                  const locked = !a.active;
                  return (
                    <li key={a.id} className={cx("flex flex-wrap items-start gap-3 px-5 py-3.5", locked && "opacity-45")}>
                      <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border", isDone ? "border-mint bg-mint text-ink-0" : "border-line-2 text-dim")}>
                        {isDone ? <Check size={13} /> : a.kind === "connector" ? <PlugZap size={12} /> : a.kind === "draft" ? <FileText size={12} /> : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cx("text-[13.5px]", isDone ? "text-silver" : "text-fg")}>{a.title}</p>
                        <p className="text-[12px] text-muted">{locked ? "Unlocks when you report that money already moved." : a.why}</p>
                        {a.result?.message && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-mint">
                            {a.result.reference && <span className="rounded border border-mint/30 px-1.5 font-mono text-[11px]">{a.result.reference}</span>}
                            {a.result.simulated && <span className="rounded border border-amber/40 px-1.5 font-mono text-[10px] text-amber">SIMULATED</span>}
                            {a.result.message}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {a.id === "callback" && !isDone && (
                          <>
                            {cure.context.person?.phone && <a href={`tel:${cure.context.person.phone}`} className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan/40 px-2.5 text-[12px] text-cyan"><Phone size={12} />{cure.context.person.phone}</a>}
                            <button disabled={!!busy} onClick={() => act(a, { outcome: "denied" })} className="h-8 rounded-lg bg-crimson-deep px-2.5 text-[12px] text-white">They denied it</button>
                            <button disabled={!!busy} onClick={() => act(a, { outcome: "confirmed" })} className="h-8 rounded-lg border border-mint/40 px-2.5 text-[12px] text-mint">They confirmed</button>
                          </>
                        )}
                        {draftFor[a.id] && !locked && (
                          <button onClick={() => setOpen(draftFor[a.id])} className="flex h-8 items-center gap-1.5 rounded-lg border border-line-2 px-2.5 text-[12px] text-silver hover:text-fg"><FileText size={12} />Open draft</button>
                        )}
                        {a.id === "evidence_pack" && <button onClick={() => downloadPack(a)} className="flex h-8 items-center gap-1.5 rounded-lg border border-line-2 px-2.5 text-[12px] text-silver hover:text-fg"><Download size={12} />ZIP</button>}
                        {a.id === "drill" && cure.drill_attack && (
                          <button onClick={() => { if (!isDone) act(a); nav(`/app/redteam?attack=${cure.drill_attack}`); }} className="flex h-8 items-center gap-1.5 rounded-lg border border-line-2 px-2.5 text-[12px] text-silver hover:text-fg"><Swords size={12} />Open drill</button>
                        )}
                        {a.id !== "callback" && !locked && (
                          isDone
                            ? <button onClick={() => act(a, { undo: true })} className="grid size-8 place-items-center rounded-lg text-dim hover:text-fg" aria-label="Undo"><RotateCcw size={13} /></button>
                            : <button disabled={busy === a.id} onClick={() => act(a)}
                                className={cx("h-8 rounded-lg px-3 text-[12px] font-medium", a.kind === "connector" || a.kind === "effect" ? "bg-cyan text-ink-0" : "border border-line-2 text-fg hover:border-mint/50")}>
                                {busy === a.id ? "…" : a.kind === "connector" ? "Run" : a.kind === "effect" ? "Apply" : "Done"}
                              </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* the whole rail is sticky (not each panel), so an open draft never slides over the panel below it */}
        <aside className="space-y-4 self-start xl:sticky xl:top-20">
          {d ? (
            <section className="panel">
              <PanelHead title={d.title} right={<button onClick={() => setOpen(null)} aria-label="Close draft" className="text-dim hover:text-fg"><X size={15} /></button>} />
              <div className="space-y-3 p-4">
                <pre className="max-h-[44vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-ink-1 p-3 font-mono text-[11.5px] leading-relaxed text-silver">{d.text}</pre>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" icon={<Copy size={13} />} onClick={() => { navigator.clipboard?.writeText(d.text); toast.success("Copied"); }}>Copy</Button>
                  {d.link && <a href={d.link} target={d.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex h-8 items-center gap-1.5 rounded-lg border border-line-2 px-3 text-[13px] text-fg"><ExternalLink size={13} />Open {d.link.startsWith("tel") ? "dialler" : d.link.startsWith("mailto") ? "email" : "portal"}</a>}
                </div>
                <p className="text-[11px] text-dim">Pre-filled from the case evidence. Review before sending; MIRAGE never files on your behalf.</p>
              </div>
            </section>
          ) : (
            <section className="panel p-4 text-[12.5px] text-muted">
              <p className="label mb-1">Drafts</p>Open any draft to review the pre-filled complaint, 1930 script, bank recall, Chakshu report or warning.
            </section>
          )}
          <section className="panel">
            <PanelHead title="Who else was targeted" meta="same accounts or numbers" />
            <div className="p-4">
              {cure.others.length ? (
                <ul className="space-y-2">
                  {cure.others.map((o) => (
                    <li key={o.case_id}>
                      <button onClick={() => nav(`/app/cases/${o.case_id}/respond`)} className="w-full rounded-lg border border-line px-3 py-2 text-left hover:border-line-2">
                        <p className="flex items-center gap-2 text-[12.5px] text-fg"><Users size={12} className="text-amber" /><span className="font-mono text-[11px] text-dim">{o.case_id}</span><span className="truncate">{o.title}</span></p>
                        <p className="truncate font-mono text-[10.5px] text-muted">shared: {o.shared.join(", ")} · {o.submitted_by}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[12.5px] text-muted">No other case shares these identifiers yet. Blocking them makes any future one escalate.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

import { CheckCheck, Flag, Inbox, Mail, MessageCircle, Phone, Play, Send, ShieldCheck, Smartphone, Target, Video, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/kit/StateKit";
import { Button } from "@/components/ui/Button";
import { PanelHead, Skeleton } from "@/components/ui/primitives";
import { api, getToken, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, cx } from "@/lib/format";

interface Drill {
  id: string; campaign: string; channel: string; sender: string; text: string; has_audio: boolean; created_at: string;
  response: Choice | null; responded_at: string | null; target?: string; attack?: string; attack_title?: string; levers?: string[]; defence?: string;
}
type Choice = "complied" | "verified" | "reported" | "ignored";
interface Stats { sent: number; complied: number; verified: number; reported: number; ignored: number; pending: number; median_s: number | null }
interface Board { totals: Stats; campaigns: (Stats & { campaign: string; attack: string; created_at: string; drills: Drill[] })[] }

const ICON: Record<string, LucideIcon> = { email: Mail, whatsapp: MessageCircle, phone: Phone, video: Video, sms: Smartphone };
const PERSONAS = [{ id: "employee", name: "Kavita Shah", role: "Accounts payable" }, { id: "admin", name: "Vikram Desai", role: "Head of IT" },
  { id: "analyst", name: "Shreyas Kale", role: "SOC analyst" }, { id: "family", name: "Lata Panchal", role: "Personal safety" }];
const CHOICES: { id: Choice; label: string; hint: string; icon: LucideIcon; cls: string }[] = [
  { id: "complied", label: "Do what it asks", hint: "pay, share, follow the link", icon: Send, cls: "hover:border-crimson/50 hover:text-crimson" },
  { id: "verified", label: "Call back to verify", hint: "on the number you already have", icon: Phone, cls: "hover:border-mint/50 hover:text-mint" },
  { id: "reported", label: "Report to security", hint: "send it to the SOC", icon: Flag, cls: "hover:border-cyan/50 hover:text-cyan" },
  { id: "ignored", label: "Ignore it", hint: "do nothing", icon: CheckCheck, cls: "hover:border-line-2 hover:text-fg" },
];
const OUTCOME: Record<Choice, { label: string; color: string; verdict: string }> = {
  complied: { label: "Complied", color: "var(--color-crimson)", verdict: "In a real attack, the money or code would now be gone." },
  verified: { label: "Verified", color: "var(--color-mint)", verdict: "Exactly right: a callback on a known number defeats a cloned voice." },
  reported: { label: "Reported", color: "var(--color-cyan)", verdict: "Good: the SOC can now warn everyone else this lure reached." },
  ignored: { label: "Ignored", color: "var(--color-silver)", verdict: "Safe for you, but reporting it would have protected colleagues." },
};

/** Stacked outcome bar: the drill's whole result in one line. */
function Outcomes({ s }: { s: Stats }) {
  const parts: [Choice | "pending", number, string][] = [["verified", s.verified, "var(--color-mint)"], ["reported", s.reported, "var(--color-cyan)"],
    ["ignored", s.ignored, "var(--color-silver)"], ["complied", s.complied, "var(--color-crimson)"], ["pending", s.pending, "var(--color-ink-4)"]];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-4" role="img" aria-label={parts.map(([k, v]) => `${v} ${k}`).join(", ")}>
      {parts.map(([k, v, c]) => v ? <span key={k} title={`${v} ${k}`} style={{ width: `${(v / Math.max(1, s.sent)) * 100}%`, background: c }} /> : null)}
    </div>
  );
}

function InboxItem({ d, onAnswered }: { d: Drill; onAnswered: (d: Drill) => void }) {
  const Icon = ICON[d.channel] ?? MessageCircle;
  const [busy, setBusy] = useState<Choice | null>(null);
  const audio = d.has_audio ? `${import.meta.env.VITE_API_URL ?? ""}/v1/drills/${d.id}/audio?token=${encodeURIComponent(getToken() ?? "")}` : null;
  const answer = async (c: Choice) => {
    setBusy(c);
    try { onAnswered(await post<Drill>(`/v1/drills/${d.id}/respond`, { choice: c })); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const o = d.response ? OUTCOME[d.response] : null;
  return (
    <article className={cx("rounded-xl border p-4 transition-colors", o ? "border-line" : "border-line-2 bg-ink-1/40")}>
      <header className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-ink-4 text-silver"><Icon size={14} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-fg">{d.sender}</p>
          <p className="font-mono text-[10.5px] text-dim">{d.channel} · {ago(d.created_at)}</p>
        </div>
        {o && <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px]" style={{ color: o.color, borderColor: `color-mix(in oklab, ${o.color} 40%, transparent)` }}>TRAINING DRILL</span>}
      </header>
      <p className="mt-3 text-[14px] leading-relaxed text-silver">{d.text}</p>
      {audio && <audio controls src={audio} className="mt-3 h-9 w-full" />}
      {!o ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {CHOICES.map((c) => (
            <button key={c.id} onClick={() => answer(c.id)} disabled={busy != null}
              className={cx("flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-left text-silver transition-colors disabled:opacity-50", c.cls)}>
              <c.icon size={14} className={busy === c.id ? "animate-pulse" : undefined} />
              <span><span className="block text-[12.5px]">{c.label}</span><span className="block text-[11px] text-dim">{c.hint}</span></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border px-3 py-2.5" style={{ borderColor: `color-mix(in oklab, ${o.color} 30%, transparent)`, background: `color-mix(in oklab, ${o.color} 6%, transparent)` }}>
          <p className="text-[13px]" style={{ color: o.color }}>You chose: {o.label.toLowerCase()}. {o.verdict}</p>
          {d.attack_title && <p className="mt-1.5 text-[12px] text-muted">This was a simulated <span className="text-silver">{d.attack_title.toLowerCase()}</span> using {d.levers?.join(", ")}. {d.defence}</p>}
        </div>
      )}
    </article>
  );
}

export default function Drills() {
  const { persona } = useAuth();
  const staff = persona?.role === "analyst" || persona?.role === "admin";
  const [inbox, setInbox] = useState<Drill[] | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [attacks, setAttacks] = useState<{ key: string; title: string; levers: string[]; channel: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attack, setAttack] = useState("ceo_voice_wire");
  const [targets, setTargets] = useState<string[]>(["employee"]);
  const [voice, setVoice] = useState(true);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Drill[]>("/v1/drills/inbox").then(setInbox).catch((e) => setError(e.message));
    if (staff) {
      api<Board>("/v1/drills").then(setBoard).catch((e) => setError(e.message));
      api<typeof attacks>("/v1/drills/attacks").then(setAttacks).catch(() => {});
    }
  }, [staff]);
  useEffect(() => { load(); }, [load]);

  const launch = async () => {
    setBusy(true);
    try {
      const r = await post<{ campaign: string; drills: string[]; voice: boolean }>("/v1/drills", { attack, targets, voice, consent_confirmed: consent });
      toast.success(`${r.campaign} sent to ${r.drills.length} inbox${r.drills.length === 1 ? "" : "es"}`, { description: r.voice ? "With a synthetic neural voice note." : voice ? "Text only: no neural voice is available on this machine." : undefined });
      setConsent(false);
      load();
    } catch (e) {
      toast.error("Drill not sent", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (error && !inbox) return <ErrorState title="Drill mode could not load." cause={error} onRetry={load} />;
  const t = board?.totals;
  const pending = (inbox ?? []).filter((d) => !d.response);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-[26px] font-medium tracking-tight">Drill mode</h1>
        <p className="text-[13.5px] text-muted">Consented, simulated attacks from the red-team playbook. The score that matters is how many people verify before they act.</p>
      </header>

      <div className={cx("grid gap-4", staff && "xl:grid-cols-[1fr_1.25fr]")}>
        <section className="panel min-w-0">
          <PanelHead title="Your inbox" meta={pending.length ? `${pending.length} waiting` : "nothing waiting"} right={<Inbox size={14} className="text-dim" />} />
          <div className="space-y-3 p-4">
            {!inbox ? <Skeleton className="h-40" /> : inbox.length ? inbox.map((d) => (
              <InboxItem key={d.id} d={d} onAnswered={(n) => { setInbox((xs) => (xs ?? []).map((x) => (x.id === n.id ? { ...x, ...n } : x))); if (staff) load(); }} />
            )) : <EmptyState icon={Inbox} title="No messages for you." hint={staff ? "Send a drill to yourself to see what your colleagues will see." : "When your security team runs a drill, the message arrives here, and you decide what to do."} />}
          </div>
        </section>

        {staff && (
          <div className="min-w-0 space-y-4">
            <section className="panel">
              <PanelHead title="Launch a drill" right={<Target size={14} className="text-dim" />} />
              <div className="space-y-4 p-4">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {attacks.map((a) => {
                    const Icon = ICON[a.channel] ?? MessageCircle;
                    return (
                      <button key={a.key} onClick={() => setAttack(a.key)} aria-pressed={attack === a.key}
                        className={cx("flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors", attack === a.key ? "border-cyan/50 bg-cyan/[0.06]" : "border-line hover:border-line-2")}>
                        <Icon size={14} className={cx("mt-0.5 shrink-0", attack === a.key ? "text-cyan" : "text-dim")} />
                        <span className="min-w-0"><span className="block truncate text-[12.5px] text-fg">{a.title}</span><span className="block truncate font-mono text-[10.5px] text-dim">{a.levers.join(" · ")}</span></span>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <p className="label mb-1.5">Send to</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PERSONAS.map((p) => {
                      const on = targets.includes(p.id);
                      return (
                        <button key={p.id} aria-pressed={on} onClick={() => setTargets(on ? targets.filter((x) => x !== p.id) : [...targets, p.id])}
                          className={cx("rounded-lg border px-2.5 py-1.5 text-left text-[12px] transition-colors", on ? "border-cyan/40 bg-cyan/[0.07] text-fg" : "border-line text-muted hover:text-silver")}>
                          {p.name}<span className="block font-mono text-[10px] text-dim">{p.role}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[12.5px] text-silver">
                  <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} className="accent-[var(--color-cyan)]" />
                  Attach a synthetic voice note (neural TTS, fictional speaker)
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-line bg-ink-1/50 px-3 py-2.5 text-[12.5px] text-silver">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--color-cyan)]" />
                  Everyone selected has agreed to take part in phishing drills. Recorded in the audit chain.
                </label>
                <Button onClick={launch} disabled={!consent || !targets.length || busy} loading={busy} icon={<Play size={14} />}>Send drill</Button>
              </div>
            </section>

            <section className="panel">
              <PanelHead title="Results" meta={t ? `${t.sent} sent` : undefined} right={<ShieldCheck size={14} className="text-dim" />} />
              {!board ? <div className="p-4"><Skeleton className="h-24" /></div> : !board.campaigns.length ? (
                <EmptyState title="No drills yet." hint="Results appear per drill: who verified, who reported, who complied, and how long they took." />
              ) : (
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([["Verified or reported", t!.verified + t!.reported, "var(--color-mint)"], ["Complied", t!.complied, "var(--color-crimson)"], ["Ignored", t!.ignored, "var(--color-silver)"], ["Waiting", t!.pending, "var(--color-muted)"]] as const).map(([l, v, c]) => (
                      <div key={l}><p className="text-[11.5px] text-muted">{l}</p><p className="tnum text-[22px] font-medium" style={{ color: c }}>{v}</p></div>
                    ))}
                  </div>
                  <ul className="divide-y divide-line">
                    {board.campaigns.map((c) => (
                      <li key={c.campaign} className="py-3">
                        <div className="mb-1.5 flex items-baseline justify-between gap-3">
                          <p className="truncate text-[13px] text-fg">{c.drills[0]?.attack_title ?? c.attack} <span className="font-mono text-[10.5px] text-dim">{c.campaign}</span></p>
                          <p className="shrink-0 font-mono text-[10.5px] text-dim">{ago(c.created_at)}{c.median_s != null && ` · median ${c.median_s < 90 ? `${c.median_s}s` : `${Math.round(c.median_s / 60)}m`} to answer`}</p>
                        </div>
                        <Outcomes s={c} />
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10.5px] text-dim">
                          {c.drills.map((d) => <span key={d.id}>{PERSONAS.find((p) => p.id === d.target)?.name ?? d.target}: <span style={{ color: d.response ? OUTCOME[d.response].color : undefined }}>{d.response ?? "waiting"}</span></span>)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

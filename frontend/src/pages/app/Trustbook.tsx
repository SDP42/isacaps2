import { AlertTriangle, Check, Fingerprint, Mic, Plus, Save, Search, Square, Trash2, Upload, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/kit/StateKit";
import { Button } from "@/components/ui/Button";
import { PanelHead, Segmented, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cx, inr } from "@/lib/format";
import { micError, useRecorder } from "@/lib/recorder";

interface Person {
  id: number; name: string; role: string; department: string; circle: "org" | "family" | "external"; email: string; phone: string;
  approval_limit_inr: number; usual_channels: string[]; usual_hours: [number, number]; aliases: string[];
  voiceprint_enrolled: boolean; voiceprint_kind: "wavlm" | "simulator" | null; code_word_set: boolean; impersonation_count: number;
}

const CHANNELS = ["email", "whatsapp", "phone", "sms", "teams", "video"];
const PROMPTS = [
  "My name is {name}, and I approve payments only through the finance portal.",
  "If I ever ask you to move money urgently, call me back on my saved number first.",
  "Today is a normal working day, and this recording is for my MIRAGE voiceprint.",
];
const BLANK: Omit<Person, "id" | "voiceprint_enrolled" | "voiceprint_kind" | "impersonation_count"> = {
  name: "", role: "", department: "", circle: "org", email: "", phone: "", approval_limit_inr: 0, usual_channels: ["email"],
  usual_hours: [9, 19], aliases: [], code_word_set: false,
};

async function send<T>(path: string, method: string, body: unknown): Promise<T> {
  return api<T>(path, { method, body: body instanceof FormData ? body : JSON.stringify(body) });
}

function PrintBadge({ p }: { p: Person }) {
  if (p.voiceprint_kind === "wavlm") return <span className="inline-flex items-center gap-1 rounded-md border border-mint/30 bg-mint/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-mint"><Fingerprint size={11} />WavLM</span>;
  if (p.voiceprint_kind === "simulator") return <span className="inline-flex items-center gap-1 rounded-md border border-amber/30 bg-amber/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-amber" title="Seeded from the speech simulator. Re-enrol from consented recordings."><AlertTriangle size={11} />simulator</span>;
  return <span className="font-mono text-[10px] text-dim">none</span>;
}

/** Three prompted takes, each recorded or uploaded, then one consented enrolment that checks they match. */
function Enrolment({ p, onDone }: { p: Person; onDone: (p: Person) => void }) {
  const [takes, setTakes] = useState<(File | null)[]>([null, null, null]);
  const [consent, setConsent] = useState(false);
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ takes: { take: number; agreement: number }[]; min_agreement: number; seconds: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const rec = useRecorder();
  const file = useRef<HTMLInputElement>(null);
  const slot = useRef(0);
  useEffect(() => { setTakes([null, null, null]); setResult(null); setConsent(false); setBy(""); }, [p.id]);

  const put = (i: number, f: File | null) => setTakes((t) => t.map((x, j) => (j === i ? f : x)));
  const record = async (i: number) => {
    if (rec.recording) {
      const f = await rec.stop();
      setActive(null);
      if (f) put(i, f); else toast.error("Nothing was recorded. Read the whole sentence.");
      return;
    }
    try { await rec.start(); setActive(i); } catch (e) { toast.error(micError(e)); }
  };
  const submit = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      takes.forEach((t) => t && fd.append("files", t));
      fd.append("consent", String(consent));
      fd.append("consent_by", by);
      const r = await send<{ person: Person; takes: { take: number; agreement: number }[]; min_agreement: number; seconds: number }>(`/v1/identity/people/${p.id}/enroll-guided`, "POST", fd);
      setResult(r);
      onDone(r.person);
      toast.success(`${p.name}'s voiceprint enrolled`, { description: `${r.seconds}s of speech, takes agree at ${r.min_agreement.toFixed(2)} or better.` });
    } catch (e) {
      toast.error("Enrolment refused", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const ready = consent && takes.every(Boolean);

  return (
    <div className="space-y-3">
      <input ref={file} type="file" accept="audio/*,.ogg,.opus,.m4a,.weba" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) put(slot.current, f); e.target.value = ""; }} />
      <ol className="space-y-2">
        {PROMPTS.map((s, i) => {
          const t = takes[i];
          const live = rec.recording && active === i;
          const agree = result?.takes.find((x) => x.take === i + 1)?.agreement;
          return (
            <li key={i} className={cx("rounded-lg border px-3 py-2.5 transition-colors", live ? "border-crimson/50 bg-crimson/[0.05]" : t ? "border-mint/25" : "border-line")}>
              <div className="flex items-start gap-3">
                <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px]", t ? "bg-mint text-ink-0" : "bg-ink-4 text-silver")}>{t ? <Check size={11} /> : i + 1}</span>
                <p className="flex-1 text-[13px] leading-snug text-fg">“{s.replace("{name}", p.name)}”</p>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-8">
                <button onClick={() => record(i)} disabled={rec.recording && active !== i}
                  className={cx("inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors disabled:opacity-40",
                    live ? "border-crimson/60 text-crimson" : "border-line-2 text-silver hover:border-cyan/40 hover:text-fg")}>
                  {live ? <><Square size={10} className="fill-current" />Stop · {rec.seconds}s</> : <><Mic size={12} />{t ? "Re-record" : "Record"}</>}
                </button>
                <button onClick={() => { slot.current = i; file.current?.click(); }} disabled={rec.recording}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:text-fg disabled:opacity-40"><Upload size={12} />Upload</button>
                {t && <span className="truncate font-mono text-[10.5px] text-dim">{t.name.slice(0, 28)} · {(t.size / 1024).toFixed(0)} KB</span>}
                {agree != null && <span className="ml-auto font-mono text-[10.5px] text-mint">match {agree.toFixed(2)}</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <label className="flex items-start gap-2.5 rounded-lg border border-line bg-ink-1/50 px-3 py-2.5 text-[12.5px] text-silver">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--color-cyan)]" />
        <span>{p.name} agreed to have their voice enrolled for fraud checks, and these recordings are their own. Consent is written to the audit chain.</span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Consent recorded by (optional)" aria-label="Consent recorded by"
          className="h-8 flex-1 rounded-lg border border-line-2 bg-transparent px-3 text-[12.5px] outline-none focus:border-cyan/60" />
        <Button size="sm" onClick={submit} disabled={!ready || busy} loading={busy} icon={<Fingerprint size={14} />}>Enrol voiceprint</Button>
      </div>
      <p className="text-[11.5px] leading-relaxed text-dim">MIRAGE embeds each take with WavLM and refuses the enrolment if any two takes sound like different speakers (cosine below 0.75). The stored print is their average.</p>
    </div>
  );
}

export default function Trustbook() {
  const { persona } = useAuth();
  const admin = persona?.role === "admin";
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [circle, setCircle] = useState<"all" | "org" | "family" | "external">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<typeof BLANK | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => api<Person[]>("/v1/identity/people").then((p) => { setPeople(p); setError(null); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const current = typeof sel === "number" ? people?.find((p) => p.id === sel) ?? null : null;
  useEffect(() => {
    if (sel === "new") setDraft({ ...BLANK });
    else if (current) setDraft({ name: current.name, role: current.role, department: current.department, circle: current.circle, email: current.email, phone: current.phone,
      approval_limit_inr: current.approval_limit_inr, usual_channels: current.usual_channels, usual_hours: current.usual_hours, aliases: current.aliases, code_word_set: current.code_word_set });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, current?.id]);

  const rows = useMemo(() => (people ?? []).filter((p) => (circle === "all" || p.circle === circle)
    && `${p.name} ${p.role} ${p.department} ${p.email} ${p.phone}`.toLowerCase().includes(q.toLowerCase())), [people, circle, q]);
  const simulator = (people ?? []).filter((p) => p.voiceprint_kind === "simulator").length;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const p = sel === "new" ? await send<Person>("/v1/identity/people", "POST", draft) : await send<Person>(`/v1/identity/people/${sel}`, "PATCH", draft);
      setPeople((xs) => (sel === "new" ? [...(xs ?? []), p] : (xs ?? []).map((x) => (x.id === p.id ? p : x))));
      setSel(p.id);
      toast.success(sel === "new" ? `${p.name} added to the Trustbook` : `${p.name} updated`);
    } catch (e) {
      toast.error("Not saved", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };
  const dropPrint = async () => {
    if (!current) return;
    const p = await send<Person>(`/v1/identity/people/${current.id}/voiceprint`, "DELETE", {});
    setPeople((xs) => (xs ?? []).map((x) => (x.id === p.id ? p : x)));
    toast.success(`${p.name}'s voiceprint removed`);
  };

  if (error && !people) return <ErrorState title="The Trustbook could not load." cause={error} onRetry={load} />;
  const field = "h-8 w-full rounded-lg border border-line-2 bg-transparent px-2.5 text-[13px] text-fg outline-none focus:border-cyan/60 disabled:opacity-60";

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-medium tracking-tight">Trustbook</h1>
          <p className="text-[13.5px] text-muted">The people MIRAGE checks a claim against: their real channels, hours, approval limits and voice.</p>
        </div>
        {admin && <Button size="sm" icon={<Plus size={14} />} onClick={() => setSel("new")}>Add person</Button>}
      </header>

      {simulator > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber/25 bg-amber/[0.06] px-3.5 py-2.5 text-[12.5px] text-amber">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          <p>{simulator} voiceprint{simulator === 1 ? " was" : "s were"} seeded from the speech simulator, so voice matching for {simulator === 1 ? "that person" : "them"} is a placeholder. Re-enrol each from three consented takes of their real voice.</p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className="panel min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <label className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, role, number" aria-label="Search the Trustbook"
                className="h-8 w-[220px] rounded-lg border border-line bg-ink-1 pl-8 pr-2 text-[12.5px] outline-none focus:border-cyan/50" />
            </label>
            <Segmented value={circle} onChange={setCircle} options={[{ value: "all", label: "All" }, { value: "org", label: "Organisation" }, { value: "family", label: "Family" }, { value: "external", label: "External" }]} />
            <span className="ml-auto font-mono text-[11px] text-dim">{rows.length} people</span>
          </div>
          {!people ? <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div> : (
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="sticky top-0 bg-ink-2">
                  <tr className="border-b border-line text-left font-mono text-[10.5px] tracking-[0.1em] text-dim">
                    <th className="py-2 pl-4 font-normal">PERSON</th><th className="py-2 font-normal">CHANNELS</th><th className="py-2 font-normal">LIMIT</th><th className="py-2 font-normal">VOICE</th><th className="py-2 pr-4 text-right font-normal">IMPERSONATED</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} onClick={() => setSel(p.id)} aria-selected={sel === p.id}
                      className={cx("cursor-pointer border-b border-line/60 transition-colors last:border-0", sel === p.id ? "bg-cyan/[0.06]" : "hover:bg-white/[0.025]")}>
                      <td className="py-2.5 pl-4">
                        <p className="text-fg">{p.name}</p>
                        <p className="font-mono text-[10.5px] text-dim">{p.role || "—"}{p.department && ` · ${p.department}`} · {p.circle}</p>
                      </td>
                      <td className="py-2.5 font-mono text-[11px] text-muted">{p.usual_channels.join(" · ") || "—"}</td>
                      <td className="tnum py-2.5 font-mono text-[11.5px] text-silver">{p.approval_limit_inr ? inr(p.approval_limit_inr) : "—"}</td>
                      <td className="py-2.5"><PrintBadge p={p} /></td>
                      <td className={cx("tnum py-2.5 pr-4 text-right font-mono text-[12px]", p.impersonation_count ? "text-crimson" : "text-dim")}>{p.impersonation_count || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel min-w-0">
          {!draft ? (
            <div className="flex h-full min-h-[300px] flex-col items-start justify-center gap-2 px-6 text-[13px] text-muted">
              <UserRound size={18} className="text-dim" />
              <p className="text-silver">Select someone to see how MIRAGE verifies them.</p>
              <p>{admin ? "Edit their channels, hours and limits, or enrol their voice from three consented takes." : "Only an administrator can change the Trustbook; sign in as Vikram Desai to edit."}</p>
            </div>
          ) : (
            <>
              <PanelHead title={sel === "new" ? "New person" : draft.name} meta={current ? `#${current.id}` : undefined}
                right={admin && <Button size="sm" onClick={save} loading={saving} disabled={!draft.name.trim()} icon={<Save size={13} />}>Save</Button>} />
              <div className="space-y-4 p-4">
                <fieldset disabled={!admin} className="grid grid-cols-2 gap-3">
                  {([["name", "Name"], ["role", "Role"], ["department", "Department"], ["email", "Email"], ["phone", "Phone"]] as const).map(([k, l]) => (
                    <label key={k} className={cx("block", k === "name" && "col-span-2")}>
                      <span className="label mb-1 block !text-[9.5px]">{l}</span>
                      <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className={field} />
                    </label>
                  ))}
                  <label className="block">
                    <span className="label mb-1 block !text-[9.5px]">Approval limit (₹)</span>
                    <input type="number" min={0} step={10000} value={draft.approval_limit_inr} onChange={(e) => setDraft({ ...draft, approval_limit_inr: Math.max(0, Number(e.target.value)) })} className={cx(field, "tnum")} />
                  </label>
                  <div className="col-span-2">
                    <span className="label mb-1.5 block !text-[9.5px]">Usual channels</span>
                    <div className="flex flex-wrap gap-1.5">
                      {CHANNELS.map((c) => {
                        const on = draft.usual_channels.includes(c);
                        return (
                          <button type="button" key={c} aria-pressed={on} onClick={() => setDraft({ ...draft, usual_channels: on ? draft.usual_channels.filter((x) => x !== c) : [...draft.usual_channels, c] })}
                            className={cx("h-7 rounded-md border px-2.5 text-[12px] capitalize transition-colors", on ? "border-cyan/40 bg-cyan/[0.08] text-cyan" : "border-line text-muted hover:text-silver")}>{c}</button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="label mb-1.5 block !text-[9.5px]">Usual hours · {String(draft.usual_hours[0]).padStart(2, "0")}:00 to {String(draft.usual_hours[1]).padStart(2, "0")}:00</span>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={23} value={draft.usual_hours[0]} aria-label="Start hour" onChange={(e) => setDraft({ ...draft, usual_hours: [Math.min(Number(e.target.value), draft.usual_hours[1] - 1), draft.usual_hours[1]] })} className="flex-1 accent-[var(--color-cyan)]" />
                      <input type="range" min={1} max={24} value={draft.usual_hours[1]} aria-label="End hour" onChange={(e) => setDraft({ ...draft, usual_hours: [draft.usual_hours[0], Math.max(Number(e.target.value), draft.usual_hours[0] + 1)] })} className="flex-1 accent-[var(--color-cyan)]" />
                    </div>
                    <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-ink-4">
                      <span style={{ width: `${(draft.usual_hours[0] / 24) * 100}%` }} />
                      <span className="bg-cyan/60" style={{ width: `${((draft.usual_hours[1] - draft.usual_hours[0]) / 24) * 100}%` }} />
                    </div>
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-[12.5px] text-silver">
                    <input type="checkbox" checked={draft.code_word_set} onChange={(e) => setDraft({ ...draft, code_word_set: e.target.checked })} className="accent-[var(--color-cyan)]" />
                    A family or team code word is agreed (MIRAGE asks for it in emergencies; the word itself is never stored)
                  </label>
                </fieldset>

                {current && (
                  <div className="border-t border-line pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="label">Voiceprint</p>
                      <div className="flex items-center gap-2"><PrintBadge p={current} />
                        {admin && current.voiceprint_enrolled && <button onClick={dropPrint} className="inline-flex items-center gap-1 text-[11.5px] text-muted hover:text-crimson"><Trash2 size={12} />Remove</button>}
                      </div>
                    </div>
                    {admin ? <Enrolment p={current} onDone={(p) => setPeople((xs) => (xs ?? []).map((x) => (x.id === p.id ? p : x)))} />
                      : <p className="text-[12.5px] text-muted">Enrolment is an administrator task.</p>}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

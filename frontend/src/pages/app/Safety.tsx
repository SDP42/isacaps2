import { Check, Mic, Phone, ShieldCheck, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api, post } from "@/lib/api";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { CaseDetail, CaseSummary } from "@/lib/types";

const PLAIN: Record<string, { head: string; body: string; color: string }> = {
  HIGH: { head: "Don't send anything yet.", body: "This looks like a scam. Check with the real person on their saved number first.", color: "#fb7185" },
  MEDIUM: { head: "Pause and check.", body: "Some things don't add up. A quick call on a number you already have will settle it.", color: "#fbbf24" },
  LOW: { head: "Looks okay.", body: "Nothing here asks you to do anything risky. Stay alert if a follow-up asks for money.", color: "#6ee7b7" },
  INCONCLUSIVE: { head: "We can't tell from this alone.", body: "Add the message text or the number it came from, or simply call them back to check.", color: "#c7cfdd" },
};

/** Personal safety mode: mobile-first, plain language, no percentages, one primary action per screen. */
export default function Safety() {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CaseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { data: family } = useApi<{ name: string; aliases: string[]; phone: string; code_word_set: boolean }[]>("/v1/identity/people?circle=family");

  const check = async () => {
    if (!text.trim() && !file) {
      toast.error("Paste the message or add the voice note.");
      return;
    }
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    if (file) fd.append("files", file, file.name);
    fd.append("message", text);
    fd.append("claimed_sender", from);
    fd.append("channel", "whatsapp");
    try {
      const c = await post<CaseSummary>("/v1/cases", fd);
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const d = await api<CaseDetail>(`/v1/cases/${c.id}`);
        if (d.status === "complete" || d.status === "failed") {
          setResult(d);
          break;
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const v = result?.verdict;
  const plain = v ? PLAIN[v.band] : null;
  const person = family?.find((p) => from && [p.name, ...p.aliases].some((a) => a.toLowerCase().includes(from.toLowerCase())));

  return (
    <div className="mx-auto max-w-md px-4 pb-16 pt-6">
      <div className="flex items-center gap-2 text-mint"><ShieldCheck size={18} /><span className="text-[13px]">Personal safety</span></div>
      <h1 className="mt-3 text-[30px] font-medium leading-tight tracking-tight">Got a message that feels off?</h1>
      <p className="mt-2 text-[15px] text-muted">Paste it or add the voice note. You'll get one clear answer and what to do next.</p>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 space-y-3">
            <label className="block">
              <span className="text-[13px] text-silver">Who does it say it's from?</span>
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Papa, Bhaiya, the bank…" className="mt-1.5 h-12 w-full rounded-2xl border border-line-2 bg-ink-1 px-4 text-[16px] outline-none placeholder:text-dim focus:border-mint/50" />
            </label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste the message here"
              className="w-full rounded-2xl border border-line-2 bg-ink-1 px-4 py-3 text-[16px] leading-relaxed outline-none placeholder:text-dim focus:border-mint/50" />
            <button onClick={() => input.current?.click()} className={cx("flex h-12 w-full items-center justify-center gap-2 rounded-2xl border text-[15px]", file ? "border-mint/50 text-mint" : "border-dashed border-line-2 text-silver")}>
              {file ? <><Check size={16} />{file.name}</> : <><Upload size={16} />Add voice note or screenshot</>}
            </button>
            <input ref={input} type="file" accept="audio/*,image/*,video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button onClick={check} disabled={busy} className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-mint text-[16px] font-medium text-ink-0 disabled:opacity-70">
              {busy ? <><span className="size-4 animate-spin rounded-full border-2 border-ink-0 border-r-transparent" />Checking the voice, words and sender…</> : "Check it"}
            </button>
            <p className="pt-2 text-center text-[12.5px] text-dim"><Mic size={12} className="inline" /> Tip: on your phone, share a WhatsApp voice note straight to MIRAGE.</p>
          </motion.div>
        ) : (
          <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
            {plain && (
              <div className="rounded-3xl border p-6" style={{ borderColor: `${plain.color}55`, background: `${plain.color}10` }}>
                <p className="text-[26px] font-medium leading-tight" style={{ color: plain.color }}>{plain.head}</p>
                <p className="mt-2 text-[16px] leading-relaxed text-fg">{plain.body}</p>
              </div>
            )}
            {v && v.reasons.filter((r) => r.kind !== "policy" && r.kind !== "mitigating").slice(0, 3).length > 0 && (
              <div className="rounded-2xl border border-line bg-ink-1 p-5">
                <p className="text-[14px] text-silver">Why we think so</p>
                <ul className="mt-3 space-y-2.5">
                  {v.reasons.filter((r) => r.kind !== "policy" && r.kind !== "mitigating").slice(0, 3).map((r, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-snug text-fg"><span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: plain?.color }} />{r.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {(v?.band === "HIGH" || v?.band === "MEDIUM" || v?.band === "INCONCLUSIVE") && (
              <>
                {person ? (
                  <a href={`tel:${person.phone.replace(/\s/g, "")}`} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-mint text-[16px] font-medium text-ink-0">
                    <Phone size={17} /> Call {person.name.split(" ")[0]} on {person.phone}
                  </a>
                ) : (
                  <div className="rounded-2xl border border-line bg-ink-1 p-4 text-[15px] text-fg">Call them back on the number already saved in your phone, not the one that messaged you.</div>
                )}
                {person?.code_word_set && <p className="text-center text-[14px] text-silver">Ask for your family code word before sending anything.</p>}
                <div className="rounded-2xl border border-amber/30 bg-amber/[0.06] p-4 text-[14.5px] leading-relaxed text-fg">
                  Already sent money? Call <a href="tel:1930" className="font-mono text-amber underline">1930</a> right away and tell your bank. Then report at cybercrime.gov.in.
                </div>
              </>
            )}
            <button onClick={() => { setResult(null); setText(""); setFile(null); }} className="h-12 w-full rounded-full border border-line-2 text-[15px] text-silver">Check something else</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

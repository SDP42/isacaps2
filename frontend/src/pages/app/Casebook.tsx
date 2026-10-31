import { BookOpenText, Search, Send } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PanelHead, Skeleton } from "@/components/ui/primitives";
import { post } from "@/lib/api";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface Doc { id: string; title: string; source: string; kind: string; sections: { id: string; heading: string; text: string }[] }
interface Hit { id: string; title: string; heading: string; source: string; kind: string; text: string; score: number; bm25: number; cosine: number }
interface Answer { answer: string; sentences: { text: string; cite: string }[]; citations: Hit[] }

const KIND_COLOR: Record<string, string> = { advisory: "#67e8f9", framework: "#a78bfa", pattern: "#fbbf24", policy: "#6ee7b7", guidance: "#93c5fd", case: "#fb7185" };
const SUGGEST = ["What is a digital arrest scam?", "How do I verify a CFO payment request?", "What should I do if I already paid?", "Can deepfake detectors be fooled?", "Does IT ever ask for my OTP?"];

export default function Casebook() {
  const { data: docs } = useApi<Doc[]>("/v1/rag/documents");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [openSec, setOpenSec] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true);
    setAsked(question);
    try {
      const a = await post<Answer>("/v1/rag/ask", { question });
      setAnswer(a);
      setOpenSec(a.citations[0]?.id ?? null);
    } finally {
      setBusy(false);
    }
  };
  const sec = useMemo(() => docs?.flatMap((d) => d.sections.map((s) => ({ ...s, doc: d }))).find((s) => s.id === openSec), [docs, openSec]);
  const kinds = Array.from(new Set(docs?.map((d) => d.kind) ?? []));

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-medium tracking-tight">Casebook</h1>
        <p className="text-[13.5px] text-muted">Security intelligence MIRAGE retrieves from: advisories, frameworks, scam patterns, policy and precedent. Every answer cites its passages.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="relative">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-dim" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask MIRAGE anything about deepfake fraud, policy or response…"
          className="h-14 w-full rounded-2xl border border-line-2 bg-ink-1 pl-12 pr-32 text-[15px] text-fg outline-none placeholder:text-dim focus:border-cyan/50" />
        <Button type="submit" size="sm" loading={busy} icon={<Send size={13} />} className="!absolute right-2.5 top-1/2 -translate-y-1/2">Ask</Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGEST.map((s) => <button key={s} onClick={() => { setQ(s); ask(s); }} className="rounded-full border border-line px-3 py-1 text-[12.5px] text-muted hover:border-cyan/40 hover:text-fg">{s}</button>)}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {busy && <Skeleton className="h-40" />}
          {answer && !busy && (
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="panel">
              <PanelHead title="Answer" meta={`grounded in ${answer.citations.length} passages · extractive`} />
              <div className="p-5">
                <p className="mb-3 text-[13px] text-muted">› {asked}</p>
                <div className="space-y-2.5">
                  {answer.sentences.map((s, i) => (
                    <p key={i} className="text-[15px] leading-relaxed text-fg">
                      {s.text}{" "}
                      <button onClick={() => setOpenSec(s.cite)} className={cx("rounded border px-1 font-mono text-[10.5px] transition-colors", openSec === s.cite ? "border-violet bg-violet/20 text-violet" : "border-violet/30 bg-violet/10 text-violet hover:bg-violet/20")}>{s.cite}</button>
                    </p>
                  ))}
                </div>
              </div>
              <div className="border-t border-line p-4">
                <p className="label mb-2">Retrieved evidence · hybrid BM25 + vector, RRF</p>
                <ul className="space-y-1">
                  {answer.citations.map((h) => (
                    <li key={h.id}>
                      <button onClick={() => setOpenSec(h.id)} className={cx("grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors", openSec === h.id ? "bg-ink-3" : "hover:bg-white/[0.03]")}>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-fg">{h.title} — {h.heading}</span>
                          <span className="font-mono text-[10.5px] text-dim">{h.id} · bm25 {h.bm25.toFixed(1)} · cos {h.cosine.toFixed(2)}</span>
                        </span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-4"><span className="block h-full rounded-full bg-violet" style={{ width: `${h.score * 100}%` }} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.section>
          )}
          <section className="panel">
            <PanelHead title="Library" meta={`${docs?.length ?? 0} documents · ${docs?.reduce((n, d) => n + d.sections.length, 0) ?? 0} passages`} />
            <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3">
              <button onClick={() => setKind(null)} className={cx("rounded-full border px-2.5 py-0.5 text-[12px]", !kind ? "border-cyan/40 text-cyan" : "border-line text-muted")}>all</button>
              {kinds.map((k) => <button key={k} onClick={() => setKind(k)} className={cx("rounded-full border px-2.5 py-0.5 text-[12px]", kind === k ? "text-fg" : "border-line text-muted")} style={kind === k ? { borderColor: KIND_COLOR[k] } : undefined}>{k}</button>)}
            </div>
            <ul className="divide-y divide-line">
              {(docs ?? []).filter((d) => !kind || d.kind === kind).map((d) => (
                <li key={d.id} className="px-4 py-3">
                  <p className="flex items-center gap-2 text-[13.5px] text-fg"><BookOpenText size={14} style={{ color: KIND_COLOR[d.kind] }} />{d.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-dim">{d.source}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.sections.map((s) => <button key={s.id} onClick={() => setOpenSec(s.id)} className={cx("rounded-md border px-2 py-0.5 text-[11.5px] transition-colors", openSec === s.id ? "border-violet/50 bg-violet/10 text-violet" : "border-line text-muted hover:text-silver")}>{s.heading}</button>)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <section className="panel min-h-[320px]">
            <PanelHead title="Passage" meta={sec?.id} />
            {sec ? (
              <motion.article key={sec.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: KIND_COLOR[sec.doc.kind] }}>{sec.doc.kind}</p>
                <h2 className="mt-1 text-[19px] font-medium leading-snug">{sec.heading}</h2>
                <p className="text-[12.5px] text-muted">{sec.doc.title}</p>
                <p className="mt-5 text-[15px] leading-[1.75] text-silver">
                  {sec.text.split(/(?<=[.!?])\s+/).map((t, i) => {
                    const hit = answer?.sentences.some((s) => s.cite === sec.id && s.text.trim() === t.trim());
                    return <span key={i} className={hit ? "rounded bg-violet/15 text-fg" : undefined}>{t} </span>;
                  })}
                </p>
                <p className="mt-6 border-t border-line pt-3 text-[11.5px] text-dim">Source: {sec.doc.source}</p>
              </motion.article>
            ) : <p className="p-6 text-[13.5px] text-muted">Ask a question or pick a passage from the library.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

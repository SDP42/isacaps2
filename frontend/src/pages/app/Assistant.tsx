import { AudioLines, Gavel, ShieldCheck, Sparkles, Waypoints } from "lucide-react";
import { Copilot, Orb } from "@/components/assistant/Copilot";
import { useCopilot } from "@/lib/assistant";
import { useApi } from "@/lib/hooks";
import { cx } from "@/lib/format";

const SEV: Record<string, string> = { CRITICAL: "text-crimson", HIGH: "text-crimson", MEDIUM: "text-amber", LOW: "text-mint", INCONCLUSIVE: "text-violet" };

/** Full-page copilot: the conversation, plus what it is looking at and how it works. */
export default function Assistant() {
  const { turns } = useCopilot();
  const subject = [...turns].reverse().find((t) => t.reply?.subject)?.reply?.subject;
  const { data: meta } = useApi<{ router: { accuracy: number | null; n: number | null; trained_on: number | null; features: string | null } }>("/v1/assistant/meta");
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-8">
          <Orb size={30} />
          <div>
            <h1 className="text-[15px] font-medium text-fg">MIRAGE Copilot</h1>
            <p className="text-[11.5px] text-muted">Runs every check, explains every verdict, tells you what to do next</p>
          </div>
        </header>
        <div className="min-h-0 flex-1"><Copilot variant="page" /></div>
      </section>
      <aside className="hidden w-[290px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-ink-1/40 p-4 xl:flex">
        <div>
          <p className="label mb-2 !text-[10px]">Looking at</p>
          {subject ? (
            <div className="rounded-xl border border-line bg-ink-2/60 p-3">
              <p className="truncate text-[13px] text-fg" title={subject.label}>{subject.label}</p>
              <p className={cx("mt-0.5 font-mono text-[11px]", SEV[subject.severity ?? ""] ?? "text-muted")}>{subject.kind} · {subject.severity}</p>
              <p className="mt-2 text-[11.5px] text-dim">Follow-up questions are answered about this.</p>
            </div>
          ) : <p className="text-[12px] text-dim">Nothing yet. Drop a file or try a sample.</p>}
        </div>
        <div>
          <p className="label mb-2 !text-[10px]">It can</p>
          <ul className="space-y-2 text-[12px] text-silver">
            {[[AudioLines, "Run the voice, image, video and message checks"], [Sparkles, "Answer why, where, how sure, what if"],
              [Waypoints, "Run scenarios and open cases"], [ShieldCheck, "Walk you through the response and reporting"],
              [Gavel, "Cite benchmarks, limits and the docs"]].map(([I, t]: any) => (
              <li key={t} className="flex gap-2"><I size={14} className="mt-px shrink-0 text-cyan" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-ink-2/60 p-3">
          <p className="label mb-1.5 !text-[10px]">How it answers</p>
          <p className="text-[11.5px] leading-relaxed text-muted">
            A router trained on this machine ({meta?.router.features ?? "MiniLM + n-grams"}, {meta?.router.trained_on ?? "…"} phrasings) works out the question;
            the answer is assembled from MIRAGE's own detector output, benchmark and case data. No LLM writes the facts.
          </p>
          {meta?.router.accuracy != null && (
            <p className="mt-2 font-mono text-[11px] text-mint">{(meta.router.accuracy * 100).toFixed(1)}% on {meta.router.n} held-out questions</p>
          )}
        </div>
      </aside>
    </div>
  );
}

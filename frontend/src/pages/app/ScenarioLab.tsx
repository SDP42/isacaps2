import { AudioLines, FileText, Image as ImageIcon, Play, Video } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BandPill, Skeleton } from "@/components/ui/primitives";
import { post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { CaseSummary, Scenario } from "@/lib/types";

const FILE_ICON = (f: string) => (f.endsWith(".mp4") ? <Video size={13} /> : f.endsWith(".png") ? <ImageIcon size={13} /> : <AudioLines size={13} />);

export default function ScenarioLab() {
  const { data } = useApi<Scenario[]>("/v1/scenarios");
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (s: Scenario) => {
    setBusy(s.key);
    try {
      const c = await post<CaseSummary>(`/v1/scenarios/${s.key}/run`);
      toast.success(`${c.id}: Scenario ${s.code} is running`);
      nav(`/app/investigate?case=${c.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };
  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="mb-6 max-w-3xl">
        <h1 className="text-[26px] font-medium tracking-tight">Scenario lab</h1>
        <p className="text-[13.5px] text-muted">
          Nine labelled attacks and controls, each with real generated media. Two are the proof of thinking: <span className="text-fg">D</span>, a genuine voice with a fraudulent request,
          and <span className="text-fg">E</span>, a harmless AI avatar that must not raise an alarm. All samples are synthetic and watermarked.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data ?? Array.from({ length: 6 }, () => null)).map((s, i) =>
          s ? (
            <motion.article key={s.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="panel group flex flex-col p-5 transition-colors hover:border-line-2">
              <div className="flex items-start justify-between">
                <span className="font-serif text-[40px] italic leading-none text-cyan/80">{s.code}</span>
                <span className="text-right"><span className="label block !text-[9.5px]">expected</span><BandPill band={s.expected} /></span>
              </div>
              <h2 className="mt-3 text-[16px] font-medium">{s.title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{s.story}</p>
              {s.message && <p className="mt-3 line-clamp-2 border-l border-line-2 pl-3 text-[12.5px] italic text-silver/80">“{s.message}”</p>}
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {s.files.map((f) => <span key={f} className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{FILE_ICON(f)}{f}</span>)}
                {s.message && <span className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-muted"><FileText size={11} />text</span>}
                {s.tags.map((t) => <span key={t} className="rounded-md bg-ink-3 px-1.5 py-0.5 text-[10.5px] text-silver">{t}</span>)}
              </div>
              <button onClick={() => run(s)} disabled={busy !== null}
                className="mt-5 flex h-10 items-center justify-center gap-2 rounded-xl border border-line-2 text-[13px] text-fg transition-colors hover:border-cyan/50 hover:bg-cyan/[0.05] disabled:opacity-50">
                {busy === s.key ? <span className="size-3.5 animate-spin rounded-full border-2 border-cyan border-r-transparent" /> : <Play size={13} className="fill-current" />}
                Run investigation
              </button>
            </motion.article>
          ) : <Skeleton key={i} className="h-72" />,
        )}
      </div>
    </div>
  );
}

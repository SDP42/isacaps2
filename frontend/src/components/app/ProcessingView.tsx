import { Check, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AGENT_META, cx, WITNESS_META } from "@/lib/format";
import type { LiveState } from "@/lib/hooks";
import type { CaseDetail } from "@/lib/types";

const STAGES = [
  { k: "intake", label: "Intake", note: "SHA-256 sealed" },
  { k: "plan", label: "Plan", note: "witnesses chosen" },
  { k: "witnesses", label: "Witnesses", note: "parallel analysis" },
  { k: "identity", label: "Identity", note: "Trustbook check" },
  { k: "fusion", label: "Fusion", note: "calibrated risk" },
  { k: "tribunal", label: "Tribunal", note: "agents argue" },
  { k: "verdict", label: "Verdict", note: "plan & report" },
];

/** The live pipeline: stage rail, witness status, streaming log and Tribunal testimony as it arrives. */
export function ProcessingView({ live, detail }: { live: LiveState; detail: CaseDetail | null }) {
  const idx = Math.max(0, STAGES.findIndex((s) => s.k === live.stage));
  const expected = new Set<string>(["identity"]);
  for (const a of detail?.artifacts ?? []) {
    if (a.kind === "audio") expected.add("voice");
    if (a.kind === "video") { expected.add("face"); expected.add("voice"); }
    if (a.kind === "image") expected.add("provenance");
  }
  if (detail?.message_text) expected.add("words");
  const messages = detail?.status === "complete" && detail.tribunal.length ? detail.tribunal : live.messages;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <p className="label">Processing timeline</p>
          <span className="tnum font-mono text-[12px] text-cyan">{Math.round(live.progress * 100)}%</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink-4">
          <motion.div className="h-full rounded-full bg-cyan" animate={{ width: `${live.progress * 100}%` }} transition={{ duration: 0.6 }} />
        </div>
        <ol className="mt-6 space-y-0">
          {STAGES.map((s, i) => {
            const done = i < idx || live.stage === "verdict";
            const active = i === idx && live.stage !== "verdict";
            return (
              <li key={s.k} className="relative flex gap-4 pb-5 last:pb-0">
                {i < STAGES.length - 1 && <span className={cx("absolute left-[11px] top-6 h-[calc(100%-12px)] w-px", done ? "bg-cyan/50" : "bg-line")} />}
                <span className={cx("relative grid size-6 shrink-0 place-items-center rounded-full border text-[10px]",
                  done ? "border-cyan bg-cyan text-ink-0" : active ? "border-cyan text-cyan" : "border-line-2 text-dim")}>
                  {done ? <Check size={12} strokeWidth={3} /> : active ? <Loader2 size={12} className="animate-spin" /> : i + 1}
                </span>
                <div className="-mt-0.5">
                  <p className={cx("text-[14px]", done || active ? "text-fg" : "text-dim")}>{s.label}</p>
                  <p className="font-mono text-[11px] text-dim">{s.note}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-4">
        <section className="panel p-5">
          <p className="label">Witness status</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(["voice", "face", "provenance", "words", "identity"] as const).map((w) => {
              const st = live.witnesses[w];
              const on = expected.has(w);
              const meta = WITNESS_META[w];
              const state = !on ? "not called" : !st ? "queued" : st.state;
              return (
                <div key={w} className={cx("rounded-xl border p-3 transition-colors", on ? "border-line bg-ink-1" : "border-line/50 opacity-40")}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px]" style={{ color: on ? meta.color : undefined }}>{meta.label}</span>
                    {state === "running" ? <Loader2 size={12} className="animate-spin text-amber" /> : state === "ok" ? <Check size={13} className="text-mint" /> : null}
                  </div>
                  <p className="mt-1 font-mono text-[10.5px] text-dim">{state}{st?.score != null ? ` · ${Number(st.score).toFixed(2)}` : ""}</p>
                  {st?.latency_ms != null && <p className="font-mono text-[10px] text-dim">{st.latency_ms} ms</p>}
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel flex min-h-[220px] flex-col p-5">
          <p className="label">Tribunal · live</p>
          <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
            <AnimatePresence initial={false}>
              {messages.length === 0 && <p className="text-[13px] text-dim">Agents will testify once the witnesses report.</p>}
              {messages.slice(-5).map((m) => (
                <motion.div key={m.seq} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[13px] leading-relaxed">
                  <span className="font-mono text-[10.5px] tracking-[0.12em]" style={{ color: AGENT_META[m.agent]?.color }}>{AGENT_META[m.agent]?.name.toUpperCase()} </span>
                  <span className="text-silver">{m.content}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-3 max-h-24 overflow-y-auto border-t border-line pt-2 font-mono text-[10.5px] text-dim">
            {live.log.slice(-6).map((l, i) => <p key={i}><span className="text-muted">{l.t.toFixed(1)}s</span> {l.text}</p>)}
          </div>
        </section>
      </div>
    </div>
  );
}

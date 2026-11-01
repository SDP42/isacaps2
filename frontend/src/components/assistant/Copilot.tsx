import { ArrowUp, AudioLines, ChevronRight, FileText, Image as ImageIcon, Loader2, Mic, Paperclip, RotateCcw, Square, Video } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApi } from "@/lib/hooks";
import { audioFor, reset, send, useCopilot, type Reply, type Turn } from "@/lib/assistant";
import { useRecorder, micError } from "@/lib/recorder";
import { cx } from "@/lib/format";
import { useSimple } from "@/lib/viewMode";

// Simple mode keeps the answer, the verdict and what to do; model juries, formulas, tables and timelines are expert detail
const EXPERT_BLOCKS = new Set(["jury", "formula", "table", "heatmap", "timeline", "matrix", "sources", "bars"]);
import { BlockView, Md } from "./Blocks";

interface Meta { samples: { key: string; label: string; kind: string }[]; starters: string[]; router: { accuracy: number | null; n: number | null; trained_on: number | null } }

const PENDING: Record<string, string[]> = {
  route: ["Understanding the question", "Reading MIRAGE's own data", "Composing the answer"],
  media: ["Checking the file type and hashing it", "Running the detectors", "Transcribing and reading the request", "Weighing who is speaking against what they want"],
  scenario: ["Opening a case with the scenario's evidence", "Five witnesses examining it", "Risk engine and Tribunal", "Building the response plan"],
};

/** The case the user is looking at, so "why is this high?" on a case page is about that case. */
export function usePageContext() {
  const loc = useLocation();
  const m = loc.pathname.match(/\/app\/(?:cases|tribunal)\/(MRG-\d+)/);
  return m ? { case_id: m[1] } : undefined;
}

function Thinking({ kind }: { kind: string }) {
  const steps = PENDING[kind] ?? PENDING.route;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), kind === "route" ? 450 : 1800);
    return () => clearInterval(id);
  }, [kind, steps.length]);
  return (
    <div className="flex items-start gap-3">
      <Orb thinking />
      <ul className="space-y-1 pt-1">
        {steps.slice(0, i + 1).map((s, k) => (
          <li key={s} className={cx("flex items-center gap-2 text-[12.5px]", k === i ? "text-silver" : "text-dim")}>
            {k === i ? <Loader2 size={12} className="animate-spin text-cyan" /> : <span className="size-1.5 rounded-full bg-mint" />}{s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Orb({ thinking = false, size = 28 }: { thinking?: boolean; size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size }}>
      <span className={cx("absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#67e8f9,#a78bfa,#fb7185,#67e8f9)] opacity-80", thinking && "animate-spin [animation-duration:2.4s]")} />
      <span className="absolute inset-[2px] rounded-full bg-ink-1" />
      <span className="relative size-2 rounded-full bg-cyan shadow-[0_0_12px_#67e8f9]" />
    </span>
  );
}

function Answer({ r, turns, idx, onAsk, onSample, last }: { r: Reply; turns: Turn[]; idx: number; onAsk: (p: string) => void; onSample: (k: string, l: string) => void; last: boolean }) {
  const [open, setOpen] = useState(false);
  const simple = useSimple();
  const src = audioFor(turns, idx, r);
  const blocks = simple ? r.blocks.filter((b) => !EXPERT_BLOCKS.has(b.type)) : r.blocks;
  return (
    <div className="flex items-start gap-3">
      <Orb />
      <div className="min-w-0 flex-1 space-y-2.5">
        {blocks.map((b, i) => (
          <div key={i} className="copilot-in" style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}>
            <BlockView b={b} onAsk={onAsk} onSample={onSample} audioSrc={src} />
          </div>
        ))}
        {r.did_you_mean.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] text-dim">Not what you meant?</span>
            {r.did_you_mean.map((s) => <button key={s} onClick={() => onAsk(s)} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:border-violet/50 hover:text-fg">{s}</button>)}
          </div>
        )}
        {!simple && <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 font-mono text-[10px] text-dim hover:text-muted" aria-expanded={open}>
          <ChevronRight size={11} className={cx("transition-transform", open && "rotate-90")} />
          how I answered · {r.intent ?? "—"} · {Math.round(r.confidence * 100)}% · {r.ms} ms
        </button>}
        {open && !simple && (
          <ul className="space-y-0.5 border-l border-line pl-3 font-mono text-[10.5px] text-muted">
            <li>route: {r.method}</li>
            {r.trace.map((t) => <li key={t}>{t}</li>)}
            <li>numbers: read from detector output, benchmark.json and the case database at answer time</li>
          </ul>
        )}
        {last && r.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {r.suggestions.map((s) => (
              <button key={s} onClick={() => onAsk(s)} className="rounded-full border border-cyan/25 bg-cyan/[0.05] px-3 py-1 text-[12px] text-cyan transition-colors hover:bg-cyan/[0.12]">{s}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const FILE_ICON = { audio: AudioLines, image: ImageIcon, video: Video, text: FileText } as const;

function UserTurn({ t }: { t: Turn }) {
  const Icon = t.file ? FILE_ICON[t.file.kind as keyof typeof FILE_ICON] ?? FileText : null;
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-1.5 rounded-2xl rounded-tr-md border border-line-2 bg-ink-3 px-3.5 py-2 text-[13.5px] text-fg">
        {t.file && Icon && (
          <div className="flex items-center gap-2 text-[12px] text-silver">
            <Icon size={14} className="text-cyan" /><span className="truncate">{t.file.name}</span>
          </div>
        )}
        {t.file?.kind === "image" && t.file.url && <img src={t.file.url} alt="" className="max-h-40 rounded-lg" />}
        {t.text && <p className="whitespace-pre-wrap break-words">{t.text}</p>}
      </div>
    </div>
  );
}

export function Copilot({ variant = "page" }: { variant?: "page" | "dock" }) {
  const { turns, busy } = useCopilot();
  const { data: meta } = useApi<Meta>("/v1/assistant/meta");
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const [micErr, setMicErr] = useState<string | null>(null);
  const page = usePageContext();
  const nav = useNavigate();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const rec = useRecorder();

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy]);

  const after = (r: Reply | null) => {
    if (r?.go) nav(r.go);
  };
  const ask = (p: string) => {
    if (!p.trim() || busy) return;
    setText("");
    send({ text: p.trim(), page }).then(after);
  };
  const sample = (key: string, label: string) => send({ sample: key, label: `Analyse the sample: ${label}`, page }).then(after);
  const upload = (f: File) => send({ file: f, text: "", page }).then(after);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  };
  const mic = async () => {
    setMicErr(null);
    if (rec.recording) {
      const f = await rec.stop();
      if (f) upload(f);
      return;
    }
    try {
      await rec.start();
    } catch (e) {
      setMicErr(micError(e));
    }
  };
  useEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = "0px";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [text]);

  const empty = turns.length === 0;
  return (
    <div className={cx("relative flex h-full min-h-0 flex-col", drag && "ring-2 ring-inset ring-cyan/50")}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div ref={scroller} className={cx("min-h-0 flex-1 overflow-y-auto", variant === "dock" ? "px-4 py-4" : "px-4 py-6 sm:px-8")}>
        {empty ? (
          <div className="mx-auto max-w-2xl pt-4 text-center">
            <div className="mx-auto mb-4 w-fit"><Orb size={52} /></div>
            <h2 className="text-[22px] font-medium tracking-tight text-fg">Ask MIRAGE anything</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-muted">
              Drop a voice note, call, image, video or email to have it checked, then cross-question the result. Or ask how any part of MIRAGE works.
            </p>
            <div className="mt-6 grid gap-2 text-left sm:grid-cols-2">
              {(meta?.starters ?? []).map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-xl border border-line bg-ink-1/60 px-3.5 py-2.5 text-[12.5px] text-silver transition-colors hover:border-cyan/40 hover:text-fg">{s}</button>
              ))}
            </div>
            {meta?.samples && (
              <div className="mt-5">
                <BlockView b={{ type: "samples", items: meta.samples }} onAsk={ask} onSample={sample} />
              </div>
            )}
            {meta?.router.accuracy != null && (
              <p className="mt-6 font-mono text-[10.5px] text-dim">
                Runs locally · router trained here on {meta.router.trained_on} phrasings · {(meta.router.accuracy * 100).toFixed(1)}% on {meta.router.n} held-out questions · answers grounded in MIRAGE's data
              </p>
            )}
          </div>
        ) : (
          <div className={cx("mx-auto space-y-5", variant === "page" && "max-w-3xl")}>
            {turns.map((t, i) => t.role === "user" ? <UserTurn key={t.id} t={t} />
              : t.pending ? <Thinking key={t.id} kind={t.pending} />
                : t.error ? <div key={t.id} className="flex gap-3"><Orb /><Md text={`**Couldn't answer.** ${t.error}`} className="text-[13px] text-crimson" /></div>
                  : t.reply ? <Answer key={t.id} r={t.reply} turns={turns} idx={i} onAsk={ask} onSample={sample} last={i === turns.length - 1} /> : null)}
          </div>
        )}
      </div>

      <div className={cx("border-t border-line bg-ink-0/80 backdrop-blur-xl", variant === "dock" ? "p-3" : "px-4 py-3 sm:px-8")}>
        <div className={cx("mx-auto", variant === "page" && "max-w-3xl")}>
          {page?.case_id && <p className="mb-1.5 font-mono text-[10.5px] text-dim">Context: case {page.case_id}. Ask “why is this high?” or “what should I do?”</p>}
          {micErr && <p className="mb-1.5 text-[11.5px] text-amber">{micErr}</p>}
          <div className="flex items-end gap-2 rounded-2xl border border-line-2 bg-ink-1 p-2 focus-within:border-cyan/50">
            <button onClick={() => fileIn.current?.click()} disabled={busy} aria-label="Attach a file" title="Attach a voice note, image, video, .eml or .txt"
              className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-white/[0.04] hover:text-fg disabled:opacity-40"><Paperclip size={17} /></button>
            <input ref={fileIn} type="file" hidden accept="audio/*,video/*,image/*,.eml,.txt,.ogg,.opus,.m4a"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            {rec.recording ? (
              <div className="flex h-9 flex-1 items-center gap-[3px] px-1" aria-label="Recording">
                {rec.level.map((l, i) => <span key={i} className="w-[3px] rounded-full bg-crimson" style={{ height: `${6 + l * 26}px` }} />)}
                <span className="ml-2 font-mono text-[11px] text-crimson">{rec.seconds}s · tap stop to check it</span>
              </div>
            ) : (
              <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }}
                placeholder={empty ? "Ask, paste a message, or drop a file…" : "Cross-question: why? which part? how sure? what if it was real?"}
                className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[13.5px] text-fg placeholder:text-dim focus:outline-none" />
            )}
            <button onClick={mic} disabled={busy && !rec.recording} aria-label={rec.recording ? "Stop recording" : "Record a voice note"}
              className={cx("grid size-9 shrink-0 place-items-center rounded-xl", rec.recording ? "bg-crimson/20 text-crimson" : "text-muted hover:bg-white/[0.04] hover:text-fg")}>
              {rec.recording ? <Square size={14} /> : <Mic size={17} />}
            </button>
            <button onClick={() => ask(text)} disabled={busy || !text.trim()} aria-label="Send"
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan text-ink-0 transition-opacity disabled:opacity-30">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} />}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-dim">
            <span>Enter to send · Shift+Enter new line · drop files anywhere</span>
            {!empty && <button onClick={reset} className="inline-flex items-center gap-1 hover:text-muted"><RotateCcw size={10} /> new chat</button>}
          </div>
        </div>
      </div>
      {drag && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink-0/70 text-[14px] text-cyan backdrop-blur-sm">Drop to check it with MIRAGE</div>}
    </div>
  );
}


import { AnimatePresence, motion } from "motion/react";
import { AudioLines, FileVideo, Gavel, Loader2, Phone, ScanSearch, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import type { DemoCase, Stage } from "./data";
import { STAGES } from "./data";

/**
 * A laptop showing what the user sees in MIRAGE at each step of the scroll. The screens are simplified copies of
 * the real app (New investigation, the live processing view, the verdict, the Tribunal, the Simple-mode report).
 */
const bandColor = (b: string) => (b === "HIGH" ? "var(--color-crimson)" : b === "MEDIUM" ? "var(--color-amber)" : "var(--color-mint)");

function Upload_({ c, p }: { c: DemoCase; p: number }) {
  const dropped = p > 0.25;
  const pressed = p > 0.7;
  return (
    <div className="space-y-2.5 p-4">
      <p className="text-[13px] font-medium text-fg">New investigation</p>
      <div className="relative grid h-[72px] place-items-center rounded-lg border border-dashed border-line-2 bg-ink-1/50">
        {!dropped && <p className="flex items-center gap-2 text-[11px] text-dim"><Upload size={13} /> Drop voice notes, calls, video, images, email</p>}
        <AnimatePresence>
          {dropped && (
            <motion.div initial={{ y: -40, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", damping: 16 }}
              className="flex items-center gap-2 rounded-md border border-cyan/40 bg-cyan/10 px-3 py-2 text-[11px] text-cyan">
              {c.file.kind === "video" ? <FileVideo size={13} /> : <AudioLines size={13} />} {c.file.name}
              <span className="font-mono text-[10px] text-dim">{(c.file.bytes / 1024).toFixed(0)} KB</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10.5px]">
        {[["Claimed sender", c.sender], ["Channel", c.channel], ["Sender contact", c.contact], ["Received", "today, 15:12"]].map(([k, v]) => (
          <div key={k} className="rounded-md border border-line bg-ink-1/60 px-2 py-1.5"><p className="text-dim">{k}</p><p className="truncate text-silver">{v}</p></div>
        ))}
      </div>
      <div className="rounded-md border border-line bg-ink-1/60 px-2 py-1.5 text-[10.5px] leading-snug text-silver"><span className="text-dim">Message · </span>{c.message.slice(0, 120)}…</div>
      <motion.div animate={{ scale: pressed ? 0.96 : 1 }} className={`flex items-center justify-center gap-2 rounded-md py-2 text-[11.5px] font-medium ${pressed ? "bg-cyan text-ink-0" : "bg-cyan/80 text-ink-0"}`}>
        {pressed ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />} {pressed ? "Investigating…" : "Investigate"}
      </motion.div>
    </div>
  );
}

const W = ["voice", "face", "provenance", "words", "identity"] as const;

function Processing({ c, stage, p }: { c: DemoCase; stage: Stage; p: number }) {
  const order = STAGES.map((s) => s.id);
  const at = order.indexOf(stage);
  const scores: Record<string, number | null> = { voice: c.voice.score, face: c.face?.score ?? null, provenance: null, words: c.words.score, identity: c.identity.score };
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-fg">{c.id} · investigating</p>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-amber"><span className="size-1.5 animate-pulse rounded-full bg-amber" />live</span>
      </div>
      <div className="flex gap-1.5">
        {["Custody", "Dissection", "Witnesses", "Risk", "Tribunal"].map((s, i) => {
          const done = i === 0 ? at > 1 : i === 1 ? at > 2 : i === 2 ? at > 7 : false;
          const active = (i === 0 && at === 1) || (i === 1 && at === 2) || (i === 2 && at >= 3 && at <= 7);
          return <span key={s} className={`flex-1 rounded px-1 py-1 text-center text-[9.5px] ${done ? "bg-mint/15 text-mint" : active ? "bg-cyan/15 text-cyan" : "bg-ink-3 text-dim"}`}>{done ? "✓ " : ""}{s}</span>;
        })}
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {W.map((w) => {
          const i = order.indexOf(w);
          const s = scores[w];
          const state = s == null ? "n/a" : at > i ? "done" : at === i ? "run" : "wait";
          const shown = state === "done" ? s! : state === "run" ? s! * Math.min(1, p * 1.4) : 0;
          return (
            <div key={w} className={`grid grid-cols-[72px_1fr_36px] items-center gap-2 rounded-md border px-2 py-1.5 text-[10.5px] ${state === "run" ? "border-cyan/50 bg-cyan/[0.06]" : "border-line bg-ink-1/50"}`}>
              <span className="capitalize text-silver">{w}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-ink-4">
                {state !== "n/a" && <span className="block h-full rounded-full" style={{ width: `${shown * 100}%`, background: shown >= 0.7 ? "var(--color-crimson)" : shown > 0.3 ? "var(--color-amber)" : "var(--color-mint)" }} />}
              </span>
              <span className="text-right font-mono text-[10px] text-dim">{state === "n/a" ? "n/a" : state === "wait" ? "…" : shown.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      <p className="font-mono text-[9.5px] text-dim">sha256 {c.file.sha}… · {c.file.mime}</p>
    </div>
  );
}

function Verdict({ c, p }: { c: DemoCase; p: number }) {
  const r = c.risk * Math.min(1, p * 1.6 + 0.1);
  const col = bandColor(c.band);
  return (
    <div className="space-y-3 p-4">
      <p className="text-[13px] font-medium text-fg">{c.id} · verdict</p>
      <div className="flex items-center gap-4">
        <div className="relative grid size-[96px] place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-ink-4)" strokeWidth="9" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(r / 100) * 264} 264`} /></svg>
          <span className="font-mono text-[24px]" style={{ color: col }}>{Math.round(r)}</span>
        </div>
        <div className="min-w-0">
          <span className="rounded-full px-2 py-0.5 font-mono text-[10px]" style={{ color: col, background: `color-mix(in oklab, ${col} 15%, transparent)` }}>{c.band}</span>
          <p className="mt-1 text-[12px] text-fg">{c.category}</p>
          <p className="font-mono text-[10px] text-dim">rule · {c.rule}</p>
        </div>
      </div>
      <div className="space-y-1">
        {c.shap.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[60px_1fr_44px] items-center gap-2 text-[10px]">
            <span className="text-silver">{k}</span><span className="h-1.5 rounded-full bg-ink-4"><span className="block h-full rounded-full bg-cyan" style={{ width: `${(v / 40) * 100 * Math.min(1, p * 2)}%` }} /></span>
            <span className="text-right font-mono text-dim">{v.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tribunal({ c, p }: { c: DemoCase; p: number }) {
  const n = Math.max(1, Math.ceil(p * c.tribunal.length));
  return (
    <div className="space-y-2 p-4">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg"><Gavel size={13} /> Tribunal</p>
      {c.tribunal.slice(0, n).map(([a, t], i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-md border border-line bg-ink-1/60 px-2 py-1.5 text-[10.5px] leading-snug">
          <span className="font-mono text-[9.5px] text-violet">{a.toUpperCase()}</span><p className="text-silver">{t}</p>
        </motion.div>
      ))}
    </div>
  );
}

function Cure({ c }: { c: DemoCase }) {
  const danger = c.band === "HIGH";
  const col = bandColor(c.band);
  return (
    <div className="space-y-2.5 p-4">
      <div className="rounded-xl border-2 p-3" style={{ borderColor: `color-mix(in oklab, ${col} 55%, transparent)`, background: `color-mix(in oklab, ${col} 10%, transparent)` }}>
        <p className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: col }}>{danger ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
          {danger ? (c.severity === "CRITICAL" ? "This is very likely a scam" : "This looks like a scam") : "This looks safe"}</p>
        <p className="mt-1 text-[11px] text-fg">{danger ? "Do not pay, share any code or install anything." : "Nothing here asks you to do anything risky."}</p>
        {danger && <p className="mt-2 flex items-center justify-center gap-2 rounded-md bg-crimson-deep py-1.5 text-[11px] font-semibold text-white"><Phone size={12} /> If you already paid, call 1930 now</p>}
      </div>
      <ol className="space-y-1.5">
        {c.plan.map((s, i) => (
          <li key={i} className="flex gap-2 rounded-md border border-line bg-ink-1/60 px-2 py-1.5 text-[10.5px] text-silver">
            <span className="grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold text-ink-0" style={{ background: col }}>{i + 1}</span>{s}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Laptop({ c, stage, p }: { c: DemoCase; stage: Stage; p: number }) {
  const screen = stage === "input" ? "upload" : stage === "risk" ? "verdict" : stage === "tribunal" ? "tribunal" : stage === "cure" ? "cure" : "processing";
  return (
    <div className="mx-auto w-full max-w-[560px] [perspective:1600px]">
      <div className="relative rounded-t-[18px] border border-line-2 bg-[#0b0f17] p-2.5 shadow-[0_40px_120px_-30px_rgb(103_232_249/0.25)] [transform:rotateX(4deg)]">
        <div className="absolute left-1/2 top-1 size-1.5 -translate-x-1/2 rounded-full bg-ink-4" />
        <div className="overflow-hidden rounded-[10px] border border-line bg-ink-0">
          <div className="flex items-center gap-2 border-b border-line bg-ink-1 px-3 py-1.5">
            <span className="flex gap-1">{["#fb7185", "#fbbf24", "#6ee7b7"].map((x) => <span key={x} className="size-2 rounded-full" style={{ background: x, opacity: 0.7 }} />)}</span>
            <span className="mx-auto rounded bg-ink-3 px-3 py-0.5 font-mono text-[9.5px] text-dim">localhost:5173/app/{screen === "upload" ? "investigate" : `cases/${c.id}`}</span>
          </div>
          <div className="flex h-[min(360px,46vh)]">
            <aside className="hidden w-[92px] shrink-0 space-y-1 border-r border-line bg-ink-1/60 p-2 sm:block">
              {["Copilot", "Investigate", "Voice check", "Cases", "Tribunal", "Red team"].map((n, i) => (
                <p key={n} className={`rounded px-1.5 py-1 text-[9.5px] ${(screen === "upload" && i === 1) || (screen !== "upload" && i === 3) ? "bg-ink-3 text-fg" : "text-dim"}`}>{n}</p>
              ))}
            </aside>
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div key={screen + c.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="absolute inset-0 overflow-hidden">
                  {screen === "upload" && <Upload_ c={c} p={p} />}
                  {screen === "processing" && <Processing c={c} stage={stage} p={p} />}
                  {screen === "verdict" && <Verdict c={c} p={p} />}
                  {screen === "tribunal" && <Tribunal c={c} p={p} />}
                  {screen === "cure" && <Cure c={c} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto h-3 w-[108%] -translate-x-[3.7%] rounded-b-2xl border border-t-0 border-line-2 bg-gradient-to-b from-[#1a2233] to-[#0b0f17]" />
      <div className="mx-auto h-1.5 w-24 rounded-b-lg bg-ink-3" />
    </div>
  );
}


import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowDown, AudioLines, FileVideo, Megaphone } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import ShinyText from "@/components/reactbits/ShinyText";
import { useSmoothScroll } from "@/components/landing/useSmoothScroll";
import { CASES, STAGES, type CaseKey, type Stage } from "./data";
import { Laptop } from "./Laptop";
import { Lens } from "./Lens";

/**
 * Technical demonstration (/technical_demonstration): scroll through one real case as it moves through MIRAGE.
 * A laptop shows what the user sees; the backend lens beside it zooms into the engine doing the work, with the rule,
 * the formula and the case's real numbers. The rail at the top is the architecture, and where you are in it.
 */
const ICON = { cfo: AudioLines, police: FileVideo, townhall: Megaphone } as const;
const VH_PER_STAGE = 110;

function Rail({ stage, onJump }: { stage: Stage; onJump: (i: number) => void }) {
  const at = STAGES.findIndex((s) => s.id === stage);
  const groups = [...new Set(STAGES.map((s) => s.group))];
  return (
    <div className="flex w-full items-stretch gap-1 overflow-x-auto pb-1">
      {groups.map((g) => (
        <div key={g} className="flex min-w-fit flex-col gap-1">
          <span className="px-1 font-mono text-[9px] tracking-[0.16em] text-dim">{g.toUpperCase()}</span>
          <div className="flex gap-1">
            {STAGES.map((s, i) => s.group !== g ? null : (
              <button key={s.id} onClick={() => onJump(i)} aria-current={i === at}
                className={`relative rounded-md border px-2.5 py-1.5 text-[11.5px] transition-colors ${i === at ? "border-cyan text-ink-0" : i < at ? "border-cyan/30 text-cyan" : "border-line text-dim hover:text-silver"}`}>
                {i === at && <motion.span layoutId="rail-on" className="absolute inset-0 -z-[1] rounded-md bg-cyan" transition={{ type: "spring", damping: 28, stiffness: 300 }} />}
                <span className="relative">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TechnicalDemonstration() {
  useSmoothScroll();
  const [key, setKey] = useState<CaseKey>("cfo");
  const [pos, setPos] = useState({ i: 0, p: 0 });
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const x = Math.min(0.9999, Math.max(0, v)) * STAGES.length;
    const i = Math.floor(x);
    setPos((o) => (o.i === i && Math.abs(o.p - (x - i)) < 0.01 ? o : { i, p: x - i }));
  });
  const c = CASES[key];
  const stage = STAGES[pos.i].id;
  const jump = (i: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.offsetTop + (i + 0.35) * (el.offsetHeight - window.innerHeight) / STAGES.length;
    const lenis = (window as any).__lenis;
    lenis ? lenis.scrollTo(top, { duration: 1.2 }) : window.scrollTo({ top, behavior: "smooth" });
  };
  const pick = (k: CaseKey) => {
    setKey(k);
    if (pos.i > 0) jump(0);
  };

  return (
    <div className="relative min-h-dvh bg-ink-0 text-fg">
      <div className="pointer-events-none fixed inset-0 grid-field opacity-30 [mask-image:radial-gradient(ellipse_at_50%_30%,black,transparent_75%)]" />
      <div className="pointer-events-none fixed -top-40 left-1/3 size-[60vw] rounded-full bg-cyan/[0.05] blur-[140px]" />

      {/* intro */}
      <header className="relative mx-auto max-w-[1300px] px-4 pb-16 pt-20 sm:px-8">
        <Link to="/" className="font-mono text-[11px] tracking-[0.16em] text-dim hover:text-silver">← MIRAGE</Link>
        <p className="mt-10 font-mono text-[11px] tracking-[0.2em] text-cyan">TECHNICAL DEMONSTRATION</p>
        <h1 className="mt-4 max-w-[18ch] text-[clamp(2.4rem,6vw,5rem)] font-medium leading-[0.95] tracking-[-0.04em]">
          Follow one file through the <span className="font-serif font-normal italic"><ShinyText text="whole machine." color="#67e8f9" shineColor="#f0fdff" speed={3} /></span>
        </h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-silver/90">
          On the left, what the person sees. On the right, the backend doing the work: custody, dissection, five witnesses, the risk engine, the Tribunal and the cure, with the real rules and the real numbers. Pick a case and scroll.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {(Object.keys(CASES) as CaseKey[]).map((k) => {
            const x = CASES[k];
            const I = ICON[k];
            return (
              <button key={k} onClick={() => pick(k)} aria-pressed={k === key}
                className={`group rounded-2xl border p-4 text-left transition-colors ${k === key ? "border-cyan/60 bg-cyan/[0.06]" : "border-line bg-ink-1/60 hover:border-line-2"}`}>
                <div className="flex items-center justify-between">
                  <I size={18} className={k === key ? "text-cyan" : "text-dim"} />
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${x.band === "HIGH" ? "bg-crimson/15 text-crimson" : "bg-mint/15 text-mint"}`}>{x.band} {x.risk}</span>
                </div>
                <p className="mt-3 text-[15px] font-medium">{x.label}</p>
                <p className="mt-1 text-[12.5px] leading-snug text-muted">{x.story}</p>
                <p className="mt-3 font-mono text-[10px] text-dim">real run · {x.id}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-10 flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-dim"><ArrowDown size={13} className="animate-bounce" /> SCROLL TO RUN THE INVESTIGATION</p>
      </header>

      {/* the investigation, pinned */}
      <section ref={track} className="relative" style={{ height: `${STAGES.length * VH_PER_STAGE}vh` }}>
        <div className="sticky top-0 flex h-dvh flex-col gap-3 px-4 pb-4 pt-4 sm:px-8">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 lg:flex-row lg:items-end lg:gap-3">
            <div className="min-w-0 flex-1"><Rail stage={stage} onJump={jump} /></div>
            <div className="flex gap-1 rounded-full border border-line bg-ink-1/80 p-1">
              {(Object.keys(CASES) as CaseKey[]).map((k) => (
                <button key={k} onClick={() => setKey(k)} className={`rounded-full px-3 py-1 text-[11.5px] ${k === key ? "bg-fg text-ink-0" : "text-muted hover:text-fg"}`}>{CASES[k].short}</button>
              ))}
            </div>
          </div>
          <div className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="hidden flex-col justify-center lg:flex">
              <Laptop c={c} stage={stage} p={pos.p} />
              <p className="mt-6 text-center font-mono text-[10.5px] tracking-[0.14em] text-dim">WHAT THE PERSON SEES · {c.id}</p>
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div>
                  <p className="font-mono text-[10.5px] tracking-[0.16em] text-cyan">ZOOM · BACKEND · {STAGES[pos.i].file}</p>
                  <AnimatePresence mode="wait">
                    <motion.h2 key={stage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="text-[clamp(1.4rem,2.6vw,2.2rem)] font-medium tracking-tight">
                      {String(pos.i + 1).padStart(2, "0")} · {STAGES[pos.i].label}
                    </motion.h2>
                  </AnimatePresence>
                </div>
                <div className="h-1 w-28 overflow-hidden rounded-full bg-ink-4"><div className="h-full bg-cyan" style={{ width: `${pos.p * 100}%` }} /></div>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={stage + key} className="min-h-0 flex-1 overflow-y-auto pr-1"
                  initial={{ opacity: 0, scale: 0.94, filter: "blur(6px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.03, filter: "blur(4px)" }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
                  <Lens c={c} stage={stage} p={pos.p} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* outro */}
      <section className="relative mx-auto max-w-[1300px] px-4 py-24 sm:px-8">
        <p className="font-mono text-[11px] tracking-[0.2em] text-cyan">MEASURED, NOT ASSUMED</p>
        <h2 className="mt-3 max-w-3xl text-[clamp(1.8rem,4vw,3rem)] font-medium leading-tight tracking-tight">The same pipeline, tested on data it had never seen.</h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["1.00", "Voice benchmark AUC", "80 clips; neural TTS, Windows and LJSpeech fakes all caught"], ["41 / 42", "Red-team voice", "6 attacks × 7 laundering channels"],
            ["14 / 14", "Decision matrix", "AI or human voice × payment, OTP or nothing, through the full pipeline"], ["0.257 → 0.160", "Third detector", "held-out error after adding the multilingual MMS model"]].map(([n, t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-ink-1/60 p-5">
              <p className="font-mono text-[28px] text-fg">{n}</p><p className="mt-1 text-[13px] text-silver">{t}</p><p className="mt-2 text-[12px] leading-snug text-dim">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-muted">
          Where it is weak is measured too: unseen voice generators can score human, reverberant real voices can score AI, and in-the-wild face swaps are the hardest case. Because the verdict weighs the request, a missed fake that asks for money still meets the verify-first rule.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/auth" className="rounded-full bg-cyan px-5 py-2.5 text-[14px] font-medium text-ink-0">Try it on a real file</Link>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="rounded-full border border-line px-5 py-2.5 text-[14px] text-silver">Run another case</button>
        </div>
        <p className="mt-12 font-mono text-[10.5px] text-dim">Values from real MIRAGE runs on 1 Nov 2026: {CASES.cfo.id}, {CASES.police.id}, {CASES.townhall.id}. Hashes show the first 16 hex characters.</p>
      </section>
    </div>
  );
}

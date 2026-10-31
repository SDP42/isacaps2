import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { useMedia, useReducedMotion } from "@/lib/hooks";
import { ScrollTrigger } from "./useSmoothScroll";

const W = [
  {
    key: "voice", name: "Voice", color: "#67e8f9", question: "Is this a human larynx, and is it theirs?",
    measures: ["Per-window synthetic-speech score", "Pitch jitter, shimmer, high-band energy", "Voiceprint vs Trustbook enrolment", "Codec chain, so compression is not mistaken for fakery"],
    model: "Calibrated spoof model · speaker embedding", testimony: "Synthetic-speech score 0.94. Not his voice.",
  },
  {
    key: "face", name: "Face", color: "#a78bfa", question: "Does the face hold together over time?",
    measures: ["Face tracking and per-frame artefact scores", "Temporal pooling: bursts, not single frames", "Lip-sync offset against the audio", "Track jitter at the face boundary"],
    model: "Haar tracking · frame forensics · AV-sync", testimony: "Mouth-region blending; lip drift +187 ms.",
  },
  {
    key: "words", name: "Words", color: "#fbbf24", question: "What is the message trying to make you do?",
    measures: ["Scam-language classifier, EN · HI · Hinglish", "Authority, urgency, secrecy, fear, channel switch", "Requested action, amount, UPI, IFSC, deadline", "Style drift against how this person writes"],
    model: "Char + word n-gram classifier · tactic lexicon", testimony: "Four levers and ₹48,50,000 before 4 PM.",
  },
  {
    key: "identity", name: "Identity", color: "#fb7185", question: "Does the request fit the real person?",
    measures: ["Claimed sender resolved against the Trustbook", "Number, channel and working hours", "Approval limits and the beneficiary's history", "Anomaly against 12 months of requests"],
    model: "Trustbook rules · Isolation Forest", testimony: "CFO never requests wires on WhatsApp.",
  },
  {
    key: "provenance", name: "Provenance", color: "#6ee7b7", question: "Where did this file come from?",
    measures: ["AI-generation probability from pixel statistics", "Error-level analysis for local edits", "EXIF and generator metadata", "C2PA content credentials"],
    model: "Pixel forensics · ELA · C2PA", testimony: "No credentials; written by an image model.",
  },
];

function Glyph({ k, color }: { k: string; color: string }) {
  const s = { stroke: color, strokeWidth: 1.4, fill: "none" } as const;
  return (
    <svg viewBox="0 0 48 48" className="size-full">
      {k === "voice" && [6, 12, 18, 24, 30, 36, 42].map((x, i) => <line key={x} x1={x} x2={x} y1={24 - [4, 10, 16, 8, 14, 6, 3][i]} y2={24 + [4, 10, 16, 8, 14, 6, 3][i]} {...s} strokeLinecap="round" />)}
      {k === "face" && (<><ellipse cx="24" cy="23" rx="12" ry="15" {...s} /><path d="M18 21h3M27 21h3M21 31q3 2 6 0" {...s} /><path d="M24 8v-4M24 44v-4M8 23H4M44 23h-4" {...s} strokeDasharray="1 2" /></>)}
      {k === "words" && (<><path d="M9 16h30M9 24h22M9 32h26" {...s} strokeLinecap="round" /><rect x="20" y="20" width="12" height="8" rx="2" {...s} /></>)}
      {k === "identity" && (<><circle cx="24" cy="14" r="4" {...s} /><circle cx="12" cy="34" r="4" {...s} /><circle cx="36" cy="34" r="4" {...s} /><path d="M22 17.5L14 31M26 17.5L34 31M16 34h16" {...s} /></>)}
      {k === "provenance" && (<><circle cx="24" cy="24" r="14" {...s} /><circle cx="24" cy="24" r="9" {...s} strokeDasharray="2 2" /><path d="M19 24l4 4 7-8" {...s} strokeLinecap="round" /></>)}
    </svg>
  );
}

export function Witnesses() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const desktop = useMedia("(min-width: 1024px)");
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!desktop || reduced || !root.current) return;
    const st = ScrollTrigger.create({
      trigger: root.current, start: "top top", end: "+=220%", pin: true, scrub: true,
      onUpdate: (self) => { if (!manual) setActive(Math.min(4, Math.floor(self.progress * 5))); },
    });
    return () => st.kill();
  }, [desktop, reduced, manual]);

  const w = W[active];
  const radius = desktop ? 520 : 300;

  return (
    <section id="witnesses" ref={root} className="relative overflow-hidden bg-ink-0 py-24 lg:h-dvh lg:py-0">
      <div className="pointer-events-none absolute inset-0 grid-field-fine opacity-40 [mask-image:radial-gradient(ellipse_at_50%_100%,black,transparent_65%)]" />
      <div className="relative mx-auto grid h-full max-w-[1400px] items-center gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="relative z-10 lg:pb-24">
          <h2 className="text-[clamp(2.2rem,4.8vw,4.2rem)] font-medium leading-[1] tracking-[-0.035em]">
            Five witnesses.
            <br />
            <span className="text-muted">One question each.</span>
          </h2>
          <AnimatePresence mode="wait">
            <motion.div key={w.key} initial={{ opacity: 0, y: 16, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="mt-10">
              <div className="flex items-center gap-3">
                <span className="size-9"><Glyph k={w.key} color={w.color} /></span>
                <span className="text-2xl font-medium" style={{ color: w.color }}>{w.name}</span>
              </div>
              <p className="mt-4 font-serif text-[clamp(1.6rem,2.6vw,2.3rem)] italic leading-tight text-fg">“{w.question}”</p>
              <ul className="mt-6 space-y-2.5">
                {w.measures.map((m) => (
                  <li key={m} className="flex gap-3 text-[15px] text-silver/90">
                    <span className="mt-2.5 h-px w-4 shrink-0" style={{ background: w.color }} />
                    {m}
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5 font-mono text-[11.5px]">
                <span className="text-muted">{w.model}</span>
                <span style={{ color: w.color }}>→ {w.testimony}</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* the arc */}
        <div className="relative h-[360px] lg:h-full">
          <div
            className="absolute left-1/2 rounded-full border border-line"
            style={{ width: radius * 2, height: radius * 2, top: desktop ? "58%" : "40%", marginLeft: -radius }}
          >
            <div className="absolute inset-[60px] rounded-full border border-dashed border-line" />
            <motion.div className="absolute inset-0" animate={{ rotate: -active * 28 + 56 }} transition={{ type: "spring", stiffness: 60, damping: 18 }}>
              {W.map((x, i) => {
                const ang = ((i * 28 - 56 - 90) * Math.PI) / 180;
                const isA = i === active;
                return (
                  <button
                    key={x.key}
                    onClick={() => { setManual(true); setActive(i); }}
                    className="absolute -ml-[46px] -mt-[46px] size-[92px]"
                    style={{ left: radius + Math.cos(ang) * radius, top: radius + Math.sin(ang) * radius }}
                    aria-label={`${x.name} witness`}
                  >
                    <motion.span
                      className={cx("flex size-full flex-col items-center justify-center gap-1 rounded-full border bg-ink-1 transition-colors")}
                      style={{ borderColor: isA ? x.color : "var(--color-line-2)", boxShadow: isA ? `0 0 40px -8px ${x.color}` : "none" }}
                      animate={{ rotate: active * 28 - 56, scale: isA ? 1.12 : 0.9 }}
                      transition={{ type: "spring", stiffness: 60, damping: 18 }}
                    >
                      <span className="size-8"><Glyph k={x.key} color={isA ? x.color : "#5d6880"} /></span>
                      <span className="font-mono text-[9.5px] tracking-[0.14em]" style={{ color: isA ? x.color : "#5d6880" }}>{x.name.toUpperCase()}</span>
                    </motion.span>
                  </button>
                );
              })}
            </motion.div>
          </div>
          <div className="absolute left-1/2 top-[18%] -translate-x-1/2 text-center lg:top-[24%]">
            <p className="tnum font-mono text-[11px] tracking-[0.2em] text-dim">WITNESS {active + 1} / 5</p>
          </div>
        </div>
      </div>
    </section>
  );
}

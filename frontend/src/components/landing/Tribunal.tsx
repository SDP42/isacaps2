import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { useMedia, useReducedMotion } from "@/lib/hooks";
import { ScrollTrigger } from "./useSmoothScroll";

type Seat = { key: string; name: string; x: number; y: number; color: string; stance: "inc" | "exc" | "neutral" | "ruling"; text: string; refs: string[] };

const SEATS: Seat[] = [
  { key: "voice", name: "Voice Analyst", x: 92, y: 168, color: "#67e8f9", stance: "inc", text: "Synthetic-speech score 0.94 between 0:04 and 0:16. Voiceprint 0.38 against the enrolled CFO.", refs: ["E1", "E2"] },
  { key: "face", name: "Face Analyst", x: 62, y: 300, color: "#a78bfa", stance: "inc", text: "Blending around the mouth on frames 180–240. Lip-sync drifts +187 ms.", refs: ["E3", "E4"] },
  { key: "linguist", name: "Linguist", x: 120, y: 428, color: "#fbbf24", stance: "inc", text: "Authority, urgency, secrecy, channel switch. Asks for ₹48,50,000 before 4 PM.", refs: ["E5"] },
  { key: "identity", name: "Identity Officer", x: 300, y: 486, color: "#fb7185", stance: "inc", text: "Not the CFO's number. He never requests wires on WhatsApp. Beneficiary never paid.", refs: ["E6", "E7"] },
  { key: "casebook", name: "Casebook Clerk", x: 480, y: 428, color: "#93c5fd", stance: "neutral", text: "Matches the CEO-fraud pattern in CERT-In's guidance (0.86). Policy FIN-07: call back on the directory number.", refs: [] },
  { key: "skeptic", name: "Skeptic", x: 540, y: 250, color: "#f0abfc", stance: "exc", text: "The note passed through WhatsApp's codec, which can mimic artefacts. It does not explain the request. No objection.", refs: ["E9"] },
  { key: "judge", name: "Judge", x: 300, y: 58, color: "#e9eef7", stance: "ruling", text: "HIGH, 87/100. Secrecy plus an unverified sender on a money request. The court explains the score; it cannot change it.", refs: ["E1", "E5", "E6"] },
  { key: "verifier", name: "Verifier", x: 470, y: 112, color: "#6ee7b7", stance: "neutral", text: "Freeze the payment. Call R. Mehta on +91 98200 11002. Ask this week's phrase.", refs: [] },
];
const CORE = { x: 300, y: 280 };

function pathFor(s: Seat): string {
  if (s.key === "skeptic") return `M${s.x},${s.y} C${s.x - 120},${s.y - 140} ${SEATS[0].x + 160},${SEATS[0].y - 90} ${SEATS[0].x + 24},${SEATS[0].y - 8}`;
  if (s.key === "judge") return `M${CORE.x},${CORE.y - 46} L${s.x},${s.y + 26}`;
  if (s.key === "verifier") return `M${SEATS[6].x + 26},${SEATS[6].y + 8} Q${s.x - 40},${s.y - 40} ${s.x - 22},${s.y - 10}`;
  const mx = (s.x + CORE.x) / 2 + (s.y - CORE.y) * 0.18;
  const my = (s.y + CORE.y) / 2 - (s.x - CORE.x) * 0.18;
  return `M${s.x},${s.y} Q${mx},${my} ${CORE.x},${CORE.y}`;
}

export function Tribunal() {
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState(-1);
  const desktop = useMedia("(min-width: 1024px)");
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!root.current) return;
    if (reduced || !desktop) {
      const st = ScrollTrigger.create({ trigger: root.current, start: "top 60%", onEnter: () => setStep(SEATS.length - 1) });
      return () => st.kill();
    }
    const st = ScrollTrigger.create({
      trigger: root.current, start: "top top", end: "+=260%", pin: true, scrub: true,
      onUpdate: (self) => setStep(Math.min(SEATS.length - 1, Math.floor(self.progress * (SEATS.length + 0.6)) - 1)),
    });
    return () => st.kill();
  }, [desktop, reduced]);

  return (
    <section id="tribunal" ref={root} className="relative overflow-hidden bg-ink-0 py-24 lg:h-dvh lg:py-0">
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[70vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/[0.05] blur-[140px]" />
      <div className="relative mx-auto grid h-full max-w-[1400px] items-center gap-10 px-4 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <h2 className="max-w-[14ch] text-[clamp(2.2rem,4.8vw,4.2rem)] font-medium leading-[1] tracking-[-0.035em]">
            The Tribunal argues <span className="font-serif italic text-violet">before</span> you decide.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
            Specialist agents testify from the evidence. A Skeptic argues the innocent explanation. The Judge explains a
            score it is not allowed to change. Every sentence cites an exhibit.
          </p>
          <svg viewBox="0 0 600 540" className="mt-4 w-full max-w-[560px] lg:max-h-[52vh]" role="img" aria-label="Tribunal diagram">
            <defs>
              <radialGradient id="core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fb7185" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={CORE.x} cy={CORE.y} r="210" fill="none" stroke="rgb(148 163 184 / 0.08)" />
            <circle cx={CORE.x} cy={CORE.y} r="130" fill="none" stroke="rgb(148 163 184 / 0.06)" strokeDasharray="2 6" />
            {SEATS.map((s, i) => (
              <motion.path key={`p-${s.key}`} d={pathFor(s)} fill="none" stroke={s.color} strokeWidth={s.key === "skeptic" ? 1.4 : 1.6}
                strokeDasharray={s.key === "skeptic" ? "5 5" : undefined} strokeLinecap="round"
                initial={false} animate={{ pathLength: step >= i ? 1 : 0, opacity: step >= i ? 0.85 : 0 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
            ))}
            <circle cx={CORE.x} cy={CORE.y} r={step >= 6 ? 70 : 44} fill="url(#core)" style={{ transition: "r 0.8s" }} opacity={step >= 3 ? 1 : 0.4} />
            <circle cx={CORE.x} cy={CORE.y} r="44" fill="#070b14" stroke={step >= 6 ? "#fb7185" : "rgb(148 163 184 / 0.3)"} strokeWidth="1.2" />
            <text x={CORE.x} y={CORE.y - 6} textAnchor="middle" fill="#8e99ad" fontFamily="Geist Mono" fontSize="9" letterSpacing="1.5">MRG-0412</text>
            <text x={CORE.x} y={CORE.y + 14} textAnchor="middle" fill={step >= 6 ? "#fb7185" : "#e9eef7"} fontFamily="Geist" fontSize="17" fontWeight="600">
              {step >= 6 ? "HIGH 87" : step >= 0 ? `${Math.min(step + 1, 6)} / 6` : "—"}
            </text>
            {SEATS.map((s, i) => (
              <g key={s.key} opacity={step >= i ? 1 : 0.28} style={{ transition: "opacity 0.5s" }}>
                <circle cx={s.x} cy={s.y} r="24" fill="#0b1120" stroke={s.color} strokeOpacity={step >= i ? 0.9 : 0.4} />
                <circle cx={s.x} cy={s.y} r="5" fill={s.color} />
                <text x={s.x} y={s.y + (s.y > 300 ? 42 : -32)} textAnchor="middle" fill={step >= i ? s.color : "#5d6880"} fontFamily="Geist Mono" fontSize="10.5" letterSpacing="1">
                  {s.name.toUpperCase()}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <ol className="relative space-y-2">
          {SEATS.map((s, i) => (
            <motion.li
              key={s.key}
              initial={false}
              animate={{ opacity: step >= i ? 1 : 0.16, x: step >= i ? 0 : 12 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className={cx(
                "relative rounded-xl border px-4 py-2.5",
                s.stance === "ruling" ? "border-crimson/40 bg-crimson/[0.06]" : s.stance === "exc" ? "border-[#f0abfc]/30 bg-[#f0abfc]/[0.04]" : "border-line bg-ink-1/70",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10.5px] tracking-[0.14em]" style={{ color: s.color }}>{s.name.toUpperCase()}</span>
                <span className="flex gap-1">{s.refs.map((r) => <span key={r} className="etag">{r}</span>)}</span>
              </div>
              <p className="mt-1 text-[13.5px] leading-snug text-silver">{s.text}</p>
              {s.key === "skeptic" && <span className="absolute -left-2 top-4 hidden h-px w-2 bg-[#f0abfc] lg:block" />}
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

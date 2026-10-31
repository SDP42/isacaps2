import { Check, Phone } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { ScrollTrigger } from "./useSmoothScroll";

const STEPS = [
  { k: "Detect", t: "Five witnesses examine every file and line of text in parallel.", c: "#67e8f9" },
  { k: "Explain", t: "Exhibits, highlighted seconds and phrases, and a Tribunal that cites them.", c: "#a78bfa" },
  { k: "Verify", t: "A plan that routes you to a channel the attacker does not control.", c: "#6ee7b7" },
  { k: "Report", t: "A hash-stamped incident report, escalation, and recovery if money already moved.", c: "#fbbf24" },
];

const CHECKS = [
  "Freeze the payment",
  "Do not reply on WhatsApp",
  "Call R. Mehta on +91 98200 11002",
  "Ask this week's verification phrase",
  "Escalate to the SOC, case pre-filled",
];

export function Protection() {
  const root = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!root.current) return;
    const st = ScrollTrigger.create({ trigger: root.current, start: "top 70%", end: "bottom 60%", scrub: true, onUpdate: (s) => setP(s.progress) });
    return () => st.kill();
  }, []);
  const active = Math.min(3, Math.floor(p * 4.2));
  const ticks = Math.floor(Math.max(0, p - 0.35) * 9);

  return (
    <section id="protection" ref={root} className="relative py-28">
      <div className="mx-auto grid max-w-[1400px] gap-16 px-4 sm:px-8 lg:grid-cols-[1fr_420px] lg:items-center">
        <div>
          <h2 data-split className="max-w-[15ch] text-[clamp(2.2rem,4.8vw,4.2rem)] font-medium leading-[1] tracking-[-0.035em]">
            Detection is evidence. <span className="text-mint">Verification is the control.</span>
          </h2>
          <ol className="relative mt-14 space-y-10 pl-10">
            <span className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px bg-line" />
            <span className="absolute left-[7px] top-1 w-px bg-gradient-to-b from-cyan via-violet to-amber transition-[height] duration-300"
              style={{ height: `calc(${Math.min(1, p * 1.25) * 100}% - 8px)` }} />
            {STEPS.map((s, i) => (
              <li key={s.k} className="relative">
                <span className="absolute -left-10 top-1 size-[15px] rounded-full border-2 transition-colors duration-500"
                  style={{ borderColor: i <= active ? s.c : "var(--color-line-2)" }} />
                <p className={cx("text-2xl font-medium tracking-tight transition-colors duration-500", i <= active ? "text-fg" : "text-dim")}>{s.k}</p>
                <p className={cx("mt-1.5 max-w-md text-[15px] leading-relaxed transition-colors duration-500", i <= active ? "text-muted" : "text-dim/70")}>{s.t}</p>
              </li>
            ))}
          </ol>
          <p className="mt-14 max-w-lg border-t border-line pt-6 text-[14.5px] leading-relaxed text-silver">
            Already paid? MIRAGE switches to recovery: call <span className="font-mono text-amber">1930</span> within the
            hour, freeze UPI, and file at cybercrime.gov.in with the report it has already prepared.
          </p>
        </div>

        {/* phone */}
        <div className="mx-auto w-full max-w-[360px]">
          <div className="rounded-[44px] border border-line-2 bg-ink-1 p-3 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)]">
            <div className="overflow-hidden rounded-[34px] border border-line">
              <div className="flex items-center justify-between px-6 pb-2 pt-4 font-mono text-[11px] text-muted">
                <span>15:42</span><span className="h-5 w-20 rounded-full bg-ink-3" /><span>5G</span>
              </div>
              <div className="px-5 pb-6">
                <div className="mt-2 rounded-2xl border border-crimson/30 bg-crimson/[0.07] p-4">
                  <p className="font-mono text-[10.5px] tracking-[0.16em] text-crimson">HIGH · DO NOT ACT</p>
                  <p className="mt-1.5 text-[15px] leading-snug text-fg">This voice note is unlikely to be from Rajesh.</p>
                </div>
                <p className="label mt-5">Verify before you act</p>
                <ul className="mt-3 space-y-2">
                  {CHECKS.map((c, i) => (
                    <li key={c} className="flex items-center gap-3 rounded-xl border border-line bg-ink-1 px-3 py-2.5 text-[13.5px]">
                      <motion.span className="grid size-5 shrink-0 place-items-center rounded-md border"
                        animate={{ backgroundColor: i < ticks ? "#6ee7b7" : "rgba(0,0,0,0)", borderColor: i < ticks ? "#6ee7b7" : "rgb(148 163 184 / 0.3)" }}>
                        {i < ticks && <Check size={13} className="text-ink-0" strokeWidth={3} />}
                      </motion.span>
                      <span className={i < ticks ? "text-muted line-through decoration-muted/40" : "text-silver"}>{c}</span>
                    </li>
                  ))}
                </ul>
                <button className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-mint text-[14px] font-medium text-ink-0">
                  <Phone size={15} /> Call R. Mehta on directory number
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

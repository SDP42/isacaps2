import { ChevronLeft, ChevronRight, Presentation, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { CaseSummary } from "@/lib/types";

/** The five-minute demo script: attack → detect → explain → respond → prove. "case:<tab>" resolves to the most recent
 * HIGH case so the presenter never has to hunt for an id. */
export const DEMO_STEPS = [
  { title: "Forge the attack", to: "/app/redteam",
    say: "Scam crews clone a voice and launder it through WhatsApp or a phone line. MIRAGE's red-team lab does the same, with labelled synthetic content, then checks whether it still catches it." },
  { title: "Is the voice real?", to: "/app/voice",
    say: "Two independent anti-spoofing models judge the voice first. Then MIRAGE reads what the voice is asking for, and places the call on the AI / human × sensitive / harmless grid." },
  { title: "Full investigation", to: "case:evidence",
    say: "Five witnesses run in parallel: voice, face, provenance, words and identity. The request-aware risk engine fuses them; policy rules mean an uncertain detector can never talk a payment down." },
  { title: "Why, with evidence", to: "case:tribunal",
    say: "The AI Tribunal argues the case. Every statement cites an exhibit, and the Skeptic argues the innocent explanation so the verdict is earned, not asserted." },
  { title: "What now", to: "case:verify",
    say: "Detection ends in action: call back on the Trustbook number, freeze the payment, and if money already moved, the 1930 golden hour starts." },
  { title: "Live on a call", to: "/app/shield",
    say: "The same checks run every three seconds during a call, in the app or through the MIRAGE Shield Chrome extension." },
  { title: "Why trust it", to: "/app/system",
    say: "Every detector shows its published result next to our own benchmark, and the red-team campaigns show which laundering channels still hurt." },
] as const;

const KEY = "mirage.demo";
const EVENT = "mirage:demo";

function readStep(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

export function setDemoStep(step: number | null) {
  try {
    if (step == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(step));
  } catch {
    /* storage blocked: the bar still works for this page view */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: step }));
}

export function useDemoStep() {
  const [step, setStep] = useState<number | null>(readStep);
  useEffect(() => {
    const on = (e: Event) => setStep((e as CustomEvent<number | null>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return step;
}

async function demoCase(): Promise<string | null> {
  const cases = await api<CaseSummary[]>("/v1/cases?limit=40").catch(() => []);
  const high = cases.filter((c) => c.band === "HIGH");
  return (high.find((c) => c.title.includes("Scenario A")) ?? high[0] ?? cases[0])?.id ?? null;
}

export function PresenterBar() {
  const step = useDemoStep();
  const nav = useNavigate();
  const loc = useLocation();

  const goTo = useCallback(async (i: number) => {
    const s = DEMO_STEPS[i];
    setDemoStep(i);
    if (s.to.startsWith("case:")) {
      const id = await demoCase();
      nav(id ? `/app/cases/${id}/${s.to.slice(5)}` : "/app/lab");
    } else nav(s.to);
  }, [nav]);

  useEffect(() => {
    if (step == null) return;
    const on = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || !e.altKey) return;
      if (e.key === "ArrowRight" && step < DEMO_STEPS.length - 1) goTo(step + 1);
      if (e.key === "ArrowLeft" && step > 0) goTo(step - 1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [step, goTo]);

  if (step == null) return null;
  const s = DEMO_STEPS[step];
  const here = s.to.startsWith("case:") ? loc.pathname.endsWith(`/${s.to.slice(5)}`) : loc.pathname.startsWith(s.to);

  return (
    <div className="sticky top-14 z-30 border-b border-cyan/25 bg-ink-1/95 backdrop-blur-xl">
      <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
        <Presentation size={16} className="shrink-0 text-cyan" />
        <ol className="hidden items-center gap-1 xl:flex">
          {DEMO_STEPS.map((d, i) => (
            <li key={d.title}>
              <button onClick={() => goTo(i)} title={d.title}
                className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] transition-colors",
                  i === step ? "bg-cyan text-ink-0" : i < step ? "text-cyan/70 hover:text-cyan" : "text-dim hover:text-silver")}>
                {i + 1}{i === step && <span className="font-sans text-[11.5px]">{d.title}</span>}
              </button>
            </li>
          ))}
        </ol>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-silver">
          <span className="mr-2 text-fg xl:hidden">{step + 1}. {s.title} ·</span>{s.say}
        </p>
        {!here && <button onClick={() => goTo(step)} className="shrink-0 rounded-full border border-cyan/40 px-3 py-1 text-[12px] text-cyan">Go there</button>}
        <div className="flex shrink-0 items-center gap-1">
          <button aria-label="Previous step" disabled={step === 0} onClick={() => goTo(step - 1)} className="grid size-8 place-items-center rounded-lg text-silver hover:bg-white/5 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <button aria-label="Next step" disabled={step === DEMO_STEPS.length - 1} onClick={() => goTo(step + 1)} className="grid size-8 place-items-center rounded-lg bg-cyan text-ink-0 disabled:opacity-30"><ChevronRight size={16} /></button>
          <button aria-label="End presentation" onClick={() => setDemoStep(null)} className="grid size-8 place-items-center rounded-lg text-dim hover:text-fg"><X size={15} /></button>
        </div>
      </div>
    </div>
  );
}

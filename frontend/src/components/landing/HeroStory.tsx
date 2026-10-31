import { ArrowRight, Play } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { faceControls } from "@/components/three/ParticleFace";
import { Button } from "@/components/ui/Button";
import { useReducedMotion } from "@/lib/hooks";
import { gsap, scrollToId } from "./useSmoothScroll";

const HeroCanvas = lazy(() => import("@/components/three/HeroCanvas"));

/** Readouts that drift like live instrument values. */
function useDrift(base: number, spread: number, ms = 900) {
  const [v, setV] = useState(base);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setV(base + (Math.random() - 0.5) * spread), ms);
    return () => clearInterval(id);
  }, [base, spread, ms, reduced]);
  return v;
}

function Bracket({ className }: { className: string }) {
  return <span className={`absolute size-6 border-cyan/60 ${className}`} aria-hidden />;
}

function SyntheticCard() {
  const p = useDrift(0.931, 0.012, 700);
  const [flip, setFlip] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setFlip((f) => !f), 3200);
    return () => clearInterval(id);
  }, [reduced]);
  return (
    <div className="panel w-[300px] p-5 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <span className="label">Synthetic probability</span>
        <span className="font-mono text-[10px] text-dim">E1 · voice</span>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <span className="tnum text-[52px] font-light leading-none tracking-tight text-crimson">{p.toFixed(3)}</span>
        <span className="mb-1.5 font-mono text-[11px] text-crimson">▲ HIGH RISK</span>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-ink-4">
        <div className="h-full rounded-full bg-gradient-to-r from-amber to-crimson" style={{ width: `${p * 100}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[10.5px]">
        <span className={flip ? "text-dim" : "text-cyan"}>● authentic frame</span>
        <span className={flip ? "text-crimson" : "text-dim"}>● synthetic frame</span>
      </div>
    </div>
  );
}

export function HeroStory() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const rppg = useDrift(0.21, 0.04);
  const lip = useDrift(187, 14);

  useEffect(() => {
    if (reduced || !root.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: 1.1 },
      });
      tl.to(".hero-copy", { opacity: 0, y: -60, filter: "blur(8px)", duration: 0.22, ease: "power2.in" }, 0.04)
        .to(".hero-hud", { opacity: 0, duration: 0.15 }, 0.04)
        .to(faceControls, { split: 1, rotate: 0.35, duration: 0.3, ease: "none" }, 0.22)
        .fromTo(".illusion-a", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.12 }, 0.3)
        .fromTo(".split-label", { opacity: 0 }, { opacity: 1, duration: 0.1, stagger: 0.04 }, 0.34)
        .to(".illusion-a", { opacity: 0, y: -40, duration: 0.1 }, 0.58)
        .to(".split-label", { opacity: 0, duration: 0.08 }, 0.58)
        .to(faceControls, { dissolve: 1, dim: 0.55, duration: 0.25, ease: "none" }, 0.6)
        .fromTo(".illusion-b", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.12 }, 0.66)
        .to(".illusion-b", { opacity: 1, duration: 0.2 }, 0.8)
        .to(faceControls, { dim: 1, duration: 0.1 }, 0.92);
    }, root);
    return () => {
      ctx.revert();
      Object.assign(faceControls, { split: 0, dissolve: 0, dim: 0, rotate: 0 });
    };
  }, [reduced]);

  return (
    <section id="top" ref={root} className={reduced ? "relative" : "relative h-[340vh]"}>
      <div id="illusion" className="absolute top-[110vh]" aria-hidden />
      <div className="sticky top-0 h-dvh overflow-hidden">
        {/* atmosphere */}
        <div className="pointer-events-none absolute inset-0 grid-field opacity-40 [mask-image:radial-gradient(ellipse_at_60%_45%,black,transparent_70%)]" />
        <div className="pointer-events-none absolute right-[-10%] top-[10%] size-[60vw] rounded-full bg-cyan/[0.06] blur-[120px]" />
        <div className="pointer-events-none absolute bottom-[-20%] left-[-10%] size-[50vw] rounded-full bg-violet/[0.05] blur-[140px]" />

        <Suspense fallback={null}>
          <HeroCanvas className="absolute inset-0" />
        </Suspense>

        {/* scanner framing around the face */}
        <div className="hero-hud pointer-events-none absolute right-[5%] top-[13%] hidden h-[68vh] w-[42vw] lg:block">
          <Bracket className="left-0 top-0 border-l border-t" />
          <Bracket className="right-0 top-0 border-r border-t" />
          <Bracket className="bottom-0 left-0 border-b border-l" />
          <Bracket className="bottom-0 right-0 border-b border-r" />
          <div className="absolute left-6 top-6 space-y-2 font-mono text-[11px] leading-relaxed">
            <p className="text-cyan">SCAN · LANDMARK MESH 468pt</p>
            <p className="text-muted">rPPG PULSE ··· {rppg.toFixed(2)} Hz <span className="text-crimson">IRREGULAR</span></p>
            <p className="text-muted">LIP–AUDIO OFFSET <span className="text-fg">+{Math.round(lip)}ms</span></p>
            <p className="text-muted">VOICEPRINT vs CFO <span className="text-crimson">0.38</span></p>
          </div>
        </div>
        <div className="hero-hud absolute bottom-[12%] right-[5%] hidden lg:block">
          <SyntheticCard />
        </div>

        {/* hero copy */}
        <div className="hero-copy relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-center px-4 pb-24 pt-24 sm:px-8">
          <h1 className="max-w-[13ch] text-[clamp(3rem,8.4vw,7.4rem)] font-medium leading-[0.92] tracking-[-0.045em] text-fg">
            Seeing is no longer{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-cyan">believing.</span>
          </h1>
          <p className="mt-8 max-w-[34rem] text-[clamp(1.02rem,1.35vw,1.2rem)] leading-relaxed text-silver/90">
            Trust can be manufactured. Requests can be manipulated. MIRAGE investigates what lies beneath the surface.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button to="/auth" size="lg" magnetic icon={<ArrowRight size={17} />} className="flex-row-reverse">
              Investigate a file
            </Button>
            <Button variant="outline" size="lg" magnetic icon={<Play size={14} className="fill-current" />} onClick={() => scrollToId("illusion")}>
              Watch the illusion break
            </Button>
          </div>
          <div className="absolute inset-x-4 bottom-8 flex flex-wrap items-center gap-x-10 gap-y-2 font-mono text-[11px] tracking-[0.08em] text-muted sm:inset-x-8">
            <span className="text-silver">↓ Scroll to dissect a deepfake</span>
            <span>41% of CISOs · deepfake on an employee audio call (Gartner, Sep 2026)</span>
            <span className="hidden md:inline">Case MRG-0412 · opened 31 Oct 2026</span>
          </div>
        </div>

        {/* Section 1 — The Illusion (overlays inside the pinned scene) */}
        <div className="pointer-events-none absolute inset-0 z-10 mx-auto flex max-w-[1400px] items-center px-4 sm:px-8">
          <div className="illusion-a max-w-xl opacity-0">
            <h2 className="text-[clamp(2.2rem,4.6vw,4rem)] font-medium leading-[1] tracking-[-0.035em]">
              A face is a texture.
              <br />
              <span className="text-muted">A voice is a waveform.</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-silver/85">
              Both can now be generated on demand, in your boss's accent, on your family's number, at the moment you are
              most likely to comply.
            </p>
          </div>
          <div className="split-label absolute left-[52%] top-[22%] hidden font-mono text-[11px] tracking-[0.18em] text-cyan opacity-0 md:block">
            AUTHENTIC · 0.04
          </div>
          <div className="split-label absolute right-[8%] top-[30%] hidden font-mono text-[11px] tracking-[0.18em] text-crimson opacity-0 md:block">
            SYNTHETIC · 0.93
          </div>
          <div className="illusion-b absolute inset-x-4 top-1/2 mx-auto max-w-4xl -translate-y-1/2 text-center opacity-0 sm:inset-x-8">
            <p className="font-mono text-[11px] tracking-[0.18em] text-crimson">HONG KONG · 2024</p>
            <p className="tnum mt-4 text-[clamp(4rem,13vw,11rem)] font-light leading-[0.9] tracking-[-0.05em]">HK$200m</p>
            <p className="mx-auto mt-6 max-w-2xl text-[clamp(1.05rem,1.6vw,1.3rem)] leading-relaxed text-silver">
              Fifteen transfers after one video call in which every other participant was synthetic. The employee's first
              instinct was right. The meeting talked him out of it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

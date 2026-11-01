import { Eye, Mic, Play, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/hooks";
import { cx } from "@/lib/format";

/**
 * The Truth Lens: a WhatsApp voice note that looks exactly like your father, and a glass lens that shows what MIRAGE
 * sees beneath it. Two identical layouts are stacked; the forensic layer is revealed through a circular mask that
 * follows the pointer (or drifts on its own, or opens fully with "Reveal all"). The voice score, transcript and tactics
 * are from a real MIRAGE check of demo_inputs/01_voice_check/02_ai_family_emergency_hinglish.ogg; the caller number and
 * voiceprint line are illustrative, and the caption says so.
 */

// per-bar synthetic score along the note (what the anti-spoofing windows found), and the surface waveform heights
const BARS = Array.from({ length: 56 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23 + 1)));
const SYN = BARS.map((_, i) => (i > 3 && i < 52 ? 0.82 + 0.16 * Math.abs(Math.sin(i * 1.3)) : 0.3));

const TACTIC = { urgency: "#fbbf24", secrecy: "#fb7185", payment: "#a78bfa", authority: "#67e8f9" } as const;

function Line({ children, mark }: { children: ReactNode; mark?: keyof typeof TACTIC }) {
  if (!mark) return <>{children}</>;
  const c = TACTIC[mark];
  return (
    <span className="relative rounded-sm" style={{ background: `color-mix(in oklab, ${c} 24%, transparent)`, boxShadow: `inset 0 -2px 0 ${c}` }}>
      {children}
      <span className="absolute -top-4 left-0 whitespace-nowrap font-mono text-[9px] tracking-[0.12em]" style={{ color: c }}>{mark.toUpperCase()}</span>
    </span>
  );
}

function Note({ xray }: { xray: boolean }) {
  return (
    <div className={cx("absolute inset-0 flex flex-col p-6 sm:p-9", xray ? "bg-[#06080f]" : "bg-[#0b141a]")}>
      {xray && <div className="pointer-events-none absolute inset-0 grid-field opacity-60" />}
      {/* chat header */}
      <div className="relative flex items-center gap-3">
        <span className={cx("grid size-11 place-items-center rounded-full text-[15px] font-semibold", xray ? "bg-crimson/20 text-crimson ring-1 ring-crimson/50" : "bg-[#2a3942] text-[#e9edef]")}>
          {xray ? <ShieldAlert size={20} /> : "P"}
        </span>
        <div className="min-w-0">
          <p className={cx("text-[16px] font-medium", xray ? "font-mono text-[13px] tracking-[0.06em] text-crimson" : "text-[#e9edef]")}>
            {xray ? "UNVERIFIED NUMBER · +91 98•• ••• 334" : "Papa 💛"}
          </p>
          <p className={cx("text-[12px]", xray ? "font-mono text-dim" : "text-[#8696a0]")}>
            {xray ? "voiceprint vs Papa (enrolled): 0.41 — no match" : "online"}
          </p>
        </div>
      </div>

      {/* the voice note */}
      <div className={cx("relative mt-8 max-w-[560px] rounded-2xl rounded-tl-sm p-4", xray ? "border border-crimson/40 bg-crimson/[0.06]" : "border border-transparent bg-[#202c33]")}>
        <div className="flex items-center gap-3">
          <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", xray ? "bg-crimson/20 text-crimson" : "bg-[#00a884] text-white")}>
            {xray ? <Mic size={17} /> : <Play size={16} className="ml-0.5 fill-current" />}
          </span>
          <div className="flex h-10 flex-1 items-center gap-[3px]">
            {BARS.map((h, i) => (
              <span key={i} className="w-[3px] flex-1 rounded-full"
                style={{ height: `${h * 100}%`, background: xray ? (SYN[i] > 0.7 ? `color-mix(in oklab, var(--color-crimson) ${Math.round(SYN[i] * 100)}%, transparent)` : "var(--color-mint)") : "#8696a0" }} />
            ))}
          </div>
          <span className={cx("font-mono text-[11px]", xray ? "text-crimson" : "text-[#8696a0]")}>{xray ? "0.96" : "0:18"}</span>
        </div>
        {/* present on both layers (invisible on the surface) so everything below sits at the same height */}
        <p className={cx("mt-2 font-mono text-[10px] tracking-[0.1em] text-crimson/90", !xray && "invisible")}>SYNTHETIC SPEECH · 3 detectors · 0.4–17.6 s · vocoder seam near 3.4 kHz</p>
      </div>

      {/* transcript bubble */}
      <div className={cx("relative mt-6 max-w-[560px] rounded-2xl rounded-tl-sm p-4 text-[15px] leading-[2.1]", xray ? "border border-line-2 bg-ink-2/80 text-fg" : "border border-transparent bg-[#202c33] text-[#e9edef]")}>
        {xray ? (
          <>
            Beta, <Line mark="authority">Papa bol raha hoon</Line>. Accident ho gaya hai, hospital mein hoon.{" "}
            <Line mark="urgency">Jaldi</Line> <Line mark="payment">50,000 bhej do</Line> is UPI pe,{" "}
            <Line mark="secrecy">mummy ko mat batana</Line>.
          </>
        ) : (
          <>Beta, Papa bol raha hoon. Accident ho gaya hai, hospital mein hoon. Jaldi 50,000 bhej do is UPI pe, mummy ko mat batana.</>
        )}
        {/* same width on both layers so the two transcripts wrap identically under the lens */}
        <span className={cx("ml-2 inline-block w-[9.5rem] align-bottom font-mono text-[10px]", xray ? "text-right text-dim" : "text-right text-[#8696a0]")}>{xray ? "transcribed · Hinglish" : "9:41 PM ✓✓"}</span>
      </div>

      {/* verdict */}
      <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-6">
        {xray ? (
          <>
            <span className="rounded-full bg-crimson px-4 py-1.5 font-mono text-[12px] font-semibold tracking-[0.12em] text-white">CRITICAL · VOICE CLONE</span>
            <span className="text-[14px] text-fg">Don't pay. Call Papa on his saved number.</span>
          </>
        ) : (
          <span className="text-[14px] text-[#8696a0]">Looks like him. Sounds like him.</span>
        )}
      </div>
    </div>
  );
}

export function TruthLens() {
  const box = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [pos, setPos] = useState({ x: 0.62, y: 0.55 });
  const [touched, setTouched] = useState(false);
  const [all, setAll] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // idle drift: a slow figure-eight across the note until the visitor takes the lens
  useEffect(() => {
    if (reduced || touched || all || !visible) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const s = (t - t0) / 1000;
      setPos({ x: 0.5 + 0.32 * Math.sin(s * 0.45), y: 0.52 + 0.26 * Math.sin(s * 0.9) });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, touched, all, visible]);

  const move = (cx_: number, cy: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setTouched(true);
    setPos({ x: Math.min(1, Math.max(0, (cx_ - r.left) / r.width)), y: Math.min(1, Math.max(0, (cy - r.top) / r.height)) });
  };

  const radius = all ? 1600 : 150;
  const mask = `radial-gradient(circle ${radius}px at ${pos.x * 100}% ${pos.y * 100}%, #000 calc(100% - 2px), transparent 100%)`;
  const lensStyle: CSSProperties = { left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width: radius * 2, height: radius * 2 };

  return (
    <section id="lens" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <p className="font-mono text-[11px] tracking-[0.2em] text-cyan">THE TRUTH LENS</p>
        <h2 className="mt-4 max-w-3xl text-[clamp(2.2rem,5vw,4.2rem)] font-medium leading-[0.98] tracking-[-0.04em]">
          Look <span className="font-serif font-normal italic text-cyan">beneath</span> the surface.
        </h2>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-silver/85">
          Your father sent a voice note. Drag the lens across it to see what MIRAGE hears.
        </p>

        <div ref={box}
          onPointerMove={(e) => e.pointerType === "mouse" && move(e.clientX, e.clientY)}
          onPointerDown={(e) => move(e.clientX, e.clientY)}
          onTouchMove={(e) => move(e.touches[0].clientX, e.touches[0].clientY)}
          className="group relative mt-12 aspect-[4/5] w-full cursor-none touch-none select-none overflow-hidden rounded-[28px] border border-line-2 shadow-[0_40px_120px_-40px_rgb(103_232_249/0.35)] sm:aspect-[16/10]"
          role="img" aria-label="A WhatsApp voice note from 'Papa'. Under the lens MIRAGE shows a synthetic voice (0.96), urgency, secrecy and a payment request: a critical voice-clone scam.">
          <Note xray={false} />
          <div className="absolute inset-0 transition-[mask-image] duration-700" style={{ WebkitMaskImage: mask, maskImage: mask }}>
            <Note xray />
          </div>
          {!all && (
            <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" style={lensStyle}>
              <span className="absolute inset-0 rounded-full border border-white/25 shadow-[inset_0_0_40px_rgb(103_232_249/0.25),0_0_0_1px_rgb(103_232_249/0.35),0_20px_60px_-10px_rgb(0_0_0/0.8)]" />
              <span className="absolute inset-[6px] rounded-full border border-cyan/20" />
              <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tracking-[0.18em] text-cyan">MIRAGE · LIVE READ</span>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button onClick={() => setAll((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-cyan/40 px-4 py-2 text-[13px] text-cyan transition-colors hover:bg-cyan/10">
            <Eye size={15} /> {all ? "Show the surface" : "Reveal all"}
          </button>
          <p className="text-[12px] text-dim">Voice score, transcript and tactics from a real MIRAGE check of a synthetic demo voice note (no real person's voice); the number and voiceprint line are illustrative.</p>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef } from "react";
import { useMedia, useReducedMotion } from "@/lib/hooks";
import { gsap } from "./useSmoothScroll";

function WaveViz() {
  const bars = useMemo(() => Array.from({ length: 64 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 0.75), []);
  return (
    <svg viewBox="0 0 256 80" className="w-full">
      <rect x="70" y="0" width="58" height="80" fill="rgb(251 113 133 / 0.12)" />
      <rect x="170" y="0" width="34" height="80" fill="rgb(251 113 133 / 0.12)" />
      {bars.map((h, i) => {
        const x = i * 4;
        const red = (x >= 70 && x < 128) || (x >= 170 && x < 204);
        return <rect key={i} x={x} y={40 - h * 34} width="2" height={h * 68} rx="1" fill={red ? "#fb7185" : "#67e8f9"} />;
      })}
    </svg>
  );
}

function VoiceprintViz() {
  return (
    <div className="space-y-3 font-mono text-[11px]">
      <div className="flex justify-between text-muted"><span>enrolled · R. Mehta</span><span>similarity</span></div>
      <div className="relative h-2 rounded-full bg-ink-4">
        <div className="absolute inset-y-0 left-0 w-[38%] rounded-full bg-crimson" />
        <div className="absolute -top-1 bottom-[-4px] left-[43%] w-px bg-silver" />
      </div>
      <div className="flex justify-between"><span className="text-crimson">0.38</span><span className="text-dim">match ≥ 0.43</span></div>
    </div>
  );
}

function FrameViz() {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {[0.12, 0.2, 0.86, 0.91].map((s, i) => (
        <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-md bg-ink-3">
          <div className="absolute inset-x-[22%] top-[18%] h-[52%] rounded-[45%] border border-silver/30" />
          {s > 0.5 && <div className="absolute left-1/2 top-[52%] size-6 -translate-x-1/2 rounded-full bg-crimson/60 blur-md" />}
          <span className="absolute bottom-1 left-1 font-mono text-[9px] text-muted">{s.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function SyncViz() {
  const pts = Array.from({ length: 40 }, (_, i) => `${i * 6.5},${40 - Math.exp(-(((i - 27) / 6) ** 2)) * 32 + Math.sin(i) * 2}`).join(" ");
  return (
    <svg viewBox="0 0 256 60" className="w-full">
      <line x1="130" x2="130" y1="0" y2="60" stroke="#5d6880" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth="1.8" />
      <text x="176" y="12" fill="#fb7185" fontFamily="Geist Mono" fontSize="10">+187 ms</text>
    </svg>
  );
}

function PhraseViz() {
  return (
    <p className="text-[13.5px] leading-[1.9] text-silver">
      Hi, it's Rajesh.{" "}
      <mark className="rounded bg-cyan/15 px-1 text-cyan">can't take calls</mark>. Please process{" "}
      <mark className="rounded bg-crimson/15 px-1 text-crimson">₹48,50,000</mark>{" "}
      <mark className="rounded bg-amber/15 px-1 text-amber">before 4 PM</mark>.{" "}
      <mark className="rounded bg-violet/20 px-1 text-violet">Keep this between us</mark>.
    </p>
  );
}

function ContactViz() {
  return (
    <div className="space-y-2 font-mono text-[12px]">
      <div className="flex justify-between border-b border-line pb-2"><span className="text-muted">Trustbook</span><span className="text-mint">+91 98200 11002</span></div>
      <div className="flex justify-between"><span className="text-muted">Observed</span><span className="text-crimson line-through decoration-crimson/40">+91 70451 88213</span></div>
      <div className="flex justify-between"><span className="text-muted">Channel</span><span className="text-amber">WhatsApp ≠ email · Teams</span></div>
    </div>
  );
}

function BeneficiaryViz() {
  return (
    <div className="space-y-2 font-mono text-[12px]">
      <div className="flex justify-between"><span className="text-muted">a/c 918273645501</span><span className="text-crimson">first seen: never</span></div>
      <div className="flex justify-between"><span className="text-muted">amount</span><span>₹48,50,000</span></div>
      <div className="flex justify-between"><span className="text-muted">request anomaly</span><span className="text-crimson">0.99</span></div>
    </div>
  );
}

function ProvenanceViz() {
  return (
    <div className="space-y-2 font-mono text-[12px]">
      <div className="flex justify-between"><span className="text-muted">C2PA manifest</span><span className="text-dim">none</span></div>
      <div className="flex justify-between"><span className="text-muted">PNG parameters</span><span className="text-crimson">sdxl · DPM++ 2M</span></div>
      <div className="flex justify-between"><span className="text-muted">CFA correlation</span><span className="text-crimson">0.19</span></div>
    </div>
  );
}

const EXHIBITS = [
  { id: "E1", witness: "Voice", color: "#67e8f9", title: "Synthetic speech", note: "Over-regular pitch and a missing high band between 0:04 and 0:09.", viz: <WaveViz /> },
  { id: "E2", witness: "Voice", color: "#67e8f9", title: "Voiceprint mismatch", note: "The speaker does not match the consented voiceprint on file.", viz: <VoiceprintViz /> },
  { id: "E3", witness: "Face", color: "#a78bfa", title: "Blending at the mouth", note: "Two of every five frames carry face-swap texture artefacts.", viz: <FrameViz /> },
  { id: "E4", witness: "Face", color: "#a78bfa", title: "Lip-sync drift", note: "The mouth trails the voice by a fifth of a second.", viz: <SyncViz /> },
  { id: "E5", witness: "Words", color: "#fbbf24", title: "Manipulation tactics", note: "Authority, urgency, secrecy and a channel switch, in Hinglish.", viz: <PhraseViz /> },
  { id: "E6", witness: "Identity", color: "#fb7185", title: "Wrong number, wrong channel", note: "The CFO is in the Trustbook. This is not his number.", viz: <ContactViz /> },
  { id: "E7", witness: "Identity", color: "#fb7185", title: "A beneficiary never paid", note: "New account, large amount, out of pattern for 12 months.", viz: <BeneficiaryViz /> },
  { id: "E8", witness: "Provenance", color: "#6ee7b7", title: "Generator fingerprints", note: "No content credentials; the file was written by an image model.", viz: <ProvenanceViz /> },
];

function Exhibit({ e }: { e: (typeof EXHIBITS)[number] }) {
  return (
    <article
      className="exhibit relative flex w-[78vw] shrink-0 flex-col p-6 sm:w-[360px]"
      style={{
        clipPath: "polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%)",
        background: "linear-gradient(180deg, rgb(17 26 46 / 0.85), rgb(9 14 26 / 0.9))",
        boxShadow: `inset 0 0 0 1px rgb(148 163 184 / 0.12)`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="etag" style={{ color: e.color, borderColor: `${e.color}55`, background: `${e.color}10` }}>{e.id}</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.14em] text-muted">{e.witness.toUpperCase()}</span>
          <span className="size-3 rounded-full border border-line-2" aria-hidden />
        </span>
      </div>
      <h3 className="mt-6 text-xl font-medium tracking-tight">{e.title}</h3>
      <div className="my-6 min-h-[92px]">{e.viz}</div>
      <p className="mt-auto text-[13.5px] leading-relaxed text-muted">{e.note}</p>
    </article>
  );
}

export function Evidence() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const desktop = useMedia("(min-width: 1024px)");
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = track.current;
    if (!desktop || reduced || !root.current || !el) return;
    const ctx = gsap.context(() => {
      const distance = () => el.scrollWidth - window.innerWidth + 64;
      gsap.to(el, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: () => `+=${distance()}`, scrub: 1, pin: true, invalidateOnRefresh: true },
      });
      gsap.from(".exhibit", { opacity: 0, y: 40, stagger: 0.08, duration: 0.8, ease: "expo.out", scrollTrigger: { trigger: root.current, start: "top 70%" } });
    }, root);
    return () => ctx.revert();
  }, [desktop, reduced]);

  return (
    <section id="evidence" ref={root} className="relative overflow-hidden bg-ink-0 py-24 lg:flex lg:h-dvh lg:flex-col lg:justify-center lg:py-0">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <h2 className="max-w-[16ch] text-[clamp(2.2rem,4.8vw,4.2rem)] font-medium leading-[1] tracking-[-0.035em]">
            The fake is never <span className="font-serif italic text-cyan">just</span> the face.
          </h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-muted">
            Every case becomes numbered exhibits. Media artefacts sit beside the wrong phone number, the unpaid account
            and the word "confidential", because attackers can clone a voice but not a context.
          </p>
        </div>
      </div>
      <div ref={track} className="mt-12 flex gap-5 overflow-x-auto px-4 pb-4 sm:px-8 lg:overflow-visible lg:pl-[max(2rem,calc((100vw-1400px)/2+2rem))]">
        {EXHIBITS.map((e) => (
          <Exhibit key={e.id} e={e} />
        ))}
      </div>
    </section>
  );
}

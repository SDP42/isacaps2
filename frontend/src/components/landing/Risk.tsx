import { useMemo, useState } from "react";
import { RiskRing } from "@/components/ui/primitives";
import { cx } from "@/lib/format";
import { simulate, type Action } from "@/lib/risk";

const PRESETS: { label: string; a: number; m: number; c: number; action: Action; secrecy: boolean }[] = [
  { label: "Fake voice says “Happy Diwali”", a: 0.85, m: 0.02, c: 0.1, action: "none", secrecy: false },
  { label: "Same voice asks for ₹48 lakh", a: 0.85, m: 0.75, c: 0.6, action: "payment", secrecy: true },
  { label: "Real voice, never-paid account", a: 0.05, m: 0.3, c: 0.62, action: "payment", secrecy: false },
  { label: "“IT” asks for your OTP", a: 0.2, m: 0.6, c: 0.3, action: "credential", secrecy: false },
];

const ACTIONS: { v: Action; label: string }[] = [
  { v: "none", label: "Nothing" },
  { v: "info", label: "Info" },
  { v: "data", label: "Data" },
  { v: "payment", label: "Money" },
  { v: "credential", label: "OTP" },
];

function Slider({ label, hint, value, onChange, color }: { label: string; hint: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] text-fg">{label}</span>
        <span className="tnum font-mono text-[12px]" style={{ color }}>{value.toFixed(2)}</span>
      </div>
      <p className="mb-2 text-[12.5px] text-muted">{hint}</p>
      <input
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-4 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fg [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgb(103_232_249/0.2)]"
        style={{ background: `linear-gradient(to right, ${color} ${value * 100}%, var(--color-ink-4) ${value * 100}%)` }}
      />
    </label>
  );
}

export function Risk() {
  const [a, setA] = useState(0.85);
  const [m, setM] = useState(0.75);
  const [c, setC] = useState(0.6);
  const [action, setAction] = useState<Action>("payment");
  const [secrecy, setSecrecy] = useState(true);
  const r = useMemo(() => simulate(a, m, c, action, secrecy), [a, m, c, action, secrecy]);
  const apply = (p: (typeof PRESETS)[number]) => {
    setA(p.a); setM(p.m); setC(p.c); setAction(p.action); setSecrecy(p.secrecy);
  };

  return (
    <section id="risk" className="relative bg-ink-0 py-28">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <h2 className="max-w-[17ch] text-[clamp(2.2rem,4.8vw,4.2rem)] font-medium leading-[1] tracking-[-0.035em]">
            A fake that asks for nothing is <span className="font-serif italic text-mint">not</span> an emergency.
          </h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-muted">
            Risk multiplies authenticity by consequence. Move the sliders: this is the same formula and the same policy
            rules the engine runs on every case.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="panel p-6 sm:p-8">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => apply(p)}
                  className="rounded-full border border-line-2 px-3 py-1.5 text-[12.5px] text-silver transition-colors hover:border-cyan/50 hover:text-fg">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-8 space-y-6">
              <Slider label="Authenticity concern" hint="Voice, face and provenance witnesses, confidence-weighted" value={a} onChange={setA} color="#67e8f9" />
              <Slider label="Manipulation" hint="Scam language and pressure tactics in the message" value={m} onChange={setM} color="#fbbf24" />
              <Slider label="Identity & context mismatch" hint="Wrong number, odd channel, above limit, new beneficiary" value={c} onChange={setC} color="#fb7185" />
            </div>
            <div className="mt-8">
              <p className="text-[14px] text-fg">What does it ask you to do?</p>
              <div className="mt-3 grid grid-cols-5 gap-1.5 rounded-xl border border-line bg-ink-1 p-1">
                {ACTIONS.map((x) => (
                  <button key={x.v} onClick={() => setAction(x.v)}
                    className={cx("h-9 rounded-lg text-[13px] transition-colors", action === x.v ? "bg-ink-4 text-fg" : "text-muted hover:text-silver")}>
                    {x.label}
                  </button>
                ))}
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-3 text-[13.5px] text-silver">
                <input type="checkbox" checked={secrecy} onChange={(e) => setSecrecy(e.target.checked)} className="size-4 accent-[#67e8f9]" />
                Message asks for secrecy or to skip approvals
              </label>
            </div>
          </div>

          <div className="panel flex flex-col items-center justify-between gap-6 p-6 sm:p-8">
            <div className="w-full font-mono text-[12.5px] leading-relaxed text-muted">
              <p>RISK = 100 · σ( logit( 1 − (1 − <span className="text-cyan">A</span>·S)(1 − <span className="text-amber">M</span>·S)(1 − <span className="text-crimson">C</span>) ) / T )</p>
              <p className="mt-1 text-dim">S = {({ none: 0.1, info: 0.3, data: 0.6, payment: 1, credential: 1 } as const)[action]} · T = 1.65 (fitted)</p>
            </div>
            <RiskRing risk={r.risk} band={r.band} size={230} />
            <div className="w-full space-y-3">
              {(["authenticity", "manipulation", "context"] as const).map((k) => (
                <div key={k} className="flex items-center gap-3 text-[13px]">
                  <span className="w-28 capitalize text-muted">{k}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-4">
                    <div className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${Math.min(100, r.contributions[k])}%`, background: k === "authenticity" ? "#67e8f9" : k === "manipulation" ? "#fbbf24" : "#fb7185" }} />
                  </div>
                  <span className="tnum w-8 text-right font-mono text-[12px] text-silver">{r.contributions[k].toFixed(0)}</span>
                </div>
              ))}
              <p className="min-h-[2.8em] border-t border-line pt-3 text-[13.5px] leading-relaxed text-silver">
                {r.ruleText ? <><span className="font-mono text-[11px] text-cyan">POLICY · </span>{r.ruleText}</> : "No hard rule fired; the calibrated score decides."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

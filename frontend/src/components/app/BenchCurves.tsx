import { useMemo, useState } from "react";
import { cx } from "@/lib/format";

export interface BenchEntry { n: number; auc?: number; eer?: number; eer_thr?: number; "acc@0.5"?: number; roc?: [number, number][]; calibration?: [number, number, number][] }
export type Benchmark = Record<string, Record<string, BenchEntry>>;

const SETS: Record<string, string> = {
  audio_df: "Deepfake speech", img_modern: "Modern AI images", face_ff: "FaceForensics++ faces", face_openforensics: "OpenForensics faces (in the wild)",
  india_sms: "Indian scam SMS", india_multi: "Indian scam SMS (multilingual)", scam_dialogue: "Scam call dialogues", sms_uci: "UCI SMS spam",
};
const NAMES: Record<string, string> = {
  df_arena: "DF_Arena 500M", nii: "NII AntiDeepfake", ensemble: "Ensemble", commfor: "Community Forensics", swinv2: "SwinV2",
  gend: "GenD CLIP", gend_pe: "GenD PE", face_ensemble: "Face ensemble", image_ensemble: "Image ensemble (on faces)",
  "tfidf(own)": "TF-IDF (own)", phishing: "Phishing DistilBERT", nli: "mDeBERTa zero-shot", words_witness: "Words witness",
  claude_judge: "Claude judge", "words_witness+judge": "Words witness + Claude",
};
const PALETTE = ["#67e8f9", "#a78bfa", "#fbbf24", "#6ee7b7", "#fb7185", "#93c5fd"];
const ENSEMBLES = new Set(["ensemble", "face_ensemble", "words_witness"]);

const S = 220;
const P = 38;

/**
 * ROC curves and a reliability diagram for every model on one benchmark set, from `models_store/benchmark.json`.
 * Ensembles are drawn heavier; hovering a legend entry isolates that model on both charts.
 */
export function BenchCurves({ bench }: { bench: Benchmark }) {
  const sets = useMemo(() => Object.keys(SETS).filter((s) => Object.values(bench).some((m) => m[s]?.roc)), [bench]);
  // open on a set where the models actually differ; deepfake speech is a flat 1.0 for every model
  const [set, setSet] = useState(sets.includes("face_openforensics") ? "face_openforensics" : sets[0] ?? "audio_df");
  const [focus, setFocus] = useState<string | null>(null);
  const models = Object.entries(bench).filter(([, v]) => v[set]?.roc).map(([k, v], i) => ({ key: k, e: v[set], color: PALETTE[i % PALETTE.length] }));
  const x = (v: number) => P + v * S;
  const y = (v: number) => P + (1 - v) * S;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  if (!sets.length) {
    return <p className="p-5 text-[13px] text-muted">No curves recorded yet. Run <span className="font-mono text-silver">scripts/benchmark_models.py</span> to write ROC points and calibration bins into benchmark.json.</p>;
  }

  const axes = (xl: string, yl: string) => (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={P} y2={P + S} stroke="rgb(148 163 184 / 0.08)" />
          <line x1={P} x2={P + S} y1={y(t)} y2={y(t)} stroke="rgb(148 163 184 / 0.08)" />
          <text x={x(t)} y={P + S + 13} textAnchor="middle" className="fill-dim font-mono text-[9px]">{t}</text>
          <text x={P - 6} y={y(t) + 3} textAnchor="end" className="fill-dim font-mono text-[9px]">{t}</text>
        </g>
      ))}
      <rect x={P} y={P} width={S} height={S} fill="none" stroke="var(--color-line-2)" />
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--color-dim)" strokeDasharray="3 4" />
      <text x={P + S / 2} y={P + S + 27} textAnchor="middle" className="fill-muted font-mono text-[9.5px]">{xl}</text>
      <text transform={`translate(9 ${P + S / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted font-mono text-[9.5px]">{yl}</text>
    </>
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Benchmark set">
        {sets.map((s) => (
          <button key={s} role="tab" aria-selected={set === s} onClick={() => setSet(s)}
            className={cx("h-7 rounded-md border px-2.5 text-[12px] transition-colors", set === s ? "border-cyan/40 bg-cyan/[0.07] text-fg" : "border-line text-muted hover:text-silver")}>
            {SETS[s]}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[auto_auto_1fr]">
        <figure>
          <svg viewBox={`0 0 ${S + P * 2} ${S + P * 2 + 8}`} width={S + P * 2} className="max-w-full" role="img" aria-label={`ROC curves on ${SETS[set]}`}>
            {axes("false-positive rate", "true-positive rate")}
            {models.map((m) => {
              const d = m.e.roc!.map(([f, t], i) => `${i ? "L" : "M"}${x(f).toFixed(1)},${y(t).toFixed(1)}`).join("");
              const dim = focus && focus !== m.key;
              return <path key={m.key} d={d} fill="none" stroke={m.color} strokeWidth={ENSEMBLES.has(m.key) ? 2.4 : 1.4} strokeOpacity={dim ? 0.12 : 0.95} strokeLinejoin="round" />;
            })}
            {models.filter((m) => m.e.eer != null).map((m) => (
              <circle key={m.key} cx={x(m.e.eer!)} cy={y(1 - m.e.eer!)} r={3} fill={m.color} opacity={focus && focus !== m.key ? 0.12 : 1}><title>{`${NAMES[m.key] ?? m.key}: EER ${m.e.eer}`}</title></circle>
            ))}
          </svg>
          <figcaption className="mt-1 font-mono text-[10px] text-dim">ROC · dots mark each model's equal-error point</figcaption>
        </figure>
        <figure>
          <svg viewBox={`0 0 ${S + P * 2} ${S + P * 2 + 8}`} width={S + P * 2} className="max-w-full" role="img" aria-label={`Calibration on ${SETS[set]}`}>
            {axes("predicted fake score", "observed fake rate")}
            {models.map((m) => {
              const pts = m.e.calibration ?? [];
              const dim = focus && focus !== m.key;
              const max = Math.max(1, ...pts.map((p) => p[2]));
              return (
                <g key={m.key} opacity={dim ? 0.12 : 1}>
                  <path d={pts.map(([p, o], i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(o).toFixed(1)}`).join("")} fill="none" stroke={m.color} strokeWidth={1.2} strokeOpacity={0.7} />
                  {pts.map(([p, o, n], i) => <circle key={i} cx={x(p)} cy={y(o)} r={1.8 + 3.2 * Math.sqrt(n / max)} fill={m.color} fillOpacity={0.85}><title>{`${NAMES[m.key] ?? m.key}: scored ~${p}, ${Math.round(o * 100)}% fake (n ${n})`}</title></circle>)}
                </g>
              );
            })}
          </svg>
          <figcaption className="mt-1 font-mono text-[10px] text-dim">Reliability · on the diagonal = calibrated · dot size = samples</figcaption>
        </figure>
        <ul className="min-w-0 space-y-1" onMouseLeave={() => setFocus(null)}>
          {models.map((m) => (
            <li key={m.key}>
              <button onMouseEnter={() => setFocus(m.key)} onFocus={() => setFocus(m.key)} onBlur={() => setFocus(null)}
                className="grid w-full grid-cols-[10px_1fr_auto] items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.03]">
                <span className="h-0.5 w-2.5 rounded-full" style={{ background: m.color, height: ENSEMBLES.has(m.key) ? 3 : 2 }} />
                <span className="truncate text-[12.5px] text-silver">{NAMES[m.key] ?? m.key}</span>
                <span className="tnum font-mono text-[11px] text-muted">AUC <span className="text-fg">{m.e.auc?.toFixed(3) ?? "—"}</span> · EER {m.e.eer?.toFixed(3) ?? "—"}</span>
              </button>
            </li>
          ))}
          <li className="px-2 pt-2 font-mono text-[10.5px] text-dim">n = {models[0]?.e.n ?? 0} samples · scores are each model's raw output, before MIRAGE recentres it on its threshold</li>
        </ul>
      </div>
    </div>
  );
}

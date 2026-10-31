import { CheckCircle2, ShieldX } from "lucide-react";
import { useState } from "react";
import { Empty, PanelHead, Segmented, Skeleton } from "@/components/ui/primitives";
import { clock, cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface Models { metrics: Record<string, any>; llm: string; model_version: string; policy_version: string }
interface Audit { chain: { intact: boolean; checked: number; head?: string; broken_at?: number }; entries: { id: number; case_id: string | null; actor: string; action: string; payload_hash: string; prev_hash: string; this_hash: string; ts: string }[] }

const CARDS: Record<string, { title: string; what: string; data: string; upgrade: string }> = {
  words: { title: "Words · scam-language classifier", what: "Char 2–5 + word 1–2 n-gram TF-IDF, logistic regression, sigmoid-calibrated. Plus a tactic lexicon with spans.", data: "Synthetic EN / HI / Hinglish corpus, 10 scam and 3 legitimate families.", upgrade: "MuRIL / mDeBERTa fine-tune on real phishing and SMS corpora." },
  voice: { title: "Voice · synthetic-speech detector", what: "Spoofing features (jitter, shimmer, flatness, high band, vocoder periodicity) into isotonic-calibrated gradient boosting.", data: "Source-filter speech simulator through telephony, WhatsApp and μ-law channels.", upgrade: "wav2vec2-XLSR + AASIST on ASVspoof 5, In-the-Wild, IndicSynth." },
  provenance: { title: "Provenance · AI-image detector", what: "ELA, noise residual, spectral slope and upsampling peaks, CFA correlation, saturation.", data: "Procedural camera (Bayer + sensor noise) vs generator-like images.", upgrade: "CLIP ViT-L/14 linear probe (UnivFD) on GenImage." },
  voiceprint: { title: "Voiceprint · speaker verification", what: "Background-normalised pitch + long-term spectrum embedding, cosine at the EER threshold.", data: "Held-out simulated speakers over random channels.", upgrade: "ECAPA-TDNN (SpeechBrain) embeddings." },
  request_anomaly: { title: "Identity · request anomaly", what: "Isolation Forest over channel, hour, amount vs limit, beneficiary age.", data: "12 months of simulated Acme Fintech request logs with injected attacks.", upgrade: "Live IdP and payment-system feeds." },
};

function Metric({ k, v }: { k: string; v: number | string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{k}</p>
      <p className="tnum text-[17px] text-fg">{typeof v === "number" ? v.toFixed(3) : v}</p>
    </div>
  );
}

export default function System() {
  const [tab, setTab] = useState<"models" | "audit">("models");
  const { data: models } = useApi<Models>("/v1/models");
  const { data: audit, error: auditErr } = useApi<Audit>(tab === "audit" ? "/v1/audit?limit=120" : null, [tab]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-medium tracking-tight">Models &amp; audit</h1>
          <p className="text-[13.5px] text-muted">Model cards with honest, held-out metrics, and the tamper-evident audit chain.</p>
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: "models", label: "Model registry" }, { value: "audit", label: "Audit chain" }]} />
      </div>

      {tab === "models" ? (
        !models ? <Skeleton className="h-96" /> : (
          <>
            <div className="panel flex flex-wrap gap-x-10 gap-y-3 p-5 font-mono text-[12px]">
              <span><span className="text-dim">witness bundle </span><span className="text-fg">{models.model_version}</span></span>
              <span><span className="text-dim">risk policy </span><span className="text-fg">{models.policy_version}</span></span>
              <span><span className="text-dim">narration </span><span className="text-fg">{models.llm}</span></span>
              <span><span className="text-dim">trained </span><span className="text-fg">{models.metrics._meta?.trained_at}</span></span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {Object.entries(CARDS).map(([k, card]) => {
                const m = models.metrics[k] ?? {};
                return (
                  <section key={k} className="panel">
                    <PanelHead title={card.title} meta={m.split} />
                    <div className="space-y-4 p-5">
                      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
                        {m.auc != null && <Metric k="AUC" v={m.auc} />}
                        {m.eer != null && <Metric k="EER" v={m.eer} />}
                        {m.f1 != null && <Metric k="F1" v={m.f1} />}
                        {m.ece != null && <Metric k="ECE" v={m.ece} />}
                        {m.auc_mulaw_channel != null && <Metric k="AUC μ-law" v={m.auc_mulaw_channel} />}
                        {m.threshold_at_eer != null && <Metric k="threshold" v={m.threshold_at_eer} />}
                        {m.n_test != null && <Metric k="n test" v={String(m.n_test)} />}
                        {m.n_attacks != null && <Metric k="attacks" v={String(m.n_attacks)} />}
                      </div>
                      {m.auc_by_language && (
                        <p className="font-mono text-[11px] text-muted">AUC by language: {Object.entries(m.auc_by_language).map(([l, v]) => `${l} ${(v as number).toFixed(3)}`).join(" · ")}</p>
                      )}
                      {m.feature_importance && (
                        <div>
                          <p className="label mb-2 !text-[10px]">Permutation importance (AUC drop)</p>
                          <div className="space-y-1">
                            {Object.entries(m.feature_importance as Record<string, number>).slice(0, 5).map(([f, v]) => (
                              <div key={f} className="grid grid-cols-[130px_1fr_50px] items-center gap-2 font-mono text-[10.5px]">
                                <span className="truncate text-muted">{f}</span>
                                <span className="h-1 rounded-full bg-ink-4"><span className="block h-full rounded-full bg-cyan" style={{ width: `${Math.min(100, Math.max(2, v * 400))}%` }} /></span>
                                <span className="text-right text-silver">{v.toFixed(3)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <dl className="space-y-1.5 border-t border-line pt-3 text-[12.5px]">
                        <div><dt className="inline text-dim">Method · </dt><dd className="inline text-silver">{card.what}</dd></div>
                        <div><dt className="inline text-dim">Data · </dt><dd className="inline text-silver">{card.data}</dd></div>
                        <div><dt className="inline text-dim">Production path · </dt><dd className="inline text-silver">{card.upgrade}</dd></div>
                        {m.note && <div className="text-amber">{m.note}</div>}
                      </dl>
                    </div>
                  </section>
                );
              })}
              <section className="panel">
                <PanelHead title="Limitations, said out loud" />
                <ul className="space-y-2 p-5 text-[13px] leading-relaxed text-silver">
                  <li>Media witnesses are trained on simulated data, so their near-perfect proxy scores will not hold on real deepfakes. They are evidence, not proof.</li>
                  <li>The voiceprint EER is high; a mismatch is weak evidence and is weighted that way.</li>
                  <li>Hard policy rules mean an uncertain detector can never downgrade a credential or unverified money request.</li>
                  <li>Missing C2PA credentials are never treated as evidence of fakery.</li>
                  <li>The response MIRAGE always recommends is independent verification on a pre-trusted channel.</li>
                </ul>
              </section>
            </div>
          </>
        )
      ) : auditErr ? <Empty title={auditErr} /> : !audit ? <Skeleton className="h-96" /> : (
        <>
          <section className={cx("panel flex flex-wrap items-center gap-4 p-5", audit.chain.intact ? "border-mint/25" : "border-crimson/40")}>
            {audit.chain.intact ? <CheckCircle2 className="text-mint" /> : <ShieldX className="text-crimson" />}
            <div>
              <p className="text-[15px] text-fg">{audit.chain.intact ? "Audit chain intact" : `Chain broken at entry ${audit.chain.broken_at}`}</p>
              <p className="font-mono text-[11px] text-muted">{audit.chain.checked} entries verified · head {audit.chain.head?.slice(0, 24)}…</p>
            </div>
          </section>
          <section className="panel overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead><tr className="border-b border-line text-left font-mono text-[10px] tracking-[0.12em] text-dim"><th className="px-4 py-2.5 font-normal">#</th><th className="font-normal">TIME</th><th className="font-normal">ACTOR</th><th className="font-normal">ACTION</th><th className="font-normal">CASE</th><th className="px-4 font-normal">HASH ← PREV</th></tr></thead>
              <tbody>
                {audit.entries.map((e) => (
                  <tr key={e.id} className="border-b border-line/60">
                    <td className="px-4 py-2 font-mono text-dim">{e.id}</td>
                    <td className="font-mono text-[11px] text-muted">{clock(e.ts)}</td>
                    <td className="text-silver">{e.actor}</td>
                    <td className="text-fg">{e.action}</td>
                    <td className="font-mono text-[11px] text-muted">{e.case_id ?? "—"}</td>
                    <td className="px-4 font-mono text-[10.5px]"><span className="text-cyan">{e.this_hash.slice(0, 12)}</span><span className="text-dim"> ← {e.prev_hash.slice(0, 12)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

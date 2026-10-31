import { useState } from "react";
import { Waveform } from "@/components/app/Waveform";
import { PanelHead, Segmented } from "@/components/ui/primitives";
import { artifactUrl } from "@/lib/api";
import { cx, secs } from "@/lib/format";
import type { CaseDetail, EvidenceItem } from "@/lib/types";

function FrameTimeline({ timeline, keyframes, duration, onSeek }: { timeline: { t: number; score: number; face: boolean }[]; keyframes: { t: number; score: number; image: string }[]; duration: number; onSeek: (t: number) => void }) {
  const W = 600, H = 80;
  const pts = timeline.map((p) => `${(p.t / Math.max(duration, 0.01)) * W},${H - p.score * (H - 8) - 4}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 80 }}>
        <line x1="0" x2={W} y1={H - 0.65 * (H - 8) - 4} y2={H - 0.65 * (H - 8) - 4} stroke="#fb7185" strokeOpacity="0.35" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <polyline points={`0,${H} ${pts} ${W},${H}`} fill="rgb(167 139 250 / 0.12)" stroke="none" />
        <polyline points={pts} fill="none" stroke="#a78bfa" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {timeline.filter((p) => !p.face).map((p, i) => <circle key={i} cx={(p.t / duration) * W} cy={H - 3} r="2" fill="#5d6880" />)}
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {keyframes.map((k) => (
          <button key={k.t} onClick={() => onSeek(k.t)} className="group relative overflow-hidden rounded-lg border border-line text-left">
            <img src={k.image} alt={`Frame at ${secs(k.t)}`} className="aspect-video w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
            <span className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-ink-0/90 to-transparent px-2 pb-1 pt-4 font-mono text-[10px]">
              <span className="text-silver">{secs(k.t)}</span>
              <span className={k.score >= 0.65 ? "text-crimson" : "text-muted"}>{k.score.toFixed(2)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SyncCurve({ curve, offset }: { curve: { lag_ms: number; corr: number }[]; offset: number }) {
  const W = 300, H = 70;
  const min = Math.min(...curve.map((c) => c.lag_ms)), max = Math.max(...curve.map((c) => c.lag_ms));
  const cmin = Math.min(...curve.map((c) => c.corr)), cmax = Math.max(...curve.map((c) => c.corr), 0.01);
  const x = (l: number) => ((l - min) / Math.max(max - min, 1)) * W;
  const y = (c: number) => H - ((c - cmin) / Math.max(cmax - cmin, 0.01)) * (H - 10) - 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 70 }}>
      <line x1={x(0)} x2={x(0)} y1="0" y2={H} stroke="#5d6880" strokeDasharray="3 3" />
      <polyline points={curve.map((c) => `${x(c.lag_ms)},${y(c.corr)}`).join(" ")} fill="none" stroke="#a78bfa" strokeWidth="1.6" />
      <circle cx={x(offset)} cy={y(Math.max(...curve.map((c) => c.corr)))} r="3.5" fill="#fb7185" />
      <text x={x(offset) + 6} y="12" fill="#fb7185" fontFamily="Geist Mono" fontSize="10">{offset > 0 ? "+" : ""}{offset} ms</text>
    </svg>
  );
}

function ElaGrid({ grid }: { grid: number[][] }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${grid[0]?.length ?? 1}, 1fr)` }}>
      {grid.flat().map((v, i) => <span key={i} style={{ background: `rgb(251 113 133 / ${Math.max(0, v - 0.25) * 0.75})` }} />)}
    </div>
  );
}

export function MediaStudio({ detail, selected, onSelect }: { detail: CaseDetail; selected: string | null; onSelect: (id: string) => void }) {
  const [ela, setEla] = useState<"off" | "on">("off");
  const [videoT, setVideoT] = useState<number | null>(null);
  const media = detail.artifacts.filter((a) => a.kind !== "text");
  if (!media.length) return null;
  const ev = detail.evidence;

  return (
    <section className="panel overflow-hidden">
      <PanelHead title="Forensic media studio" meta={`${media.length} file${media.length > 1 ? "s" : ""} · synchronised with the ledger`} />
      <div className="divide-y divide-line">
        {media.map((a) => {
          const voice = detail.findings.find((f) => f.witness === "voice" && f.artifact_id === a.id);
          const face = detail.findings.find((f) => f.witness === "face" && f.artifact_id === a.id);
          const prov = detail.findings.find((f) => f.witness === "provenance" && f.artifact_id === a.id);
          const regions = ev.filter((e: EvidenceItem) => e.artifact_id === a.id && e.t0 != null && e.t1 != null && e.witness === "voice")
            .map((e) => ({ id: e.id, t0: e.t0!, t1: e.t1! }));
          const url = artifactUrl(detail.id, a.id);
          return (
            <div key={a.id} className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13.5px] text-fg">{a.filename}</p>
                <p className="font-mono text-[10.5px] text-dim">{a.kind} · sha256 {a.sha256.slice(0, 12)}… {a.duration_s ? `· ${a.duration_s}s` : ""}</p>
              </div>

              {a.kind === "video" && (
                <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
                  <video key={videoT ?? 0} src={url + (videoT != null ? `#t=${videoT}` : "")} controls className="w-full rounded-xl border border-line bg-black" />
                  {face?.details?.timeline && (
                    <div>
                      <p className="label mb-2">Frame inspection · face artefact score</p>
                      <FrameTimeline timeline={face.details.timeline} keyframes={face.details.keyframes ?? []} duration={face.details.duration_s || a.duration_s || 1} onSeek={setVideoT} />
                      {face.details.lip_sync && (
                        <div className="mt-4">
                          <p className="label mb-1">Lip-sync · audio-visual cross-correlation</p>
                          <SyncCurve curve={face.details.lip_sync.curve} offset={face.details.lip_sync.offset_ms} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {(a.kind === "audio" || a.kind === "video") && voice?.details?.waveform && (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="label">Audio waveform · synthetic-speech windows</p>
                    <p className="font-mono text-[10.5px] text-dim">
                      {voice.details.channel?.codec_guess} · SNR {voice.details.channel?.snr_db} dB
                      {voice.details.voiceprint_similarity != null && <> · voiceprint <span className={voice.details.voiceprint_similarity < 0.43 ? "text-crimson" : "text-mint"}>{voice.details.voiceprint_similarity.toFixed(2)}</span></>}
                    </p>
                  </div>
                  <Waveform peaks={voice.details.waveform} duration={voice.details.duration_s} src={a.kind === "audio" ? url : undefined}
                    regions={regions} activeRegion={selected} onRegion={onSelect} windows={voice.details.windows} />
                </div>
              )}

              {a.kind === "image" && prov && (
                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="relative overflow-hidden rounded-xl border border-line bg-ink-2">
                    <img src={url} alt={a.filename} className="max-h-[420px] w-full object-contain" />
                    {ela === "on" && prov.details.ela_grid && <ElaGrid grid={prov.details.ela_grid} />}
                  </div>
                  <div className="space-y-3">
                    <Segmented value={ela} onChange={setEla} options={[{ value: "off", label: "Original" }, { value: "on", label: "ELA heat" }]} />
                    <dl className="space-y-2 font-mono text-[11.5px]">
                      <div className="flex justify-between"><dt className="text-muted">AI probability</dt><dd className={prov.details.ai_probability > 0.6 ? "text-crimson" : "text-mint"}>{prov.details.ai_probability?.toFixed(2)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">C2PA</dt><dd>{prov.details.markers?.c2pa_manifest ? "present" : "none"}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Generator tag</dt><dd className={prov.details.markers?.generator_tag ? "text-crimson" : "text-dim"}>{prov.details.markers?.generator_tag ?? (prov.details.markers?.png_text_params ? "PNG params" : "—")}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Camera EXIF</dt><dd>{prov.details.exif?.Make ?? "—"}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">CFA correlation</dt><dd>{prov.details.features?.cfa_corr?.toFixed(2)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Noise residual</dt><dd>{prov.details.features?.resid_std?.toFixed(2)}</dd></div>
                    </dl>
                    <div className="flex flex-wrap gap-1">
                      {ev.filter((e) => e.artifact_id === a.id).map((e) => (
                        <button key={e.id} onClick={() => onSelect(e.id)} className={cx("etag", selected === e.id && "!bg-cyan !text-ink-0")}>{e.id} {e.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

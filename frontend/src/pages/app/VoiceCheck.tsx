import { AudioLines, Bot, FileAudio, Loader2, MessageSquareWarning, ScanLine, Upload, User } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ModelJury, type JuryMeta } from "@/components/app/ModelJury";
import { EvidenceTimeline } from "@/components/kit/EvidenceTimeline";
import { VerdictMatrix, useMatrixHistory } from "@/components/kit/VerdictMatrix";
import { RecordButton } from "@/components/app/VoiceControls";
import { SEVERITY_COLOR, WhatNow, type ResponsePlan } from "@/components/app/WhatNow";
import { Button } from "@/components/ui/Button";
import { Meter, PanelHead } from "@/components/ui/primitives";
import { post } from "@/lib/api";
import { cx, inr } from "@/lib/format";

interface Triage {
  sha256: string;
  stage1: { label: string; verdict: "ai" | "human" | "uncertain"; score: number | null; confidence: number; summary: string;
    models: Record<string, number> | null; meta?: Record<string, JuryMeta> | null; agree: boolean | null; windows: { t0: number; t1: number; score: number }[];
    waveform: number[] | null; duration_s: number; channel: { codec_guess: string; snr_db: number } | null; status: string; noisy?: boolean };
  stage2: { transcript: string; language: string | null; words: { w: string; t0: number; t1: number }[]; semantics: null | {
    score: number; summary: string; tactics: string[]; action: string; amount_inr: number | null; category: string; category_label: string;
    entities: Record<string, string[]>; deadline: string | null; spans: { kind: string; text: string; span: [number, number] }[] } };
  stage3: { severity: string; kind: string; why: string; synthetic: string; sensitive: boolean };
  response: ResponsePlan;
}

const SAMPLES = [
  { file: "cfo_voice_note.wav", label: "CFO voice note" },
  { file: "papa_voice_note.wav", label: "'Papa' emergency" },
  { file: "it_helpdesk.wav", label: "IT help-desk OTP" },
  { file: "townhall_avatar.wav", label: "AI townhall (harmless)" },
];
const TACTIC_COLOR: Record<string, string> = {
  urgency: "#fbbf24", authority: "#a78bfa", secrecy: "#fb7185", fear: "#f97316", reward: "#6ee7b7", channel_switch: "#67e8f9", bypass: "#f472b6",
};
const STAGES = ["Is the voice AI or human?", "What is it asking for?", "Combine both", "What to do now"];

function Highlighted({ text, spans }: { text: string; spans: { kind: string; span: [number, number] }[] }) {
  const parts = useMemo(() => {
    const s = [...spans].filter((x) => x.span).sort((a, b) => a.span[0] - b.span[0]);
    const out: { t: string; kind?: string }[] = [];
    let i = 0;
    for (const x of s) {
      if (x.span[0] < i) continue;
      out.push({ t: text.slice(i, x.span[0]) }, { t: text.slice(x.span[0], x.span[1]), kind: x.kind });
      i = x.span[1];
    }
    out.push({ t: text.slice(i) });
    return out;
  }, [text, spans]);
  return (
    <p className="text-[15px] leading-relaxed text-silver">
      {parts.map((p, i) => p.kind
        ? <mark key={i} title={p.kind} className="rounded px-0.5 text-fg" style={{ background: `color-mix(in oklab, ${TACTIC_COLOR[p.kind] ?? "#fbbf24"} 28%, transparent)` }}>{p.t}</mark>
        : <span key={i}>{p.t}</span>)}
    </p>
  );
}

export default function VoiceCheck() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [claimed, setClaimed] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Triage | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = (f: File) => {
    setFile(f);
    setR(null);
    setUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(f); });
  };
  const sample = async (name: string) => {
    const blob = await fetch(`/v1/samples/${name}`).then((x) => x.blob());
    pick(new File([blob], name, { type: "audio/wav" }));
  };
  const run = async () => {
    if (!file) return;
    setBusy(true);
    setR(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("claimed_sender", claimed);
      setR(await post<Triage>("/v1/voice/triage", fd));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const s1 = r?.stage1;
  const sem = r?.stage2.semantics;
  const point = useMemo(() => (r && r.stage1.score != null
    ? { synthetic: r.stage1.score, manipulation: r.stage2.semantics?.score ?? 0, sensitive: r.stage3.sensitive, at: Date.now() }
    : null), [r]);
  const history = useMatrixHistory(point);
  const vColor = s1?.verdict === "ai" ? "var(--color-crimson)" : s1?.verdict === "human" ? "var(--color-mint)" : "var(--color-silver)";

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-[26px] font-medium tracking-tight">Voice check</h1>
        <p className="text-[13.5px] text-muted">Two questions, in order: is this voice machine-generated, and what is it trying to get you to do?</p>
      </div>

      <section className="panel p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pick(f); }}
            onClick={() => input.current?.click()}
            className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-line-2 px-5 py-5 hover:border-cyan/50">
            <input ref={input} type="file" accept="audio/*,video/*,.ogg,.opus,.m4a,.weba" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
            {file ? <FileAudio className="text-cyan" /> : <Upload className="text-dim" />}
            <div className="min-w-0">
              <p className="truncate text-[14px] text-fg">{file ? file.name : "Drop a voice note, call recording or video"}</p>
              <p className="text-[12px] text-muted">WhatsApp .opus/.ogg, .m4a, .mp3, .wav, .mp4 · or record it below</p>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2">
            <RecordButton onFile={pick} />
            <input value={claimed} onChange={(e) => setClaimed(e.target.value)} placeholder="Who do they claim to be? (optional)"
              className="h-9 rounded-lg border border-line-2 bg-transparent px-3 text-[13px] outline-none focus:border-cyan/60" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="label !text-[10px]">Try</span>
          {SAMPLES.map((s) => (
            <button key={s.file} onClick={() => sample(s.file)} className="rounded-full border border-line-2 px-3 py-1 text-[12px] text-silver hover:border-cyan/40 hover:text-fg">{s.label}</button>
          ))}
          <span className="flex-1" />
          <Button onClick={run} disabled={!file || busy} loading={busy} icon={<ScanLine size={15} />}>Check this voice</Button>
        </div>
      </section>

      {/* stage rail */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((s, i) => {
          const reached = !!r || (busy && i === 0);
          return (
            <div key={s} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px]", reached ? "border-cyan/40 text-fg" : "border-line text-dim")}>
              <span className={cx("grid size-6 place-items-center rounded-full font-mono text-[11px]", reached ? "bg-cyan text-ink-0" : "bg-ink-3")}>
                {busy && !r && i === 0 ? <Loader2 size={12} className="animate-spin" /> : i + 1}
              </span>
              {s}
            </div>
          );
        })}
      </div>

      {r && s1 && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel">
              <PanelHead title="1 · Voice authenticity" meta={s1.channel?.codec_guess} />
              <div className="space-y-4 p-5">
                <div className="flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, ${vColor} 15%, transparent)`, color: vColor }}>
                    {s1.verdict === "ai" ? <Bot size={28} /> : s1.verdict === "human" ? <User size={28} /> : <AudioLines size={28} />}
                  </span>
                  <div className="flex-1">
                    <p className="text-[20px] font-medium" style={{ color: vColor }}>{s1.label}</p>
                    <p className="text-[12.5px] text-muted">Synthetic-speech probability {(s1.score ?? 0).toFixed(2)} · confidence {s1.confidence.toFixed(2)}</p>
                    <Meter value={s1.score ?? 0} color={vColor} className="mt-2" height={6} />
                  </div>
                </div>
                {s1.models && <ModelJury models={s1.models} meta={s1.meta} consensus={s1.score} fakeWord="synthetic" />}
                <p className="text-[12.5px] text-muted">{s1.summary}</p>
                {s1.noisy && (
                  <p className="rounded-lg border border-amber/40 bg-amber/[0.06] px-3 py-2 text-[12.5px] text-amber">
                    Background noise hides synthesis artefacts and can make real voices look synthetic, so the voice result is weak evidence here. The verdict leans on what is being asked.
                  </p>
                )}
              </div>
            </section>

            <section className="panel">
              <PanelHead title="2 · What it says" meta={r.stage2.language ?? undefined} />
              <div className="space-y-4 p-5">
                {r.stage2.transcript ? <Highlighted text={r.stage2.transcript} spans={sem?.spans ?? []} />
                  : <p className="text-[13px] text-muted">No intelligible speech was transcribed (too short or not speech).</p>}
                {sem && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {sem.tactics.map((t) => (
                        <span key={t} className="rounded-full px-2.5 py-0.5 text-[11.5px]" style={{ color: TACTIC_COLOR[t] ?? "#fbbf24", background: `color-mix(in oklab, ${TACTIC_COLOR[t] ?? "#fbbf24"} 14%, transparent)` }}>
                          {t.replace("_", " ")}
                        </span>
                      ))}
                      {!sem.tactics.length && <span className="text-[12px] text-dim">No pressure tactics found</span>}
                    </div>
                    <dl className="grid grid-cols-2 gap-3 font-mono text-[12px]">
                      <div><dt className="text-dim">Category</dt><dd className="text-fg">{sem.category_label}</dd></div>
                      <div><dt className="text-dim">Asks for</dt><dd className={sem.action !== "none" ? "text-crimson" : "text-mint"}>{sem.action.replace("_", " ")}</dd></div>
                      {sem.amount_inr != null && <div><dt className="text-dim">Amount</dt><dd className="text-fg">{inr(sem.amount_inr)}</dd></div>}
                      {sem.deadline && <div><dt className="text-dim">Deadline</dt><dd className="text-fg">{sem.deadline}</dd></div>}
                      {Object.entries(sem.entities).filter(([, v]) => v.length).map(([k, v]) => (
                        <div key={k}><dt className="text-dim">{k.toUpperCase()}</dt><dd className="truncate text-fg">{v.join(", ")}</dd></div>
                      ))}
                    </dl>
                    <p className="text-[12.5px] text-muted">Manipulation score {sem.score.toFixed(2)} · {sem.summary}</p>
                  </>
                )}
              </div>
            </section>
          </div>

          <section className="panel">
            <PanelHead title="Evidence on one clock" meta="audio, synthetic windows, words and tactics share one playhead · click or drag to seek" />
            <div className="p-4">
              <EvidenceTimeline duration={s1.duration_s} peaks={s1.waveform} windows={s1.windows} words={r.stage2.words}
                spans={(sem?.spans ?? []).filter((x) => x.span)} src={url ?? undefined} />
            </div>
          </section>

          <section className="panel">
            <PanelHead title="3 · Combined verdict" right={<span className="font-mono text-[11px]" style={{ color: SEVERITY_COLOR[r.stage3.severity] }}>{r.stage3.severity}</span>} />
            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <div className="flex gap-3">
                <MessageSquareWarning className="mt-1 shrink-0" style={{ color: SEVERITY_COLOR[r.stage3.severity] }} />
                <p className="text-[15px] leading-relaxed text-fg">{r.stage3.why}</p>
              </div>
              <VerdictMatrix synthetic={s1.score} verdict={r.stage1.verdict} manipulation={sem?.score ?? 0} sensitive={r.stage3.sensitive} history={history} />
            </div>
          </section>

          <WhatNow plan={r.response} />
          <p className="font-mono text-[10.5px] text-dim">sha256 {r.sha256}</p>
        </>
      )}
    </div>
  );
}

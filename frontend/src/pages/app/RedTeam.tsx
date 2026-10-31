import { Crosshair, FlaskConical, Grid3x3, Loader2, Play, ScanSearch, ShieldCheck, Skull, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Empty, Meter, PanelHead, Segmented, Skeleton } from "@/components/ui/primitives";
import { getToken, post } from "@/lib/api";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";

interface Attack { key: string; title: string; stage: string; levers: string[]; mitre: string[]; case: string; script: string; defence: string; has_image: boolean; voice: string }
interface Catalog { attacks: Attack[]; audio_launder: Record<string, string>; image_launder: Record<string, string>; generators: { neural_tts: boolean; image: boolean } }
interface Sample {
  id: string; attack: string; modality: string; launder: string; file: string | null; files: string[]; seconds: number;
  kit: { script: string; voice_engine?: string; image_engine?: string };
  detection: null | { score: number; caught: boolean; summary: string; models?: Record<string, number> | null };
  semantics: { score: number; tactics: string[]; action: string };
}
interface CampaignState {
  id: string; modality: string; attacks: string[]; launders: string[]; total: number; done: number; status: string; error: string | null;
  cells: { attack: string; launder: string; score: number; caught: boolean }[];
  by_launder: Record<string, { rate: number; mean: number }>; insights: string[]; elapsed_s: number;
}

/** Media served by the API needs the bearer token, so fetch it as a blob. */
function useAuthedUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    let made: string | null = null;
    fetch(path, { headers: { authorization: `Bearer ${getToken() ?? ""}` } })
      .then((r) => r.blob())
      .then((b) => { if (live) { made = URL.createObjectURL(b); setUrl(made); } });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return url;
}

function SampleView({ s, onInvestigate }: { s: Sample; onInvestigate: () => void }) {
  const url = useAuthedUrl(s.file ? `/v1/redteam/samples/${s.id}/${s.file}` : null);
  const det = s.detection;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-ink-2 p-3">
        {s.modality === "audio" && url && <audio src={url} controls className="w-full" />}
        {s.modality === "image" && url && <img src={url} alt="Generated attack sample" className="mx-auto max-h-[320px] rounded-lg" />}
        {s.modality === "video" && url && <video src={url} controls className="mx-auto max-h-[320px] rounded-lg" />}
        {s.modality === "text" && <p className="text-[14px] text-silver">"{s.kit.script}"</p>}
        {!url && s.file && <Skeleton className="h-16" />}
      </div>
      <p className="font-mono text-[11px] text-dim">
        {s.kit.voice_engine && <>voice: {s.kit.voice_engine} · </>}{s.kit.image_engine && <>image: {s.kit.image_engine} · </>}{s.seconds}s · {s.id}
      </p>
      {det && (
        <div className={cx("flex items-center gap-3 rounded-xl border px-4 py-3", det.caught ? "border-mint/40 bg-mint/[0.06]" : "border-crimson/40 bg-crimson/[0.07]")}>
          {det.caught ? <ShieldCheck className="text-mint" /> : <TriangleAlert className="text-crimson" />}
          <div className="min-w-0 flex-1">
            <p className={cx("text-[15px]", det.caught ? "text-mint" : "text-crimson")}>{det.caught ? "Caught by MIRAGE" : "Slipped past the media detector"}</p>
            <p className="text-[12px] text-muted">{det.summary}</p>
          </div>
          <span className="tnum font-mono text-[20px] text-fg">{det.score.toFixed(2)}</span>
        </div>
      )}
      {det?.models && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(det.models).map(([m, v]) => (
            <span key={m} className={cx("rounded-md border px-2 py-0.5 font-mono text-[10.5px]", v >= 0.5 ? "border-mint/30 text-mint" : "border-crimson/40 text-crimson")}>
              {m.split("/").pop()} {v.toFixed(2)}
            </span>
          ))}
        </div>
      )}
      <p className="text-[12.5px] text-muted">
        Script read by the Words witness: manipulation {s.semantics.score.toFixed(2)} · asks for {s.semantics.action} · {s.semantics.tactics.join(", ") || "no tactics"}
      </p>
      <Button variant="outline" size="sm" icon={<ScanSearch size={14} />} onClick={onInvestigate}>Run the full investigation</Button>
    </div>
  );
}

function Heatmap({ c, cat }: { c: CampaignState; cat: Catalog }) {
  const names = c.modality === "audio" ? cat.audio_launder : cat.image_launder;
  const title = (k: string) => cat.attacks.find((a) => a.key === k)?.title ?? k;
  const cell = (a: string, l: string) => c.cells.find((x) => x.attack === a && x.launder === l);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-1 text-[12px]">
        <thead>
          <tr>
            <th />
            {c.launders.map((l) => <th key={l} className="px-1 pb-1 text-left font-normal text-muted" title={names[l]}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {c.attacks.map((a) => (
            <tr key={a}>
              <td className="pr-2 text-silver">{title(a)}</td>
              {c.launders.map((l) => {
                const x = cell(a, l);
                if (!x) return <td key={l}><div className="h-10 animate-pulse rounded-md bg-ink-3" /></td>;
                const col = x.caught ? "var(--color-mint)" : "var(--color-crimson)";
                return (
                  <td key={l}>
                    <div className="grid h-10 place-items-center rounded-md font-mono text-[12px]" title={`${names[l]} · score ${x.score.toFixed(2)}`}
                      style={{ background: `color-mix(in oklab, ${col} ${18 + 40 * Math.abs(x.score - 0.5)}%, transparent)`, color: "var(--color-fg)" }}>
                      {x.caught ? "✓" : "✕"} {x.score.toFixed(2)}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td className="pr-2 text-dim">caught</td>
            {c.launders.map((l) => <td key={l} className="text-center font-mono text-muted">{c.by_launder[l] ? `${Math.round(c.by_launder[l].rate * 100)}%` : "…"}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function RedTeam() {
  const nav = useNavigate();
  const { data: cat, error } = useApi<Catalog>("/v1/redteam/catalog");
  const [sel, setSel] = useState<string>("ceo_voice_wire");
  const [modality, setModality] = useState<"audio" | "image" | "video" | "text">("audio");
  const [launder, setLaunder] = useState("clean");
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState<Sample | null>(null);
  const [cmod, setCmod] = useState<"audio" | "image">("audio");
  const [camp, setCamp] = useState<CampaignState | null>(null);

  const attack = cat?.attacks.find((a) => a.key === sel);
  useEffect(() => { if (attack && !attack.has_image && (modality === "image" || modality === "video")) setModality("audio"); }, [attack, modality]);
  useEffect(() => { setLaunder("clean"); }, [modality]);
  useEffect(() => {
    if (!camp || camp.status !== "running") return;
    const t = setInterval(async () => {
      try { setCamp(await fetch(`/v1/redteam/campaign/${camp.id}`, { headers: { authorization: `Bearer ${getToken() ?? ""}` } }).then((r) => r.json())); } catch { /* keep polling */ }
    }, 2500);
    return () => clearInterval(t);
  }, [camp]);

  if (error) return <div className="p-6"><Empty title={error} hint="The attack lab needs the analyst or admin role." /></div>;
  if (!cat) return <div className="p-6"><Skeleton className="h-96" /></div>;
  const launders = modality === "image" ? cat.image_launder : modality === "audio" ? cat.audio_launder : { clean: "As generated" };

  const generate = async () => {
    setBusy(true);
    setSample(null);
    try {
      setSample(await post<Sample>("/v1/redteam/generate", { attack: sel, modality, launder }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const investigate = async () => {
    if (!sample) return;
    const c = await post<{ id: string }>(`/v1/redteam/samples/${sample.id}/investigate`);
    nav(`/app/investigate?case=${c.id}`);
  };
  const runCampaign = async () => {
    try {
      setCamp(await post<CampaignState>("/v1/redteam/campaign", { modality: cmod }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[26px] font-medium tracking-tight"><Skull size={22} className="text-crimson" /> Red-team lab</h1>
          <p className="max-w-3xl text-[13.5px] text-muted">
            Build the attack the way scam crews do, launder it the way they evade detectors, then see whether MIRAGE still catches it.
            Synthetic voices and generated faces only, fictional names, every image stamped "MIRAGE RED TEAM".
          </p>
        </div>
        <div className="flex gap-2 font-mono text-[11px]">
          <span className={cx("rounded-md border px-2 py-1", cat.generators.neural_tts ? "border-mint/30 text-mint" : "border-line text-dim")}>neural voice {cat.generators.neural_tts ? "on" : "off"}</span>
          <span className={cx("rounded-md border px-2 py-1", cat.generators.image ? "border-mint/30 text-mint" : "border-line text-dim")}>image generator {cat.generators.image ? "on" : "procedural"}</span>
        </div>
      </div>

      <section className="panel">
        <PanelHead title="Attacker playbook" meta="pick a scheme" />
        <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {cat.attacks.map((a) => (
            <button key={a.key} onClick={() => setSel(a.key)}
              className={cx("rounded-xl border p-4 text-left transition-colors", sel === a.key ? "border-crimson/50 bg-crimson/[0.06]" : "border-line hover:border-line-2")}>
              <p className="text-[14.5px] text-fg">{a.title}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {a.levers.map((l) => <span key={l} className="rounded-full bg-ink-3 px-2 py-0.5 text-[10.5px] text-silver">{l}</span>)}
              </div>
            </button>
          ))}
        </div>
      </section>

      {attack && (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
          <section className="panel">
            <PanelHead title="How the attacker works" meta={attack.mitre.join(" · ")} />
            <div className="space-y-4 p-5 text-[13.5px] leading-relaxed">
              <div><p className="label mb-1"><Crosshair size={11} className="mr-1 inline" />Operation</p><p className="text-silver">{attack.stage}</p></div>
              <div><p className="label mb-1">Pretext script</p><p className="rounded-lg border border-line bg-ink-2 p-3 text-fg">"{attack.script}"</p></div>
              <div><p className="label mb-1">On record</p><p className="text-muted">{attack.case}</p></div>
              <div><p className="label mb-1 !text-mint">Antidote</p><p className="text-silver">{attack.defence}</p></div>
            </div>
          </section>

          <section className="panel">
            <PanelHead title="Forge and test" right={<Segmented value={modality} onChange={(v) => setModality(v as typeof modality)}
              options={[{ value: "audio", label: "Voice" }, ...(attack.has_image ? [{ value: "image" as const, label: "Image" }, { value: "video" as const, label: "Video" }] : []), { value: "text", label: "Text" }]} />} />
            <div className="space-y-4 p-5">
              <div>
                <p className="label mb-2">Laundering (how it reaches the victim)</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(launders).map(([k, v]) => (
                    <button key={k} onClick={() => setLaunder(k)} title={v}
                      className={cx("rounded-full border px-3 py-1 text-[12px]", launder === k ? "border-cyan bg-cyan/10 text-fg" : "border-line-2 text-silver hover:text-fg")}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={generate} loading={busy} icon={<FlaskConical size={15} />} variant="danger">
                {busy ? "Forging and analysing…" : "Forge attack and test MIRAGE"}
              </Button>
              {busy && <p className="flex items-center gap-2 text-[12px] text-muted"><Loader2 size={13} className="animate-spin" /> Writing the voice, laundering it, running the witnesses…</p>}
              {sample && <SampleView s={sample} onInvestigate={investigate} />}
            </div>
          </section>
        </div>
      )}

      <section className="panel">
        <PanelHead title="Robustness campaign" meta="every scheme × every laundering channel"
          right={
            <div className="flex items-center gap-2">
              <Segmented value={cmod} onChange={(v) => setCmod(v as "audio" | "image")} options={[{ value: "audio", label: "Voice" }, { value: "image", label: "Image" }]} />
              <Button size="sm" onClick={runCampaign} disabled={camp?.status === "running"} icon={<Play size={13} />}>Run campaign</Button>
            </div>
          } />
        <div className="space-y-4 p-5">
          {!camp ? (
            <div className="flex items-center gap-3 text-[13px] text-muted"><Grid3x3 size={18} /> Generates each scheme once, launders it through every channel and scores each variant. Takes 2–5 minutes on a GPU.</div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Meter value={camp.total ? camp.done / camp.total : 0} className="flex-1" height={6} />
                <span className="font-mono text-[12px] text-muted">{camp.done}/{camp.total} · {camp.elapsed_s}s · {camp.status}</span>
              </div>
              {camp.error && <p className="text-[13px] text-crimson">{camp.error}</p>}
              <Heatmap c={camp} cat={cat} />
              {camp.insights.length > 0 && (
                <ul className="space-y-1 text-[13px] text-silver">{camp.insights.map((s, i) => <li key={i}>· {s}</li>)}</ul>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

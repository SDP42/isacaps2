import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, CameraOff, CheckCircle2, RotateCcw, RotateCw, ScanFace, ShieldAlert, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { PanelHead } from "@/components/ui/primitives";
import { api, post } from "@/lib/api";
import { cx } from "@/lib/format";

interface Challenge { key: string; prompt: string }
interface FrameOut { face: boolean; index: number; done: boolean; pose?: { yaw: number; pitch: number; roll: number }; box?: [number, number, number, number]; calibrating?: boolean; advanced?: boolean; timed_out?: boolean; elapsed?: number }
interface Result {
  verdict: "LIVE" | "FAILED" | "SUSPECT"; why: string; passed: number; total: number; deepfake_score: number | null; frames: number;
  face_visible: number; median_reaction_s: number | null; deepfake_model: string | null; results: { key: string; passed: boolean; reaction_s: number | null }[];
}

// the view is mirrored like a selfie camera, so "your left" points to the screen's left
const CUE: Record<string, LucideIcon> = { turn_left: ArrowLeft, turn_right: ArrowRight, look_up: ArrowUp, look_down: ArrowDown, tilt_left: RotateCcw, tilt_right: RotateCw };
const VERDICT = {
  LIVE: { color: "var(--color-mint)", icon: CheckCircle2, title: "A live person followed the prompts" },
  FAILED: { color: "var(--color-amber)", icon: XCircle, title: "Liveness not shown" },
  SUSPECT: { color: "var(--color-crimson)", icon: ShieldAlert, title: "The face looks manipulated" },
};
const FPS = 6;

/**
 * Liveness challenge for a video call or onboarding: random head movements a replayed clip or a real-time face swap
 * struggles to follow. Frames go to the MIRAGE API (YuNet landmarks + GenD) and nothing is stored.
 */
export default function Liveness() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const run = useRef(0);
  const [phase, setPhase] = useState<"idle" | "starting" | "calibrating" | "challenge" | "done">("idle");
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [limit, setLimit] = useState(5);
  const [last, setLast] = useState<FrameOut | null>(null);
  const [flash, setFlash] = useState<"pass" | "miss" | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const stop = () => {
    run.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);

  const begin = async () => {
    setResult(null);
    setLast(null);
    setPhase("starting");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
    } catch (e) {
      const name = (e as { name?: string }).name;
      toast.error(name === "NotAllowedError" ? "Camera permission was blocked. Allow it from the address-bar icon and try again." : name === "NotFoundError" ? "No camera was found on this device." : "The camera could not start.");
      setPhase("idle");
      return;
    }
    const v = video.current!;
    v.srcObject = stream.current;
    await v.play().catch(() => {});
    let s: { session: string; challenges: Challenge[]; limit_s: number };
    try {
      s = await post("/v1/liveness/start", { count: 3 });
    } catch (e) {
      toast.error((e as Error).message);
      stop();
      setPhase("idle");
      return;
    }
    setChallenges(s.challenges);
    setLimit(s.limit_s);
    setPhase("calibrating");
    const id = ++run.current;
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    let lastIndex = 0;
    while (run.current === id) {
      const t0 = performance.now();
      c.width = 320;
      c.height = Math.round((320 * (v.videoHeight || 480)) / (v.videoWidth || 640));
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.75));
      if (!blob || run.current !== id) break;
      const fd = new FormData();
      fd.append("session", s.session);
      fd.append("file", blob, "frame.jpg");
      let out: FrameOut;
      try {
        out = await api<FrameOut>("/v1/liveness/frame", { method: "POST", body: fd });
      } catch (e) {
        toast.error((e as Error).message);
        break;
      }
      if (run.current !== id) break;
      setLast(out);
      if (!out.calibrating && out.face) setPhase((p) => (p === "calibrating" ? "challenge" : p));
      if (out.index > lastIndex) {
        setFlash(out.timed_out ? "miss" : "pass");
        window.setTimeout(() => setFlash(null), 450);
        lastIndex = out.index;
      }
      if (out.done) {
        try {
          setResult(await post<Result>("/v1/liveness/finish", { session: s.session }));
        } catch (e) {
          toast.error((e as Error).message);
        }
        setPhase("done");
        stop();
        return;
      }
      const wait = 1000 / FPS - (performance.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    stop();
    setPhase((p) => (p === "done" ? p : "idle"));
  };

  const cur = last && phase === "challenge" ? challenges[last.index] : null;
  const Cue = cur ? CUE[cur.key] : null;
  const box = last?.box;
  const left = (last?.elapsed ?? 0) / limit;

  return (
    <div className="mx-auto max-w-[1300px] space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-[26px] font-medium tracking-tight">Liveness check</h1>
        <p className="text-[13.5px] text-muted">Is a real person in front of the camera right now? Three random head movements that a replayed clip cannot follow, plus a deepfake check on the face.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="relative aspect-[4/3] bg-ink-0">
            <video ref={video} muted playsInline className={cx("absolute inset-0 size-full -scale-x-100 object-cover transition-opacity", phase === "idle" || phase === "done" ? "opacity-25" : "opacity-100")} />
            <canvas ref={canvas} hidden />
            {box && (phase === "calibrating" || phase === "challenge") && (
              <span className="absolute rounded-xl border-2 transition-[left,top,width,height] duration-150"
                style={{ left: `${(1 - box[0] - box[2]) * 100}%`, top: `${box[1] * 100}%`, width: `${box[2] * 100}%`, height: `${box[3] * 100}%`,
                  borderColor: flash === "pass" ? "var(--color-mint)" : flash === "miss" ? "var(--color-amber)" : "rgb(103 232 249 / 0.7)" }} />
            )}
            {(phase === "calibrating" || phase === "challenge") && last && !last.face && (
              <p className="absolute inset-x-0 top-4 mx-auto w-fit rounded-lg bg-ink-0/80 px-3 py-1.5 text-[13px] text-amber">No face in view: move into the frame</p>
            )}
            {phase === "calibrating" && last?.face && (
              <p className="absolute inset-x-0 bottom-6 mx-auto w-fit rounded-xl bg-ink-0/80 px-4 py-2 text-[15px] text-fg">Look straight at the camera…</p>
            )}
            {cur && Cue && (
              <div className="absolute inset-x-0 bottom-5 mx-auto flex w-fit items-center gap-4 rounded-2xl border border-cyan/30 bg-ink-0/85 px-5 py-3 backdrop-blur">
                <span className="relative grid size-12 place-items-center">
                  <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90"><circle cx="24" cy="24" r="21" fill="none" stroke="var(--color-ink-4)" strokeWidth="3" />
                    <circle cx="24" cy="24" r="21" fill="none" stroke="var(--color-cyan)" strokeWidth="3" strokeDasharray={132} strokeDashoffset={132 * Math.min(1, left)} strokeLinecap="round" /></svg>
                  <Cue size={22} className="text-cyan" />
                </span>
                <div>
                  <p className="font-mono text-[10.5px] text-dim">PROMPT {Math.min(last!.index + 1, challenges.length)} OF {challenges.length}</p>
                  <p className="text-[17px] font-medium text-fg">{cur.prompt}</p>
                </div>
              </div>
            )}
            {(phase === "idle" || phase === "starting") && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <ScanFace size={36} className="mx-auto text-dim" />
                  <Button className="mt-4" onClick={begin} loading={phase === "starting"} icon={<Camera size={15} />}>Start the camera</Button>
                  <p className="mt-2 text-[12px] text-dim">Frames are analysed and discarded; nothing is recorded.</p>
                </div>
              </div>
            )}
            {(phase === "calibrating" || phase === "challenge") && (
              <button onClick={() => { stop(); setPhase("idle"); }} className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-0/80 px-3 text-[12px] text-silver hover:text-fg"><CameraOff size={13} />Stop</button>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
            {challenges.length ? challenges.map((c, i) => {
              const r = result?.results[i];
              const done = (last?.index ?? 0) > i || r;
              return <span key={c.key + i} className={cx("h-1.5 flex-1 rounded-full transition-colors", r ? (r.passed ? "bg-mint" : "bg-amber") : done ? "bg-mint" : i === last?.index && phase === "challenge" ? "bg-cyan/60" : "bg-ink-4")} />;
            }) : <span className="h-1.5 flex-1 rounded-full bg-ink-4" />}
            {last?.pose && <span className="ml-2 font-mono text-[10.5px] text-dim">yaw {last.pose.yaw.toFixed(2)} · pitch {last.pose.pitch.toFixed(2)} · roll {last.pose.roll.toFixed(0)}°</span>}
          </div>
        </section>

        <section className="panel">
          <PanelHead title={result ? "Result" : "How it works"} />
          {result ? (
            <div className="space-y-4 p-5">
              {(() => {
                const v = VERDICT[result.verdict];
                return (
                  <div className="flex items-start gap-3">
                    <v.icon size={26} style={{ color: v.color }} className="shrink-0" />
                    <div>
                      <p className="text-[18px] font-medium" style={{ color: v.color }}>{v.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-silver">{result.why}</p>
                    </div>
                  </div>
                );
              })()}
              <ul className="divide-y divide-line rounded-lg border border-line">
                {result.results.map((r, i) => (
                  <li key={i} className="flex items-center justify-between px-3 py-2 text-[12.5px]">
                    <span className="text-silver">{challenges[i]?.prompt ?? r.key}</span>
                    <span className={cx("font-mono text-[11px]", r.passed ? "text-mint" : "text-amber")}>{r.passed ? `${r.reaction_s}s` : r.reaction_s != null ? "too fast" : "missed"}</span>
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-2 gap-3 font-mono text-[11.5px]">
                <div><dt className="text-dim">Deepfake score</dt><dd className={cx(result.deepfake_score != null && result.deepfake_score >= 0.5 ? "text-crimson" : "text-fg")}>{result.deepfake_score?.toFixed(2) ?? "not run"}</dd></div>
                <div><dt className="text-dim">Median reaction</dt><dd className="text-fg">{result.median_reaction_s != null ? `${result.median_reaction_s}s` : "—"}</dd></div>
                <div><dt className="text-dim">Face in view</dt><dd className="text-fg">{Math.round(result.face_visible * 100)}% of {result.frames} frames</dd></div>
                <div><dt className="text-dim">Face model</dt><dd className="truncate text-fg">{result.deepfake_model ?? "not installed"}</dd></div>
              </dl>
              <Button variant="outline" size="sm" onClick={begin} icon={<RotateCcw size={13} />}>Run again</Button>
            </div>
          ) : (
            <ol className="space-y-3 p-5 text-[13px] leading-relaxed text-silver">
              <li><span className="text-fg">1 · Neutral pose.</span> MIRAGE learns where your face normally points, so glasses or a tilted laptop do not matter.</li>
              <li><span className="text-fg">2 · Three random prompts.</span> Turn, tilt or look up or down within {limit} seconds. The order is drawn fresh each time, so a recording cannot anticipate it.</li>
              <li><span className="text-fg">3 · Reaction and face check.</span> Answers faster than a human can react are rejected, and every few frames the face goes through the same GenD deepfake detectors as uploaded video.</li>
              <li className="text-muted">Use it when a video caller asks for money or access: ask them to open this page and run the check while you watch, or run it yourself during onboarding.</li>
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

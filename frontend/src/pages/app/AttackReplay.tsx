import { ArrowRight, Check, Mail, Maximize2, MessageCircle, Mic, Pause, Phone, Play, RotateCcw, ShieldAlert, Video, Wallet, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Segmented } from "@/components/ui/primitives";
import { MiniRing } from "@/components/app/charts";
import { post } from "@/lib/api";
import { BAND_COLOR, cx, WITNESS_META } from "@/lib/format";
import { useLiveCase } from "@/lib/hooks";
import type { Band, CaseSummary } from "@/lib/types";

type Kind = "email" | "chat" | "voice" | "video" | "payment";
interface Stage { at: number; kind: Kind; from: string; title: string; body: string; channel: string }

const SCRIPT: Stage[] = [
  { at: 1, kind: "email", from: "Orbit Supplies Accounts", channel: "Email", title: "Updated bank details · INV-20931",
    body: "Dear Accounts, our bank details have changed due to an internal audit. Kindly release the pending invoice to the new account 918273645501 by EOD today. Please keep this confidential." },
  { at: 7, kind: "chat", from: "+91 70451 88213", channel: "WhatsApp-style chat", title: "Rajesh (CFO)?",
    body: "Hi Kavita, Rajesh here. In a board meeting, can't take calls. Orbit's new account is correct, process it today. Keep this between us until audit closes." },
  { at: 14, kind: "voice", from: "+91 70451 88213", channel: "Voice note", title: "Voice note · 0:15", body: "cfo_voice_note.wav" },
  { at: 24, kind: "video", from: "Ashok Raman (CEO)", channel: "Video call", title: "Incoming video call", body: "“Kavita, I need this done before 4 PM. The CFO has explained.”" },
  { at: 31, kind: "payment", from: "Payments portal", channel: "Payment", title: "Approve ₹48,50,000?", body: "Beneficiary 918273645501 · first seen today · requested by R. Mehta" },
];
const ICON: Record<Kind, typeof Mail> = { email: Mail, chat: MessageCircle, voice: Mic, video: Video, payment: Wallet };
const END = 40;

interface Intercept { stage: number; band?: Band; risk?: number; tactics?: string[]; action?: string; note: string }

function bandOf(score: number): Band {
  return score >= 0.7 ? "HIGH" : score >= 0.4 ? "MEDIUM" : "LOW";
}

/** Live Attack Replay: a scripted multi-channel attack against a phone, intercepted stage by stage by MIRAGE. */
export default function AttackReplay() {
  const [mode, setMode] = useState<"with" | "without">("with");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [caseId, setCaseId] = useState<string | undefined>();
  const [intercepts, setIntercepts] = useState<Intercept[]>([]);
  const [blocked, setBlocked] = useState(false);
  const fired = useRef<Set<number>>(new Set());
  const stageRoot = useRef<HTMLDivElement>(null);
  const voiceAudio = useRef<HTMLAudioElement | null>(null);
  const { detail, live } = useLiveCase(caseId);

  const reset = useCallback(() => {
    setPlaying(false);
    setT(0);
    setCaseId(undefined);
    setIntercepts([]);
    setBlocked(false);
    fired.current = new Set();
    voiceAudio.current?.pause();
  }, []);

  useEffect(reset, [mode, reset]);

  // clock
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((x) => (x >= END ? x : x + 0.1)), 100);
    return () => clearInterval(id);
  }, [playing]);
  useEffect(() => {
    if (t >= END) setPlaying(false);
  }, [t]);

  // fire stages
  useEffect(() => {
    SCRIPT.forEach((s, i) => {
      if (t < s.at || fired.current.has(i)) return;
      fired.current.add(i);
      if (s.kind === "voice") {
        voiceAudio.current = new Audio(`/v1/samples/${s.body}`);
        voiceAudio.current.play().catch(() => {});
      }
      if (mode === "without") return;
      if (s.kind === "email" || s.kind === "chat" || s.kind === "video") {
        post<{ score: number; details: { tactics: string[]; requested_action: string } }>("/v1/analyze/text", { text: s.body })
          .then((r) => setIntercepts((x) => [...x, { stage: i, band: bandOf(r.score), risk: r.score * 100, tactics: r.details.tactics, action: r.details.requested_action, note: `${s.channel} analysed` }]))
          .catch(() => {});
      } else if (s.kind === "voice") {
        setIntercepts((x) => [...x, { stage: i, note: "Voice note sealed · five witnesses convened" }]);
        post<CaseSummary>("/v1/scenarios/cfo_wire/run").then((c) => setCaseId(c.id)).catch(() => {});
      } else if (s.kind === "payment") {
        setIntercepts((x) => [...x, { stage: i, band: "HIGH", note: "Payment held pending callback" }]);
      }
    });
  }, [t, mode]);

  // MIRAGE interrupts the phone once the voice-note verdict lands
  useEffect(() => {
    if (mode === "with" && detail?.verdict?.band === "HIGH") setBlocked(true);
  }, [detail?.verdict?.band, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === "r") reset();
      if (e.key === "ArrowRight") setT((x) => Math.min(END, (SCRIPT.find((s) => s.at > x)?.at ?? END)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  const arrived = SCRIPT.filter((s) => t >= s.at);
  const paymentArrived = t >= SCRIPT[4].at;
  const v = detail?.verdict;
  const outcome = paymentArrived && t >= SCRIPT[4].at + 3 ? (mode === "without" ? "lost" : "held") : null;

  return (
    <div ref={stageRoot} className="relative flex min-h-[calc(100dvh-56px)] flex-col bg-ink-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight">Live attack replay</h1>
          <p className="text-[12.5px] text-muted">One attacker, five channels, forty seconds. Space to play, → to skip, R to reset.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: "with", label: "With MIRAGE" }, { value: "without", label: "Without MIRAGE" }]} />
          <button onClick={() => setPlaying((p) => !p)} className="flex h-9 items-center gap-2 rounded-lg bg-cyan px-4 text-[13px] font-medium text-ink-0">
            {playing ? <Pause size={14} /> : <Play size={14} className="fill-current" />}{playing ? "Pause" : t > 0 ? "Resume" : "Start attack"}
          </button>
          <button onClick={reset} className="grid size-9 place-items-center rounded-lg border border-line text-silver hover:text-fg" aria-label="Reset"><RotateCcw size={14} /></button>
          <button onClick={() => stageRoot.current?.requestFullscreen?.()} className="grid size-9 place-items-center rounded-lg border border-line text-silver hover:text-fg" aria-label="Fullscreen"><Maximize2 size={14} /></button>
        </div>
      </div>

      {/* timeline */}
      <div className="relative mx-4 mt-4 h-10 sm:mx-6">
        <div className="absolute inset-x-0 top-4 h-px bg-line" />
        <motion.div className="absolute left-0 top-4 h-px bg-cyan" style={{ width: `${(t / END) * 100}%` }} />
        {SCRIPT.map((s, i) => {
          const I = ICON[s.kind];
          const hit = intercepts.find((x) => x.stage === i);
          const c = hit?.band ? BAND_COLOR[hit.band] : t >= s.at ? "var(--color-fg)" : "var(--color-dim)";
          return (
            <button key={i} onClick={() => setT(s.at)} className="absolute -translate-x-1/2" style={{ left: `${(s.at / END) * 100}%` }} title={s.channel}>
              <span className="grid size-8 place-items-center rounded-full border bg-ink-0" style={{ borderColor: c, color: c }}><I size={14} /></span>
            </button>
          );
        })}
      </div>

      <div className="grid flex-1 gap-6 p-4 sm:p-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* the phone */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="relative rounded-[46px] border border-line-2 bg-ink-1 p-3 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.9)]">
            <div className="relative h-[640px] overflow-hidden rounded-[36px] border border-line bg-[#06080f]">
              <div className="flex items-center justify-between px-6 pb-2 pt-4 font-mono text-[11px] text-muted">
                <span>15:{(41 + Math.floor(t / 10)).toString().padStart(2, "0")}</span><span className="h-5 w-20 rounded-full bg-ink-3" /><span>5G</span>
              </div>
              <p className="px-5 pb-2 text-[12px] text-dim">Kavita Shah · Accounts Payable</p>
              <div className="space-y-2.5 overflow-y-auto px-4 pb-24" style={{ maxHeight: 560 }}>
                <AnimatePresence initial={false}>
                  {arrived.map((s, i) => {
                    const I = ICON[s.kind];
                    return (
                      <motion.div key={i} initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", damping: 22, stiffness: 260 }}
                        className={cx("rounded-2xl border p-3", s.kind === "payment" ? "border-amber/30 bg-amber/[0.06]" : "border-line bg-ink-2")}>
                        <div className="flex items-center gap-2 text-[11.5px] text-muted"><I size={12} />{s.channel}<span className="ml-auto font-mono text-[10px] text-dim">{s.from}</span></div>
                        <p className="mt-1 text-[13px] font-medium text-fg">{s.title}</p>
                        {s.kind === "voice" ? (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="grid size-8 place-items-center rounded-full bg-cyan/15 text-cyan"><Play size={12} className="fill-current" /></span>
                            <div className="flex h-6 flex-1 items-center gap-[2px]">
                              {Array.from({ length: 34 }, (_, k) => <span key={k} className="w-[3px] rounded-full bg-silver/60" style={{ height: 4 + ((k * 13) % 18) }} />)}
                            </div>
                          </div>
                        ) : s.kind === "video" ? (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <span className="flex items-center justify-center gap-1 rounded-lg bg-crimson-deep py-1.5 text-[12px] text-white"><Phone size={12} />Decline</span>
                            <span className="flex items-center justify-center gap-1 rounded-lg bg-mint py-1.5 text-[12px] text-ink-0"><Video size={12} />Join</span>
                          </div>
                        ) : s.kind === "payment" ? (
                          <>
                            <p className="mt-1 text-[12px] text-muted">{s.body}</p>
                            <div className="mt-2 rounded-lg py-2 text-center text-[13px] font-medium"
                              style={{ background: mode === "without" ? "#fbbf24" : "#18233b", color: mode === "without" ? "#04060b" : "#8e99ad" }}>
                              {mode === "without" ? "Approve" : "Held by MIRAGE"}
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-[12.5px] leading-snug text-silver">{s.body}</p>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {arrived.length === 0 && <p className="pt-40 text-center text-[13px] text-dim">A normal afternoon. Press Start attack.</p>}
              </div>

              {/* MIRAGE interruption */}
              <AnimatePresence>
                {blocked && mode === "with" && (
                  <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 26, stiffness: 220 }}
                    className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-crimson/40 bg-ink-1/95 p-5 backdrop-blur-xl">
                    <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-crimson"><ShieldAlert size={14} />MIRAGE · HIGH · DO NOT ACT</div>
                    <p className="mt-2 text-[16px] leading-snug text-fg">This voice is unlikely to be Rajesh, and he has never asked for payments on chat.</p>
                    <div className="mt-3 flex items-center justify-center gap-2 rounded-full bg-mint py-2.5 text-[13.5px] font-medium text-ink-0"><Phone size={14} />Call Rajesh on +91 98200 11002</div>
                    <button onClick={() => setBlocked(false)} className="absolute right-4 top-4 text-dim" aria-label="Dismiss"><X size={15} /></button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* outcomes */}
              <AnimatePresence>
                {outcome === "lost" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center bg-crimson-deep/90 p-8 text-center">
                    <div>
                      <p className="font-mono text-[11px] tracking-[0.16em] text-white/80">TRANSFER COMPLETE</p>
                      <p className="mt-3 text-[40px] font-light leading-none text-white">₹48,50,000</p>
                      <p className="mt-3 text-[14px] text-white/90">sent to a mule account in 40 seconds. Every message looked plausible on its own.</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* MIRAGE console */}
        <div className="min-w-0 space-y-4">
          {mode === "without" ? (
            <div className="panel grid min-h-[300px] place-items-center p-8 text-center">
              <div>
                <p className="font-mono text-[11px] tracking-[0.16em] text-dim">NO INVESTIGATION</p>
                <p className="mt-3 max-w-md text-[18px] leading-relaxed text-silver">
                  Without MIRAGE each channel is judged alone: an ordinary email, a plausible chat, a familiar voice, a busy CEO. Nobody connects them.
                </p>
                {outcome === "lost" && <p className="mt-6 text-[15px] text-crimson">Switch to “With MIRAGE” and replay.</p>}
              </div>
            </div>
          ) : (
            <>
              <div className="panel p-5">
                <div className="flex items-center justify-between">
                  <p className="label">Interceptions</p>
                  <span className="font-mono text-[11px] text-dim">{intercepts.length} / {SCRIPT.length} channels</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {SCRIPT.map((s, i) => {
                    const hit = intercepts.find((x) => x.stage === i);
                    const band = i === 2 && v ? v.band : hit?.band;
                    const I = ICON[s.kind];
                    return (
                      <span key={i} className="flex items-center gap-2">
                        <motion.span initial={false} animate={{ opacity: t >= s.at ? 1 : 0.25 }}
                          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]"
                          style={{ borderColor: band ? `${BAND_COLOR[band]}66` : "var(--color-line)", color: band ? BAND_COLOR[band] : "var(--color-muted)" }}>
                          <I size={12} />{s.kind}{band && <span className="font-mono text-[10px]">· {band}</span>}
                        </motion.span>
                        {i < SCRIPT.length - 1 && <ArrowRight size={12} className={t >= SCRIPT[i + 1].at ? "text-crimson" : "text-dim"} />}
                      </span>
                    );
                  })}
                </div>
                {intercepts.length >= 2 && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 font-mono text-[11px] text-crimson">
                    ⛓ linked campaign · shared account 918273645501 · shared number +91 70451 88213
                  </motion.p>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="panel p-5">
                  <p className="label mb-3">Message analysis · live</p>
                  <ul className="space-y-3">
                    <AnimatePresence initial={false}>
                      {intercepts.filter((x) => x.tactics).map((x) => (
                        <motion.li key={x.stage} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="rounded-lg border border-line bg-ink-1 p-3">
                          <div className="flex items-center justify-between text-[12.5px]">
                            <span className="text-fg">{SCRIPT[x.stage].channel}</span>
                            {x.band && x.risk != null && <MiniRing risk={x.risk} band={x.band} size={30} />}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {x.tactics!.map((tc) => <span key={tc} className="rounded-full border border-amber/30 px-2 py-0.5 text-[11px] text-amber">{tc.replace("_", " ")}</span>)}
                            {x.action && x.action !== "none" && <span className="rounded-full border border-crimson/30 px-2 py-0.5 text-[11px] text-crimson">asks: {x.action}</span>}
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                    {!intercepts.some((x) => x.tactics) && <li className="text-[13px] text-dim">Waiting for the first message…</li>}
                  </ul>
                </div>

                <div className="panel p-5">
                  <div className="flex items-center justify-between">
                    <p className="label">Voice note · full investigation</p>
                    {caseId && <Link to={`/app/cases/${caseId}`} className="font-mono text-[11px] text-cyan hover:underline">{caseId} →</Link>}
                  </div>
                  {!caseId ? <p className="mt-3 text-[13px] text-dim">Opens when the voice note arrives.</p> : (
                    <div className="mt-4 space-y-3">
                      <div className="h-1 overflow-hidden rounded-full bg-ink-4"><motion.div className="h-full bg-cyan" animate={{ width: `${(v ? 1 : live.progress) * 100}%` }} /></div>
                      <div className="grid grid-cols-3 gap-2">
                        {(["voice", "words", "identity"] as const).map((w) => {
                          const st = live.witnesses[w];
                          const f = detail?.findings.find((x) => x.witness === w);
                          const score = f?.score ?? st?.score;
                          return (
                            <div key={w} className="rounded-lg border border-line bg-ink-1 p-2.5">
                              <p className="text-[12px]" style={{ color: WITNESS_META[w].color }}>{WITNESS_META[w].label}</p>
                              <p className="font-mono text-[10.5px] text-dim">{score != null ? Number(score).toFixed(2) : st?.state ?? "queued"}</p>
                            </div>
                          );
                        })}
                      </div>
                      {v ? (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: `${BAND_COLOR[v.band]}55` }}>
                          <MiniRing risk={v.risk} band={v.band} size={44} />
                          <p className="text-[13px] leading-snug text-silver">{v.summary.replace(/\s*\[E\d+\]/g, "")}</p>
                        </motion.div>
                      ) : (
                        <p className="font-mono text-[11px] text-amber">{live.stage}…</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {outcome === "held" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel flex flex-wrap items-center gap-4 border-mint/30 p-5">
                    <span className="grid size-10 place-items-center rounded-full bg-mint/15 text-mint"><Check size={18} /></span>
                    <div className="flex-1">
                      <p className="text-[16px] text-fg">₹48,50,000 held. The campaign was stopped at the voice note.</p>
                      <p className="text-[13px] text-muted">Next step: an independent callback on the Trustbook number confirms the fraud and flags the account for every future case.</p>
                    </div>
                    {caseId && <Link to={`/app/cases/${caseId}/verify`} className="rounded-lg bg-mint px-4 py-2 text-[13px] font-medium text-ink-0">Make the callback</Link>}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

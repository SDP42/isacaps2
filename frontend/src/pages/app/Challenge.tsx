import { ArrowRight, Image as ImageIcon, MessageSquareText, Mic, Play, RotateCcw, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getToken, post } from "@/lib/api";
import { cx } from "@/lib/format";

type Answer = "safe" | "scam";
interface Item {
  kind: "audio" | "image" | "text";
  title: string;
  prompt: string;
  src?: string;
  text?: string;
  truth: Answer;
  why: string;
}

const ITEMS: Item[] = [
  { kind: "audio", title: "Voice note from “Rajesh, CFO”", prompt: "Your CFO sends this voice note. Do you pay?", src: "cfo_voice_note.wav", truth: "scam",
    why: "The voice is synthetic, the number isn't his, and he never asks for payments on chat." },
  { kind: "text", title: "Message from HR", prompt: "Real, or a phishing attempt?", truth: "safe",
    text: "Payroll will be processed on the 28th. Contact HR through the portal if your bank details changed.",
    why: "No pressure, no new account, and it points you to the official portal rather than a link." },
  { kind: "image", title: "New account manager at a vendor", prompt: "This headshot came with new bank details. Trust it?", src: "vendor_headshot.png", truth: "scam",
    why: "The image was written by an image generator, and the email failed DMARC with a look-alike domain." },
  { kind: "audio", title: "Company townhall announcement", prompt: "An AI avatar voice. Is it a threat?", src: "townhall_avatar.wav", truth: "safe",
    why: "Yes, the voice is synthetic. But it asks for nothing, so MIRAGE tags it instead of raising an alarm." },
  { kind: "text", title: "WhatsApp from “Papa”", prompt: "Your father messages from a new number.", truth: "scam",
    text: "Beta main hoon, accident ho gaya hai, phone toot gaya. Paise abhi bhejo family.help@ibl pe, ₹75,000, kisi ko mat batana please.",
    why: "New number, urgency, secrecy and a UPI ID. Call Papa on his saved number and ask the family code word." },
  { kind: "image", title: "Notice from the “CBI”", prompt: "A police notice arrives during a video call.", src: "cbi_notice.png", truth: "scam",
    why: "No agency conducts a ‘digital arrest’ or asks for a deposit. OCR reads the threat straight off the image." },
];
const ICON = { audio: Mic, image: ImageIcon, text: MessageSquareText };

interface Verdict { score: number; summary: string; tactics?: string[] }

/** Spot the Fake: the audience votes "safe to act" or "scam", then MIRAGE reveals its live analysis. */
export default function Challenge() {
  const [i, setI] = useState(0);
  const [votes, setVotes] = useState<Record<number, Answer>>({});
  const [revealed, setRevealed] = useState<Record<number, Verdict>>({});
  const [busy, setBusy] = useState(false);
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const audio = useRef<HTMLAudioElement | null>(null);
  const done = i >= ITEMS.length;
  const item = ITEMS[Math.min(i, ITEMS.length - 1)];

  useEffect(() => {
    ITEMS.filter((x) => x.kind === "image").forEach(async (x) => {
      const r = await fetch(`/v1/samples/${x.src}`, { headers: { authorization: `Bearer ${getToken() ?? ""}` } });
      const url = URL.createObjectURL(await r.blob());
      setImgUrls((m) => ({ ...m, [x.src!]: url }));
    });
  }, []);

  const reveal = async () => {
    setBusy(true);
    try {
      let v: Verdict;
      if (item.kind === "text") {
        const r = await post<{ score: number; summary: string; details: { tactics: string[] } }>("/v1/analyze/text", { text: item.text });
        v = { score: r.score, summary: r.summary, tactics: r.details.tactics };
      } else {
        const r = await post<{ score: number; summary: string }>(`/v1/analyze/sample/${item.src}`);
        v = { score: r.score, summary: r.summary };
      }
      setRevealed((m) => ({ ...m, [i]: v }));
    } finally {
      setBusy(false);
    }
  };
  const play = () => {
    audio.current?.pause();
    audio.current = new Audio(`/v1/samples/${item.src}`);
    audio.current.play().catch(() => {});
  };

  const humanRight = Object.entries(votes).filter(([k, v]) => ITEMS[+k].truth === v).length;
  const v = revealed[i];

  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-medium tracking-tight">Spot the fake</h1>
          <p className="text-[13.5px] text-muted">The room votes first, then MIRAGE answers live. The question isn't “is it fake?” but “is it safe to act?”</p>
        </div>
        <div className="flex gap-1.5">
          {ITEMS.map((_, k) => (
            <span key={k} className={cx("h-1.5 w-8 rounded-full transition-colors", k < i ? (votes[k] === ITEMS[k].truth ? "bg-mint" : "bg-crimson") : k === i && !done ? "bg-cyan" : "bg-ink-4")} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!done ? (
          <motion.div key={i} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <section className="panel flex min-h-[420px] flex-col p-6">
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                {(() => { const I = ICON[item.kind]; return <I size={14} />; })()}
                <span className="font-mono tracking-[0.12em]">EXHIBIT {i + 1} / {ITEMS.length}</span>
              </div>
              <h2 className="mt-3 text-[22px] font-medium tracking-tight">{item.title}</h2>
              <p className="mt-1 text-[14.5px] text-silver">{item.prompt}</p>
              <div className="my-6 flex flex-1 items-center justify-center">
                {item.kind === "audio" && (
                  <button onClick={play} className="group flex flex-col items-center gap-4">
                    <span className="grid size-24 place-items-center rounded-full border border-cyan/40 bg-cyan/10 text-cyan transition-transform group-hover:scale-105"><Play size={30} className="ml-1 fill-current" /></span>
                    <span className="flex h-10 items-center gap-[3px]">{Array.from({ length: 40 }, (_, k) => <span key={k} className="w-[3px] rounded-full bg-silver/50" style={{ height: 6 + ((k * 17) % 30) }} />)}</span>
                    <span className="text-[12.5px] text-muted">Play the clip</span>
                  </button>
                )}
                {item.kind === "image" && (imgUrls[item.src!] ? <img src={imgUrls[item.src!]} alt={item.title} className="max-h-[300px] rounded-xl border border-line object-contain" /> : <div className="skeleton h-64 w-64" />)}
                {item.kind === "text" && <p className="max-w-lg rounded-2xl rounded-tl-sm border border-line bg-ink-2 p-5 text-[16px] leading-relaxed text-fg">{item.text}</p>}
              </div>
            </section>

            <section className="panel flex flex-col p-6">
              <p className="label flex items-center gap-2"><Users size={13} />The room votes</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {(["safe", "scam"] as Answer[]).map((a) => (
                  <button key={a} disabled={!!v} onClick={() => setVotes((m) => ({ ...m, [i]: a }))}
                    className={cx("flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border text-[15px] transition-all disabled:opacity-60",
                      votes[i] === a ? (a === "safe" ? "border-mint bg-mint/15 text-mint" : "border-crimson bg-crimson/15 text-crimson") : "border-line-2 text-silver hover:border-line-2 hover:bg-white/[0.03]")}>
                    {a === "safe" ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}{a === "safe" ? "Safe to act" : "Scam"}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex-1">
                {!v ? (
                  <Button className="w-full" disabled={!votes[i]} loading={busy} onClick={reveal}>Reveal MIRAGE's analysis</Button>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className={cx("rounded-2xl border p-4", item.truth === "scam" ? "border-crimson/40 bg-crimson/[0.06]" : "border-mint/40 bg-mint/[0.06]")}>
                      <p className={cx("font-mono text-[11px] tracking-[0.16em]", item.truth === "scam" ? "text-crimson" : "text-mint")}>
                        MIRAGE · {item.truth === "scam" ? "SCAM · DO NOT ACT" : "SAFE"}
                      </p>
                      <p className="mt-2 text-[15px] leading-relaxed text-fg">{item.why}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-ink-1 p-3 font-mono text-[11.5px] text-muted">
                      single-witness check · score {v.score?.toFixed(2)} · {v.summary}
                      {v.tactics && v.tactics.length > 0 && <div className="mt-1.5 text-amber">{v.tactics.join(" · ")}</div>}
                    </div>
                    <p className={cx("text-[14px]", votes[i] === item.truth ? "text-mint" : "text-crimson")}>
                      {votes[i] === item.truth ? "The room got this one." : "The room was fooled."}
                    </p>
                    <Button className="w-full flex-row-reverse" icon={<ArrowRight size={15} />} onClick={() => setI(i + 1)}>{i === ITEMS.length - 1 ? "See the score" : "Next exhibit"}</Button>
                  </motion.div>
                )}
              </div>
            </section>
          </motion.div>
        ) : (
          <motion.section key="score" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="panel p-8 text-center sm:p-12">
            <p className="font-mono text-[11px] tracking-[0.18em] text-dim">FINAL SCORE</p>
            <div className="mx-auto mt-8 grid max-w-xl grid-cols-2 gap-6">
              <div>
                <p className="tnum text-[64px] font-light leading-none text-silver">{humanRight}<span className="text-[28px] text-dim">/{ITEMS.length}</span></p>
                <p className="mt-2 text-[14px] text-muted">The room</p>
              </div>
              <div>
                <p className="tnum text-[64px] font-light leading-none text-cyan">{ITEMS.length}<span className="text-[28px] text-dim">/{ITEMS.length}</span></p>
                <p className="mt-2 text-[14px] text-muted">MIRAGE full pipeline</p>
                <p className="text-[11.5px] text-dim">same files, verdicts asserted by the test suite</p>
              </div>
            </div>
            <p className="mx-auto mt-8 max-w-xl text-[16px] leading-relaxed text-silver">
              Large studies put people close to chance at spotting high-quality deepfakes. MIRAGE doesn't win by out-seeing you: it checks the
              number, the channel, the account and the request, then sends you to verify.
            </p>
            <Button variant="outline" className="mt-8" icon={<RotateCcw size={14} />} onClick={() => { setI(0); setVotes({}); setRevealed({}); }}>Play again</Button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

import { Phone, PhoneOff, Repeat2, ShieldAlert, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { getToken, post } from "@/lib/api";
import type { CaseDetail, CaseSummary } from "@/lib/types";

interface CallbackResult { outcome: "deny" | "confirm"; person: string; phone: string; line: string; flagged: string[]; audio: string | null; case: CaseDetail }

/**
 * The out-of-band verification call, staged: ring on the Trustbook number, the real person answers (real audio),
 * the case is stamped, and the learning loop is offered as a one-click replay from a new number.
 */
export function CallbackSheet({ detail, open, onClose, onDone }: { detail: CaseDetail; open: boolean; onClose: () => void; onDone: (d: CaseDetail) => void }) {
  const [phase, setPhase] = useState<"ring" | "talk" | "done">("ring");
  const [res, setRes] = useState<CallbackResult | null>(null);
  const [typed, setTyped] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const nav = useNavigate();
  const idf = detail.findings.find((f) => f.witness === "identity");
  const who = idf?.details?.resolved?.name ?? (detail.claimed_sender || "the sender");
  const phone = idf?.details?.resolved?.directory_phone ?? "saved number";

  useEffect(() => {
    if (!open) return;
    setPhase("ring");
    setRes(null);
    setTyped("");
    let cancelled = false;
    const call = post<CallbackResult>(`/v1/cases/${detail.id}/callback`);
    const ring = new Promise((r) => setTimeout(r, 2400));
    Promise.all([call, ring]).then(async ([r]) => {
      if (cancelled) return;
      setRes(r);
      setPhase("talk");
      if (r.audio) {
        const blob = await fetch(r.audio, { headers: { authorization: `Bearer ${getToken() ?? ""}` } }).then((x) => x.blob());
        audio.current = new Audio(URL.createObjectURL(blob));
        audio.current.play().catch(() => {});
      }
      const words = r.line.split(" ");
      for (let i = 1; i <= words.length; i++) {
        if (cancelled) return;
        setTyped(words.slice(0, i).join(" "));
        await new Promise((x) => setTimeout(x, 230));
      }
      await new Promise((x) => setTimeout(x, 500));
      if (cancelled) return;
      setPhase("done");
      onDone(r.case);
      if (r.outcome === "deny") toast.success(`Confirmed fraud. ${r.flagged.length} identifier${r.flagged.length === 1 ? "" : "s"} flagged for future cases.`);
    }).catch((e) => toast.error(e.message));
    return () => {
      cancelled = true;
      audio.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detail.id]);

  const replay = async () => {
    const c = await post<CaseSummary>(`/v1/cases/${detail.id}/replay`);
    toast(`${c.id}: same attack, new number. Watch it get caught.`);
    onClose();
    nav(`/app/investigate?case=${c.id}`);
  };

  const initials = who.split(" ").map((x: string) => x[0]).join("").slice(0, 2);
  const deny = res?.outcome === "deny";

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-ink-0/80 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: "spring", damping: 24, stiffness: 240 }}
            className="relative w-full max-w-sm overflow-hidden rounded-[36px] border border-line-2 bg-ink-1 p-7 text-center shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-mint/10 to-transparent" />
            <p className="relative font-mono text-[10.5px] tracking-[0.16em] text-mint">INDEPENDENT CALLBACK · TRUSTBOOK NUMBER</p>
            <div className="relative mx-auto mt-8 grid size-24 place-items-center">
              {phase === "ring" && [0, 1, 2].map((i) => (
                <motion.span key={i} className="absolute inset-0 rounded-full border border-mint/50"
                  animate={{ scale: [1, 1.9], opacity: [0.6, 0] }} transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6 }} />
              ))}
              <span className="relative grid size-24 place-items-center rounded-full bg-ink-3 text-2xl font-medium text-fg">{initials}</span>
            </div>
            <p className="relative mt-5 text-xl text-fg">{who}</p>
            <p className="relative font-mono text-[12.5px] text-mint">{res?.phone ?? phone}</p>
            <p className="relative mt-1 text-[12.5px] text-muted">
              {phase === "ring" ? "Calling…" : phase === "talk" ? "Connected" : "Call ended"}
            </p>

            <div className="relative mt-6 min-h-[96px]">
              {phase === "talk" && (
                <div className="flex h-8 items-center justify-center gap-[3px]" aria-hidden>
                  {Array.from({ length: 24 }, (_, i) => (
                    <motion.span key={i} className="w-[3px] rounded-full bg-mint" animate={{ height: [6, 8 + ((i * 7) % 22), 6] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.04 }} />
                  ))}
                </div>
              )}
              {typed && <p className="mt-3 text-[14.5px] leading-relaxed text-silver">“{typed}”</p>}
            </div>

            <AnimatePresence>
              {phase === "done" && res && (
                <motion.div initial={{ opacity: 0, scale: 1.4, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: -4 }} transition={{ type: "spring", damping: 12 }}
                  className={`relative mx-auto mt-4 inline-flex items-center gap-2 rounded-lg border-2 px-4 py-2 font-mono text-[13px] tracking-[0.14em] ${deny ? "border-crimson text-crimson" : "border-mint text-mint"}`}>
                  {deny ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}{deny ? "CONFIRMED FRAUD" : "VERIFIED GENUINE"}
                </motion.div>
              )}
            </AnimatePresence>
            {phase === "done" && deny && res && res.flagged.length > 0 && (
              <p className="relative mt-3 font-mono text-[11px] text-muted">flagged: {res.flagged.join(" · ")}</p>
            )}

            <div className="relative mt-7 flex flex-col gap-2">
              {phase === "done" && deny && (
                <Button variant="outline" icon={<Repeat2 size={15} />} onClick={replay}>Replay this attack from a new number</Button>
              )}
              <button onClick={onClose} className={`mx-auto mt-1 grid size-14 place-items-center rounded-full ${phase === "done" ? "bg-ink-4 text-silver" : "bg-crimson-deep text-white"}`} aria-label="Close call">
                {phase === "done" ? <Phone size={18} /> : <PhoneOff size={20} />}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

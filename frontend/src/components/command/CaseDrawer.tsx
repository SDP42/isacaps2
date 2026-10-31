import { ArrowUpRight, Check, LifeBuoy, ShieldX, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfidenceBand } from "@/components/kit/ConfidenceBand";
import { post } from "@/lib/api";
import { BAND_COLOR, BAND_COPY, WITNESS_META, clock, cx, inr } from "@/lib/format";
import { Kbd } from "@/components/ui/primitives";
import { FIRED, WITNESSES, label, type Fact } from "./data";

const OUTCOMES = [
  { id: "confirmed_fraud", label: "Confirm fraud", icon: ShieldX, cls: "border-crimson/40 text-crimson hover:bg-crimson/10" },
  { id: "false_alarm", label: "False alarm", icon: Undo2, cls: "border-line-2 text-silver hover:bg-white/[0.04]" },
  { id: "verified_genuine", label: "Verified genuine", icon: Check, cls: "border-mint/40 text-mint hover:bg-mint/10" },
] as const;

/** Triage without leaving the floor: the verdict, each witness, the ask, and one-click outcomes. */
export function CaseDrawer({ f, onClose, onChanged }: { f: Fact | null; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!f) {
    return (
      <div className="flex h-full flex-col justify-center gap-3 px-6 py-10 text-[13px] text-muted">
        <p className="text-silver">Pick a case to triage it here.</p>
        <p className="leading-relaxed">Click a dot on the threat field, a row in the queue or an event in the feed. <Kbd>J</Kbd> <Kbd>K</Kbd> move through the queue, <Kbd>↵</Kbd> opens the case, <Kbd>/</Kbd> searches.</p>
      </div>
    );
  }
  const c = BAND_COLOR[f.band];
  const split = Object.entries(f.agree).filter(([, v]) => !v).map(([w]) => w);
  const close = async (outcome: string) => {
    setBusy(outcome);
    try {
      await post(`/v1/cases/${f.id}/close`, { outcome });
      toast.success(`${f.id} closed as ${label(outcome)}`, { description: outcome === "confirmed_fraud" ? "Its account and UPI identifiers are now flagged for every future case." : undefined });
      onChanged();
    } catch (e) {
      toast.error(`Could not close ${f.id}`, { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] text-dim">{f.id} · {f.channel} · {clock(f.at)}</p>
          <h3 className="mt-1 line-clamp-2 text-[14.5px] leading-snug text-fg">{f.title}</h3>
        </div>
        <button onClick={onClose} aria-label="Clear the selection" className="grid size-7 shrink-0 place-items-center rounded-md text-dim hover:bg-white/[0.04] hover:text-fg"><X size={14} /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px]" style={{ color: c }}><span className="tnum text-[28px] font-medium tracking-tight">{Math.round(f.risk)}</span> <span className="font-mono text-[11px] tracking-[0.12em]">{f.band}</span></span>
            <span className="text-[12px] text-muted">{BAND_COPY[f.band]}</span>
          </div>
          <ConfidenceBand value={f.risk} band={f.band} interval={f.interval} uncertain={split.length > 0} className="mt-2" />
        </div>

        <p className="text-[13px] leading-relaxed text-silver">{f.summary.replace(/\s*\[E\d+\]/g, "")}</p>

        <div>
          <p className="label mb-2">Witnesses</p>
          <ul className="space-y-1.5">
            {WITNESSES.map((w) => {
              const s = f.witnesses[w];
              const m = WITNESS_META[w];
              return (
                <li key={w} className="grid grid-cols-[78px_1fr_34px] items-center gap-2 text-[12px]">
                  <span className={s == null ? "text-dim" : "text-silver"}>{m.label}</span>
                  {s == null ? <span className="h-1 rounded-full border-t border-dashed border-line-2" /> : (
                    <span className="relative h-1.5 overflow-hidden rounded-full bg-ink-4">
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s * 100}%`, background: m.color, opacity: s >= FIRED ? 1 : 0.45 }} />
                    </span>
                  )}
                  <span className="tnum text-right font-mono text-[11px] text-muted">{s == null ? "—" : Math.round(s * 100)}</span>
                </li>
              );
            })}
          </ul>
          {split.length > 0 && <p className="mt-2 text-[11.5px] text-amber">Models disagree on {split.join(", ")}: treat that witness as uncertain.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-[12.5px]">
          <div>
            <p className="label mb-1">Asks for</p>
            <p className="capitalize text-fg">{f.action === "none" ? "Nothing" : label(f.action)}</p>
            {f.amount_inr > 0 && <p className="tnum font-mono text-[12px] text-amber">{inr(f.amount_inr)}</p>}
          </div>
          <div>
            <p className="label mb-1">Claims to be</p>
            <p className="truncate text-fg">{f.sender || "Unknown sender"}</p>
            {f.contact && <p className="truncate font-mono text-[11px] text-dim">{f.contact}</p>}
          </div>
        </div>

        {f.tactics.length > 0 && (
          <div>
            <p className="label mb-2">Pressure tactics</p>
            <div className="flex flex-wrap gap-1.5">
              {f.tactics.map((t) => <span key={t} className="rounded-md border border-amber/30 bg-amber/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] capitalize text-amber">{label(t)}</span>)}
            </div>
          </div>
        )}

        {f.first_step && (
          <div className="rounded-lg border border-line bg-ink-1/60 px-3 py-2.5">
            <p className="label mb-1">First step</p>
            <p className="text-[13px] text-fg">{f.first_step}</p>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-line p-3">
        {f.closed ? (
          <p className="px-1 text-[12.5px] text-muted">Closed as <span className="text-silver">{label(f.outcome ?? "closed")}</span>.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {OUTCOMES.map((o) => (
              <button key={o.id} disabled={busy != null} onClick={() => close(o.id)}
                className={cx("flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[12px] transition-colors disabled:opacity-50", o.cls)}>
                <o.icon size={13} className={busy === o.id ? "animate-pulse" : undefined} />{o.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Link to={`/app/cases/${f.id}`} className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-cyan text-[12.5px] font-medium text-ink-0 hover:bg-[#8ff0fb]">
            Open case <ArrowUpRight size={13} />
          </Link>
          <Link to={`/app/cases/${f.id}/respond`} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line-2 text-[12.5px] text-fg hover:border-cyan/50">
            <LifeBuoy size={13} /> Respond
          </Link>
        </div>
      </div>
    </div>
  );
}

import { AnimatePresence, motion } from "motion/react";
import {
  AudioLines, Ban, BookUser, Crosshair, Image as ImageIcon, MessageSquareText, ScanFace, CheckCheck, FileArchive, FileDown, Fingerprint, Gavel, KeyRound, Pause, Play, PlugZap, RotateCcw,
  ScanSearch, ShieldAlert, Skull, Wrench, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "@/lib/api";
import { BAND_COLOR, cx } from "@/lib/format";
import type { Band } from "@/lib/types";
import { label, type Fact } from "./data";

export interface OpsEvent {
  kind: string;
  case_id: string | null;
  actor: string;
  ts: number;
  replay?: boolean;
  [k: string]: unknown;
}

type Group = "verdicts" | "actions" | "pipeline";
const GROUPS: { id: Group; label: string }[] = [
  { id: "verdicts", label: "Verdicts" },
  { id: "actions", label: "Actions" },
  { id: "pipeline", label: "Pipeline" },
];

function group(e: OpsEvent): Group {
  if (e.kind === "verdict.issued" || e.kind.startsWith("triage") || e.kind === "live.alert") return "verdicts";
  if (e.kind === "case.stage" || e.kind.startsWith("demo.reset_progress") || e.kind === "case.created" || e.kind === "auth.login") return "pipeline";
  return "actions";
}

const ICON: Record<string, LucideIcon> = {
  "verdict.issued": Gavel, "case.created": ScanSearch, "case.closed": CheckCheck, "case.failed": Ban, "case.stage": Wrench,
  "cure.paid": ShieldAlert, "cure.evidence_pack": FileArchive, "report.exported": FileDown, "redteam.campaign": Skull,
  "redteam.generated": Skull, "voiceprint.enrolled": Fingerprint, "auth.login": KeyRound, "demo.reset": RotateCcw,
  "demo.reset_done": RotateCcw, "demo.reset_progress": RotateCcw, "triage.voice": AudioLines, "triage.text": MessageSquareText,
  "triage.media": ImageIcon, "live.alert": ShieldAlert, "liveness.checked": ScanFace, "drill.launched": Crosshair,
  "drill.responded": Crosshair, "trustbook.person_added": BookUser, "trustbook.person_updated": BookUser, "voiceprint.removed": Fingerprint,
};

const OUTCOME: Record<string, string> = {
  confirmed_fraud: "confirmed fraud", verified_genuine: "verified genuine", false_alarm: "a false alarm", already_paid: "already paid",
};

function describe(e: OpsEvent, title?: string): { text: string; tone?: string } {
  const who = e.actor === "system" ? "MIRAGE" : e.actor;
  const cid = e.case_id ?? "";
  switch (e.kind) {
    case "verdict.issued":
      return { text: `${String(e.band)} ${Math.round(Number(e.risk))} on ${cid}${title ? ` · ${title}` : ""}`, tone: BAND_COLOR[e.band as Band] };
    case "case.created": return { text: `${who} opened ${cid}` };
    case "case.stage": return { text: `${cid} · ${String(e.stage)} ${Math.round(Number(e.progress) * 100)}%` };
    case "case.closed": return { text: `${who} closed ${cid}${e.outcome ? ` as ${OUTCOME[String(e.outcome)] ?? String(e.outcome)}` : ""}`, tone: e.outcome === "confirmed_fraud" ? "var(--color-crimson)" : "var(--color-mint)" };
    case "case.failed": return { text: `${cid} failed: ${String(e.error ?? "pipeline error")}`, tone: "var(--color-crimson)" };
    case "cure.paid": return { text: `Golden hour started on ${cid}: money already sent`, tone: "var(--color-crimson)" };
    case "redteam.campaign": return { text: `${who} ran a red-team campaign`, tone: "var(--color-violet)" };
    case "redteam.generated": return { text: `${who} forged a synthetic ${String(e.kind_ ?? e.modality ?? "sample")}`, tone: "var(--color-violet)" };
    case "voiceprint.enrolled": return { text: `${who} enrolled a voiceprint` };
    case "report.exported": return { text: `${who} exported the report for ${cid}` };
    case "auth.login": return { text: `${who} signed in` };
    case "demo.reset": return { text: `${who} reset the demo data`, tone: "var(--color-amber)" };
    case "demo.reset_progress": return { text: `Rebuilding history · ${String(e.done)}/${String(e.total)} cases` };
    case "demo.reset_done": return { text: "Demo history rebuilt", tone: "var(--color-mint)" };
    case "triage.voice": return { text: `Voice check: ${String(e.severity)} · ${String(e.label ?? "")}`, tone: sevTone(e.severity) };
    case "triage.text": return { text: `Message check: ${String(e.severity)} · ${label(String(e.category ?? ""))}`, tone: sevTone(e.severity) };
    case "triage.media": return { text: `${String(e.modality ?? "Media")} check: ${String(e.label ?? e.severity)}`, tone: sevTone(e.severity) };
    case "liveness.checked": return { text: `${who} ran a liveness check${e.verdict ? `: ${String(e.verdict)} (${String(e.passed)}/${String(e.total)} prompts)` : ""}`, tone: e.verdict === "LIVE" ? "var(--color-mint)" : e.verdict === "SUSPECT" ? "var(--color-crimson)" : "var(--color-amber)" };
    case "drill.launched": return { text: e.campaign ? `${who} sent drill ${String(e.campaign)} to ${String(e.targets)} inbox${e.targets === 1 ? "" : "es"}` : `${who} sent a drill`, tone: "var(--color-violet)" };
    case "drill.responded": return { text: `${who} answered a drill${e.choice ? `: ${String(e.choice)}` : ""}`, tone: e.choice === "complied" ? "var(--color-crimson)" : e.choice === "ignored" ? undefined : "var(--color-mint)" };
    case "trustbook.person_added": return { text: `${who} added ${String(e.name ?? "someone")} to the Trustbook` };
    case "trustbook.person_updated": return { text: `${who} updated a Trustbook entry${e.fields ? ` (${String(e.fields)})` : ""}` };
    case "voiceprint.removed": return { text: `${who} removed a voiceprint` };
    case "live.alert": return { text: `Live call shield alert: risk ${Math.round(Number(e.risk))}`, tone: "var(--color-crimson)" };
    default:
      if (e.kind.startsWith("cure.")) return { text: `${who} ${e.kind.slice(5).replace(/_/g, " ").replace(".undo", " (undone)")} on ${cid}` };
      return { text: `${e.kind.replace(/[._]/g, " ")}${cid ? ` · ${cid}` : ""}` };
  }
}

const sevTone = (s: unknown) => (s === "CRITICAL" || s === "HIGH" ? "var(--color-crimson)" : s === "MEDIUM" ? "var(--color-amber)" : undefined);

const stamp = (t: number) => new Date(t * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** App-wide operations feed over Server-Sent Events. Reconnects with backoff; pausing buffers, it does not drop. */
export function useOpsStream(onEvent: (e: OpsEvent) => void) {
  const [state, setState] = useState<"connecting" | "live" | "offline">("connecting");
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 0;
    let timer: number | undefined;
    let dead = false;
    const open = () => {
      const base = import.meta.env.VITE_API_URL ?? "";
      es = new EventSource(`${base}/v1/ops/stream?token=${encodeURIComponent(getToken() ?? "")}`);
      es.onopen = () => { retry = 0; setState("live"); };
      es.addEventListener("ops", (m) => {
        try { cb.current(JSON.parse((m as MessageEvent).data)); } catch { /* malformed frame */ }
      });
      es.onerror = () => {
        es?.close();
        if (dead) return;
        setState("offline");
        timer = window.setTimeout(open, Math.min(15000, 1000 * 2 ** retry++));
      };
    };
    open();
    return () => { dead = true; es?.close(); window.clearTimeout(timer); };
  }, []);
  return state;
}

export function LiveFeed({
  events, facts, onSelect, paused, onPause, conn,
}: {
  events: OpsEvent[];
  facts: Map<string, Fact>;
  onSelect: (id: string) => void;
  paused: number | null;
  onPause: () => void;
  conn: "connecting" | "live" | "offline";
}) {
  const [on, setOn] = useState<Record<Group, boolean>>({ verdicts: true, actions: true, pipeline: false });
  // a stream reconnect replays recent events, so the same event can arrive twice
  const shown = useMemo(() => {
    const seen = new Set<string>();
    return events.filter((e) => {
      const k = `${e.ts}-${e.kind}-${e.case_id}`;
      if (seen.has(k) || !on[group(e)]) return false;
      seen.add(k);
      return true;
    });
  }, [events, on]);
  const perMin = useMemo(() => {
    const now = Date.now() / 1000;
    return events.filter((e) => !e.replay && now - e.ts < 300).length / 5;
  }, [events]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => setOn((s) => ({ ...s, [g.id]: !s[g.id] }))} aria-pressed={on[g.id]}
            className={cx("h-6 rounded-md border px-2 font-mono text-[10.5px] tracking-[0.06em] transition-colors",
              on[g.id] ? "border-cyan/40 bg-cyan/[0.08] text-cyan" : "border-line text-dim hover:text-silver")}>
            {g.label}
          </button>
        ))}
        <span className="ml-auto tnum font-mono text-[10.5px] text-dim">{perMin.toFixed(1)}/min</span>
        <button onClick={onPause} aria-label={paused != null ? "Resume the live feed" : "Pause the live feed"}
          className="grid size-6 place-items-center rounded-md border border-line text-silver transition-colors hover:border-line-2 hover:text-fg">
          {paused != null ? <Play size={12} /> : <Pause size={12} />}
        </button>
      </div>
      {paused != null && paused > 0 && (
        <button onClick={onPause} className="border-b border-line bg-cyan/[0.06] px-3 py-1.5 text-left font-mono text-[11px] text-cyan hover:bg-cyan/10">
          {paused} new event{paused === 1 ? "" : "s"} held · resume
        </button>
      )}
      <ol className="min-h-0 flex-1 overflow-y-auto py-1" aria-live="polite" aria-relevant="additions">
        {conn === "offline" && !shown.length && (
          <li className="flex items-start gap-2 px-4 py-6 text-[12.5px] text-muted"><PlugZap size={14} className="mt-0.5 text-amber" />The live feed is offline. MIRAGE retries on its own; check that the API is running.</li>
        )}
        {conn !== "offline" && !shown.length && (
          <li className="px-4 py-6 text-[12.5px] leading-relaxed text-muted">Quiet so far. Run a scenario or a voice check and every verdict, action and stage lands here as it happens.</li>
        )}
        <AnimatePresence initial={false}>
          {shown.map((e) => {
            const Icon = ICON[e.kind] ?? Wrench;
            const f = e.case_id ? facts.get(e.case_id) : undefined;
            const d = describe(e, f?.title);
            const clickable = Boolean(e.case_id && f);
            return (
              <motion.li key={`${e.ts}-${e.kind}-${e.case_id}`} layout="position"
                initial={{ opacity: 0, y: -6, backgroundColor: "rgba(103,232,249,0.10)" }}
                animate={{ opacity: 1, y: 0, backgroundColor: "rgba(103,232,249,0)" }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1], backgroundColor: { duration: 1.6 } }}>
                <button disabled={!clickable} onClick={() => e.case_id && onSelect(e.case_id)}
                  className={cx("grid w-full grid-cols-[52px_14px_1fr] items-start gap-2 px-3 py-[7px] text-left", clickable && "hover:bg-white/[0.03]")}>
                  <span className="tnum pt-px font-mono text-[10.5px] text-dim">{stamp(e.ts)}</span>
                  <Icon size={13} className="mt-0.5" style={{ color: d.tone ?? "var(--color-muted)" }} />
                  <span className="min-w-0 truncate text-[12.5px] leading-snug" style={{ color: d.tone ? undefined : "var(--color-silver)" }}>
                    <span style={{ color: d.tone }}>{d.text}</span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}

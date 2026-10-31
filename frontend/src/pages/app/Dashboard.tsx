import { Activity, ArrowUpRight, FlaskConical, Mail, MessageCircle, Phone, RotateCcw, ScanSearch, Search, Smartphone, Video, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CaseDrawer } from "@/components/command/CaseDrawer";
import { AttackClock, ChannelMatrix, FacetBars } from "@/components/command/Facets";
import { IncidentQueue, type SortKey } from "@/components/command/IncidentQueue";
import { LiveFeed, useOpsStream, type OpsEvent } from "@/components/command/LiveFeed";
import { PostureStrip, fmt, type Metric } from "@/components/command/PostureStrip";
import { ThreatField } from "@/components/command/ThreatField";
import {
  BANDS, NO_FILTERS, RANGE_MS, agreement, applyFilters, countBy, isOpenIncident, label, ts,
  type Fact, type Filters, type Overview, type Range,
} from "@/components/command/data";
import { ErrorState, OfflineBanner } from "@/components/kit/StateKit";
import { Button } from "@/components/ui/Button";
import { PanelHead, Segmented, Skeleton } from "@/components/ui/primitives";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BAND_COLOR, WITNESS_META, cx } from "@/lib/format";
import type { Band } from "@/lib/types";

const CHANNEL_ICON: Record<string, LucideIcon> = { email: Mail, whatsapp: MessageCircle, phone: Phone, video: Video, sms: Smartphone };
const RANGE_KEY = "mirage.cc.range";

function readRange(): Range {
  try {
    const r = localStorage.getItem(RANGE_KEY);
    return r === "24h" || r === "7d" || r === "30d" ? r : "30d";
  } catch {
    return "30d";
  }
}

/** Daily (or hourly) counts for the posture strip's trend bars. */
function series(facts: Fact[], span: [number, number], pick: (f: Fact) => number, n = 14) {
  const size = (span[1] - span[0]) / n;
  const out = Array(n).fill(0) as number[];
  for (const f of facts) {
    const i = Math.floor((ts(f) - span[0]) / size);
    if (i >= 0 && i < n) out[i] += pick(f);
  }
  return out;
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-cyan/30 bg-cyan/[0.07] pl-2 pr-1 text-[12px] text-fg">
      {children}
      <button onClick={onClear} aria-label="Remove this filter" className="grid size-5 place-items-center rounded text-cyan hover:bg-cyan/15"><X size={12} /></button>
    </span>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-[118px]" />
      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]"><Skeleton className="h-[380px]" /><Skeleton className="h-[380px]" /></div>
      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]"><Skeleton className="h-[440px]" /><Skeleton className="h-[440px]" /></div>
    </div>
  );
}

export default function Dashboard() {
  const { persona } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRangeState] = useState<Range>(readRange);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "risk", dir: -1 });
  const [events, setEvents] = useState<OpsEvent[]>([]);
  const [held, setHeld] = useState<OpsEvent[] | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [confirmReset, setConfirmReset] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef<Set<string> | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const refetchTimer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    api<Overview>("/v1/ops/overview")
      .then((d) => {
        const ids = new Set(d.facts.map((f) => f.id));
        if (known.current) {
          const added = [...ids].filter((id) => !known.current!.has(id));
          if (added.length) {
            setFresh(new Set(added));
            window.setTimeout(() => setFresh(new Set()), 4500);
          }
        }
        known.current = ids;
        setData(d);
        setError(null);
        setNow(Date.now());
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const heldRef = useRef<OpsEvent[] | null>(null);
  const onEvent = useCallback((e: OpsEvent) => {
    if (heldRef.current) {
      heldRef.current = [e, ...heldRef.current].slice(0, 200);
      setHeld(heldRef.current);
    } else setEvents((xs) => [e, ...xs].slice(0, 200));
    // case.stage "verdict" is published after the verdict commits, so it is the reliable trigger for a refetch
    if (!e.replay && /^(verdict\.issued|case\.closed|case\.stage|demo\.reset|case\.failed)/.test(e.kind)) {
      window.clearTimeout(refetchTimer.current);
      refetchTimer.current = window.setTimeout(load, e.kind === "demo.reset_progress" ? 1500 : 600);
    }
  }, [load]);
  const conn = useOpsStream(onEvent);

  const setRange = (r: Range) => {
    setRangeState(r);
    setFilters((f) => ({ ...f, window: null }));
    try { localStorage.setItem(RANGE_KEY, r); } catch { /* storage blocked */ }
  };
  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  const span = useMemo<[number, number]>(() => [now - RANGE_MS[range], now], [now, range]);
  const facts = data?.facts ?? [];
  const byId = useMemo(() => new Map(facts.map((f) => [f.id, f])), [facts]);
  const inSpan = useMemo(() => applyFilters(facts, NO_FILTERS, span), [facts, span]);
  const rows = useMemo(() => applyFilters(facts, filters, span), [facts, filters, span]);
  const fieldFacts = useMemo(() => applyFilters(facts, filters, span, "window"), [facts, filters, span]);
  const sorted = useMemo(() => {
    const k = sort.k;
    return [...rows].sort((a, b) => {
      const va = k === "at" ? ts(a) : (a[k] as number);
      const vb = k === "at" ? ts(b) : (b[k] as number);
      return (va - vb) * sort.dir || ts(b) - ts(a);
    });
  }, [rows, sort]);
  const sel = selected ? byId.get(selected) ?? null : null;

  // keyboard: j/k move through the queue, enter opens, / searches, esc clears
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) {
        if (e.key === "Escape") (t as HTMLInputElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); search.current?.focus(); return; }
      if (e.key === "Escape") { setSelected(null); return; }
      if (e.key === "Enter" && selected) { nav(`/app/cases/${selected}`); return; }
      if (e.key === "j" || e.key === "k") {
        if (!sorted.length) return;
        const i = sorted.findIndex((f) => f.id === selected);
        const next = e.key === "j" ? Math.min(sorted.length - 1, i + 1) : Math.max(0, (i < 0 ? 1 : i) - 1);
        setSelected(sorted[next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sorted, selected, nav]);

  const togglePause = () => {
    const h = heldRef.current;
    heldRef.current = h ? null : [];
    if (h) setEvents((xs) => [...h, ...xs].slice(0, 200));
    setHeld(heldRef.current);
  };

  const reset = async () => {
    setConfirmReset(false);
    try {
      const r = await post<{ removed: number }>("/v1/ops/reset-demo");
      toast.success("Rebuilding the demo history", { description: `${r.removed} cases removed. Every seeded case runs through the real pipeline again; progress streams into the feed.` });
      setSelected(null);
      setFilters(NO_FILTERS);
      load();
    } catch (e) {
      toast.error("Reset did not start", { description: (e as Error).message });
    }
  };

  if (!data && error) return <ErrorState title="The command centre could not load." cause={error} onRetry={load} className="mx-auto max-w-[1600px]" />;
  if (!data) return <PageSkeleton />;

  // ---- metrics over the selected range, compared with the range before it
  const len = span[1] - span[0];
  const prevSpan: [number, number] = [span[0] - len, span[0]];
  const prev = applyFilters(facts, NO_FILTERS, prevSpan);
  const hasPrev = facts.some((f) => ts(f) < span[0]);
  const openNow = facts.filter(isOpenIncident);
  const money = (xs: Fact[]) => xs.filter((f) => f.band === "HIGH" && f.action === "payment").reduce((s, f) => s + f.amount_inr, 0);
  const agreeNow = agreement(inSpan);
  const agreePrev = agreement(prev);
  const triaged = (xs: Fact[]) => xs.filter((f) => f.band === "HIGH" && f.closed).length;
  const isOpenFilter = filters.status === "open" && filters.bands.length === 1 && filters.bands[0] === "HIGH";
  const compareLabel = `the ${range === "24h" ? "previous 24 hours" : range === "7d" ? "previous 7 days" : "previous 30 days"}`;
  const metrics: Metric[] = [
    {
      id: "open", label: "Open incidents", value: openNow.length, prev: null, color: "var(--color-crimson)", upIsBad: true,
      series: series(inSpan, span, (f) => (isOpenIncident(f) ? 1 : 0)), hint: "HIGH and not yet closed",
      active: isOpenFilter, onClick: () => patch(isOpenFilter ? { bands: [], status: "all" } : { bands: ["HIGH"], status: "open" }),
    },
    {
      id: "money", label: "Money at stake", value: money(inSpan), prev: hasPrev ? money(prev) : null, format: fmt.inr, color: "var(--color-amber)", upIsBad: true,
      series: series(inSpan, span, (f) => (f.band === "HIGH" && f.action === "payment" ? f.amount_inr : 0)), hint: "asked for in HIGH cases",
      active: filters.action === "payment", onClick: () => patch({ action: filters.action === "payment" ? null : "payment" }),
    },
    {
      id: "volume", label: "Investigations", value: inSpan.length, prev: hasPrev ? prev.length : null, color: "var(--color-cyan)", upIsBad: true,
      series: series(inSpan, span, () => 1), hint: `${inSpan.filter((f) => f.band === "HIGH").length} HIGH · ${inSpan.filter((f) => f.band === "MEDIUM").length} MEDIUM`,
    },
    {
      id: "triaged", label: "HIGH cases triaged", value: triaged(inSpan), prev: hasPrev ? triaged(prev) : null, color: "var(--color-mint)",
      series: series(inSpan, span, (f) => (f.band === "HIGH" && f.closed ? 1 : 0)), hint: "closed with an outcome",
      active: filters.status === "closed", onClick: () => patch({ status: filters.status === "closed" ? "all" : "closed" }),
    },
    {
      id: "agree", label: "Model agreement", value: agreeNow == null ? 0 : agreeNow * 100, prev: agreePrev == null || !hasPrev ? null : agreePrev * 100, format: (v) => (agreeNow == null ? "—" : fmt.pct(v)), color: "var(--color-violet)",
      series: series(inSpan, span, (f) => Object.values(f.agree).filter(Boolean).length), hint: "ensemble models agree",
    },
  ];

  const activeChips: { key: string; node: React.ReactNode; clear: () => void }[] = [];
  if (filters.window) activeChips.push({ key: "w", node: <>{new Date(filters.window[0]).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} → {new Date(filters.window[1]).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>, clear: () => patch({ window: null }) });
  if (filters.channel) activeChips.push({ key: "c", node: <>channel <b className="font-medium capitalize">{filters.channel}</b></>, clear: () => patch({ channel: null }) });
  if (filters.witness) activeChips.push({ key: "wi", node: <><b className="font-medium">{WITNESS_META[filters.witness]?.label}</b> fired</>, clear: () => patch({ witness: null }) });
  if (filters.tactic) activeChips.push({ key: "t", node: <>tactic <b className="font-medium capitalize">{label(filters.tactic)}</b></>, clear: () => patch({ tactic: null }) });
  if (filters.action) activeChips.push({ key: "a", node: <>asks for <b className="font-medium">{label(filters.action)}</b></>, clear: () => patch({ action: null }) });
  if (filters.hour != null) activeChips.push({ key: "h", node: <>arrived {String(filters.hour).padStart(2, "0")}:00–{String(filters.hour).padStart(2, "0")}:59</>, clear: () => patch({ hour: null }) });
  if (filters.status !== "all") activeChips.push({ key: "s", node: <>{filters.status}</>, clear: () => patch({ status: "all" }) });
  const filtered = activeChips.length > 0 || filters.bands.length > 0 || filters.q.trim() !== "";

  const camp = data.campaigns[0];
  const canReset = persona?.role === "analyst" || persona?.role === "admin";
  const hour = new Date().getHours();
  const highs = rows.filter((f) => f.band === "HIGH");

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-medium tracking-tight">Command centre</h1>
          <p className="mt-0.5 text-[13.5px] text-muted">
            Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, {persona?.name.split(" ")[0]}.{" "}
            {openNow.length ? <>{openNow.length} HIGH case{openNow.length === 1 ? " is" : "s are"} waiting for an outcome{openNow[0] ? <>, the newest from <span className="text-silver">{[...openNow].sort((a, b) => ts(b) - ts(a))[0].sender || "an unknown sender"}</span></> : null}.</> : "Nothing is waiting for triage."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx("inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 font-mono text-[11px]",
            conn === "live" ? "border-mint/25 text-mint" : conn === "connecting" ? "border-line-2 text-muted" : "border-amber/30 text-amber")}>
            <span className={cx("size-1.5 rounded-full", conn === "live" ? "live-dot bg-mint" : conn === "connecting" ? "bg-muted" : "bg-amber")} />
            {conn === "live" ? "LIVE" : conn === "connecting" ? "CONNECTING" : "RECONNECTING"}
          </span>
          <Segmented value={range} onChange={setRange} options={[{ value: "24h", label: "24 h" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />
          {canReset && (confirmReset ? (
            <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber/40 bg-amber/[0.06] pl-3 pr-1 text-[12.5px] text-amber">
              Wipe all cases and rebuild the 30-day history?
              <button onClick={reset} className="ml-1 h-6 rounded-md bg-amber px-2 text-[12px] font-medium text-ink-0 hover:bg-[#fcd34d]">Rebuild</button>
              <button onClick={() => setConfirmReset(false)} className="h-6 rounded-md px-2 text-[12px] text-silver hover:bg-white/5">Cancel</button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} disabled={data.reset.running} onClick={() => setConfirmReset(true)}>
              {data.reset.running ? `Rebuilding ${data.reset.done}/${data.reset.total || "…"}` : "Reset demo"}
            </Button>
          ))}
          <Button variant="outline" size="sm" icon={<FlaskConical size={14} />} to="/app/lab">Scenario lab</Button>
          <Button size="sm" icon={<ScanSearch size={14} />} to="/app/investigate">New investigation</Button>
        </div>
      </header>

      <OfflineBanner show={conn === "offline" || Boolean(error)} />

      <PostureStrip open={openNow.length} metrics={metrics} compareLabel={compareLabel} />

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input ref={search} value={filters.q} onChange={(e) => patch({ q: e.target.value })} placeholder="Search case, sender, number"
            aria-label="Search cases" className="h-8 w-[240px] rounded-lg border border-line bg-ink-1 pl-8 pr-8 text-[12.5px] text-fg placeholder:text-dim focus:border-cyan/50 focus:outline-none" />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-dim">/</kbd>
        </label>
        <div className="flex gap-1" role="group" aria-label="Filter by band">
          {BANDS.map((b) => {
            const on = filters.bands.includes(b);
            const n = inSpan.filter((f) => f.band === b).length;
            return (
              <button key={b} aria-pressed={on} onClick={() => patch({ bands: on ? filters.bands.filter((x) => x !== b) : [...filters.bands, b] })}
                className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[11px] tracking-[0.06em] transition-colors",
                  on ? "text-fg" : "border-line text-muted hover:border-line-2 hover:text-silver")}
                style={on ? { borderColor: `color-mix(in oklab, ${BAND_COLOR[b]} 50%, transparent)`, background: `color-mix(in oklab, ${BAND_COLOR[b]} 10%, transparent)` } : undefined}>
                <span className="size-1.5 rounded-full" style={{ background: BAND_COLOR[b] }} />{b === "INCONCLUSIVE" ? "UNSURE" : b}<span className="tnum text-dim">{n}</span>
              </button>
            );
          })}
        </div>
        {activeChips.map((c) => <Chip key={c.key} onClear={c.clear}>{c.node}</Chip>)}
        <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-dim">
          <span><span className="tnum text-silver">{rows.length}</span> of {inSpan.length} cases</span>
          {filtered && <button onClick={() => setFilters(NO_FILTERS)} className="text-cyan hover:underline">Clear all</button>}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <section className="panel min-w-0 overflow-hidden xl:h-[414px]">
          <PanelHead title="Threat field" meta="dot = investigation · size = amount · hollow = closed"
            right={filters.window ? <button onClick={() => patch({ window: null })} className="text-[12px] text-cyan hover:underline">Reset window</button> : <span className="hidden font-mono text-[10.5px] text-dim sm:inline">drag to zoom in on a window</span>} />
          <div className="px-3 pb-2 pt-3">
            {inSpan.length ? (
              <ThreatField facts={fieldFacts} span={span} range={range} window={filters.window} onWindow={(w) => patch({ window: w })}
                selected={selected} onSelect={setSelected} fresh={fresh} hiddenBands={filters.bands.length ? BANDS.filter((b) => !filters.bands.includes(b)) : []} />
            ) : (
              <div className="grid h-[330px] place-items-center text-center text-[13px] text-muted">
                <div>
                  <p className="text-silver">No investigations in the last {range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days"}.</p>
                  <p className="mt-1">Widen the range, or run a scenario to watch one land here live.</p>
                  <div className="mt-3 flex justify-center gap-2">
                    {range !== "30d" && <Button variant="outline" size="sm" onClick={() => setRange("30d")}>Show 30 days</Button>}
                    <Button size="sm" to="/app/lab" icon={<FlaskConical size={14} />}>Run a scenario</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="panel flex h-[420px] min-w-0 flex-col overflow-hidden xl:h-[414px]">
          <PanelHead title="Live feed" meta="as it happens" right={<Activity size={14} className={conn === "live" ? "text-mint" : "text-dim"} />} />
          <div className="min-h-0 flex-1">
            <LiveFeed events={events} facts={byId} onSelect={setSelected} paused={held ? held.length : null} onPause={togglePause} conn={conn} />
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <section className="panel min-w-0 overflow-hidden">
          <PanelHead title="Incident queue" meta={`${sorted.length} case${sorted.length === 1 ? "" : "s"} · ${highs.filter((f) => !f.closed).length} HIGH open`}
            right={<span className="hidden font-mono text-[10.5px] text-dim md:inline">J / K to move · ↵ to open</span>} />
          <IncidentQueue rows={sorted} selected={selected} onSelect={setSelected} sort={sort.k} dir={sort.dir}
            onSort={(k) => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))} />
        </section>
        <section className="panel flex max-h-[600px] min-h-[400px] min-w-0 flex-col overflow-hidden xl:max-h-[486px]" aria-label="Case triage">
          <CaseDrawer f={sel} onClose={() => setSelected(null)} onChanged={load} />
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr]">
        <section className="panel min-w-0 md:col-span-2 xl:col-span-1">
          <PanelHead title="Who catches what" meta="% of each channel's cases where a witness fired" />
          <div className="p-3">
            <ChannelMatrix facts={applyFilters(facts, { ...filters, channel: null, witness: null }, span)} channel={filters.channel} witness={filters.witness}
              onPick={(channel, witness) => patch({ channel, witness })} />
          </div>
        </section>
        <section className="panel min-w-0">
          <PanelHead title="Pressure tactics" meta="Words witness" />
          <div className="p-2">
            <FacetBars all={countBy(applyFilters(facts, filters, span, "tactic"), (f) => f.tactics)} active={filters.tactic} onPick={(t) => patch({ tactic: t })} color="var(--color-amber)" />
          </div>
        </section>
        <section className="panel min-w-0">
          <PanelHead title="What they asked for" meta="requested action" />
          <div className="p-2">
            <FacetBars all={countBy(applyFilters(facts, filters, span, "action"), (f) => f.action)} active={filters.action} onPick={(a) => patch({ action: a })} color="var(--color-cyan)"
              format={(k) => (k === "none" ? "nothing" : label(k))} />
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr]">
        <section className="panel min-w-0 md:col-span-2 xl:col-span-1">
          <PanelHead title="Attack clock" meta="HIGH cases by weekday and hour · click an hour to filter" />
          <div className="p-4"><AttackClock facts={applyFilters(facts, filters, span, "hour")} hour={filters.hour} onHour={(h) => patch({ hour: h })} /></div>
        </section>

        <section className="panel flex min-w-0 flex-col">
          <PanelHead title="Campaign spotlight" meta={camp ? `${camp.id} · ${camp.stages.length} stages` : "cross-channel"}
            right={<Link to="/app/attack-chain" className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">Attack chains <ArrowUpRight size={12} /></Link>} />
          {camp ? (
            <div className="flex-1 p-4">
              <ol className="relative space-y-0">
                {(camp.stages.length > 6 ? [...camp.stages.slice(0, 3), null, ...camp.stages.slice(-2)] : camp.stages).map((s, i, arr) => {
                  if (!s) {
                    const hidden = camp.stages.slice(3, -2);
                    return (
                      <li key="gap" className="relative grid grid-cols-[26px_1fr] gap-3 pb-3">
                        <span className="absolute left-[12.5px] top-0 h-full w-px border-l border-dashed border-line-2" />
                        <span />
                        <span className="font-mono text-[10.5px] text-dim">{hidden.length} more stages via {[...new Set(hidden.map((h) => h.channel))].join(", ")}</span>
                      </li>
                    );
                  }
                  const Icon = CHANNEL_ICON[s.channel] ?? MessageCircle;
                  const c = BAND_COLOR[s.band as Band];
                  return (
                    <li key={s.case_id} className="relative grid grid-cols-[26px_1fr] gap-3 pb-3 last:pb-0">
                      {i < arr.length - 1 && arr[i + 1] && <span className="absolute left-[12.5px] top-7 h-[calc(100%-22px)] w-px bg-line-2" />}
                      <span className="z-[1] grid size-[26px] place-items-center rounded-full border bg-ink-2" style={{ borderColor: `color-mix(in oklab, ${c} 55%, transparent)`, color: c }}><Icon size={12} /></span>
                      <button onClick={() => setSelected(s.case_id)} className="min-w-0 text-left">
                        <p className={cx("truncate text-[12.5px] hover:text-fg", selected === s.case_id ? "text-cyan" : "text-silver")}>{s.claimed_sender} <span className="text-dim">via {s.channel}</span></p>
                        <p className="font-mono text-[10.5px] text-dim">{s.case_id} · <span style={{ color: c }}>{s.band} {Math.round(s.risk)}</span> · {new Date(s.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {camp.shared_identifiers.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="label mb-1.5">Linked by</p>
                  <div className="flex flex-wrap gap-1">{camp.shared_identifiers.slice(0, 4).map((k) => <button key={k} onClick={() => patch({ q: k })} className="etag hover:bg-cyan/15">{k}</button>)}</div>
                </div>
              )}
            </div>
          ) : <p className="p-5 text-[13px] text-muted">No cross-channel campaign yet. Cases that share a number, account or UPI ID are linked here.</p>}
        </section>

        <section className="panel min-w-0">
          <PanelHead title="Engine health" meta={data.audit.intact ? "audit chain intact" : "audit chain broken"} />
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-3 gap-3">
              <div><p className="label !text-[9.5px]">Models</p><p className="tnum mt-0.5 text-[18px] text-fg">{data.models.loaded}<span className="text-dim">/{data.models.total}</span></p></div>
              <div><p className="label !text-[9.5px]">Running</p><p className="tnum mt-0.5 text-[18px] text-amber">{data.running.length}</p></div>
              <div><p className="label !text-[9.5px]">Failed</p><p className={cx("tnum mt-0.5 text-[18px]", data.failed ? "text-crimson" : "text-fg")}>{data.failed}</p></div>
            </div>
            <div>
              <p className="label mb-2">Median witness time</p>
              <ul className="space-y-1.5">
                {Object.entries(data.latency_ms).sort((a, b) => b[1] - a[1]).map(([w, ms]) => {
                  const max = Math.max(...Object.values(data.latency_ms));
                  return (
                    <li key={w} className="grid grid-cols-[72px_1fr_52px] items-center gap-2 text-[12px]">
                      <span className="text-silver">{WITNESS_META[w]?.label ?? w}</span>
                      <span className="h-1 overflow-hidden rounded-full bg-ink-4"><span className="block h-full rounded-full" style={{ width: `${Math.max(3, (ms / max) * 100)}%`, background: WITNESS_META[w]?.color }} /></span>
                      <span className="tnum text-right font-mono text-[11px] text-muted">{ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            {data.running.length > 0 && (
              <ul className="space-y-2">
                {data.running.map((c) => (
                  <li key={c.id}>
                    <Link to={`/app/cases/${c.id}`} className="block">
                      <div className="flex justify-between text-[12px]"><span className="truncate text-silver">{c.title}</span><span className="font-mono text-amber">{c.stage}</span></div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-4"><div className="h-full rounded-full bg-amber transition-[width]" style={{ width: `${c.progress * 100}%` }} /></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-line pt-3 font-mono text-[10.5px] leading-relaxed text-dim">
              {data.audit.checked.toLocaleString("en-IN")} audit entries hash-chained{data.audit.head ? <> · head {data.audit.head.slice(0, 12)}</> : null}<br />
              {data.baseline_requests.toLocaleString("en-IN")} historical requests in the anomaly baseline
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

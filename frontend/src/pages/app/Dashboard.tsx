import { ArrowUpRight, AudioLines, FileText, FlaskConical, Image as ImageIcon, MessageSquareText, ScanSearch, Video } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BandTimeline, HBars, MiniRing, RiskHistogram } from "@/components/app/charts";
import { Button } from "@/components/ui/Button";
import { BandPill, Empty, PanelHead, Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { ago, inr } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import CountUp from "@/components/reactbits/CountUp";
import type { Band, CaseSummary } from "@/lib/types";

interface Dash {
  totals: { cases: number; completed: number; high: number; medium: number; low: number; inconclusive: number; running: number; open_incidents: number; amount_at_risk_inr: number; verified: number };
  timeline: ({ date: string } & Record<Band, number>)[];
  risk_histogram: number[];
  modality: Record<string, number>;
  channels: Record<string, number>;
  tactics: Record<string, number>;
  actions: Record<string, number>;
  witness_hits: Record<string, number>;
  active_incidents: CaseSummary[];
  recent: CaseSummary[];
  running: CaseSummary[];
  most_impersonated: { name: string; role: string; count: number }[];
  request_volume_12m: number;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  audio: <AudioLines size={13} />, video: <Video size={13} />, image: <ImageIcon size={13} />, text: <MessageSquareText size={13} />,
};

function Stat({ label, value, tone, suffix }: { label: string; value: number; tone?: string; suffix?: string }) {
  return (
    <div className="min-w-0">
      <p className="label !text-[10px]">{label}</p>
      <p className="tnum mt-1 text-[26px] font-medium tracking-tight" style={{ color: tone }}>
        <CountUp to={value} duration={1.2} suffix={suffix} trigger="load" />
      </p>
    </div>
  );
}

function CaseRow({ c }: { c: CaseSummary }) {
  return (
    <Link to={`/app/cases/${c.id}`} className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      {c.band && c.risk != null ? <MiniRing risk={c.risk} band={c.band} /> : <span className="size-[38px] rounded-full border border-dashed border-line-2" />}
      <div className="min-w-0">
        <p className="truncate text-[13.5px] text-fg">{c.title}</p>
        <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-dim">
          <span>{c.id}</span>·<span>{c.channel}</span>·<span className="flex gap-1 text-muted">{c.kinds.map((k) => <span key={k}>{KIND_ICON[k]}</span>)}</span>·<span>{ago(c.received_at ?? c.created_at)}</span>
        </p>
      </div>
      <ArrowUpRight size={15} className="text-dim opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export default function Dashboard() {
  const { persona } = useAuth();
  const nav = useNavigate();
  const { data, loading, reload } = useApi<Dash>("/v1/dashboard");
  useEffect(() => {
    const id = setInterval(reload, 10000);
    return () => clearInterval(id);
  }, [reload]);

  if (loading && !data) {
    return (
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" />
        <Skeleton className="h-52" /><Skeleton className="h-52" /><Skeleton className="h-52" />
      </div>
    );
  }
  if (!data) return <Empty title="The command centre could not load." hint="Check that the API is running." />;
  const t = data.totals;
  const posture = t.open_incidents > 3 ? "Elevated" : t.open_incidents > 0 ? "Guarded" : "Calm";
  const postureColor = t.open_incidents > 3 ? "var(--color-crimson)" : t.open_incidents > 0 ? "var(--color-amber)" : "var(--color-mint)";

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div>
          <h1 className="text-[26px] font-medium tracking-tight">Command centre</h1>
          <p className="text-[13.5px] text-muted">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {persona?.name.split(" ")[0]}. Threat posture is{" "}
            <span style={{ color: postureColor }}>{posture.toLowerCase()}</span> with {t.open_incidents} open incident{t.open_incidents === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<FlaskConical size={14} />} to="/app/lab">Scenario lab</Button>
          <Button size="sm" icon={<ScanSearch size={14} />} to="/app/investigate">New investigation</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <section className="panel overflow-hidden">
          <PanelHead title="Threat overview" meta={`${t.completed} investigations · 30 days`} right={<span className="font-mono text-[11px]" style={{ color: postureColor }}>● {posture.toUpperCase()}</span>} />
          <div className="grid gap-6 p-5 md:grid-cols-[220px_1fr]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-1 md:border-r md:border-line md:pr-6">
              <Stat label="Open incidents" value={t.open_incidents} tone="var(--color-crimson)" />
              <div>
                <p className="label !text-[10px]">Payments held</p>
                <p className="tnum mt-1 text-[22px] font-medium tracking-tight text-fg">{inr(t.amount_at_risk_inr)}</p>
                <p className="text-[11.5px] text-dim">requested in HIGH cases</p>
              </div>
              <Stat label="Verified by callback" value={t.verified} tone="var(--color-mint)" />
              <Stat label="Inconclusive" value={t.inconclusive} tone="var(--color-silver)" />
            </div>
            <BandTimeline days={data.timeline} />
          </div>
        </section>

        <section className="panel flex flex-col overflow-hidden">
          <PanelHead title="Active incidents" meta="HIGH · not closed" right={<Link to="/app/cases" className="text-[12px] text-muted hover:text-fg">All cases</Link>} />
          <div className="flex-1 p-2">
            {data.active_incidents.length ? data.active_incidents.map((c) => <CaseRow key={c.id} c={c} />) : <Empty title="No open incidents." hint="HIGH-risk cases appear here until someone closes them." />}
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="panel">
          <PanelHead title="Risk distribution" meta="calibrated 0–100" />
          <div className="p-5"><RiskHistogram bins={data.risk_histogram} /></div>
        </section>
        <section className="panel">
          <PanelHead title="Modality breakdown" meta="evidence received" />
          <div className="p-5"><HBars data={data.modality} color="var(--color-cyan)" /></div>
        </section>
        <section className="panel">
          <PanelHead title="Manipulation tactics" meta="Words witness" />
          <div className="p-5"><HBars data={data.tactics} color="var(--color-amber)" /></div>
        </section>
        <section className="panel">
          <PanelHead title="Delivery channels" meta="where attacks arrive" />
          <div className="p-5"><HBars data={data.channels} color="var(--color-violet)" /></div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <section className="panel overflow-hidden">
          <PanelHead title="Investigation activity" meta="most recent" right={<Link to="/app/cases" className="text-[12px] text-muted hover:text-fg">Open case list</Link>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10.5px] tracking-[0.12em] text-dim">
                  <th className="px-5 py-2.5 font-normal">CASE</th><th className="py-2.5 font-normal">SUBJECT</th><th className="py-2.5 font-normal">ASK</th><th className="py-2.5 font-normal">VERDICT</th><th className="px-5 py-2.5 text-right font-normal">RECEIVED</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((c, i) => (
                  <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    onClick={() => nav(`/app/cases/${c.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-mono text-[12px] text-muted">{c.id}</td>
                    <td className="max-w-[320px] truncate py-3 pr-4 text-fg">{c.title}</td>
                    <td className="py-3 capitalize text-muted">{c.requested_action?.replace("_", " ") ?? "—"}</td>
                    <td className="py-3">{c.status === "complete" ? <BandPill band={c.band} /> : <span className="font-mono text-[11px] text-amber">{c.stage}…</span>}</td>
                    <td className="px-5 py-3 text-right font-mono text-[11.5px] text-dim">{ago(c.received_at ?? c.created_at)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-4">
          <section className="panel">
            <PanelHead title="Live processing" meta={data.running.length ? `${data.running.length} running` : "idle"} />
            <div className="space-y-3 p-5">
              {data.running.length ? data.running.map((c) => (
                <Link key={c.id} to={`/app/cases/${c.id}`} className="block">
                  <div className="flex justify-between text-[12.5px]"><span className="truncate text-silver">{c.title}</span><span className="font-mono text-amber">{c.stage}</span></div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-4"><div className="h-full rounded-full bg-amber transition-[width]" style={{ width: `${c.progress * 100}%` }} /></div>
                </Link>
              )) : (
                <p className="text-[13px] text-muted">All five witnesses are idle. {data.request_volume_12m.toLocaleString("en-IN")} historical requests form the anomaly baseline.</p>
              )}
            </div>
          </section>
          <section className="panel">
            <PanelHead title="Most impersonated" meta="from HIGH verdicts" />
            <ul className="space-y-2 p-5">
              {data.most_impersonated.length ? data.most_impersonated.map((p) => (
                <li key={p.name} className="flex items-center justify-between text-[13px]">
                  <span><span className="text-fg">{p.name}</span> <span className="text-muted">· {p.role}</span></span>
                  <span className="tnum font-mono text-crimson">{p.count}×</span>
                </li>
              )) : <li className="text-[13px] text-muted">Nobody impersonated yet.</li>}
            </ul>
          </section>
          <section className="panel">
            <PanelHead title="Shortcuts" />
            <div className="grid grid-cols-2 gap-2 p-4">
              {[
                { to: "/app/investigate", label: "Investigate files", icon: <ScanSearch size={15} /> },
                { to: "/app/lab", label: "Run a scenario", icon: <FlaskConical size={15} /> },
                { to: "/app/casebook", label: "Ask the casebook", icon: <FileText size={15} /> },
                { to: "/app/attack-chain", label: "Attack chains", icon: <ArrowUpRight size={15} /> },
              ].map((s) => (
                <Link key={s.to} to={s.to} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-[12.5px] text-silver transition-colors hover:border-cyan/40 hover:text-fg">
                  <span className="text-cyan">{s.icon}</span>{s.label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

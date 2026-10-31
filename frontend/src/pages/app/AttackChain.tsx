import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { chainNodeTypes } from "@/components/app/flowNodes";
import { Button } from "@/components/ui/Button";
import { BandPill, Empty, PanelHead, Segmented, Skeleton } from "@/components/ui/primitives";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Band, CaseSummary, GraphEdge, GraphNode } from "@/lib/types";

interface Stage { case_id: string; channel: string; title: string; band: Band; risk: number; action: string; at: string; claimed_sender: string; kinds: string[]; summary: string }
interface Campaign { id: string; stages: Stage[]; shared_identifiers: string[]; max_risk: number; channels: string[] }

const EDGE_STATE: Record<string, { color: string; dash?: string; label: string }> = {
  observed: { color: "#8e99ad", label: "observed" },
  matched: { color: "#6ee7b7", label: "matched" },
  verified: { color: "#67e8f9", label: "verified" },
  inferred: { color: "#fb7185", dash: "5 4", label: "inferred" },
  unknown: { color: "#5d6880", dash: "2 4", label: "unknown" },
};

function CampaignFlow({ c, onPick, picked }: { c: Campaign; onPick: (id: string) => void; picked: string | null }) {
  const nodes: Node[] = c.stages.map((s, i) => ({ id: s.case_id, type: "stage", position: { x: i * 290, y: i % 2 ? 70 : 0 }, data: { ...s, index: i + 1 }, selected: picked === s.case_id }));
  const edges: Edge[] = c.stages.slice(1).map((s, i) => ({
    id: `e${i}`, source: c.stages[i].case_id, target: s.case_id, animated: true,
    label: `+${Math.max(0, Math.round((new Date(s.at).getTime() - new Date(c.stages[i].at).getTime()) / 3.6e6))}h`,
    labelStyle: { fill: "#8e99ad", fontFamily: "Geist Mono", fontSize: 10 }, labelBgStyle: { fill: "#070b14" },
    style: { stroke: "#fb7185", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#fb7185" },
  }));
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={chainNodeTypes} fitView fitViewOptions={{ padding: 0.2 }} onNodeClick={(_, n) => onPick(n.id)}
      proOptions={{ hideAttribution: true }} colorMode="dark" nodesDraggable minZoom={0.3}>
      <Background variant={BackgroundVariant.Lines} gap={48} color="rgb(148 163 184 / 0.05)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function CaseChain({ caseId }: { caseId: string }) {
  const { data } = useApi<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/v1/cases/${caseId}/graph`, [caseId]);
  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], edges: [] as Edge[] };
    const col: Record<string, number> = { person: 0, claim: 1, channel: 2, media: 3, message: 3, case: 3, action: 4, beneficiary: 5 };
    const rows: Record<number, number> = {};
    const nodes: Node[] = data.nodes.map((n) => {
      const x = col[n.type] ?? 3;
      const y = (rows[x] = (rows[x] ?? -1) + 1);
      return { id: n.id, type: "chain", position: { x: x * 230, y: y * 110 + (x === 0 ? 0 : 0) }, data: { ...n.data, __type: n.type } };
    });
    const edges: Edge[] = data.edges.map((e) => {
      const st = EDGE_STATE[e.state ?? "observed"];
      return { id: e.id, source: e.source, target: e.target, label: st.label, animated: e.state === "inferred",
        labelStyle: { fill: st.color, fontFamily: "Geist Mono", fontSize: 9.5 }, labelBgStyle: { fill: "#070b14" },
        style: { stroke: st.color, strokeWidth: 1.4, strokeDasharray: st.dash }, markerEnd: { type: MarkerType.ArrowClosed, color: st.color } };
    });
    return { nodes, edges };
  }, [data]);
  if (!data) return <Skeleton className="h-full" />;
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={chainNodeTypes} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }} colorMode="dark" minZoom={0.3}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgb(148 163 184 / 0.12)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function AttackChain() {
  const { data, loading } = useApi<Campaign[]>("/v1/campaigns");
  const { data: cases } = useApi<CaseSummary[]>("/v1/cases?limit=60&band=HIGH");
  const [mode, setMode] = useState<"campaigns" | "case">("campaigns");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const c = data?.[idx];
  const stage = c?.stages.find((s) => s.case_id === picked) ?? c?.stages[0];
  const chainCase = caseId ?? cases?.[0]?.id ?? null;

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-[24px] font-medium tracking-tight">Attack chain explorer</h1>
          <p className="text-[13px] text-muted">Attacks rarely arrive on one channel. MIRAGE links cases that share numbers, accounts and links into campaigns.</p>
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ value: "campaigns", label: "Cross-channel campaigns" }, { value: "case", label: "Single-case storyline" }]} />
      </div>

      {mode === "campaigns" ? (
        loading && !data ? <Skeleton className="m-6 h-[60vh]" /> : !data?.length ? (
          <Empty title="No linked campaigns yet." hint="Cases that share a phone number, account or URL are grouped here." />
        ) : (
          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-[460px] flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                {data.map((x, i) => (
                  <button key={x.id} onClick={() => { setIdx(i); setPicked(null); }}
                    className={cx("rounded-lg border px-3 py-1.5 font-mono text-[11.5px] transition-colors", i === idx ? "border-crimson/50 bg-crimson/10 text-crimson" : "border-line text-muted hover:text-silver")}>
                    {x.id} · {x.stages.length} stages
                  </button>
                ))}
              </div>
              {c && (
                <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-4 py-3 font-mono text-[11.5px]">
                  {c.stages.map((s, i) => (
                    <span key={s.case_id} className="flex items-center gap-1">
                      <span className={cx("rounded px-2 py-0.5 capitalize", s.band === "HIGH" ? "bg-crimson/10 text-crimson" : "bg-amber/10 text-amber")}>{s.channel}</span>
                      {i < c.stages.length - 1 && <ArrowRight size={12} className="text-dim" />}
                    </span>
                  ))}
                  <ArrowRight size={12} className="text-dim" /><span className="rounded bg-crimson/20 px-2 py-0.5 text-crimson">payment request</span>
                </div>
              )}
              <div className="min-h-[380px] flex-1">{c && <CampaignFlow c={c} onPick={setPicked} picked={picked} />}</div>
            </div>
            <aside className="border-t border-line lg:border-l lg:border-t-0">
              <PanelHead title="Campaign dossier" meta={c?.id} />
              {c && stage && (
                <motion.div key={stage.case_id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 p-5">
                  <div>
                    <p className="label mb-2">Shared identifiers</p>
                    <div className="flex flex-wrap gap-1.5">{c.shared_identifiers.map((s) => <span key={s} className="rounded border border-crimson/30 bg-crimson/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-crimson">{s}</span>)}</div>
                  </div>
                  <div className="rounded-xl border border-line bg-ink-1 p-4">
                    <div className="flex items-center justify-between"><span className="font-mono text-[11px] text-dim">{stage.case_id}</span><BandPill band={stage.band} /></div>
                    <p className="mt-2 text-[14px] text-fg">{stage.title}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">{stage.summary}</p>
                    <Button size="sm" variant="outline" className="mt-3" to={`/app/cases/${stage.case_id}`}>Open case</Button>
                  </div>
                  <ol className="space-y-2">
                    {c.stages.map((s, i) => (
                      <li key={s.case_id}>
                        <button onClick={() => setPicked(s.case_id)} className={cx("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[12.5px]", picked === s.case_id || (!picked && i === 0) ? "bg-ink-3" : "hover:bg-white/[0.03]")}>
                          <span className="tnum font-mono text-dim">{i + 1}</span>
                          <span className="flex-1 truncate capitalize text-silver">{s.channel} · {s.claimed_sender}</span>
                          <span className="font-mono text-[11px]" style={{ color: s.band === "HIGH" ? "#fb7185" : "#fbbf24" }}>{Math.round(s.risk)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </motion.div>
              )}
            </aside>
          </div>
        )
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="max-h-[30vh] overflow-y-auto border-b border-line p-2 lg:max-h-none lg:border-b-0 lg:border-r">
            {(cases ?? []).map((x) => (
              <button key={x.id} onClick={() => setCaseId(x.id)} className={cx("block w-full rounded-lg px-3 py-2 text-left", chainCase === x.id ? "bg-ink-3" : "hover:bg-white/[0.03]")}>
                <span className="block truncate text-[12.5px] text-fg">{x.title}</span>
                <span className="font-mono text-[10.5px] text-dim">{x.id} · {x.channel}</span>
              </button>
            ))}
          </aside>
          <div className="relative min-h-[460px]">
            {chainCase ? <CaseChain caseId={chainCase} /> : <Empty title="No high-risk cases." />}
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-lg border border-line bg-ink-1/90 px-3 py-2 font-mono text-[10.5px]">
              {Object.entries(EDGE_STATE).map(([k, v]) => <span key={k} className="flex items-center gap-1.5" style={{ color: v.color }}><span className="h-px w-4" style={{ background: v.color }} />{v.label}</span>)}
            </div>
            {chainCase && <Link to={`/app/cases/${chainCase}`} className="absolute right-3 top-3 rounded-lg border border-line bg-ink-1/90 px-3 py-1.5 text-[12px] text-silver hover:text-fg">Open case →</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

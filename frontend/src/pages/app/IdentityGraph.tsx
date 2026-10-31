import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { identityNodeTypes } from "@/components/app/flowNodes";
import { Empty, PanelHead, Segmented, Skeleton } from "@/components/ui/primitives";
import { inr } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { GraphEdge, GraphNode } from "@/lib/types";

/** Layered layout: organisations → people (by reporting depth) → channels; impostors and beneficiaries flank. */
function layout(nodes: GraphNode[], edges: GraphEdge[]): Node[] {
  const depth: Record<string, number> = {};
  const parent: Record<string, string> = {};
  for (const e of edges) if (e.kind === "reports_to" || e.kind === "member") parent[e.target] = e.source;
  const d = (id: string): number => {
    if (depth[id] != null) return depth[id];
    const p = parent[id];
    return (depth[id] = p ? d(p) + 1 : 0);
  };
  const cols: Record<string, GraphNode[]> = {};
  for (const n of nodes) {
    let col: string;
    if (n.type === "org") col = "0";
    else if (n.type === "person") col = String(Math.min(3, d(n.id)));
    else if (n.type === "channel") col = "5";
    else if (n.type === "impostor") col = "6";
    else col = n.data.trust === "trusted" ? "4" : "7";
    (cols[col] ||= []).push(n);
  }
  const X: Record<string, number> = { "0": 0, "1": 300, "2": 560, "3": 820, "4": 1100, "5": 1100, "6": 1380, "7": 1660 };
  const out: Node[] = [];
  const offsets: Record<string, number> = { "4": 0, "5": 0 };
  for (const [col, list] of Object.entries(cols)) {
    list.sort((a, b) => (a.data.circle === "family" ? 1 : 0) - (b.data.circle === "family" ? 1 : 0));
    const gap = col === "5" ? 56 : col === "0" ? 380 : 104;
    const base = col === "5" ? (cols["4"]?.length ?? 0) * 96 + 40 : 0;
    list.forEach((n, i) => out.push({ id: n.id, type: n.type, data: n.data, position: { x: X[col], y: base + i * gap + (offsets[col] ?? 0) } }));
  }
  return out;
}

export default function IdentityGraph() {
  const { data, loading } = useApi<{ nodes: GraphNode[]; edges: GraphEdge[] }>("/v1/identity/graph");
  const [view, setView] = useState<"all" | "suspicious">("all");
  const [sel, setSel] = useState<Node | null>(null);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    let gn = data.nodes;
    let ge = data.edges;
    if (view === "suspicious") {
      const keep = new Set<string>();
      for (const e of ge) if (e.suspicious) { keep.add(e.source); keep.add(e.target); }
      gn = gn.filter((n) => keep.has(n.id));
      ge = ge.filter((e) => e.suspicious);
    }
    const nodes = layout(gn, ge);
    const edges: Edge[] = ge.map((e) => ({
      id: e.id, source: e.source, target: e.target, animated: Boolean(e.suspicious),
      label: e.suspicious ? e.kind?.replace(/_/g, " ") : undefined,
      labelStyle: { fill: "#fb7185", fontFamily: "Geist Mono", fontSize: 10 },
      labelBgStyle: { fill: "#070b14" },
      style: { stroke: e.suspicious ? "#fb7185" : e.kind === "uses" ? "rgb(167 139 250 / 0.35)" : e.kind === "pays" || e.kind === "owns" ? "rgb(110 231 183 / 0.35)" : "rgb(148 163 184 / 0.35)",
        strokeWidth: e.suspicious ? 1.6 : 1, strokeDasharray: e.kind === "uses" ? "3 4" : undefined },
    }));
    return { nodes, edges };
  }, [data, view]);

  const d = sel?.data as any;
  const suspicious = data?.edges.filter((e) => e.suspicious).length ?? 0;

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-[24px] font-medium tracking-tight">Identity graph</h1>
          <p className="text-[13px] text-muted">The Trustbook as a graph: who reports to whom, how they communicate, who they pay, and who has impersonated them.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-crimson">{suspicious} suspicious connections</span>
          <Segmented value={view} onChange={setView} options={[{ value: "all", label: "Full graph" }, { value: "suspicious", label: "Suspicious only" }]} />
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {loading && !data ? <Skeleton className="m-6 h-[60vh]" /> : nodes.length === 0 ? <Empty title="No suspicious connections yet." /> : (
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={identityNodeTypes} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2}
              onNodeClick={(_, n) => setSel(n)} onPaneClick={() => setSel(null)} proOptions={{ hideAttribution: true }} colorMode="dark">
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgb(148 163 184 / 0.13)" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable maskColor="rgb(4 6 11 / 0.7)" nodeColor={(n) => (n.type === "impostor" ? "#fb7185" : n.type === "beneficiary" ? ((n.data as any).trust === "trusted" ? "#6ee7b7" : "#fb7185") : n.type === "channel" ? "#a78bfa" : "#67e8f9")} className="!hidden md:!block" />
            </ReactFlow>
          )}
        </div>
        {sel && (
          <aside className="absolute inset-x-0 bottom-0 z-10 max-h-[45%] overflow-y-auto border-t border-line bg-ink-1/95 backdrop-blur md:static md:max-h-none md:w-[320px] md:border-l md:border-t-0">
            <PanelHead title={sel.type ?? "node"} right={<button onClick={() => setSel(null)} className="text-[12px] text-muted hover:text-fg">Close</button>} />
            <div className="space-y-3 p-4 text-[13px]">
              <p className="text-lg text-fg">{d.label}</p>
              {d.role && <p className="text-muted">{d.role} {d.circle === "family" && "· family circle"}</p>}
              {d.phone && <p className="font-mono text-[12px] text-mint">Directory: {d.phone}</p>}
              {d.limit > 0 && <p className="text-silver">Approval limit {inr(d.limit)}</p>}
              {d.channels && <p className="text-silver">Usual channels: {d.channels.join(", ")}</p>}
              {d.voiceprint != null && <p className="text-silver">Voiceprint {d.voiceprint ? "enrolled (consented)" : "not enrolled"} · code word {d.code_word ? "set" : "not set"}</p>}
              {d.identifier && <p className="break-all font-mono text-[12px] text-silver">{d.identifier} · {d.trust}</p>}
              {d.cases && (
                <div>
                  <p className="label mb-1.5">Linked cases</p>
                  <div className="flex flex-wrap gap-1.5">{d.cases.map((c: string) => <Link key={c} to={`/app/cases/${c}`} className="etag">{c}</Link>)}</div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

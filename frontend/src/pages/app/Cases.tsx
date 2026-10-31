import { AudioLines, Image as ImageIcon, MessageSquareText, Search, Video } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MiniRing } from "@/components/app/charts";
import { Button } from "@/components/ui/Button";
import { BandPill, Empty, Segmented, Skeleton } from "@/components/ui/primitives";
import { ago } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { CaseSummary } from "@/lib/types";

const ICON: Record<string, React.ReactNode> = { audio: <AudioLines size={13} />, video: <Video size={13} />, image: <ImageIcon size={13} />, text: <MessageSquareText size={13} /> };

export default function Cases() {
  const [band, setBand] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const { data, loading } = useApi<CaseSummary[]>(`/v1/cases?limit=200${band !== "ALL" ? `&band=${band}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, [band, q]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-medium tracking-tight">Cases</h1>
          <p className="text-[13.5px] text-muted">Every investigation, its verdict and where it stands.</p>
        </div>
        <Button size="sm" to="/app/investigate">New investigation</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={band} onChange={setBand} options={["ALL", "HIGH", "MEDIUM", "LOW", "INCONCLUSIVE"].map((b) => ({ value: b, label: b === "ALL" ? "All" : b.charAt(0) + b.slice(1).toLowerCase() }))} />
        <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line bg-ink-1 px-3 sm:max-w-xs">
          <Search size={14} className="text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id, sender, text…" className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-dim" />
        </label>
      </div>
      <div className="panel overflow-hidden">
        {loading && !data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !data?.length ? (
          <Empty title="No cases match." hint="Try another filter, or open a new investigation." />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((c) => (
              <li key={c.id}>
                <button onClick={() => nav(`/app/cases/${c.id}`)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] sm:grid-cols-[auto_1fr_140px_120px_90px]">
                  {c.band && c.risk != null ? <MiniRing risk={c.risk} band={c.band} /> : <span className="size-[38px] rounded-full border border-dashed border-line-2" />}
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-fg">{c.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-dim">
                      {c.id} · {c.claimed_sender || "unknown sender"} <span className="flex gap-1 text-muted">{c.kinds.map((k) => <span key={k}>{ICON[k]}</span>)}</span>
                    </span>
                  </span>
                  <span className="hidden text-[12.5px] capitalize text-muted sm:block">{c.channel} · {c.requested_action?.replace("_", " ") ?? "—"}</span>
                  <span className="hidden sm:block">{c.status === "complete" ? <BandPill band={c.band} /> : <span className="font-mono text-[11px] text-amber">{c.stage}…</span>}</span>
                  <span className="text-right font-mono text-[11px] text-dim">{c.closed ? "closed" : ago(c.received_at ?? c.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

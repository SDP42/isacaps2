import { motion } from "motion/react";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MiniRing } from "@/components/app/charts";
import { TribunalFlow } from "@/components/case/TribunalFlow";
import { BandPill, Empty, Skeleton } from "@/components/ui/primitives";
import { AGENT_META, cx } from "@/lib/format";
import { useApi, useLiveCase } from "@/lib/hooks";
import type { CaseSummary } from "@/lib/types";

/** The courtroom: pick a case on the left, watch its proceedings as a connected flow. */
export default function TribunalPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: cases } = useApi<CaseSummary[]>("/v1/cases?limit=40");
  const done = (cases ?? []).filter((c) => c.status === "complete");
  useEffect(() => {
    if (!id && done.length) nav(`/app/tribunal/${(done.find((c) => c.band === "HIGH") ?? done[0]).id}`, { replace: true });
  }, [id, done, nav]);
  const { detail, live } = useLiveCase(id);
  const messages = detail?.status === "complete" ? detail.tribunal : live.messages;
  const v = detail?.verdict;
  const agents = Array.from(new Set(messages.map((m) => m.agent)));

  return (
    <div className="grid min-h-[calc(100dvh-56px)] lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-ink-1/40 lg:border-b-0 lg:border-r">
        <p className="label px-5 pb-2 pt-5">Docket</p>
        <ul className="max-h-[40vh] overflow-y-auto px-2 pb-4 lg:max-h-[calc(100dvh-110px)]">
          {(cases ?? []).length === 0 && <li className="space-y-2 p-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></li>}
          {done.map((c) => (
            <li key={c.id}>
              <Link to={`/app/tribunal/${c.id}`} className={cx("grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors", id === c.id ? "bg-ink-3" : "hover:bg-white/[0.03]")}>
                {c.band && c.risk != null && <MiniRing risk={c.risk} band={c.band} size={32} />}
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-fg">{c.title}</span>
                  <span className="font-mono text-[10.5px] text-dim">{c.id} · {c.channel}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 p-4 sm:p-6">
        {!detail ? (
          id ? <Skeleton className="h-96" /> : <Empty title="No completed cases yet." hint="Open an investigation or run a scenario to convene the Tribunal." />
        ) : (
          <>
            <header className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-ink-1/60 p-5">
              <div className="pointer-events-none absolute inset-0 grid-field-fine opacity-40" />
              <div className="relative flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[11px] tracking-[0.14em] text-dim">IN THE MATTER OF {detail.id}</p>
                  <h1 className="mt-1 max-w-3xl text-[22px] font-medium leading-tight tracking-tight">{detail.title}</h1>
                  <p className="mt-1 text-[13px] text-muted">{agents.length} agents · {messages.length} statements · claimed sender {detail.claimed_sender || "unknown"}</p>
                </div>
                {v && (
                  <div className="text-right">
                    <BandPill band={v.band} withCopy />
                    <p className="tnum mt-1 text-[34px] font-light leading-none tracking-tight">{v.risk.toFixed(0)}<span className="text-[15px] text-dim">/100</span></p>
                  </div>
                )}
              </div>
              <div className="relative mt-5 flex flex-wrap gap-2">
                {Object.entries(AGENT_META).map(([k, a]) => (
                  <span key={k} className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-opacity", agents.includes(k) ? "border-line-2 opacity-100" : "border-line opacity-30")}>
                    <span className="size-1.5 rounded-full" style={{ background: a.color }} />{a.name}
                  </span>
                ))}
              </div>
            </header>
            {messages.length ? (
              <motion.div key={detail.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <TribunalFlow messages={messages} evidence={detail.evidence} onCite={(e) => nav(`/app/cases/${detail.id}/evidence`, { state: { cite: e } })} />
              </motion.div>
            ) : <Empty title="The Tribunal is convening…" hint="Testimony streams in as the witnesses report." />}
          </>
        )}
      </section>
    </div>
  );
}

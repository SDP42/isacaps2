import { ArrowLeft, Download, Gavel } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ProcessingView } from "@/components/app/ProcessingView";
import { AskPanel, ReportPanel, VerifyPanel } from "@/components/case/ActionPanels";
import { MediaStudio } from "@/components/case/MediaStudio";
import { IdentityPanel, MessageIntel } from "@/components/case/MessagePanels";
import { TribunalFlow } from "@/components/case/TribunalFlow";
import { EvidenceLedger, LensPanel, VerdictPanel, WitnessPanel } from "@/components/case/VerdictPanels";
import { WhatIf } from "@/components/case/WhatIf";
import { Button } from "@/components/ui/Button";
import { BandPill, Empty, Segmented, Skeleton } from "@/components/ui/primitives";
import { downloadReport } from "@/lib/api";
import { clock } from "@/lib/format";
import { useLiveCase } from "@/lib/hooks";

type Tab = "evidence" | "tribunal" | "verify" | "report";

export default function CaseView() {
  const { id, tab = "evidence" } = useParams<{ id: string; tab?: Tab }>();
  const nav = useNavigate();
  const { detail, live, error, setDetail } = useLiveCase(id);
  const [selected, setSelected] = useState<string | null>(null);
  const [witness, setWitness] = useState<string | null>(null);

  const cite = useCallback((eid: string) => {
    setSelected(eid);
    if (tab !== "evidence") nav(`/app/cases/${id}/evidence`);
    setTimeout(() => document.getElementById(`ledger-${eid}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
  }, [id, nav, tab]);

  if (error) return <Empty title={error} action={<Button to="/app/cases" variant="outline" size="sm">Back to cases</Button>} />;
  if (!detail) {
    return <div className="space-y-4 p-6"><Skeleton className="h-16 w-1/2" /><Skeleton className="h-64" /><Skeleton className="h-96" /></div>;
  }
  const running = detail.status !== "complete" || !detail.verdict;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/app/cases" className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg"><ArrowLeft size={12} /> Cases</Link>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[12px] text-dim">{detail.id}</span>
            {detail.verdict && <BandPill band={detail.verdict.band} withCopy />}
            {detail.closed && <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">closed · {detail.outcome?.replace("_", " ")}</span>}
          </div>
          <h1 className="mt-1 max-w-4xl text-[clamp(1.3rem,2.2vw,1.75rem)] font-medium leading-tight tracking-tight">{detail.title}</h1>
          <p className="mt-1 text-[13px] text-muted">
            Claimed sender <span className="text-fg">{detail.claimed_sender || "unknown"}</span> · via <span className="text-fg">{detail.channel}</span>
            {detail.sender_contact && <> · from <span className="font-mono text-[12px] text-silver">{detail.sender_contact}</span></>} · received {clock(detail.received_at)}
          </p>
        </div>
        {!running && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<Gavel size={13} />} to={`/app/tribunal/${detail.id}`}>Tribunal view</Button>
            <Button size="sm" icon={<Download size={13} />} onClick={() => downloadReport(detail.id).then(() => toast.success("Report downloaded")).catch((e) => toast.error(e.message))}>
              Export report
            </Button>
          </div>
        )}
      </header>

      {running ? (
        <ProcessingView live={live} detail={detail} />
      ) : (
        <>
          <Segmented value={tab} onChange={(t) => nav(`/app/cases/${id}/${t}`)}
            options={[{ value: "evidence", label: "Evidence" }, { value: "tribunal", label: `Tribunal · ${detail.tribunal.length}` }, { value: "verify", label: "Verify" }, { value: "report", label: "Report" }]} />

          {tab === "evidence" && (
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-4">
                <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
                  <VerdictPanel v={detail.verdict!} onCite={cite} />
                  <LensPanel v={detail.verdict!} />
                </div>
                <WhatIf detail={detail} />
                <MediaStudio detail={detail} selected={selected} onSelect={setSelected} />
                <MessageIntel detail={detail} selected={selected} onSelect={setSelected} />
                <div className="grid gap-4 xl:grid-cols-2">
                  <IdentityPanel detail={detail} selected={selected} onSelect={setSelected} />
                  <WitnessPanel detail={detail} active={witness} onSelectWitness={setWitness} />
                </div>
              </div>
              <aside className="space-y-4">
                <VerifyPanel detail={detail} onChange={setDetail} compact />
                <EvidenceLedger evidence={detail.evidence} selected={selected} onSelect={setSelected} filter={witness} />
                <AskPanel caseId={detail.id} onCite={cite} />
              </aside>
            </div>
          )}
          {tab === "tribunal" && <div className="panel p-5 sm:p-6"><TribunalFlow messages={detail.tribunal} evidence={detail.evidence} onCite={cite} /></div>}
          {tab === "verify" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <VerifyPanel detail={detail} onChange={setDetail} />
              <AskPanel caseId={detail.id} onCite={cite} />
            </div>
          )}
          {tab === "report" && <ReportPanel detail={detail} />}
        </>
      )}
    </div>
  );
}

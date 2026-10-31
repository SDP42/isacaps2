import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Building2, CreditCard, Fingerprint, KeyRound, MessageCircle, Phone, ShieldAlert, Video, Mail, Users } from "lucide-react";
import { cx, inr } from "@/lib/format";

const H = ({ hidden = true }: { hidden?: boolean }) => (
  <>
    <Handle type="target" position={Position.Left} className={cx(hidden && "!opacity-0")} />
    <Handle type="source" position={Position.Right} className={cx(hidden && "!opacity-0")} />
  </>
);

const CH_ICON: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle size={13} />, phone: <Phone size={13} />, video: <Video size={13} />, email: <Mail size={13} />,
  teams: <Users size={13} />, sms: <MessageCircle size={13} />, portal: <KeyRound size={13} />,
};

export function PersonNode({ data, selected }: NodeProps) {
  const d = data as any;
  const fam = d.circle === "family";
  return (
    <div className={cx("w-[210px] rounded-xl border bg-ink-1/95 px-3 py-2.5 backdrop-blur", selected ? "border-cyan/60" : d.impersonations ? "border-crimson/40" : "border-line-2")}>
      <H />
      <div className="flex items-center gap-2.5">
        <span className={cx("grid size-8 place-items-center rounded-lg text-[11px] font-medium", fam ? "bg-amber/10 text-amber" : "bg-cyan/10 text-cyan")}>
          {String(d.label).split(" ").map((x: string) => x[0]).join("").slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] text-fg">{d.label}</p>
          <p className="truncate text-[10.5px] text-muted">{d.role}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px]">
        {d.voiceprint && <span className="flex items-center gap-1 rounded border border-line px-1 py-0.5 text-mint"><Fingerprint size={10} />voice</span>}
        {d.code_word && <span className="rounded border border-line px-1 py-0.5 text-amber">code word</span>}
        {d.limit > 0 && <span className="rounded border border-line px-1 py-0.5 text-silver">≤ {inr(d.limit)}</span>}
        {d.impersonations > 0 && <span className="rounded border border-crimson/40 px-1 py-0.5 text-crimson">impersonated {d.impersonations}×</span>}
      </div>
    </div>
  );
}

export function OrgNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <div className="rounded-2xl border border-cyan/30 bg-cyan/[0.06] px-4 py-3">
      <H />
      <div className="flex items-center gap-2.5"><Building2 size={16} className="text-cyan" /><div><p className="text-[13px] text-fg">{d.label}</p><p className="font-mono text-[10px] text-muted">{d.sub}</p></div></div>
    </div>
  );
}

export function ChannelNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-violet/30 bg-violet/[0.07] px-3 py-1.5 text-[11.5px] capitalize text-violet">
      <H />{CH_ICON[d.label] ?? <MessageCircle size={13} />}{d.label}
    </div>
  );
}

export function BeneficiaryNode({ data }: NodeProps) {
  const d = data as any;
  const bad = d.trust !== "trusted";
  return (
    <div className={cx("w-[190px] rounded-lg border px-3 py-2", bad ? "border-crimson/50 bg-crimson/[0.07]" : "border-mint/30 bg-mint/[0.05]")}>
      <H />
      <p className="flex items-center gap-1.5 text-[11.5px]" style={{ color: bad ? "#fb7185" : "#6ee7b7" }}><CreditCard size={12} />{d.label}</p>
      <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{d.identifier}</p>
      <p className="font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: bad ? "#fb7185" : "#6ee7b7" }}>{d.trust}</p>
    </div>
  );
}

export function ImpostorNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <div className={cx("w-[190px] rounded-lg border border-dashed bg-ink-0 px-3 py-2", selected ? "border-crimson" : "border-crimson/60")}>
      <H />
      <p className="flex items-center gap-1.5 text-[11.5px] text-crimson"><ShieldAlert size={12} />Impostor</p>
      <p className="mt-0.5 truncate font-mono text-[10.5px] text-fg">{d.label}</p>
      <p className="font-mono text-[9.5px] text-muted">{d.channel} · {d.cases?.length} case{d.cases?.length === 1 ? "" : "s"}</p>
    </div>
  );
}

/** Attack-chain nodes */
export function StageNode({ data, selected }: NodeProps) {
  const d = data as any;
  const color = d.band === "HIGH" ? "#fb7185" : d.band === "MEDIUM" ? "#fbbf24" : d.band === "LOW" ? "#6ee7b7" : "#c7cfdd";
  return (
    <div className={cx("w-[230px] rounded-2xl border bg-ink-1/95 p-3.5 transition-colors", selected ? "border-cyan/60" : "border-line-2")} style={{ boxShadow: `inset 0 2px 0 ${color}` }}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-line-2" />
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-line-2" />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] capitalize text-silver">{CH_ICON[d.channel] ?? <MessageCircle size={13} />}{d.channel}</span>
        <span className="font-mono text-[10px] text-dim">STAGE {d.index}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-fg">{d.claimed_sender}</p>
      <p className="mt-1 font-mono text-[10px] text-dim">{new Date(d.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="font-mono text-[10.5px]" style={{ color }}>{d.band} {Math.round(d.risk)}</span>
        <span className="text-[10.5px] capitalize text-muted">{String(d.action).replace("_", " ")}</span>
      </div>
    </div>
  );
}

export function ChainNode({ data }: NodeProps) {
  const d = data as any;
  const tone: Record<string, string> = { claim: "#67e8f9", channel: "#a78bfa", media: "#67e8f9", message: "#fbbf24", action: "#fb7185", beneficiary: "#fb7185", person: "#6ee7b7", case: "#c7cfdd" };
  const c = tone[d.__type] ?? "#c7cfdd";
  return (
    <div className="w-[180px] rounded-xl border bg-ink-1/95 px-3 py-2" style={{ borderColor: `${c}55` }}>
      <H />
      <p className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: c }}>{d.__type}</p>
      <p className="mt-0.5 truncate text-[12px] text-fg">{d.label}</p>
      {d.sub && <p className="truncate font-mono text-[10px] text-muted">{d.sub}</p>}
      {d.score != null && <p className="font-mono text-[10px]" style={{ color: d.score >= 0.6 ? "#fb7185" : "#6ee7b7" }}>score {Number(d.score).toFixed(2)}</p>}
      {d.trust && <p className="font-mono text-[10px] uppercase" style={{ color: d.trust === "trusted" ? "#6ee7b7" : "#fb7185" }}>{d.trust}</p>}
      {d.role && <p className="font-mono text-[10px] text-mint">{d.role} · {d.phone}</p>}
      {d.tactics?.length > 0 && <p className="truncate font-mono text-[10px] text-amber">{d.tactics.join(" · ")}</p>}
    </div>
  );
}

export const identityNodeTypes = { person: PersonNode, org: OrgNode, channel: ChannelNode, beneficiary: BeneficiaryNode, impostor: ImpostorNode };
export const chainNodeTypes = { stage: StageNode, chain: ChainNode };

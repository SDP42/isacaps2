import { ArrowRight, AudioLines, ChevronDown, ExternalLink, FileText, Image as ImageIcon, Phone, Play, Sparkles, Video } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ModelJury } from "@/components/app/ModelJury";
import { EvidenceTimeline } from "@/components/kit/EvidenceTimeline";
import type { Block, Tone } from "@/lib/assistant";
import { cx } from "@/lib/format";
import { artifactUrl } from "@/lib/api";

const TONE: Record<string, string> = {
  crimson: "var(--color-crimson)", amber: "var(--color-amber)", mint: "var(--color-mint)", cyan: "var(--color-cyan)",
  violet: "var(--color-violet)", muted: "var(--color-muted)",
};
const tone = (t?: string) => TONE[t ?? "cyan"] ?? TONE.cyan;
const TACTIC: Record<string, string> = {
  urgency: "#fbbf24", authority: "#a78bfa", secrecy: "#fb7185", fear: "#f97316", reward: "#6ee7b7", channel_switch: "#67e8f9", bypass: "#f472b6",
};

/** **bold**, *italic* and `code`, nothing else: answers are written by MIRAGE, not pasted HTML. */
export function Md({ text, className }: { text: string; className?: string }) {
  const paras = text.split(/\n{2,}/);
  return (
    <div className={cx("space-y-2", className)}>
      {paras.map((p, i) => (
        <p key={i}>
          {p.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((s, j) =>
            s.startsWith("**") ? <strong key={j} className="font-semibold text-fg">{s.slice(2, -2)}</strong>
              : s.startsWith("`") ? <code key={j} className="rounded bg-ink-4 px-1 py-px font-mono text-[0.86em] text-cyan">{s.slice(1, -1)}</code>
                : s.startsWith("*") && s.length > 2 ? <em key={j} className="text-silver">{s.slice(1, -1)}</em> : <Fragment key={j}>{s}</Fragment>)}
        </p>
      ))}
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <p className="label mb-2 !text-[10px]">{children}</p>;
}

function Gauge({ value, color, label }: { value: number; color: string; label?: string }) {
  const r = 34, c = Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative grid w-[92px] shrink-0 place-items-center">
      <svg viewBox="0 0 84 48" className="w-full" aria-label={`${label ?? "score"} ${v.toFixed(2)}`}>
        <path d="M8 44 A34 34 0 0 1 76 44" fill="none" stroke="var(--color-ink-4)" strokeWidth="7" strokeLinecap="round" />
        <path d="M8 44 A34 34 0 0 1 76 44" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <span className="absolute bottom-0 font-mono text-[17px] font-medium" style={{ color }}>{v.toFixed(2)}</span>
    </div>
  );
}

function Verdict({ b }: { b: Block }) {
  const c = tone(b.tone);
  return (
    <div className="relative overflow-hidden rounded-xl border p-4" style={{ borderColor: `color-mix(in srgb, ${c} 35%, transparent)`, background: `linear-gradient(135deg, color-mix(in srgb, ${c} 12%, transparent), transparent 60%)` }}>
      <div className="flex items-center gap-4">
        {b.score != null && <Gauge value={b.score} color={c} label={b.score_label} />}
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-wider" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
            <span className="size-1.5 rounded-full" style={{ background: c }} />{b.severity}
          </span>
          <p className="mt-1.5 text-[15px] font-medium leading-snug text-fg">{b.title}</p>
          {b.subtitle && <p className="text-[12.5px] text-muted">{b.subtitle}</p>}
          {b.score_label && <p className="mt-0.5 font-mono text-[10.5px] text-dim">{b.score_label}</p>}
        </div>
      </div>
      {b.chips?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.chips.map((x: string) => <span key={x} className="rounded-md border border-line bg-ink-1/70 px-2 py-0.5 text-[11.5px] text-silver">{x}</span>)}
        </div>
      )}
    </div>
  );
}

const SYN = ["ai", "uncertain", "human"] as const;
const SYN_LABEL: Record<string, string> = { ai: "AI voice", uncertain: "Uncertain", human: "Human voice" };
const CELL: Record<string, [string, Tone]> = {
  "ai|1": ["CRITICAL · voice-clone scam", "crimson"], "uncertain|1": ["HIGH · unverified", "crimson"], "human|1": ["MEDIUM–HIGH · verify", "amber"],
  "ai|0": ["LOW–HIGH · synthetic, no ask", "violet"], "uncertain|0": ["INCONCLUSIVE", "muted"], "human|0": ["LOW · benign", "mint"],
};

function Matrix({ b }: { b: Block }) {
  const cur = `${b.synthetic}|${b.sensitive ? 1 : 0}`;
  const hyp = b.hypo ? `${b.hypo.synthetic}|${b.hypo.sensitive ? 1 : 0}` : null;
  return (
    <div className="rounded-xl border border-line bg-ink-1/60 p-3">
      <Title>Who is speaking × what they want</Title>
      <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1.5 text-[11px]">
        <span />
        {SYN.map((s) => <span key={s} className="text-center font-mono text-[10px] text-dim">{SYN_LABEL[s]}</span>)}
        {[1, 0].map((sens) => (
          <Fragment key={sens}>
            <span className="self-center pr-1 font-mono text-[10px] text-dim">{sens ? "Sensitive ask" : "Nothing sensitive"}</span>
            {SYN.map((s) => {
              const k = `${s}|${sens}`, [label, t] = CELL[k], on = k === cur, h = k === hyp;
              return (
                <div key={k} className={cx("relative rounded-lg border px-2 py-2 text-center leading-tight transition-colors", on || h ? "text-fg" : "text-dim")}
                  style={{ borderColor: on ? tone(t) : h ? "var(--color-cyan)" : "var(--color-line)", borderStyle: h && !on ? "dashed" : "solid",
                           background: on ? `color-mix(in srgb, ${tone(t)} 16%, transparent)` : "transparent" }}>
                  {label}
                  {on && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-ink-0 px-1 font-mono text-[9px] text-fg">this</span>}
                  {h && !on && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-ink-0 px-1 font-mono text-[9px] text-cyan">what if</span>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Quote({ b }: { b: Block }) {
  const marks = [...(b.marks ?? [])].sort((x: any, y: any) => x.start - y.start);
  const parts: ReactNode[] = [];
  let pos = 0;
  marks.forEach((m: any, i: number) => {
    if (m.start < pos) return;
    parts.push(<Fragment key={`t${i}`}>{b.text.slice(pos, m.start)}</Fragment>);
    const c = TACTIC[m.kind] ?? "var(--color-amber)";
    parts.push(<mark key={`m${i}`} title={m.kind.replace("_", " ")} className="rounded px-0.5 text-fg" style={{ background: `color-mix(in srgb, ${c} 22%, transparent)`, boxShadow: `inset 0 -2px 0 ${c}` }}>{b.text.slice(m.start, m.end)}</mark>);
    pos = m.end;
  });
  parts.push(<Fragment key="end">{b.text.slice(pos)}</Fragment>);
  return (
    <div className="rounded-xl border border-line bg-ink-1/60 p-3">
      <Title>{b.label}</Title>
      <blockquote className="border-l-2 border-cyan/40 pl-3 text-[13px] leading-relaxed text-silver">{parts}</blockquote>
    </div>
  );
}

function Bars({ b }: { b: Block }) {
  return (
    <div className="rounded-xl border border-line bg-ink-1/60 p-3">
      {b.title && <Title>{b.title}</Title>}
      <ul className="space-y-2">
        {b.items.map((it: any) => (
          <li key={it.label} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] items-center gap-3">
            <span className="truncate text-[12px] text-silver" title={it.label}>{it.label}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-ink-4">
              <span className="mark-grow absolute inset-y-0 left-0 origin-left rounded-full" style={{ width: `${Math.max(2, (it.value / (it.max || 1)) * 100)}%`, background: tone(it.tone) }} />
            </span>
            <span className="text-right font-mono text-[11px]" style={{ color: tone(it.tone) }}>{it.display}{it.note && <span className="ml-1.5 text-dim">{it.note}</span>}</span>
          </li>
        ))}
      </ul>
      {b.caption && <p className="mt-2.5 text-[11px] text-dim">{b.caption}</p>}
    </div>
  );
}

function Facts({ b }: { b: Block }) {
  return (
    <div>
      {b.title && <Title>{b.title}</Title>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {b.items.map((f: any) => (
          <div key={f.label} className="rounded-lg border border-line bg-ink-1/60 px-3 py-2">
            <p className="text-[10.5px] leading-tight text-dim">{f.label}</p>
            <p className="mt-0.5 text-[14px] font-medium leading-snug" style={{ color: f.tone ? tone(f.tone) : "var(--color-fg)" }}>{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Flow({ b }: { b: Block }) {
  return (
    <div className="rounded-xl border border-line bg-ink-1/60 p-3">
      {b.title && <Title>{b.title}</Title>}
      <ol className="relative space-y-0">
        {b.items.map((s: any, i: number) => (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < b.items.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-18px)] w-px bg-gradient-to-b from-cyan/50 to-violet/30" />}
            <span className={cx("relative z-[1] grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10.5px]",
              b.active === i ? "border-cyan bg-cyan/20 text-cyan" : "border-line-2 bg-ink-2 text-silver")}>{i + 1}</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[13px] font-medium text-fg">{s.title.replace(/^\d+ · /, "")}</p>
              {s.detail && <p className="text-[12px] leading-snug text-muted">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Steps({ b }: { b: Block }) {
  const c = tone(b.tone);
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${c} 25%, transparent)` }}>
      <Title>{b.title}</Title>
      <ol className="space-y-2">
        {b.items.map((s: string, i: number) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-silver">
            <span className="mt-px grid size-5 shrink-0 place-items-center rounded-md font-mono text-[10.5px] font-semibold text-ink-0" style={{ background: c }}>{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function List({ b }: { b: Block }) {
  return (
    <div className="rounded-xl border border-line bg-ink-1/60 p-3">
      {b.title && <Title>{b.title}</Title>}
      <ul className="space-y-1.5">
        {b.items.map((it: any, i: number) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-silver">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: tone(it.tone), boxShadow: `0 0 8px ${tone(it.tone)}` }} />
            <span>{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Callout({ b }: { b: Block }) {
  const c = tone(b.tone);
  return (
    <div className="rounded-xl border-l-[3px] px-3.5 py-2.5" style={{ borderColor: c, background: `color-mix(in srgb, ${c} 9%, transparent)` }}>
      <p className="text-[12.5px] font-semibold" style={{ color: c }}>{b.title}</p>
      <p className="text-[12.5px] leading-snug text-silver">{b.text}</p>
    </div>
  );
}

function Chips({ b, onAsk }: { b: Block; onAsk: (p: string) => void }) {
  return (
    <div>
      {b.title && <Title>{b.title}</Title>}
      <div className="grid gap-2 sm:grid-cols-2">
        {b.items.map((c: any) => {
          const col = TACTIC[c.kind] ?? tone(c.tone);
          const Tag = c.prompt ? "button" : "div";
          return (
            <Tag key={c.label} onClick={c.prompt ? () => onAsk(c.prompt) : undefined}
              className={cx("rounded-lg border px-3 py-2 text-left", c.prompt && "transition-colors hover:bg-white/[0.03]")}
              style={{ borderColor: `color-mix(in srgb, ${col} 30%, transparent)` }}>
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: col }}>
                <span className="size-1.5 rounded-full" style={{ background: col }} />{c.label}
              </p>
              {c.detail && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{c.detail}</p>}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

function Table({ b }: { b: Block }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      {b.title && <p className="label px-3 pt-2.5 !text-[10px]">{b.title}</p>}
      <table className="w-full text-left text-[12px]">
        <thead><tr>{b.columns.map((c: string, i: number) => <th key={i} className="whitespace-nowrap border-b border-line px-3 py-2 font-mono text-[10px] font-normal uppercase tracking-wider text-dim">{c}</th>)}</tr></thead>
        <tbody>
          {b.rows.map((r: any[], i: number) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {r.map((c, j) => <td key={j} className={cx("px-3 py-1.5 align-top", j === 0 ? "text-fg" : "text-silver", c === "yes" || (typeof c === "string" && c.startsWith("yes")) ? "text-mint" : c === "no" ? "text-crimson/80" : "")}>{String(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Heatmap({ b }: { b: Block }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-ink-1/60 p-3">
      <Title>{b.title}</Title>
      <div className="grid gap-1" style={{ gridTemplateColumns: `minmax(110px,auto) repeat(${b.cols.length}, minmax(38px,1fr))` }}>
        <span />
        {b.cols.map((c: string) => <span key={c} className="truncate text-center font-mono text-[9.5px] text-dim">{c}</span>)}
        {b.rows.map((r: string, i: number) => (
          <Fragment key={r}>
            <span className="truncate pr-2 font-mono text-[10px] text-silver">{r.replace(/_/g, " ")}</span>
            {b.values[i].map((cell: [number, boolean] | null, j: number) => (
              <span key={j} title={cell ? `${r} · ${b.cols[j]}: ${cell[0].toFixed(2)} ${cell[1] ? "caught" : "missed"}` : "—"}
                className="grid h-7 place-items-center rounded font-mono text-[9.5px]"
                style={{ background: cell ? `color-mix(in srgb, ${cell[1] ? "var(--color-mint)" : "var(--color-crimson)"} ${Math.round(18 + cell[0] * 50)}%, transparent)` : "var(--color-ink-3)",
                         color: cell && !cell[1] ? "var(--color-fg)" : "var(--color-ink-0)" }}>
                {cell ? (cell[1] ? cell[0].toFixed(2) : "miss") : ""}
              </span>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Formula({ b }: { b: Block }) {
  return (
    <div className="rounded-xl border border-violet/30 bg-violet/[0.06] p-3">
      <p className="overflow-x-auto whitespace-nowrap font-mono text-[13px] text-fg">{b.text}</p>
      <ul className="mt-2 space-y-0.5">{b.legend.map((l: string) => <li key={l} className="font-mono text-[11px] text-muted">{l}</li>)}</ul>
    </div>
  );
}

function Contacts({ b }: { b: Block }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {b.items.map((c: any) => (
        <a key={c.id} href={c.href ?? undefined} target={c.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
          className={cx("group rounded-lg border border-line bg-ink-1/60 px-3 py-2", c.href && "transition-colors hover:border-cyan/40")}>
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
            <Phone size={12} className="text-cyan" /> {c.label}
            {c.href?.startsWith("http") && <ExternalLink size={11} className="text-dim group-hover:text-cyan" />}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{c.why}</p>
        </a>
      ))}
    </div>
  );
}

const KIND_ICON: Record<string, any> = { ogg: AudioLines, mp3: AudioLines, wav: AudioLines, jpg: ImageIcon, png: ImageIcon, mp4: Video };

function Samples({ b, onSample }: { b: Block; onSample: (k: string, label: string) => void }) {
  return (
    <div>
      <Title>Try a sample</Title>
      <div className="flex flex-wrap gap-1.5">
        {b.items.map((s: any) => {
          const Icon = KIND_ICON[s.kind] ?? FileText;
          return (
            <button key={s.key} onClick={() => onSample(s.key, s.label)} title={s.label}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-ink-1/70 px-2.5 py-1 text-[11.5px] text-silver transition-colors hover:border-cyan/40 hover:text-fg">
              <Icon size={12} className="shrink-0 text-cyan" /><span className="truncate">{s.label.split(":")[0].split(",")[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Capabilities({ b, onAsk }: { b: Block; onAsk: (p: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {b.items.map((c: any) => (
        <button key={c.title} onClick={() => onAsk(c.prompt)} className="group rounded-xl border border-line bg-ink-1/60 p-3 text-left transition-colors hover:border-cyan/40">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg"><Sparkles size={13} className="text-cyan" />{c.title}
            <ArrowRight size={12} className="ml-auto text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-cyan" /></p>
          <p className="mt-0.5 text-[11.5px] text-muted">{c.detail}</p>
        </button>
      ))}
    </div>
  );
}

function Actions({ b, onAsk }: { b: Block; onAsk: (p: string) => void }) {
  const nav = useNavigate();
  return (
    <div className="flex flex-wrap gap-2">
      {b.items.map((a: any) => (
        <button key={a.label} onClick={() => (a.to ? nav(a.to) : onAsk(a.prompt))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/30 bg-cyan/[0.07] px-3 py-1.5 text-[12px] text-cyan transition-colors hover:bg-cyan/[0.14]">
          {a.to ? <ArrowRight size={13} /> : <Play size={12} />}{a.label}
        </button>
      ))}
    </div>
  );
}

/** The attack the copilot built from a described situation: who, how, what was said, and the evidence it produced. */
function Scenario({ b }: { b: Block }) {
  const nav = useNavigate();
  const audio = (b.media ?? []).find((m: any) => m.kind === "audio");
  const video = (b.media ?? []).find((m: any) => m.kind === "video");
  const image = (b.media ?? []).find((m: any) => m.kind === "image");
  return (
    <div className="overflow-hidden rounded-xl border border-violet/35 bg-violet/[0.05]">
      <div className="flex flex-wrap items-center gap-2 border-b border-violet/20 px-4 py-2.5">
        <span className="font-mono text-[10px] tracking-[0.14em] text-violet">SCENARIO BUILT · SYNTHETIC</span>
        <span className="ml-auto font-mono text-[10.5px] text-dim">{b.case_id}</span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-[14px] font-medium text-fg">{b.title}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Channel", b.channel], ["Claims to be", b.claimed], ["From", b.contact],
            ["Asks for", b.ask === "none" ? "nothing" : b.ask === "payment" && b.amount ? `₹${Number(b.amount).toLocaleString("en-IN")}` : String(b.ask).replace("_", " ")]].map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-lg border border-line bg-ink-1/60 px-2.5 py-1.5">
              <p className="text-[10px] text-dim">{k}</p><p className="truncate text-[12.5px] text-silver" title={v}>{v}</p>
            </div>
          ))}
        </div>
        <blockquote className="border-l-2 border-violet/50 pl-3 text-[13px] italic leading-relaxed text-silver">“{b.script}”</blockquote>
        {video && <video controls preload="metadata" className="max-h-56 rounded-lg" src={artifactUrl(b.case_id, video.id)} />}
        {!video && image && <img alt="" className="max-h-48 rounded-lg" src={artifactUrl(b.case_id, image.id)} />}
        {audio && <audio controls preload="metadata" className="w-full" src={artifactUrl(b.case_id, audio.id)} />}
        <p className="font-mono text-[10.5px] text-dim">
          {b.engine ? `voice: ${b.engine}` : "written channel: no audio"}{b.laundering ? ` · laundered: ${b.laundering}` : ""}{b.image_engine ? ` · face: ${b.image_engine}` : ""}
        </p>
        {b.assumptions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {b.assumptions.map((a: string) => <span key={a} className="rounded-full border border-amber/35 px-2 py-0.5 text-[11px] text-amber">{a}</span>)}
          </div>
        )}
        <button onClick={() => nav(`/app/cases/${b.case_id}`)} className="text-[12px] text-violet hover:underline">Open this case →</button>
      </div>
    </div>
  );
}

function Versus({ b }: { b: Block }) {
  const col = (title: string, items: string[], tone: string) => (
    <div className="rounded-xl border p-3" style={{ borderColor: `color-mix(in srgb, ${tone} 30%, transparent)` }}>
      <p className="mb-2 text-[12px] font-semibold" style={{ color: tone }}>{title}</p>
      <ol className="space-y-1.5">{items.map((s, i) => (
        <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-silver"><span className="font-mono text-[11px]" style={{ color: tone }}>{i + 1}</span>{s}</li>
      ))}</ol>
    </div>
  );
  return <div className="grid gap-2 sm:grid-cols-2">{col("Without MIRAGE", b.without, "var(--color-crimson)")}{col("With MIRAGE", b.with, "var(--color-mint)")}</div>;
}

export function BlockView({ b, onAsk, onSample, audioSrc }: { b: Block; onAsk: (p: string) => void; onSample: (k: string, l: string) => void; audioSrc?: string }) {
  switch (b.type) {
    case "lead": return <Md text={b.text} className="text-[14px] leading-relaxed text-silver" />;
    case "text": return <Md text={b.text} className="text-[13px] leading-relaxed text-muted" />;
    case "verdict": return <Verdict b={b} />;
    case "matrix": return <Matrix b={b} />;
    case "jury": return <ModelJury models={b.models} meta={b.meta} consensus={b.consensus} fakeWord={b.fake_word} compact={b.compact} />;
    case "timeline": return <EvidenceTimeline duration={b.duration} peaks={b.peaks} windows={b.windows} words={b.words} spans={b.spans} threshold={b.threshold} src={audioSrc} />;
    case "quote": return <Quote b={b} />;
    case "bars": return <Bars b={b} />;
    case "facts": return <Facts b={b} />;
    case "flow": return <Flow b={b} />;
    case "steps": return <Steps b={b} />;
    case "list": return <List b={b} />;
    case "callout": return <Callout b={b} />;
    case "chips": return <Chips b={b} onAsk={onAsk} />;
    case "table": return <Table b={b} />;
    case "heatmap": return <Heatmap b={b} />;
    case "formula": return <Formula b={b} />;
    case "contacts": return <Contacts b={b} />;
    case "samples": return <Samples b={b} onSample={onSample} />;
    case "capabilities": return <Capabilities b={b} onAsk={onAsk} />;
    case "actions": return <Actions b={b} onAsk={onAsk} />;
    case "disclosure":
      return (
        <details className="group rounded-xl border border-line bg-ink-1/60 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-silver"><ChevronDown size={13} className="transition-transform group-open:rotate-180" />{b.title}</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] text-muted">{b.items.map((s: string) => <li key={s}>{s}</li>)}</ol>
        </details>
      );
    case "sources":
      return (
        <div className="flex flex-wrap gap-1.5">
          {b.items.map((s: any, i: number) => <span key={i} className="etag"><FileText size={10} />{s.doc.replace("docs/", "")} · {s.heading}</span>)}
        </div>
      );
    case "scenario": return <Scenario b={b} />;
    case "versus": return <Versus b={b} />;
    default: return null;
  }
}


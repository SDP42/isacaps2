import { PanelHead } from "@/components/ui/primitives";
import { cx, inr } from "@/lib/format";
import type { CaseDetail, EvidenceItem } from "@/lib/types";

const TACTIC_COLOR: Record<string, string> = {
  urgency: "#fbbf24", authority: "#93c5fd", secrecy: "#a78bfa", fear: "#fb7185", reward: "#6ee7b7",
  channel_switch: "#67e8f9", bypass: "#f0abfc",
};

/** The message with every flagged tactic span highlighted; clicking a span selects its exhibit. */
export function MessageIntel({ detail, selected, onSelect }: { detail: CaseDetail; selected: string | null; onSelect: (id: string) => void }) {
  const words = detail.findings.find((f) => f.witness === "words");
  if (!words || words.status !== "ok") return null;
  const text: string = words.details.text ?? "";
  const spans = detail.evidence.filter((e) => e.witness === "words" && e.span).sort((a, b) => a.span![0] - b.span![0]);
  const parts: { s: string; e?: EvidenceItem }[] = [];
  let pos = 0;
  for (const ev of spans) {
    const [a, b] = ev.span!;
    if (a < pos) continue;
    if (a > pos) parts.push({ s: text.slice(pos, a) });
    parts.push({ s: text.slice(a, b), e: ev });
    pos = b;
  }
  parts.push({ s: text.slice(pos) });
  const d = words.details;
  const ents = d.entities ?? {};

  return (
    <section className="panel">
      <PanelHead title="Message intelligence" meta={`${d.language} · scam-language p ${Number(d.classifier_p).toFixed(2)}`} />
      <div className="grid gap-5 p-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="whitespace-pre-wrap text-[15.5px] leading-[1.95] text-silver">
            {parts.map((p, i) =>
              p.e ? (
                <button key={i} onClick={() => onSelect(p.e!.id)}
                  className={cx("rounded px-1 transition-shadow", selected === p.e.id && "ring-1 ring-current")}
                  style={{ color: TACTIC_COLOR[p.e.kind] ?? "#e9eef7", background: `color-mix(in oklab, ${TACTIC_COLOR[p.e.kind] ?? "#e9eef7"} 15%, transparent)` }}
                  title={`${p.e.id} · ${p.e.label}`}>
                  {p.s}
                </button>
              ) : <span key={i}>{p.s}</span>,
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(d.tactics as string[]).map((t) => (
              <span key={t} className="rounded-full border px-2.5 py-0.5 text-[12px]" style={{ color: TACTIC_COLOR[t], borderColor: `${TACTIC_COLOR[t]}55` }}>{t.replace("_", " ")}</span>
            ))}
          </div>
        </div>
        <dl className="space-y-2.5 border-t border-line pt-4 font-mono text-[12px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="flex justify-between gap-3"><dt className="text-muted">Requested action</dt><dd className="capitalize text-fg">{String(d.requested_action).replace("_", " ")}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Amount</dt><dd className={d.amount_inr ? "text-crimson" : "text-dim"}>{d.amount_inr ? inr(d.amount_inr) : "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Deadline</dt><dd className={d.deadline ? "text-amber" : "text-dim"}>{d.deadline ?? "—"}</dd></div>
          {(["upi", "account", "ifsc", "iban", "url", "phone", "email"] as const).map((k) =>
            ents[k]?.length ? (
              <div key={k} className="flex justify-between gap-3"><dt className="uppercase text-muted">{k}</dt><dd className="truncate text-right text-silver">{ents[k].join(", ")}</dd></div>
            ) : null,
          )}
          {d.style_drift != null && <div className="flex justify-between gap-3"><dt className="text-muted">Style drift</dt><dd className={d.style_drift > 0.45 ? "text-crimson" : "text-mint"}>{Number(d.style_drift).toFixed(2)}</dd></div>}
        </dl>
      </div>
    </section>
  );
}

export function IdentityPanel({ detail, onSelect, selected }: { detail: CaseDetail; onSelect: (id: string) => void; selected: string | null }) {
  const idf = detail.findings.find((f) => f.witness === "identity");
  if (!idf || idf.status !== "ok") return null;
  const r = idf.details.resolved;
  const rows = detail.evidence.filter((e) => e.witness === "identity");
  return (
    <section className="panel">
      <PanelHead title="Identity inconsistencies" meta={r ? `resolved → ${r.name} (${Math.round(r.confidence * 100)}%)` : "sender not resolved"} />
      <div className="p-5">
        {r && (
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-line bg-ink-1 p-3 font-mono text-[11.5px] sm:grid-cols-4">
            <div><p className="text-dim">Trustbook</p><p className="text-fg">{r.name}</p></div>
            <div><p className="text-dim">Role</p><p className="text-silver">{r.role}</p></div>
            <div><p className="text-dim">Directory</p><p className="text-mint">{r.directory_phone || "—"}</p></div>
            <div><p className="text-dim">Limit</p><p className="text-silver">{r.approval_limit_inr ? inr(r.approval_limit_inr) : "—"}</p></div>
          </div>
        )}
        <ul className="divide-y divide-line">
          {rows.map((e) => (
            <li key={e.id}>
              <button onClick={() => onSelect(e.id)} className={cx("grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5 text-left", selected === e.id && "bg-cyan/[0.05]")}>
                <span className={cx("size-2 rounded-full", e.exculpatory ? "bg-mint" : e.severity >= 3 ? "bg-crimson" : e.severity === 2 ? "bg-amber" : "bg-silver")} />
                <span className="min-w-0">
                  <span className="block text-[13px] text-fg">{e.label}</span>
                  {(e.expected || e.observed) && (
                    <span className="block font-mono text-[10.5px]"><span className="text-mint">{e.expected}</span>{e.expected && e.observed && <span className="text-dim"> vs </span>}<span className="text-crimson">{e.observed}</span></span>
                  )}
                </span>
                <span className="etag">{e.id}</span>
              </button>
            </li>
          ))}
        </ul>
        {idf.details.request_anomaly != null && (
          <p className="mt-3 font-mono text-[11px] text-dim">request anomaly vs 12-month baseline: <span className={idf.details.request_anomaly > 0.6 ? "text-crimson" : "text-silver"}>{Number(idf.details.request_anomaly).toFixed(2)}</span></p>
        )}
      </div>
    </section>
  );
}

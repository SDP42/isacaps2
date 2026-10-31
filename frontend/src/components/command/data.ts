import type { Band, CaseSummary } from "@/lib/types";

/** One completed case, as `/v1/ops/overview` ships it. Every number on the command centre is derived from these. */
export interface Fact {
  id: string;
  title: string;
  at: string;
  channel: string;
  sender: string;
  contact: string;
  band: Band;
  risk: number;
  interval: [number, number] | [];
  action: string;
  rule: string | null;
  tags: string[];
  summary: string;
  kinds: string[];
  witnesses: Record<string, number>;
  agree: Record<string, boolean>;
  tactics: string[];
  amount_inr: number;
  closed: boolean;
  outcome: string | null;
  verified: boolean;
  scenario: string | null;
  first_step: string | null;
}

export interface Campaign {
  id: string;
  stages: { case_id: string; channel: string; title: string; band: Band; risk: number; action: string; at: string; claimed_sender: string }[];
  shared_identifiers: string[];
  max_risk: number;
  channels: string[];
}

export interface Overview {
  facts: Fact[];
  running: CaseSummary[];
  failed: number;
  latency_ms: Record<string, number>;
  models: { loaded: number; total: number };
  campaigns: Campaign[];
  impersonated: { name: string; role: string; count: number }[];
  baseline_requests: number;
  audit: { intact: boolean; checked: number; head?: string; broken_at?: number };
  reset: { running: boolean; done: number; total: number };
}

export type Range = "24h" | "7d" | "30d";
export const RANGE_MS: Record<Range, number> = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5 };

/** Cross-filter state. Every panel reads it and most panels can write it. */
export interface Filters {
  bands: Band[];
  channel: string | null;
  tactic: string | null;
  action: string | null;
  witness: string | null;
  hour: number | null;
  window: [number, number] | null; // brushed time span, epoch ms
  status: "all" | "open" | "closed";
  q: string;
}

export const NO_FILTERS: Filters = { bands: [], channel: null, tactic: null, action: null, witness: null, hour: null, window: null, status: "all", q: "" };

export const BANDS: Band[] = ["HIGH", "MEDIUM", "INCONCLUSIVE", "LOW"];
export const WITNESSES = ["voice", "face", "provenance", "words", "identity"] as const;
export const FIRED = 0.6;

export const ts = (f: Fact) => new Date(f.at).getTime();

export function applyFilters(facts: Fact[], f: Filters, span: [number, number], skip?: keyof Filters): Fact[] {
  const q = f.q.trim().toLowerCase();
  return facts.filter((x) => {
    const t = ts(x);
    if (t < span[0] || t > span[1]) return false;
    if (skip !== "window" && f.window && (t < f.window[0] || t > f.window[1])) return false;
    if (skip !== "bands" && f.bands.length && !f.bands.includes(x.band)) return false;
    if (skip !== "channel" && f.channel && x.channel !== f.channel) return false;
    if (skip !== "tactic" && f.tactic && !x.tactics.includes(f.tactic)) return false;
    if (skip !== "action" && f.action && x.action !== f.action) return false;
    if (skip !== "witness" && f.witness && (x.witnesses[f.witness] ?? 0) < FIRED) return false;
    if (skip !== "hour" && f.hour != null && new Date(x.at).getUTCHours() !== f.hour) return false;
    if (f.status === "open" && x.closed) return false;
    if (f.status === "closed" && !x.closed) return false;
    if (q && !`${x.id} ${x.title} ${x.sender} ${x.contact} ${x.channel}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function countBy<T>(items: T[], key: (t: T) => string | string[] | null | undefined): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    for (const v of Array.isArray(k) ? k : k ? [k] : []) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Share of cases whose ensemble models agreed, over the witnesses that report agreement. */
export function agreement(facts: Fact[]): number | null {
  let n = 0;
  let yes = 0;
  for (const f of facts) for (const v of Object.values(f.agree)) { n++; if (v) yes++; }
  return n ? yes / n : null;
}

export const isOpenIncident = (f: Fact) => f.band === "HIGH" && !f.closed;

export function posture(open: number): { level: number; name: string; color: string } {
  if (open >= 12) return { level: 3, name: "Severe", color: "var(--color-crimson)" };
  if (open >= 4) return { level: 2, name: "Elevated", color: "var(--color-crimson)" };
  if (open >= 1) return { level: 1, name: "Guarded", color: "var(--color-amber)" };
  return { level: 0, name: "Calm", color: "var(--color-mint)" };
}

export const label = (s: string) => s.replace(/_/g, " ");

import type { Band } from "./types";

export function inr(v: number | null | undefined): string {
  if (v == null) return "—";
  const s = Math.round(v).toString();
  if (s.length <= 3) return `₹${s}`;
  const tail = s.slice(-3);
  let head = s.slice(0, -3);
  const groups: string[] = [];
  while (head.length > 2) {
    groups.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) groups.unshift(head);
  return `₹${groups.join(",")},${tail}`;
}

export function inrShort(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 1)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`;
  return `₹${v}`;
}

export const BAND_COLOR: Record<Band, string> = {
  HIGH: "var(--color-crimson)",
  MEDIUM: "var(--color-amber)",
  LOW: "var(--color-mint)",
  INCONCLUSIVE: "var(--color-silver)",
};

export const BAND_COPY: Record<Band, string> = {
  HIGH: "Do not act",
  MEDIUM: "Verify first",
  LOW: "Low risk",
  INCONCLUSIVE: "Verify anyway",
};

export function bandFromRisk(r: number): Band {
  return r < 35 ? "LOW" : r < 70 ? "MEDIUM" : "HIGH";
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function secs(t: number | undefined): string {
  if (t == null) return "";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export const WITNESS_META: Record<string, { label: string; color: string; short: string }> = {
  voice: { label: "Voice", color: "#67e8f9", short: "VOI" },
  face: { label: "Face", color: "#a78bfa", short: "FAC" },
  words: { label: "Words", color: "#fbbf24", short: "WRD" },
  identity: { label: "Identity", color: "#fb7185", short: "IDN" },
  provenance: { label: "Provenance", color: "#6ee7b7", short: "PRV" },
};

export const AGENT_META: Record<string, { name: string; role: string; color: string }> = {
  planner: { name: "Planner", role: "Chooses witnesses", color: "#c7cfdd" },
  voice: { name: "Voice Analyst", role: "Synthetic speech & voiceprint", color: "#67e8f9" },
  face: { name: "Face Analyst", role: "Face artefacts & lip-sync", color: "#a78bfa" },
  provenance: { name: "Provenance Examiner", role: "Origin & credentials", color: "#6ee7b7" },
  linguist: { name: "Linguist", role: "Tactics & requests", color: "#fbbf24" },
  identity: { name: "Identity Officer", role: "Trustbook & context", color: "#fb7185" },
  casebook: { name: "Casebook Clerk", role: "Precedent & policy (RAG)", color: "#93c5fd" },
  skeptic: { name: "Skeptic", role: "Argues innocence", color: "#f0abfc" },
  judge: { name: "Judge", role: "Rules; cannot change score", color: "#e9eef7" },
  verifier: { name: "Verifier", role: "Builds the plan", color: "#6ee7b7" },
  reporter: { name: "Reporter", role: "Writes the record", color: "#8e99ad" },
};

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

import type { CaseDetail } from "./types";

/**
 * Everyday-language reading of a verdict for Simple mode. Every sentence is derived from the same findings the expert
 * view shows (scores, tactics, the request, Trustbook flags); nothing is invented, only translated and trimmed to what
 * the person needs to decide.
 */
export type Tone = "danger" | "caution" | "safe" | "unsure";

export const HEADLINE: Record<string, { tone: Tone; title: string; line: string }> = {
  CRITICAL: { tone: "danger", title: "This is very likely a scam", line: "Do not pay, share any code or install anything." },
  HIGH: { tone: "danger", title: "This looks like a scam", line: "Do not act on it until you have checked with the person on a number you already know." },
  MEDIUM: { tone: "caution", title: "Be careful with this", line: "Check with the person directly before you do anything it asks." },
  LOW: { tone: "safe", title: "This looks safe", line: "Nothing here asks you to do anything risky." },
  INCONCLUSIVE: { tone: "unsure", title: "We could not tell", line: "A quick call to the person on their usual number will settle it." },
};

const TACTIC: Record<string, string> = {
  urgency: "It rushes you to act quickly.",
  secrecy: "It asks you to keep it a secret.",
  authority: "It claims to be someone in authority (a boss, the police, a bank).",
  fear: "It tries to scare you (arrest, an accident, a blocked account).",
  reward: "It promises a prize, a refund or easy money.",
  channel_switch: "It moves you to a new number or app.",
  bypass: "It asks you to skip the usual checks.",
};

const ASK: Record<string, string> = {
  payment: "It asks you to send money",
  credential: "It asks for a code, PIN or password",
  remote_access: "It asks you to install an app or share your screen",
  data: "It asks for personal or company information",
};

const IDENTITY: Record<string, string> = {
  contact_mismatch: "It came from a number or address that is not on record for this person.",
  new_beneficiary: "The money would go to an account that has never been paid before.",
  flagged_beneficiary: "The account has been reported in an earlier fraud.",
  linked_confirmed_fraud: "Details in it match a fraud that was already confirmed.",
  above_authority: "The amount is above what this person is allowed to approve.",
  unknown_sender: "The sender is not someone we know.",
};

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export function plainReasons(d: CaseDetail): string[] {
  const out: string[] = [];
  const f = (w: string) => d.findings.filter((x) => x.witness === w && x.status === "ok" && x.score != null);
  const voice = f("voice")[0];
  const media = [...f("face"), ...f("provenance")].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const words = f("words")[0];
  if (d.verdict?.band === "LOW") {
    // a safe answer leads with what makes it safe; a missing Trustbook entry is not a reason to worry
    if (voice && (voice.score ?? 1) <= 0.3) out.push("The voice sounds like a real person.");
    if (media && (media.score ?? 1) <= 0.3) out.push("The picture or video looks real.");
    if (voice && (voice.score ?? 0) >= 0.7) out.push("The voice is machine-made, but it asks for nothing (for example an announcement).");
    if ((d.verdict.requested_action ?? "none") === "none" && !((words?.details?.tactics as string[]) ?? []).length)
      out.push("It does not ask for money, codes or apps, and uses no pressure tricks.");
    return out.length ? out.slice(0, 4) : ["We found nothing that asks you to act."];
  }
  if (voice && (voice.score ?? 0) >= 0.7) out.push("The voice sounds machine-made, not like a real person.");
  if (media && (media.score ?? 0) >= 0.7) out.push("The picture or video looks computer-generated.");
  const action = d.verdict?.requested_action ?? "none";
  if (ASK[action]) {
    const amt = words?.details?.amount_inr;
    out.push(`${ASK[action]}${action === "payment" && amt ? ` (${inr(amt)})` : ""}.`);
  }
  for (const t of (words?.details?.tactics as string[]) ?? []) if (TACTIC[t]) out.push(TACTIC[t]);
  for (const e of d.evidence) if (e.witness === "identity" && !e.exculpatory && IDENTITY[e.kind]) out.push(IDENTITY[e.kind]);
  if (!out.length) {
    if (voice && (voice.score ?? 1) <= 0.3) out.push("The voice sounds like a real person.");
    out.push("We found no pressure tricks and no request for money, codes or apps.");
  }
  return [...new Set(out)].slice(0, 4);
}

export function plainSeverity(d: CaseDetail): string {
  const v = d.verdict;
  if (!v) return "INCONCLUSIVE";
  const synthetic = v.tags.includes("LIKELY_SYNTHETIC");
  return v.band === "HIGH" && synthetic && ["payment", "credential", "remote_access"].includes(v.requested_action) ? "CRITICAL" : v.band;
}

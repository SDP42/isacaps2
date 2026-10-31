/**
 * Client copy of the backend risk policy (backend/app/fusion/risk.py) used by the landing-page simulator.
 * The live product always uses the server's verdict; this mirrors the same formula so the demo is honest.
 */
import type { Band } from "./types";

export const SENSITIVITY = { none: 0.1, info: 0.3, data: 0.6, payment: 1.0, credential: 1.0 } as const;
export type Action = keyof typeof SENSITIVITY;
const T = 1.65;

export function combine(a: number, m: number, c: number, s: number) {
  return 1 - (1 - a * s) * (1 - m * s) * (1 - c);
}

export function calibrate(raw: number) {
  const r = Math.min(Math.max(raw, 1e-4), 1 - 1e-4);
  return 100 / (1 + Math.exp(-Math.log(r / (1 - r)) / T));
}

export interface SimResult {
  risk: number;
  band: Band;
  rule: string | null;
  ruleText: string | null;
  contributions: { authenticity: number; manipulation: number; context: number };
}

export function simulate(a: number, m: number, c: number, action: Action, secrecy: boolean): SimResult {
  const s = SENSITIVITY[action];
  let risk = calibrate(combine(a, m, c, s));
  let band: Band = risk < 35 ? "LOW" : risk < 70 ? "MEDIUM" : "HIGH";
  let rule: string | null = null;
  let ruleText: string | null = null;
  if (action === "credential") {
    rule = "credential_request";
    ruleText = "Asking for a password or OTP is high risk whatever the voice sounds like.";
    risk = Math.max(risk, 85);
    band = "HIGH";
  } else if (s >= 1 && (c >= 0.55 || secrecy)) {
    rule = "sensitive_action_unverified";
    ruleText = "Money is requested with secrecy or from an unverified sender.";
    risk = Math.max(risk, 78);
    band = "HIGH";
  } else if (a >= 0.8 && s >= 0.6) {
    rule = "synthetic_media_with_sensitive_ask";
    ruleText = "Likely synthetic media is pushing a sensitive request.";
    risk = Math.max(risk, 80);
    band = "HIGH";
  } else if (a >= 0.75 && action === "none" && m < 0.2 && c < 0.3) {
    rule = "synthetic_no_fraud_indicators";
    ruleText = "Synthetic, but it asks for nothing. Tagged, not alarmed.";
    risk = Math.min(risk, 30);
    band = "LOW";
  }
  // exact Shapley values for three players
  const players = { authenticity: a, manipulation: m, context: c } as const;
  const keys = Object.keys(players) as (keyof typeof players)[];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const phi = { authenticity: 0, manipulation: 0, context: 0 };
  for (const p of perms) {
    const cur = { authenticity: 0, manipulation: 0, context: 0 };
    let prev = combine(0, 0, 0, s);
    for (const idx of p) {
      const k = keys[idx];
      cur[k] = players[k];
      const v = combine(cur.authenticity, cur.manipulation, cur.context, s);
      phi[k] += (v - prev) / 6;
      prev = v;
    }
  }
  const tot = phi.authenticity + phi.manipulation + phi.context || 1;
  return {
    risk, band, rule, ruleText,
    contributions: {
      authenticity: (phi.authenticity / tot) * risk,
      manipulation: (phi.manipulation / tot) * risk,
      context: (phi.context / tot) * risk,
    },
  };
}

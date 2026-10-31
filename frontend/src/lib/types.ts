export type Band = "HIGH" | "MEDIUM" | "LOW" | "INCONCLUSIVE";
export type WitnessName = "voice" | "face" | "provenance" | "words" | "identity";

export interface Persona {
  id: string;
  name: string;
  role: "analyst" | "employee" | "admin" | "family";
  title: string;
  blurb: string;
  accent: string;
}

export interface CaseSummary {
  id: string;
  title: string;
  status: "queued" | "running" | "complete" | "failed";
  stage: string;
  progress: number;
  channel: string;
  claimed_sender: string;
  scenario: string | null;
  created_at: string;
  received_at: string | null;
  submitted_by: string;
  kinds: string[];
  risk: number | null;
  band: Band | null;
  tags: string[];
  requested_action: string | null;
  closed: boolean;
  outcome: string | null;
}

export interface EvidenceItem {
  id: string;
  witness: WitnessName;
  kind: string;
  label: string;
  detail?: string;
  score?: number;
  severity: number;
  t0?: number;
  t1?: number;
  span?: [number, number];
  text?: string;
  artifact_id?: number;
  expected?: string;
  observed?: string;
  exculpatory?: boolean;
}

export interface Finding {
  witness: WitnessName;
  artifact_id: number | null;
  score: number | null;
  confidence: number;
  status: "ok" | "not_applicable" | "insufficient" | "error";
  summary: string;
  details: Record<string, any>;
  model_version: string;
  latency_ms: number;
}

export interface PlanStep {
  id: string;
  title: string;
  why: string;
  done: boolean;
}

export interface Verdict {
  risk: number;
  band: Band;
  tags: string[];
  interval: [number, number];
  dims: { authenticity: number; manipulation: number; context: number; sensitivity: number; raw: number; temperature: number };
  contributions: { lenses: Record<string, number>; witnesses: Record<string, number> };
  reasons: { text: string; evidence_ids: string[]; kind: string; rule?: string }[];
  rule_fired: string | null;
  requested_action: string;
  sensitivity: number;
  summary: string;
  verification_plan: PlanStep[];
  model_version: string;
  policy_version: string;
}

export interface TribunalMessage {
  seq: number;
  agent: string;
  agent_name?: string;
  agent_role?: string;
  stance: "incriminating" | "exculpatory" | "neutral" | "ruling";
  content: string;
  supporting: string[];
  contradicting: string[];
  evidence_refs: string[];
  responds_to: number | null;
  citations?: { id: string; title: string; heading: string; score: number }[];
}

export interface Artifact {
  id: number;
  kind: "audio" | "video" | "image" | "text";
  filename: string;
  mime: string;
  sha256: string;
  size_bytes: number;
  duration_s: number | null;
  meta: Record<string, any>;
}

export interface CaseDetail extends CaseSummary {
  message_text: string;
  sender_contact: string;
  artifacts: Artifact[];
  findings: Finding[];
  evidence: EvidenceItem[];
  verdict: Verdict | null;
  tribunal: TribunalMessage[];
  verifications: { step: string; outcome: string; note: string; actor: string; ts: string }[];
}

export interface Scenario {
  key: string;
  code: string;
  title: string;
  story: string;
  expected: Band;
  channel: string;
  claimed_sender: string;
  files: string[];
  tags: string[];
  message: string;
}

export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, any>;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind?: string;
  state?: string;
  suspicious?: boolean;
  case?: string;
}

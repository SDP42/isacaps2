import { useSyncExternalStore } from "react";
import { getToken, post } from "./api";

export type Tone = "crimson" | "amber" | "mint" | "cyan" | "violet" | "muted";
export type Block = { type: string; [k: string]: any };

export interface Reply {
  session_id: string;
  intent: string | null;
  confidence: number;
  method: string;
  did_you_mean: string[];
  blocks: Block[];
  suggestions: string[];
  go?: string | null;
  subject: { kind: string; label: string; severity?: string; case_id?: string } | null;
  trace: string[];
  ms: number;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text?: string;
  file?: { name: string; kind: string; url: string };
  reply?: Reply;
  pending?: "route" | "media" | "scenario" | "forge";
  error?: string;
}

interface State { session: string; turns: Turn[]; busy: boolean }

const KEY = "mirage.copilot";
let state: State = load();
const subs = new Set<() => void>();

function load(): State {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (s?.turns) return { ...s, busy: false, turns: s.turns.filter((t: Turn) => !t.pending).map((t: Turn) => (t.file ? { ...t, file: { ...t.file, url: "" } } : t)) };
  } catch {
    /* storage blocked: start fresh */
  }
  return { session: "", turns: [], busy: false };
}

function set(next: Partial<State>) {
  state = { ...state, ...next };
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ session: state.session, turns: state.turns.slice(-40) }));
  } catch {
    /* per-tab convenience only */
  }
  subs.forEach((f) => f());
}

export function useCopilot() {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state);
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function fileKind(f: File) {
  if (f.type.startsWith("audio") || /\.(ogg|opus|mp3|wav|m4a|weba|aac|flac)$/i.test(f.name)) return "audio";
  if (f.type.startsWith("video") || /\.(mp4|webm|mov|mkv)$/i.test(f.name)) return "video";
  if (f.type.startsWith("image")) return "image";
  return "text";
}

/** Send one turn. `page` tells the copilot which case the user is looking at. */
export async function send(opts: { text?: string; file?: File; sample?: string; label?: string; page?: { case_id?: string } }) {
  if (state.busy) return null;
  const user: Turn = { id: uid(), role: "user", text: opts.label ?? opts.text,
    file: opts.file ? { name: opts.file.name, kind: fileKind(opts.file), url: URL.createObjectURL(opts.file) } : undefined };
  const scenario = /\b(run|launch|start|simulate)\b.*\b(scenario|case|investigation|attack)\b/i.test(opts.text ?? "");
  const forge = /\b(imagine|suppose|simulate|scenario|dummy|pretend\w*|let'?s say|what if (someone|a|my|the|i)|i (get|got|receive|received)|someone (calls|called|messages|texts|emails|sends))\b/i.test(opts.text ?? "")
    || (state.turns.some((t) => t.reply?.intent === "simulate") && /^\s*(make it|try it|same|what if (it|the caller|he|she) (was|is))/i.test(opts.text ?? ""));
  const pend: Turn = { id: uid(), role: "assistant", pending: opts.file || opts.sample ? "media" : forge ? "forge" : scenario ? "scenario" : "route" };
  set({ turns: [...state.turns, user, pend], busy: true });
  const fd = new FormData();
  fd.set("message", opts.text ?? "");
  fd.set("session_id", state.session);
  if (opts.sample) fd.set("sample", opts.sample);
  if (opts.file) fd.set("file", opts.file);
  if (opts.page) fd.set("page", JSON.stringify(opts.page));
  try {
    const r = await post<Reply>("/v1/assistant/chat", fd);
    set({ session: r.session_id, busy: false, turns: state.turns.map((t) => (t.id === pend.id ? { id: t.id, role: "assistant", reply: r } : t)) });
    return r;
  } catch (e: any) {
    set({ busy: false, turns: state.turns.map((t) => (t.id === pend.id ? { id: t.id, role: "assistant", error: e?.message || "The copilot is unavailable." } : t)) });
    return null;
  }
}

export function reset() {
  if (state.session) post("/v1/assistant/reset", (() => { const f = new FormData(); f.set("session_id", state.session); return f; })()).catch(() => {});
  set({ session: "", turns: [], busy: false });
}

/** The audio a turn's timeline should play: the user's own upload, or a built-in sample served by the API. */
export function audioFor(turns: Turn[], idx: number, reply: Reply): string | undefined {
  for (let i = idx - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role === "user" && t.file?.kind === "audio" && t.file.url) return t.file.url;
    if (t.role === "user" && (t.file || t.reply)) break;
  }
  const m = reply.blocks.find((b) => b.type === "timeline")?.src;
  if (!m) return undefined;
  const base = `${import.meta.env.VITE_API_URL ?? ""}${m}`;
  // case artifacts (a simulated call) need the session token; built-in samples are public
  return m.startsWith("/v1/cases/") ? `${base}?token=${encodeURIComponent(getToken() ?? "")}` : base;
}

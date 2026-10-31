const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "mirage.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: session lasts until reload */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body.detail === "string" ? body.detail : message;
    } catch {
      /* non-JSON error */
    }
    if (res.status === 401) window.dispatchEvent(new CustomEvent("mirage:unauthorized"));
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

export function artifactUrl(caseId: string, artifactId: number) {
  return `${BASE}/v1/cases/${caseId}/artifacts/${artifactId}?token=${encodeURIComponent(getToken() ?? "")}`;
}

export async function downloadReport(caseId: string) {
  const res = await fetch(`${BASE}/v1/cases/${caseId}/report.pdf`, {
    headers: { authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new ApiError(res.status, "Report not ready");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${caseId}-incident-report.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type StreamEvent = { event: string; data: any };

/** Subscribe to a case's live pipeline events (stage, witness, evidence, risk, tribunal, done). */
export function streamCase(caseId: string, onEvent: (e: StreamEvent) => void): () => void {
  const url = `${BASE}/v1/cases/${caseId}/events?token=${encodeURIComponent(getToken() ?? "")}`;
  const es = new EventSource(url);
  const kinds = ["stage", "witness", "evidence", "risk", "tribunal", "done", "error"];
  for (const k of kinds) {
    es.addEventListener(k, (ev) => {
      try {
        onEvent({ event: k, data: JSON.parse((ev as MessageEvent).data) });
      } catch {
        /* malformed frame */
      }
      if (k === "done" || k === "error") es.close();
    });
  }
  es.onerror = () => es.close();
  return () => es.close();
}

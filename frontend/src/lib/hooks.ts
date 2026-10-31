import { useCallback, useEffect, useRef, useState } from "react";
import { api, streamCase } from "./api";
import type { CaseDetail, TribunalMessage } from "./types";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return m;
}

/** Fetch JSON with loading/error state and a refetch handle. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load, setData };
}

export interface LiveState {
  stage: string;
  progress: number;
  witnesses: Record<string, { state: string; score?: number; summary?: string; confidence?: number; latency_ms?: number }>;
  messages: TribunalMessage[];
  risk?: { risk: number; band: string };
  log: { t: number; text: string; kind: string }[];
}

/** A case plus its live event stream. Refetches the persisted case when the pipeline finishes. */
export function useLiveCase(caseId: string | undefined) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>({ stage: "intake", progress: 0, witnesses: {}, messages: [], log: [] });
  const t0 = useRef(Date.now());

  const refresh = useCallback(() => {
    if (!caseId) return;
    return api<CaseDetail>(`/v1/cases/${caseId}`)
      .then((d) => {
        setDetail(d);
        return d;
      })
      .catch((e) => setError(e.message));
  }, [caseId]);

  useEffect(() => {
    if (!caseId) return;
    let stop: (() => void) | undefined;
    let cancelled = false; // StrictMode runs effects twice; never leave an orphan stream behind
    t0.current = Date.now();
    setLive({ stage: "intake", progress: 0, witnesses: {}, messages: [], log: [] });
    refresh()?.then((d) => {
      if (cancelled || !d || d.status === "complete" || d.status === "failed") return;
      stop = streamCase(caseId, ({ event, data }) => {
        const t = (Date.now() - t0.current) / 1000;
        setLive((s) => {
          const log = [...s.log];
          if (event === "stage") {
            log.push({ t, text: `${data.stage}${data.note ? ` · ${data.note}` : ""}`, kind: "stage" });
            return { ...s, stage: data.stage, progress: data.progress, log };
          }
          if (event === "witness") {
            log.push({ t, text: `${data.witness} ${data.state}${data.score != null ? ` · ${Number(data.score).toFixed(2)}` : ""}`, kind: "witness" });
            return { ...s, witnesses: { ...s.witnesses, [data.witness]: data }, log };
          }
          if (event === "tribunal") {
            return { ...s, messages: [...s.messages, data] };
          }
          if (event === "risk") {
            log.push({ t, text: `fusion · ${data.band} ${Number(data.risk).toFixed(0)}`, kind: "risk" });
            return { ...s, risk: data, log };
          }
          return s;
        });
        if (event === "done" || event === "error") refresh();
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [caseId, refresh]);

  return { detail, live, error, refresh, setDetail };
}

/** Animate a number toward a target (used by counters that show real data). */
export function useCountUp(target: number, duration = 1100, enabled = true): number {
  const [v, setV] = useState(enabled ? 0 : target);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!enabled || reduced) {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      setV(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled, reduced]);
  return v;
}

import { useSyncExternalStore } from "react";

/**
 * Simple vs Expert view, switched like a light / dark theme. Simple mode is for the person who received the call (a
 * parent, a grandparent, anyone who is not an analyst): the verdict, the reasons in everyday words and what to do.
 * Expert mode is the full forensic view. The choice is remembered per browser; the family persona starts in Simple.
 */
export type ViewMode = "simple" | "expert";
const KEY = "mirage.view";
const subs = new Set<() => void>();

function read(): ViewMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "simple" || v === "expert" ? v : null;
  } catch {
    return null;
  }
}

let mode: ViewMode = read() ?? "expert";
apply();

function apply() {
  if (typeof document !== "undefined") document.documentElement.dataset.view = mode;
}

export function setViewMode(m: ViewMode, remember = true) {
  mode = m;
  if (remember) {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private window: lasts for this tab */
    }
  }
  apply();
  subs.forEach((f) => f());
}

/** First sign-in default: a persona's natural view, unless the person already chose one. */
export function defaultViewFor(role: string | undefined) {
  if (read() === null) setViewMode(role === "family" ? "simple" : "expert", false);
}

export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const m = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => mode);
  return [m, setViewMode];
}

export const useSimple = () => useViewMode()[0] === "simple";

import { useEffect, useState } from "react";
import { cx } from "@/lib/format";

export interface MatrixPoint { synthetic: number; manipulation: number; sensitive: boolean; at?: number }

const CELLS = [
  { ai: true, sens: true, title: "Voice-clone scam", sub: "Stop and verify", color: "var(--color-crimson)" },
  { ai: true, sens: false, title: "Synthetic, harmless", sub: "Announcements, avatars", color: "var(--color-silver)" },
  { ai: false, sens: true, title: "Human social engineering", sub: "Real voices carry scams too", color: "var(--color-amber)" },
  { ai: false, sens: false, title: "Normal conversation", sub: "No action needed", color: "var(--color-mint)" },
];

const KEY = "mirage.matrix.history";

/** Past voice checks on this device, kept as faint dots. Browser storage only: a per-viewer convenience. */
export function useMatrixHistory(current: MatrixPoint | null) {
  const [hist, setHist] = useState<MatrixPoint[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
  });
  useEffect(() => {
    if (!current) return;
    setHist((h) => {
      const next = [...h.filter((p) => p.at !== current.at), current].slice(-24);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, [current]);
  return hist.filter((p) => p.at !== current?.at);
}

/**
 * The 2×2 that explains a voice verdict: who is speaking (AI or human) against what they ask for. The current case
 * is a dot placed by its actual synthetic and manipulation scores inside its cell; earlier checks are faint dots, so
 * the matrix doubles as a record of what this desk has seen. "Uncertain" voices straddle the line.
 */
export function VerdictMatrix({ synthetic, verdict, manipulation, sensitive, history = [] }: {
  synthetic: number | null;
  verdict: "ai" | "human" | "uncertain";
  manipulation: number;
  sensitive: boolean;
  history?: MatrixPoint[];
}) {
  // inside a cell: x runs with manipulation, y with synthetic-speech score
  const place = (p: { synthetic: number; manipulation: number; sensitive: boolean }) => ({
    x: (p.sensitive ? 0 : 50) + 8 + Math.min(1, Math.max(0, p.manipulation)) * 34,
    y: (1 - Math.min(1, Math.max(0, p.synthetic))) * 100,
  });
  const cur = synthetic == null ? null : place({ synthetic, manipulation, sensitive });
  const isAi = verdict === "ai";
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="grid grid-cols-[20px_1fr]">
        <span />
        <div className="mb-1.5 grid grid-cols-2 text-center font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
          <span>Sensitive request</span><span>Nothing sensitive</span>
        </div>
        <div className="grid grid-rows-2 gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
          <span className="flex items-center justify-center [writing-mode:vertical-rl] rotate-180">AI voice</span>
          <span className="flex items-center justify-center [writing-mode:vertical-rl] rotate-180">Human voice</span>
        </div>
        <div className="relative grid aspect-[2/1.1] grid-cols-2 grid-rows-2 gap-1.5">
          {CELLS.map((c) => {
            const on = verdict !== "uncertain" && c.ai === isAi && c.sens === sensitive;
            const maybe = verdict === "uncertain" && c.sens === sensitive;
            return (
              <div key={c.title} className={cx("rounded-lg border p-2.5 transition-[opacity,background-color] duration-300", !(on || maybe) && "opacity-50")}
                style={{ borderColor: on || maybe ? c.color : "var(--color-line)", background: on ? `color-mix(in oklab, ${c.color} 13%, transparent)` : maybe ? `color-mix(in oklab, ${c.color} 6%, transparent)` : undefined }}>
                <p className="text-[12.5px] text-fg">{c.title}</p>
                <p className="text-[11px] text-muted">{c.sub}</p>
              </div>
            );
          })}
          <div className="pointer-events-none absolute inset-0">
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-2" />
            {history.map((p, i) => {
              const q = place(p);
              return <span key={i} className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-silver/35" style={{ left: `${q.x}%`, top: `${q.y}%` }} />;
            })}
            {cur && (
              <span className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ left: `${cur.x}%`, top: `${Math.min(96, Math.max(4, cur.y))}%` }}>
                <span className="block size-3 rounded-full border-2 border-ink-0 bg-fg shadow-[0_0_0_3px_rgb(233_238_247/0.25)]" />
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="pl-5">
        <p className="mt-2 font-mono text-[10px] text-dim">dot height = synthetic-speech score · across = manipulation{history.length ? ` · ${history.length} earlier check${history.length === 1 ? "" : "s"} on this device` : ""}</p>
      </div>
    </div>
  );
}

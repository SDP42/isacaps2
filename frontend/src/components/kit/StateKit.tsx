import { AlertTriangle, PlugZap, RefreshCw, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/format";

/**
 * Shared empty, error and offline states. Each names what happened and the way out, in the product's own words;
 * loading states are skeletons shaped like the final layout and live with each screen.
 */
export function ErrorState({ title, cause, onRetry, className }: { title: string; cause?: string | null; onRetry?: () => void; className?: string }) {
  const offline = !cause || /fetch|network|failed to fetch|ECONN/i.test(cause);
  const Icon = offline ? PlugZap : AlertTriangle;
  return (
    <div role="alert" className={cx("flex flex-col items-start gap-3 px-6 py-10", className)}>
      <span className="grid size-9 place-items-center rounded-lg border border-amber/30 bg-amber/[0.07] text-amber"><Icon size={16} /></span>
      <div>
        <p className="text-[14px] text-fg">{title}</p>
        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">
          {offline ? "The MIRAGE API did not answer. Start it with uvicorn app.main:app --port 8000 from backend/, then retry." : cause}
        </p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-2 px-3 text-[12.5px] text-fg transition-colors hover:border-cyan/50">
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action, className }: { icon?: LucideIcon; title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-start gap-2 px-5 py-8", className)}>
      {Icon && <Icon size={16} className="mb-1 text-dim" />}
      <p className="text-[13.5px] text-silver">{title}</p>
      {hint && <p className="max-w-sm text-[12.5px] leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function OfflineBanner({ show, children }: { show: boolean; children?: ReactNode }) {
  if (!show) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-amber/25 bg-amber/[0.06] px-3 py-2 text-[12.5px] text-amber">
      <PlugZap size={14} />{children ?? "Live updates paused: reconnecting to the MIRAGE API. What you see is the last data received."}
    </div>
  );
}

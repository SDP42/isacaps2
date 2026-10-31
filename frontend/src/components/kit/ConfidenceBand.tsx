import { BAND_COLOR, cx } from "@/lib/format";
import type { Band } from "@/lib/types";

/**
 * A calibrated score with its uncertainty interval, drawn over the three decision zones. When `uncertain` is set
 * (noisy audio, models split) the interval is hatched and the label says so: the band is a range, not a point.
 */
export function ConfidenceBand({
  value, band, interval, uncertain, compact, className,
}: {
  value: number;
  band: Band;
  interval?: [number, number] | [] | null;
  uncertain?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const c = BAND_COLOR[band];
  const iv = interval && interval.length === 2 ? interval : null;
  const h = compact ? 6 : 10;
  return (
    <div className={cx("w-full", className)}>
      <div className="relative" style={{ height: h + 10 }}>
        <div className="absolute inset-x-0 flex overflow-hidden rounded-full" style={{ top: 5, height: h }}>
          <span className="h-full bg-mint/[0.12]" style={{ width: "35%" }} />
          <span className="h-full bg-amber/[0.12]" style={{ width: "35%" }} />
          <span className="h-full bg-crimson/[0.14]" style={{ width: "30%" }} />
        </div>
        {iv && (
          <div className="absolute rounded-full" style={{
            top: 5, height: h, left: `${iv[0]}%`, width: `${Math.max(1, iv[1] - iv[0])}%`,
            background: uncertain
              ? `repeating-linear-gradient(135deg, color-mix(in oklab, ${c} 45%, transparent) 0 3px, transparent 3px 6px)`
              : `color-mix(in oklab, ${c} 32%, transparent)`,
          }} />
        )}
        <div className="absolute top-0 w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${value}%`, height: h + 10, background: c, boxShadow: `0 0 0 2px var(--color-ink-1)` }} />
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-dim">
          <span>0</span>
          <span className="tnum" style={{ color: c }}>
            {Math.round(value)}{iv && <span className="text-dim"> · {Math.round(iv[0])}–{Math.round(iv[1])}</span>}{uncertain && <span className="text-silver"> · uncertain</span>}
          </span>
          <span>100</span>
        </div>
      )}
    </div>
  );
}

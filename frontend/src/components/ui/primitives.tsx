import { motion } from "motion/react";
import type { ReactNode } from "react";
import { BAND_COLOR, BAND_COPY, cx } from "@/lib/format";
import { useCountUp } from "@/lib/hooks";
import type { Band } from "@/lib/types";

export function BandPill({ band, className, withCopy = false }: { band: Band | null; className?: string; withCopy?: boolean }) {
  if (!band) return <span className={cx("label", className)}>pending</span>;
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10.5px] tracking-[0.12em]", className)}
      style={{ color: BAND_COLOR[band], background: `color-mix(in oklab, ${BAND_COLOR[band]} 11%, transparent)`, border: `1px solid color-mix(in oklab, ${BAND_COLOR[band]} 30%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: BAND_COLOR[band] }} />
      {band}
      {withCopy && <span className="opacity-70">· {BAND_COPY[band]}</span>}
    </span>
  );
}

/** Risk ring: the arc length is the calibrated score; the faint sweep is the uncertainty interval. */
export function RiskRing({
  risk,
  band,
  interval,
  size = 200,
  stroke = 10,
  label = true,
}: {
  risk: number;
  band: Band;
  interval?: [number, number];
  size?: number;
  stroke?: number;
  label?: boolean;
}) {
  const v = useCountUp(risk, 1300);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.78; // 280° gauge
  const color = BAND_COLOR[band];
  const off = (p: number) => c * (1 - arc * (p / 100));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[129deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink-4)" strokeWidth={stroke}
          strokeDasharray={`${c * arc} ${c}`} strokeLinecap="round" />
        {interval && (
          <circle cx={size / 2} cy={size / 2} r={r + stroke * 0.95} fill="none" stroke={color} strokeOpacity={0.35}
            strokeWidth={2} strokeDasharray={`${c * arc * ((interval[1] - interval[0]) / 100)} ${c * 2}`}
            strokeDashoffset={-c * arc * (interval[0] / 100)} />
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off(v)} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px color-mix(in oklab, ${color} 45%, transparent))` }} />
      </svg>
      {label && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum font-semibold tracking-tight" style={{ fontSize: size * 0.3, color }}>
            {Math.round(v)}
          </span>
          <span className="label -mt-1" style={{ color }}>{band}</span>
          <span className="mt-0.5 text-[11px] text-muted">{BAND_COPY[band]}</span>
        </div>
      )}
    </div>
  );
}

export function Meter({ value, color = "var(--color-cyan)", className, height = 4 }: { value: number; color?: string; className?: string; height?: number }) {
  return (
    <div className={cx("w-full overflow-hidden rounded-full bg-ink-4", className)} style={{ height }}>
      <div className="mark-grow h-full rounded-full transition-[width] duration-700"
        style={{ background: color, width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-2 bg-ink-3 px-1 font-mono text-[10.5px] text-silver">
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function PanelHead({ title, meta, right }: { title: string; meta?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <h3 className="label whitespace-nowrap !text-silver">{title}</h3>
        {meta && <span className="truncate font-mono text-[10.5px] text-dim">{meta}</span>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="mb-2 size-10 rounded-full border border-dashed border-line-2" />
      <p className="text-sm text-silver">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("inline-flex rounded-lg border border-line bg-ink-1 p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "relative h-7 rounded-md px-3 text-[12.5px] transition-colors",
            value === o.value ? "text-fg" : "text-muted hover:text-silver",
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 rounded-md bg-ink-4"
              transition={{ type: "spring", bounce: 0.15, duration: 0.45 }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ETag({ id, onClick, active }: { id: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("etag transition-colors", onClick && "hover:bg-cyan/15", active && "!bg-cyan !text-ink-0")}
    >
      {id}
    </button>
  );
}

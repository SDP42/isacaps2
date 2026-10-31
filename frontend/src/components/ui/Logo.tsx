import { cx } from "@/lib/format";

/** The MIRAGE mark: a lens whose right half is the synthetic twin of the left. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="var(--color-cyan)" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M16 3.5a12.5 12.5 0 0 0 0 25" fill="none" stroke="var(--color-cyan)" strokeWidth="1.8" />
      <path d="M16 3.5a12.5 12.5 0 0 1 0 25" fill="none" stroke="var(--color-crimson)" strokeWidth="1.8" strokeDasharray="2 2.6" />
      <circle cx="16" cy="16" r="4" fill="var(--color-cyan)" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="var(--color-cyan)" strokeOpacity="0.6" strokeWidth="0.8" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && <span className="text-[15px] font-semibold tracking-[0.32em] text-fg">MIRAGE</span>}
    </span>
  );
}

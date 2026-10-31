import { forwardRef, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "@/lib/format";
import { useReducedMotion } from "@/lib/hooks";

type Variant = "primary" | "outline" | "ghost" | "danger" | "safe";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-cyan text-ink-0 hover:bg-[#8ff0fb] shadow-[0_8px_30px_-12px_rgb(103_232_249/0.7)] active:translate-y-px",
  outline: "border border-line-2 text-fg hover:border-cyan/50 hover:bg-cyan/[0.04]",
  ghost: "text-silver hover:text-fg hover:bg-white/[0.04]",
  danger: "bg-crimson-deep text-white hover:bg-crimson",
  safe: "bg-mint text-ink-0 hover:bg-[#9ff1cf]",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-13 px-6 text-[15px] gap-2.5 rounded-full",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  to?: string;
  magnetic?: boolean;
  loading?: boolean;
}

/** Button with an optional magnetic pull toward the cursor (used on CTAs only). */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", icon, to, magnetic, loading, className, children, ...rest },
  ref,
) {
  const wrap = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const onMove = (e: React.MouseEvent) => {
    if (!magnetic || reduced || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) * 0.22;
    const y = (e.clientY - r.top - r.height / 2) * 0.32;
    wrap.current.style.transform = `translate(${x}px, ${y}px)`;
  };
  const onLeave = () => {
    if (wrap.current) wrap.current.style.transform = "";
  };
  const cls = cx(
    "inline-flex items-center justify-center font-medium whitespace-nowrap transition-[background,border,color,box-shadow,transform,filter] duration-200 ease-out hover:-translate-y-px disabled:opacity-35 disabled:saturate-0 disabled:hover:translate-y-0 select-none",
    VARIANT[variant],
    SIZE[size],
    className,
  );
  const inner = (
    <>
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        icon
      )}
      {children}
    </>
  );
  return (
    <span
      ref={wrap}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="inline-flex transition-transform duration-300 ease-[var(--ease-out-expo)]"
    >
      {to ? (
        <Link to={to} className={cls}>
          {inner}
        </Link>
      ) : (
        <button ref={ref} className={cls} disabled={loading || rest.disabled} {...rest}>
          {inner}
        </button>
      )}
    </span>
  );
});

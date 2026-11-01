import { Microscope, Smile } from "lucide-react";
import { motion } from "motion/react";
import { useViewMode, type ViewMode } from "@/lib/viewMode";
import { cx } from "@/lib/format";

const OPTIONS: { value: ViewMode; label: string; icon: typeof Smile; hint: string }[] = [
  { value: "simple", label: "Simple", icon: Smile, hint: "Just the answer and what to do" },
  { value: "expert", label: "Expert", icon: Microscope, hint: "The full forensic view" },
];

/** The Simple / Expert switch, styled and placed like a theme toggle. */
export function ViewModeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useViewMode();
  return (
    <div role="radiogroup" aria-label="View" className={cx("relative inline-flex rounded-full border border-line bg-ink-1 p-0.5", className)}>
      {OPTIONS.map((o) => {
        const on = mode === o.value;
        return (
          <button key={o.value} role="radio" aria-checked={on} title={o.hint} onClick={() => setMode(o.value)}
            className={cx("relative z-[1] inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors", on ? "text-ink-0" : "text-muted hover:text-fg")}>
            {on && <motion.span layoutId="view-pill" className="absolute inset-0 -z-[1] rounded-full bg-gradient-to-r from-cyan to-violet" transition={{ type: "spring", damping: 26, stiffness: 320 }} />}
            <o.icon size={13} /> {o.label}
          </button>
        );
      })}
    </div>
  );
}

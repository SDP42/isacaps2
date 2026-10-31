import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { cx } from "@/lib/format";
import { scrollToId } from "./useSmoothScroll";

const LINKS = [
  ["illusion", "Illusion"],
  ["evidence", "Evidence"],
  ["witnesses", "Witnesses"],
  ["tribunal", "Tribunal"],
  ["risk", "Risk"],
  ["protection", "Protection"],
] as const;

export function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 40));

  return (
    <>
      <header
        className={cx(
          "fixed inset-x-0 top-0 z-50 transition-[background,border-color,backdrop-filter] duration-500",
          solid ? "border-b border-line bg-ink-0/70 backdrop-blur-xl" : "border-b border-transparent",
        )}
      >
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
          <a href="#top" onClick={(e) => { e.preventDefault(); scrollToId("top"); }} aria-label="MIRAGE home">
            <Logo />
          </a>
          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map(([id, label]) => (
              <li key={id}>
                <button
                  onClick={() => scrollToId(id)}
                  className="rounded-full px-3.5 py-1.5 text-[13.5px] text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Button to="/auth" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</Button>
            <Button to="/auth" size="sm" magnetic className="!rounded-full !px-4">Launch MIRAGE</Button>
            <button className="grid size-9 place-items-center rounded-lg text-silver lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={18} />
            </button>
          </div>
        </nav>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] bg-ink-0/95 backdrop-blur-xl lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex h-16 items-center justify-between px-4">
              <Logo />
              <button className="grid size-9 place-items-center text-silver" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>
            <ul className="mt-6 space-y-1 px-4">
              {LINKS.map(([id, label], i) => (
                <motion.li key={id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
                  <button
                    onClick={() => { setOpen(false); setTimeout(() => scrollToId(id), 150); }}
                    className="w-full border-b border-line py-4 text-left text-2xl text-fg"
                  >
                    {label}
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

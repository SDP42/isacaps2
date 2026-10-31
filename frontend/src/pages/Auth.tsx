import { ArrowLeft, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Logo } from "@/components/ui/Logo";
import Aurora from "@/components/reactbits/Aurora";
import GlareHover from "@/components/reactbits/GlareHover";
import ShinyText from "@/components/reactbits/ShinyText";
import { useAuth } from "@/lib/auth";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Persona } from "@/lib/types";

const ACCENT: Record<string, string> = { cyan: "#67e8f9", violet: "#a78bfa", silver: "#c7cfdd", amber: "#fbbf24" };
const CLEARANCE: Record<string, string> = { analyst: "L3 · Investigations", employee: "L1 · Finance ops", admin: "L4 · Administration", family: "Home · Personal safety" };
const LANDS: Record<string, string> = { analyst: "Command centre", employee: "Check a message", admin: "Trustbook & models", family: "Personal safety" };

function hashStrip(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: 38 }, (_, i) => ((h >> (i % 24)) & 1 ? 2 : 1) + ((i * 7 + h) % 3 === 0 ? 1 : 0));
}

function Pass({ p, onPick, busy }: { p: Persona; onPick: () => void; busy: boolean }) {
  const c = ACCENT[p.accent] ?? "#67e8f9";
  const initials = p.name.split(" ").map((x) => x[0]).join("");
  return (
    <motion.button
      onClick={onPick}
      disabled={busy}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-ink-1/80 p-5 text-left transition-colors hover:border-[color:var(--c)] disabled:opacity-60"
      style={{ ["--c" as string]: `${c}66` }}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }} />
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-ink-4" aria-hidden />
      <div className="flex items-start justify-between">
        <span className="grid size-14 place-items-center rounded-xl border text-lg font-medium" style={{ borderColor: `${c}55`, color: c, background: `${c}0d` }}>
          {initials}
        </span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-dim">{p.role.toUpperCase()}</span>
      </div>
      <p className="mt-5 text-lg font-medium text-fg">{p.name}</p>
      <p className="text-[13px] text-muted">{p.title}</p>
      <p className="mt-4 text-[13.5px] leading-relaxed text-silver/85">{p.blurb}</p>
      <div className="mt-auto pt-6">
        <div className="flex h-7 items-end gap-[2px] opacity-50" aria-hidden>
          {hashStrip(p.id).map((w, i) => <span key={i} className="h-full bg-silver" style={{ width: w }} />)}
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-[10.5px]">
          <span style={{ color: c }}>{CLEARANCE[p.role]}</span>
          <span className="flex items-center gap-1 text-muted transition-colors group-hover:text-fg">
            {LANDS[p.role]} <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </motion.button>
  );
}

export default function Auth() {
  const { data: personas, error } = useApi<Persona[]>("/v1/auth/personas");
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (p: Persona) => {
    setBusy(p.id);
    try {
      const me = await login(p.id);
      toast.success(`Signed in as ${me.name}`);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from ?? (me.role === "family" ? "/app/safety" : me.role === "employee" ? "/app/investigate" : "/app/dashboard"), { replace: true });
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="grain relative min-h-dvh overflow-hidden bg-ink-0">
      <div className="pointer-events-none absolute inset-0 grid-field opacity-40 [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]">
        <Aurora colorStops={["#0891b2", "#6d28d9", "#0e7490"]} amplitude={1.0} blend={0.55} speed={0.5} />
      </div>
      <header className="relative mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
        <Link to="/"><Logo /></Link>
        <Link to="/" className="flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"><ArrowLeft size={14} /> Back to site</Link>
      </header>
      <main className="relative mx-auto max-w-[1400px] px-4 pb-16 pt-10 sm:px-8 sm:pt-16">
        <h1 className="text-[clamp(2.4rem,5.6vw,4.8rem)] font-medium leading-[0.98] tracking-[-0.04em]">
          Who is <span className="font-serif font-normal italic"><ShinyText text="asking?" color="#67e8f9" shineColor="#ffffff" speed={3} /></span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          MIRAGE asks that of every message, so it asks you too. Pick a pass to enter the demo; each opens the workspace
          its role would use.
        </p>
        {error && <p className="mt-8 text-crimson">Cannot reach the MIRAGE API ({error}). Start the backend on port 8000.</p>}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(personas ?? Array.from({ length: 4 }, () => null)).map((p, i) =>
            p ? (
              <motion.div key={p.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
                <GlareHover width="100%" height="100%" background="transparent" borderRadius="16px" borderColor="transparent" glareColor="#ffffff" glareOpacity={0.18} glareAngle={-35} glareSize={260}>
                  <Pass p={p} busy={busy !== null} onPick={() => pick(p)} />
                </GlareHover>
              </motion.div>
            ) : (
              <div key={i} className={cx("skeleton h-[360px] rounded-2xl")} />
            ),
          )}
        </div>
        <p className="mt-10 font-mono text-[11px] text-dim">Demo authentication: a signed JWT per persona. Production uses SSO with role-based access.</p>
      </main>
    </div>
  );
}

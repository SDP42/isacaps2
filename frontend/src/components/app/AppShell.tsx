import { AnimatePresence, motion } from "motion/react";
import { LogOut, Menu, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { Kbd } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import ClickSpark from "@/components/reactbits/ClickSpark";
import { CommandPalette } from "./CommandPalette";
import { NAV } from "./nav";

function LiveIndicator() {
  const { data, reload } = useApi<{ totals: { running: number } }>("/v1/dashboard");
  useEffect(() => {
    const id = setInterval(reload, 8000);
    return () => clearInterval(id);
  }, [reload]);
  const running = data?.totals.running ?? 0;
  return (
    <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1 font-mono text-[11px] text-muted md:inline-flex">
      <span className={cx("size-1.5 rounded-full", running ? "live-dot bg-amber" : "bg-mint")} />
      {running ? `${running} investigation${running > 1 ? "s" : ""} running` : "Engine idle · 5 witnesses ready"}
    </span>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { persona } = useAuth();
  return (
    <nav className="flex flex-col gap-6">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.roles || i.roles.includes(persona?.role ?? ""));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="label mb-2 px-3 !text-[10px] !text-dim">{g.group}</p>
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink to={it.to} onClick={onNavigate}
                    className={({ isActive }) => cx(
                      "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors",
                      isActive ? "bg-ink-3 text-fg" : "text-muted hover:bg-white/[0.03] hover:text-silver",
                    )}>
                    {({ isActive }) => (
                      <>
                        {isActive && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-cyan" />}
                        <it.icon size={16} className={isActive ? "text-cyan" : ""} />
                        {it.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export default function AppShell() {
  const { persona, logout } = useAuth();
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if (e.key === "Escape") setPalette(false);
      if (!e.metaKey && !e.ctrlKey && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        if (e.key === "n") nav("/app/investigate");
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [nav]);

  const initials = persona?.name.split(" ").map((x) => x[0]).join("") ?? "";

  return (
    <ClickSpark sparkColor={["#67e8f9", "#a78bfa"]} sparkSize={9} sparkRadius={18} sparkCount={8} duration={420} className="!block">
    <div className="relative flex min-h-dvh bg-ink-0 text-fg">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[420px] bg-[radial-gradient(ellipse_at_30%_-10%,rgb(103_232_249/0.07),transparent_60%),radial-gradient(ellipse_at_85%_-20%,rgb(167_139_250/0.06),transparent_55%)]" />
      {/* desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-ink-1/60 px-3 py-4 lg:flex">
        <NavLink to="/" className="mb-7 px-3"><Logo /></NavLink>
        <SideNav />
        <div className="mt-auto rounded-xl border border-line bg-ink-2/70 p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-ink-4 text-[13px] font-medium text-cyan">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-[13px] text-fg">{persona?.name}</p>
              <p className="truncate text-[11.5px] text-muted">{persona?.title}</p>
            </div>
          </div>
          <button onClick={() => { logout(); nav("/auth"); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line py-1.5 text-[12px] text-muted hover:text-fg">
            <LogOut size={13} /> Switch persona
          </button>
        </div>
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-[70] bg-ink-0/70 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)}>
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="h-full w-[260px] border-r border-line bg-ink-1 px-3 py-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-6 flex items-center justify-between px-3">
                <Logo />
                <button onClick={() => setDrawer(false)} aria-label="Close navigation"><X size={18} /></button>
              </div>
              <SideNav onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-ink-0/75 px-4 backdrop-blur-xl sm:px-6">
          <button className="grid size-9 place-items-center rounded-lg text-silver lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu size={18} /></button>
          <span className="lg:hidden"><LogoMark size={24} /></span>
          <button onClick={() => setPalette(true)}
            className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-line bg-ink-1 px-3 text-[13px] text-dim transition-colors hover:border-line-2 hover:text-muted">
            <Search size={14} />
            <span className="flex-1 truncate text-left">Search cases, run a scenario, jump anywhere…</span>
            <span className="hidden gap-1 sm:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <LiveIndicator />
            <span className="grid size-8 place-items-center rounded-lg bg-ink-3 text-[12px] text-cyan lg:hidden">{initials}</span>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.main key={loc.pathname.split("/").slice(0, 4).join("/")} className="relative min-w-0 flex-1"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
      <CommandPalette open={palette} setOpen={setPalette} />
    </div>
    </ClickSpark>
  );
}

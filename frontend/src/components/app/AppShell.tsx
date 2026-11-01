import { AnimatePresence, motion } from "motion/react";
import { LogOut, Maximize2, Menu, Presentation, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo, LogoMark } from "@/components/ui/Logo";
import { Kbd } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import ClickSpark from "@/components/reactbits/ClickSpark";
import { Copilot, Orb } from "@/components/assistant/Copilot";
import { CommandPalette } from "./CommandPalette";
import { NAV, SIMPLE_NAV } from "./nav";
import { ViewModeToggle } from "./ViewModeToggle";
import { defaultViewFor, useSimple } from "@/lib/viewMode";
import { PresenterBar, setDemoStep, useDemoStep } from "./Presenter";

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
  const simple = useSimple();
  return (
    <nav className="flex flex-col gap-4">
      {(simple ? SIMPLE_NAV : NAV).map((g) => {
        const items = g.items.filter((i) => !i.roles || i.roles.includes(persona?.role ?? ""));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="label mb-1 px-3 !text-[10px] !text-dim">{g.group}</p>
            <ul className="space-y-0.5">
              {items.map((it) => (
                <li key={it.to}>
                  <NavLink to={it.to} onClick={onNavigate}
                    className={({ isActive }) => cx(
                      "group relative flex h-8 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors",
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
  const [dock, setDock] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const demo = useDemoStep();
  const simple = useSimple();
  useEffect(() => defaultViewFor(persona?.role), [persona?.role]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDock((v) => !v);
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
              <ViewModeToggle className="mb-5 ml-3" />
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
            <ViewModeToggle className="hidden sm:inline-flex" />
            {!simple && <button onClick={() => setDemoStep(demo == null ? 0 : null)}
              className={cx("hidden items-center gap-2 rounded-full border px-3 py-1 text-[12px] transition-colors md:inline-flex",
                demo != null ? "border-cyan/50 bg-cyan/10 text-cyan" : "border-line text-muted hover:text-fg")}>
              <Presentation size={13} /> {demo != null ? "Presenting" : "Present"}
            </button>}
            {!simple && <LiveIndicator />}
            <span className="grid size-8 place-items-center rounded-lg bg-ink-3 text-[12px] text-cyan lg:hidden">{initials}</span>
          </div>
        </header>
        <PresenterBar />
        {/* CSS entrance: a paused animation loop (background tab) must never leave a page invisible */}
        <main key={loc.pathname.split("/").slice(0, 4).join("/")} className="page-enter relative min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={palette} setOpen={setPalette} />
      {!loc.pathname.startsWith("/app/copilot") && (
        <>
          {!dock && (
            <button onClick={() => setDock(true)} aria-label="Open the MIRAGE copilot (Ctrl+J)"
              className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2.5 rounded-full border border-cyan/30 bg-ink-1/90 py-2 pl-2 pr-4 text-[13px] text-fg shadow-[0_10px_40px_-10px_rgb(103_232_249/0.45)] backdrop-blur-xl transition-transform hover:-translate-y-0.5">
              <Orb size={30} /> Ask MIRAGE <span className="hidden font-mono text-[10px] text-dim sm:inline">Ctrl J</span>
            </button>
          )}
          <AnimatePresence>
            {dock && (
              <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed inset-y-0 right-0 z-[65] flex w-full flex-col border-l border-line-2 bg-ink-0/95 shadow-[-30px_0_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:w-[460px]">
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <Orb size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-fg">MIRAGE Copilot</p>
                    <p className="text-[11px] text-dim">Local · grounded in MIRAGE's own data</p>
                  </div>
                  <button onClick={() => { setDock(false); nav("/app/copilot"); }} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.04] hover:text-fg" aria-label="Open full screen"><Maximize2 size={15} /></button>
                  <button onClick={() => setDock(false)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/[0.04] hover:text-fg" aria-label="Close the copilot"><X size={16} /></button>
                </div>
                <div className="min-h-0 flex-1"><Copilot variant="dock" /></div>
              </motion.aside>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
    </ClickSpark>
  );
}

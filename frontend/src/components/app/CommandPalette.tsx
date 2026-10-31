import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CaseSummary, Scenario } from "@/lib/types";
import { NAV } from "./nav";

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const nav = useNavigate();
  const { logout } = useAuth();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  useEffect(() => {
    if (!open) return;
    api<CaseSummary[]>("/v1/cases?limit=20").then(setCases).catch(() => {});
    api<Scenario[]>("/v1/scenarios").then(setScenarios).catch(() => {});
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    nav(to);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-start justify-center bg-ink-0/60 px-4 pt-[14vh] backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
          <motion.div initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
            <Command label="Command palette" className="overflow-hidden rounded-2xl border border-line-2 bg-ink-1 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)]">
              <Command.Input autoFocus placeholder="Jump to a case, page or scenario…"
                className="h-13 w-full border-b border-line bg-transparent px-5 text-[15px] text-fg outline-none placeholder:text-dim" />
              <Command.List className="max-h-[56vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-dim">
                <Command.Empty className="px-4 py-8 text-center text-sm text-muted">No match.</Command.Empty>
                <Command.Group heading="NAVIGATE">
                  {NAV.flatMap((g) => g.items).map((it) => (
                    <Item key={it.to} onSelect={() => go(it.to)} icon={<it.icon size={15} />}>{it.label}</Item>
                  ))}
                </Command.Group>
                <Command.Group heading="RECENT CASES">
                  {cases.slice(0, 8).map((c) => (
                    <Item key={c.id} onSelect={() => go(`/app/cases/${c.id}`)} meta={c.band ?? c.status}>
                      <span className="font-mono text-[12px] text-dim">{c.id}</span> <span className="truncate">{c.title}</span>
                    </Item>
                  ))}
                </Command.Group>
                <Command.Group heading="RUN A SCENARIO">
                  {scenarios.map((s) => (
                    <Item key={s.key} meta={`expects ${s.expected}`} onSelect={async () => {
                      setOpen(false);
                      const c = await post<CaseSummary>(`/v1/scenarios/${s.key}/run`);
                      nav(`/app/cases/${c.id}`);
                    }}>
                      <span className="font-mono text-[12px] text-dim">{s.code}</span> {s.title}
                    </Item>
                  ))}
                </Command.Group>
                <Command.Group heading="ACCOUNT">
                  <Item onSelect={() => { setOpen(false); logout(); nav("/auth"); }}>Switch persona</Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Item({ children, onSelect, icon, meta }: { children: React.ReactNode; onSelect: () => void; icon?: React.ReactNode; meta?: string }) {
  return (
    <Command.Item onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] text-silver data-[selected=true]:bg-ink-3 data-[selected=true]:text-fg">
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {meta && <span className="font-mono text-[10.5px] text-dim">{meta}</span>}
    </Command.Item>
  );
}

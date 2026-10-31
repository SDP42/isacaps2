import { BookOpenText, FlaskConical, Gauge, Gavel, Network, Route, ScanSearch, Server, ShieldCheck, Waypoints, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: string[];
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Investigate",
    items: [
      { to: "/app/dashboard", label: "Command centre", icon: Gauge, roles: ["analyst", "admin", "employee"] },
      { to: "/app/investigate", label: "New investigation", icon: ScanSearch },
      { to: "/app/cases", label: "Cases", icon: Waypoints },
      { to: "/app/tribunal", label: "Tribunal", icon: Gavel, roles: ["analyst", "admin", "employee"] },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { to: "/app/identity", label: "Identity graph", icon: Network, roles: ["analyst", "admin"] },
      { to: "/app/attack-chain", label: "Attack chains", icon: Route, roles: ["analyst", "admin"] },
      { to: "/app/casebook", label: "Casebook", icon: BookOpenText },
    ],
  },
  {
    group: "Workspace",
    items: [
      { to: "/app/lab", label: "Scenario lab", icon: FlaskConical },
      { to: "/app/safety", label: "Personal safety", icon: ShieldCheck },
      { to: "/app/system", label: "Models & audit", icon: Server, roles: ["analyst", "admin"] },
    ],
  },
];

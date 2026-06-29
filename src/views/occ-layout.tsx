"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ClipboardCheck, LayoutGrid, ShieldAlert } from "lucide-react";

const TABS = [
  { href: "/occ", label: "Estate", icon: LayoutGrid, exact: true },
  { href: "/occ/exceptions", label: "Exceptions", icon: AlertTriangle, exact: false },
  { href: "/occ/protocols", label: "Protocols", icon: ShieldAlert, exact: false },
] as const;

function OccLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Command Center
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Operations</h1>
        </div>
        <nav className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}

export default OccLayout;

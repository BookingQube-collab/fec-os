"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; exact?: boolean; report?: boolean }[] = [
  { href: "/arcade", label: "Dashboard", exact: true },
  { href: "/arcade/week", label: "My Week" },
  { href: "/arcade/sites", label: "Sites & Games" },
  { href: "/arcade/faults", label: "Faults" },
  { href: "/arcade/pm", label: "PM" },
  { href: "/arcade/observation", label: "Observation" },
  { href: "/arcade/suppliers", label: "Suppliers" },
  { href: "/arcade/support", label: "Supplier Support" },
  { href: "/arcade/parts", label: "Spare Parts" },
  { href: "/arcade/manuals", label: "Manuals" },
  { href: "/arcade/installations", label: "Installations" },
  { href: "/arcade/damage", label: "Damage" },
  { href: "/arcade/history", label: "History" },
  { href: "/arcade/reports", label: "Reports", report: true },
  { href: "/arcade/search", label: "Search" },
];

const STATUS_CLASS: Record<string, string> = {
  WORKING: "bg-emerald-600 text-white",
  DOWN: "bg-red-600 text-white",
  UNDER_REPAIR: "bg-amber-500 text-black",
  UNDER_OBSERVATION: "bg-sky-600 text-white",
  WAITING_PART: "bg-orange-600 text-white",
  WAITING_SUPPLIER: "bg-violet-700 text-white",
  OUT_OF_SERVICE: "bg-rose-800 text-white",
  DECOMMISSIONED: "bg-slate-500 text-white",
  CRITICAL: "bg-red-700 text-white",
  HIGH: "bg-orange-700 text-white",
  RESOLVED: "bg-emerald-700 text-white",
  CLOSED: "bg-slate-700 text-white",
  REPORTED: "bg-blue-700 text-white",
  LOW_STOCK: "bg-amber-600 text-black",
  OUT_OF_STOCK: "bg-red-700 text-white",
  IN_STOCK: "bg-emerald-700 text-white",
};

export function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tracking-wide", STATUS_CLASS[status] ?? "bg-muted text-foreground")}>
      {statusLabel(status)}
    </span>
  );
}

export function ArcadeSubnav() {
  const pathname = usePathname();
  const canReport = usePermission("arcade.reports");
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Arcade Technical">
      {LINKS.filter((link) => !link.report || canReport).map((link) => {
        const active = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-sm font-medium",
              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function KpiTile({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const body = (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{total} records</span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="self-center">{page} / {pages}</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function MobileActions({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>;
}

export function ActionButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild className="h-12 text-base">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import StatusMark, { type StatusMarkStatus } from "@/components/react-bits/status-mark";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

const LINKS: { href: string; labelKey: string; exact?: boolean; report?: boolean }[] = [
  { href: "/arcade", labelKey: "nav.arcadeDashboard", exact: true },
  { href: "/arcade/week", labelKey: "nav.arcadeWeek" },
  { href: "/arcade/sites", labelKey: "nav.arcadeSites" },
  { href: "/arcade/faults", labelKey: "nav.arcadeFaults" },
  { href: "/arcade/pm", labelKey: "nav.arcadePm" },
  { href: "/arcade/observation", labelKey: "nav.arcadeObservation" },
  { href: "/arcade/suppliers", labelKey: "nav.arcadeSuppliers" },
  { href: "/arcade/support", labelKey: "nav.arcadeSupport" },
  { href: "/arcade/parts", labelKey: "nav.arcadeParts" },
  { href: "/arcade/manuals", labelKey: "nav.arcadeManuals" },
  { href: "/arcade/installations", labelKey: "nav.arcadeInstallations" },
  { href: "/arcade/damage", labelKey: "nav.arcadeDamage" },
  { href: "/arcade/history", labelKey: "nav.arcadeHistory" },
  { href: "/arcade/reports", labelKey: "nav.arcadeReports", report: true },
  { href: "/arcade/search", labelKey: "nav.arcadeSearch" },
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

function arcadeMark(status: string): StatusMarkStatus {
  if (["WORKING", "RESOLVED", "CLOSED", "IN_STOCK", "COMPLETED", "DONE"].includes(status)) return "done";
  if (["DOWN", "CRITICAL", "HIGH", "OUT_OF_STOCK", "OUT_OF_SERVICE", "DECOMMISSIONED"].includes(status)) return "failed";
  if (["REPORTED", "UNDER_REPAIR", "WAITING_PART", "WAITING_SUPPLIER", "UNDER_OBSERVATION", "LOW_STOCK"].includes(status)) return "running";
  return "pending";
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = `arcadeStatus.${status}`;
  const translated = t(key);
  const label = translated === key ? statusLabel(status) : translated;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold tracking-wide", STATUS_CLASS[status] ?? "bg-muted text-foreground")}>
      <StatusMark status={arcadeMark(status)} size={14} />
      {label}
    </span>
  );
}

export function ArcadeSubnav() {
  const pathname = usePathname();
  const canReport = usePermission("arcade.reports");
  const { t } = useTranslation();
  return (
    <PillTabScroller label={t("nav.arcade")}>
      {LINKS.filter((link) => !link.report || canReport).map((link) => {
        const active = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={pillTabItemClass(active)}
          >
            {t(link.labelKey)}
          </Link>
        );
      })}
    </PillTabScroller>
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

export function arcadeStatusName(t: (key: string) => string, code: string) {
  const key = `arcadeStatus.${code}`;
  const translated = t(key);
  return translated === key ? code.replaceAll("_", " ") : translated;
}

export function arcadeCategoryName(t: (key: string) => string, category: string) {
  const slug = category.replace(/[^A-Za-z]/g, "");
  const key = `arcadeScreens.cat.${slug}`;
  const translated = t(key);
  return translated === key ? category : translated;
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{t("arcadeScreens.records", { count: total })}</span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("common.prev")}</Button>
        <span className="self-center">{page} / {pages}</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("common.next")}</Button>
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

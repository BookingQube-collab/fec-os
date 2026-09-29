"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { InteractiveCard } from "@/components/ds/app-card";
import { StatusChip, StatusIndicator, equipmentStatusPulse, equipmentStatusTone } from "@/components/ds/status";
import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { Button } from "@/components/ui/button";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { venueTitle } from "@/lib/locations/normalize";
import { cn } from "@/lib/utils";

type ArcadeLink = { href: string; labelKey: string; exact?: boolean; report?: boolean };

const PRIMARY: ArcadeLink[] = [
  { href: "/arcade", labelKey: "nav.arcadeDashboard", exact: true },
  { href: "/arcade/week", labelKey: "nav.arcadeWeek" },
  { href: "/arcade/sites", labelKey: "nav.arcadeSites" },
  { href: "/arcade/faults", labelKey: "nav.arcadeFaults" },
];

const GROUPS: { id: string; labelKey: string; links: ArcadeLink[] }[] = [
  {
    id: "maintenance",
    labelKey: "nav.arcadeGroupMaintenance",
    links: [
      { href: "/arcade/pm", labelKey: "nav.arcadePm" },
      { href: "/arcade/observation", labelKey: "nav.arcadeObservation" },
    ],
  },
  {
    id: "suppliers",
    labelKey: "nav.arcadeGroupSuppliers",
    links: [
      { href: "/arcade/suppliers", labelKey: "nav.arcadeSuppliers" },
      { href: "/arcade/support", labelKey: "nav.arcadeSupport" },
    ],
  },
  {
    id: "parts",
    labelKey: "nav.arcadeGroupParts",
    links: [{ href: "/arcade/parts", labelKey: "nav.arcadeParts" }],
  },
  {
    id: "manuals",
    labelKey: "nav.arcadeGroupManuals",
    links: [
      { href: "/arcade/manuals", labelKey: "nav.arcadeManuals" },
      { href: "/arcade/history", labelKey: "nav.arcadeHistory" },
    ],
  },
  {
    id: "installs",
    labelKey: "nav.arcadeGroupInstalls",
    links: [
      { href: "/arcade/installations", labelKey: "nav.arcadeInstallations" },
      { href: "/arcade/damage", labelKey: "nav.arcadeDamage" },
    ],
  },
  {
    id: "more",
    labelKey: "nav.arcadeGroupMore",
    links: [
      { href: "/arcade/reports", labelKey: "nav.arcadeReports", report: true },
      { href: "/arcade/search", labelKey: "nav.arcadeSearch" },
    ],
  },
];

function isArcadeLinkActive(pathname: string, link: ArcadeLink) {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = `arcadeStatus.${status}`;
  const translated = t(key);
  const label = translated === key ? statusLabel(status) : translated;
  const tone = equipmentStatusTone(status);
  const pulse = equipmentStatusPulse(status);
  return (
    <StatusChip tone={tone}>
      <span className={cn("h-2 w-2 rounded-full bg-current", pulse && "ds-pulse")} aria-hidden />
      {label}
    </StatusChip>
  );
}

export function useVenueTitle() {
  const { t } = useTranslation();
  const sites = useSites();
  return (id?: string | null) => venueTitle(sites.data?.find((site) => site.id === id), t("common.site"));
}

export function HealthMeter({ value, label }: { value: number | null; label: string }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone = value == null ? "bg-muted-foreground/30" : value >= 80 ? "bg-emerald-600" : value >= 50 ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-foreground">{value == null ? "—" : `${value}%`}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
      >
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function healthEdge(value: number | null) {
  if (value == null) return "border-s-muted-foreground/30";
  if (value >= 80) return "border-s-emerald-600";
  if (value >= 50) return "border-s-amber-500";
  return "border-s-red-600";
}

export function SiteHealthCard({
  href,
  title,
  code,
  availability,
  detail,
  meterLabel,
  media,
  alert,
}: {
  href: string;
  title: string;
  code?: string | null;
  availability: number | null;
  detail: string;
  meterLabel: string;
  media?: ReactNode;
  /** Shown when this site already has games down. */
  alert?: string | null;
}) {
  return (
    <InteractiveCard className="h-full">
      <Link
        href={href}
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-s-4 bg-card shadow-elevated-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          healthEdge(availability),
        )}
      >
        {media}
        <div className="grid flex-1 gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{title}</p>
              {code ? <p className="mt-0.5 font-mono text-xs text-muted-foreground">{code}</p> : null}
            </div>
            {alert ? <StatusIndicator tone="critical" label={alert} pulse /> : null}
          </div>
          <p className="text-sm text-muted-foreground">{detail}</p>
          <HealthMeter value={availability} label={meterLabel} />
        </div>
      </Link>
    </InteractiveCard>
  );
}

export function ArcadeSubnav() {
  const pathname = usePathname();
  const canReport = usePermission("arcade.reports");
  const { t } = useTranslation();
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    setOpened(null);
  }, [pathname]);

  const groups = GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => !link.report || canReport),
  })).filter((group) => group.links.length > 0);
  const routeGroup = groups.find((group) => group.links.some((link) => isArcadeLinkActive(pathname, link)))?.id ?? null;
  const openId = opened === "" ? null : (opened ?? routeGroup);
  const openGroup = groups.find((group) => group.id === openId && group.links.length > 1);

  return (
    <div className="grid gap-2">
      <PillTabScroller label={t("nav.arcade")}>
        {PRIMARY.map((link) => {
          const active = isArcadeLinkActive(pathname, link);
          return (
            <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={pillTabItemClass(active)}>
              {t(link.labelKey)}
            </Link>
          );
        })}
      </PillTabScroller>
      <PillTabScroller label={t("nav.arcadeMoreSections")}>
        {groups.map((group) => {
          const childActive = group.links.some((link) => isArcadeLinkActive(pathname, link));
          if (group.links.length === 1) {
            const link = group.links[0];
            return (
              <Link key={group.id} href={link.href} aria-current={childActive ? "page" : undefined} className={pillTabItemClass(childActive)}>
                {t(link.labelKey)}
              </Link>
            );
          }
          const expanded = group.id === openId;
          return (
            <button
              key={group.id}
              type="button"
              aria-expanded={expanded}
              className={cn("cursor-pointer border-0", pillTabItemClass(childActive || expanded))}
              onClick={() => setOpened(expanded ? "" : group.id)}
            >
              {t(group.labelKey)}
              <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
          );
        })}
      </PillTabScroller>
      {openGroup ? (
        <PillTabScroller label={t(openGroup.labelKey)}>
          {openGroup.links.map((link) => {
            const active = isArcadeLinkActive(pathname, link);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={pillTabItemClass(active)}>
                {t(link.labelKey)}
              </Link>
            );
          })}
        </PillTabScroller>
      ) : null}
    </div>
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

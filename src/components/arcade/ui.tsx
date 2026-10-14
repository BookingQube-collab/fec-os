"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import {
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import StatusMark, { type StatusMarkStatus } from "@/components/react-bits/status-mark";
import { Button } from "@/components/ui/button";
import { useSites } from "@/hooks/queries/useSites";
import { venueTitle } from "@/lib/locations/normalize";
import { cn } from "@/lib/utils";

type ArcadeLink = { href: string; labelKey: string; icon: LucideIcon; exact?: boolean; report?: boolean };

const PRIMARY: ArcadeLink[] = [
  { href: "/arcade", labelKey: "nav.arcadeDashboard", icon: LayoutDashboard, exact: true },
  { href: "/arcade/checklist", labelKey: "nav.arcadeChecklist", icon: ClipboardCheck },
  { href: "/arcade/repair", labelKey: "nav.arcadeRepair", icon: Wrench },
  { href: "/arcade/tasks", labelKey: "nav.arcadeTasks", icon: ListChecks },
];

function isArcadeLinkActive(pathname: string, link: ArcadeLink) {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

const STATUS_CLASS: Record<string, string> = {
  WORKING: "arcade-status--ok",
  DOWN: "arcade-status--bad",
  UNDER_REPAIR: "arcade-status--wait",
  UNDER_OBSERVATION: "arcade-status--info",
  WAITING_PART: "arcade-status--wait",
  WAITING_SUPPLIER: "arcade-status--accent",
  OUT_OF_SERVICE: "arcade-status--bad",
  DECOMMISSIONED: "arcade-status--muted",
  CRITICAL: "arcade-status--bad",
  HIGH: "arcade-status--wait",
  RESOLVED: "arcade-status--ok",
  CLOSED: "arcade-status--muted",
  REPORTED: "arcade-status--info",
  LOW_STOCK: "arcade-status--wait",
  OUT_OF_STOCK: "arcade-status--bad",
  IN_STOCK: "arcade-status--ok",
  REPEAT: "arcade-status--accent",
  PASS: "arcade-status--ok",
  FAIL: "arcade-status--bad",
  DONE: "arcade-status--ok",
  STARTED: "arcade-status--info",
  PAUSED: "arcade-status--wait",
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
    <span className={cn("arcade-status", STATUS_CLASS[status] ?? "arcade-status--muted")}>
      <StatusMark status={arcadeMark(status)} size={14} />
      {label}
    </span>
  );
}

export function useVenueTitle() {
  const { t } = useTranslation();
  const sites = useSites();
  return (id?: string | null) => venueTitle(sites.data?.find((site) => site.id === id), t("common.site"));
}

export function HealthMeter({ value, label }: { value: number | null; label: string }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone = value == null ? "muted" : value >= 80 ? "ok" : value >= 50 ? "wait" : "bad";
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-foreground">{value == null ? "—" : `${value}%`}</span>
      </div>
      <div
        className="arcade-meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
      >
        <div className={cn("arcade-meter__bar", `arcade-meter__bar--${tone}`)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function healthEdge(value: number | null) {
  if (value == null) return "arcade-health-card--muted";
  if (value >= 80) return "arcade-health-card--ok";
  if (value >= 50) return "arcade-health-card--wait";
  return "arcade-health-card--bad";
}

export function SiteHealthCard({
  href,
  title,
  code,
  availability,
  detail,
  meterLabel,
  media,
}: {
  href: string;
  title: string;
  code?: string | null;
  availability: number | null;
  detail: string;
  meterLabel: string;
  media?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "arcade-health-card flex h-full flex-col overflow-hidden rounded-2xl border border-s-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        healthEdge(availability),
      )}
    >
      {media}
      <div className="grid flex-1 gap-3 p-4">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{title}</p>
          {code ? <p className="mt-0.5 font-mono text-xs text-muted-foreground">{code}</p> : null}
        </div>
        <p className="text-sm text-muted-foreground">{detail}</p>
        <HealthMeter value={availability} label={meterLabel} />
      </div>
    </Link>
  );
}

export function ArcadeSubnav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="grid gap-2">
      <PillTabScroller label={t("nav.arcade")}>
        {PRIMARY.map((link) => {
          const active = isArcadeLinkActive(pathname, link);
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={pillTabItemClass(active)}>
              <Icon aria-hidden />
              {t(link.labelKey)}
            </Link>
          );
        })}
      </PillTabScroller>
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

export function ActionButton({
  href,
  children,
  variant = "default",
}: {
  href: string;
  children: ReactNode;
  variant?: "default" | "outline" | "secondary";
}) {
  return (
    <Button asChild variant={variant} className={cn("h-12 w-full text-base", variant === "default" && "arcade-cta")}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function ArcadeHero({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="arcade-hero">
      <div className="arcade-hero__copy">
        {kicker ? <p className="arcade-hero__kicker">{kicker}</p> : null}
        <h1 className="arcade-hero__title">{title}</h1>
        {subtitle ? <p className="arcade-hero__sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="arcade-hero__actions">{actions}</div> : null}
    </header>
  );
}

export function ArcadeStat({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  tone?: "ok" | "wait" | "bad" | "info";
}) {
  const className = cn("arcade-stat", tone && `arcade-stat--${tone}`);
  const body = (
    <>
      <span className="arcade-stat__value">{value}</span>
      <span className="arcade-stat__label">{label}</span>
      {hint ? <span className="arcade-stat__hint">{hint}</span> : null}
    </>
  );
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

export function ArcadeEmpty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="arcade-empty">
      <p>{title}</p>
      {action ? <div className="arcade-empty__action">{action}</div> : null}
    </div>
  );
}

export function ArcadeShortcut({
  href,
  icon: Icon,
  title,
  meta,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <Link href={href} className="arcade-tile">
      <span className="arcade-tile__icon">
        <Icon aria-hidden />
      </span>
      <span className="arcade-tile__title">{title}</span>
      {meta != null && meta !== "" ? <span className="arcade-tile__meta">{meta}</span> : null}
    </Link>
  );
}

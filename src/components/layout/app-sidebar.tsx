"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, PanelLeft, PanelLeftClose, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ShellSidebarNav } from "@/components/layout/shell-sidebar-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { useUserRoles } from "@/hooks/use-auth";
import {
  getAllVisibleNavItems,
  getEmployeeSectionNav,
  getVisibleDepartments,
  isDepartmentActive,
  isNavItemActive,
  isSidebarNavGroupActive,
  isSidebarNavGroupItemActive,
  type NavItem,
  type SidebarNavGroup,
  type VisibleNavDepartment,
} from "@/lib/nav-config";
import { groupVisibleNav } from "@/lib/shell-groups";
import { isEmployeeHomeAudience } from "@/lib/rbac";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

/** Heavy route chunks — never auto-prefetch; hover/focus also skipped. */
const SIDEBAR_HEAVY_ROUTES = new Set([
  "/people/attendance/reports",
  "/people/payroll",
  "/operations/weekly-review",
  "/operations/corporate-deals",
]);

/** Lightweight high-frequency rail targets only (not every primary module). */
const SIDEBAR_WARM_PREFETCH = ["/", "/people", "/events", "/maintenance", "/procurement"] as const;



function NavLinkRow({
  item,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
  compact,
}: {
  item: NavItem;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  const active = isNavItemActive(item.href, pathname);

  return (
    <Link
      href={item.href}
      prefetch
      onClick={onNavigate}
      onMouseEnter={() => prefetchRoute(item.href)}
      className={cn(
        "flex items-center gap-2.5 rounded-full text-sm transition-colors",
        compact ? "px-3 py-2" : "px-2.5 py-1.5",
        active
          ? "bg-primary font-semibold text-primary-foreground shadow-elevated-xs"
          : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" />
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

function SidebarNavGroupSection({
  group,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
  compact,
  forceOpen,
}: {
  group: SidebarNavGroup;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
  /** Open while searching so matches stay visible. Never auto-open for the active route. */
  forceOpen?: boolean;
}) {
  const Icon = group.icon;
  const groupActive = isSidebarNavGroupActive(
    group.pathPrefix,
    pathname,
    group.items.map((item) => item.href),
  );
  const [open, setOpen] = useState(Boolean(forceOpen));

  useEffect(() => {
    setOpen(Boolean(forceOpen));
  }, [pathname, forceOpen]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 rounded-full text-sm",
          compact ? "bg-card px-3 py-2" : "px-2 py-1.5",
          groupActive
            ? "font-semibold text-foreground"
            : compact
              ? "text-foreground"
              : "text-muted-foreground hover:bg-secondary/70",
        )}
      >
        <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" />
        <span className="flex-1 truncate text-start">{t(group.labelKey)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul
          className={cn(
            "space-y-0.5",
            compact ? "mt-1 grid grid-cols-1 gap-1" : "ms-5 mt-1 border-s border-border ps-2",
          )}
        >
          {group.items.map((item) => {
            const active = isSidebarNavGroupItemActive(item.href, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch
                  onClick={onNavigate}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  className={cn(
                    "block truncate rounded-full px-2.5 py-1.5 text-sm",
                    active
                      ? "bg-primary font-semibold text-primary-foreground shadow-elevated-xs"
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  )}
                >
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DepartmentSection({
  dept,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
  compact,
  searchQuery,
}: {
  dept: VisibleNavDepartment;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
  searchQuery?: string;
}) {
  const DeptIcon = dept.icon;
  const deptActive = isDepartmentActive(dept, pathname);
  const q = searchQuery?.trim().toLowerCase() ?? "";
  const searchOpen = Boolean(q);
  const [open, setOpen] = useState(false);

  const filteredItems = q
    ? dept.items.filter((item) => t(item.labelKey).toLowerCase().includes(q))
    : dept.items;

  const filteredGroups = q
    ? dept.groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              t(item.labelKey).toLowerCase().includes(q) ||
              t(group.labelKey).toLowerCase().includes(q),
          ),
        }))
        .filter((group) => group.items.length > 0)
    : dept.groups;

  useEffect(() => {
    setOpen(searchOpen);
  }, [pathname, searchOpen]);

  if (filteredItems.length === 0 && filteredGroups.length === 0) return null;

  return (
    <li className={compact ? "col-span-2" : undefined}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className={cn(
            "group flex w-full items-center gap-2 rounded-full text-xs font-semibold uppercase tracking-wider",
            compact ? "bg-secondary/60 px-3 py-2" : "px-2 py-2",
            deptActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <DeptIcon className="h-4 w-4 shrink-0 stroke-[1.5]" />
          <span className="flex-1 truncate text-start">{t(dept.labelKey)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn("space-y-1", compact ? "mt-2" : "mt-1")}>
            {filteredItems.length > 0 && (
              <ul className={cn(compact && "grid grid-cols-2 gap-2")}>
                {filteredItems.map((item) => (
                  <li key={item.href}>
                    <NavLinkRow
                      item={item}
                      pathname={pathname}
                      t={t}
                      prefetchRoute={prefetchRoute}
                      onNavigate={onNavigate}
                      compact={compact}
                    />
                  </li>
                ))}
              </ul>
            )}
            {filteredGroups.map((group) => (
              <SidebarNavGroupSection
                key={group.id}
                group={group}
                pathname={pathname}
                t={t}
                prefetchRoute={prefetchRoute}
                onNavigate={onNavigate}
                compact={compact}
                forceOpen={searchOpen}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function OverflowNavPanel({
  pathname,
  departments,
  t,
  prefetchRoute,
  onNavigate,
  compact,
}: {
  pathname: string;
  departments: VisibleNavDepartment[];
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mb-3 shrink-0">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[1.5] text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("nav.searchModules")}
          className="h-9 bg-card ps-9 text-sm"
        />
      </div>
      <ul
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          compact ? "grid grid-cols-2 content-start gap-3" : "space-y-3",
        )}
      >
        {departments.map((dept) => (
          <DepartmentSection
            key={dept.id}
            dept={dept}
            pathname={pathname}
            t={t}
            prefetchRoute={prefetchRoute}
            onNavigate={onNavigate}
            compact={compact}
            searchQuery={searchQuery}
          />
        ))}
      </ul>
    </div>
  );
}


function EmployeeSectionRail({
  roles,
  pathname,
  t,
  expanded,
}: {
  roles: ReturnType<typeof useUserRoles>;
  pathname: string;
  t: (key: string) => string;
  /** Same pin state as the desktop rail. Labels only when expanded at lg+. */
  expanded: boolean;
}) {
  const sections = useMemo(() => getEmployeeSectionNav(roles), [roles]);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [pathname]);

  return (
    <div className="mb-2 flex w-full flex-col items-center gap-0.5">
      <p
        className={cn(
          "w-full px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
          expanded ? "hidden lg:block" : "hidden",
        )}
      >
        {t("nav.hrMyDay")}
      </p>
      {sections.map((item) => {
        const Icon = item.icon;
        const id = item.href.split("#")[1] ?? "";
        const onThisPage = pathname === "/hr/me" || pathname === "/";
        const active = id ? onThisPage && hash === `#${id}` : onThisPage && hash === "";
        const label = t(item.labelKey);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={label}
            aria-label={label}
            className={cn(
              "flex h-11 items-center gap-2.5 rounded-full text-sm",
              expanded
                ? "w-11 justify-center lg:w-full lg:justify-start lg:px-2.5"
                : "w-11 justify-center",
              active
                ? "bg-primary font-semibold text-primary-foreground shadow-elevated-xs"
                : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            )}
            onClick={(event) => {
              if (!onThisPage) return;
              const targetId = id || "me-profile";
              const el = document.getElementById(targetId);
              if (!el) return;
              event.preventDefault();
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              const nextHash = id ? `#${id}` : "";
              window.history.pushState(null, "", `${pathname}${nextHash}`);
              setHash(nextHash);
            }}
          >
            <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" />
            <span className={cn("truncate", expanded ? "hidden lg:inline" : "sr-only")}>
              {label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const roles = useUserRoles();
  const employeeHome = isEmployeeHomeAudience(roles);
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const [moreOpen, setMoreOpen] = useState(false);
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded);
  const setSidebarExpanded = useAppStore((s) => s.setSidebarExpanded);
  const surgeMode = useAppStore((s) => s.surgeMode);
  const expandLabel = sidebarExpanded ? t("nav.pinSidebar") : t("nav.showLabels");
  const ExpandIcon = sidebarExpanded ? PanelLeftClose : PanelLeft;

  const prefetchRoute = useCallback(
    (href: string) => {
      if (SIDEBAR_HEAVY_ROUTES.has(href) || SIDEBAR_HEAVY_ROUTES.has(href.split("?")[0] ?? href)) {
        return;
      }
      router.prefetch(href);
    },
    [router],
  );

  const departments = useMemo(() => getVisibleDepartments(roles), [roles]);
  const shell = useMemo(() => groupVisibleNav(getAllVisibleNavItems(roles)), [roles]);
  const hasOverflow = shell.groups.some((group) => group.items.length > 1) || shell.unassigned.length > 0;

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (shell.groups.length === 0) return;
    const warm = () => {
      const connection = (
        navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
      ).connection;
      if (connection?.saveData) return;
      if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
      const allowed = new Set(shell.groups.flatMap((group) => group.items.map((item) => item.href)));
      for (const href of SIDEBAR_WARM_PREFETCH) {
        if (!allowed.has(href) || SIDEBAR_HEAVY_ROUTES.has(href)) continue;
        router.prefetch(href);
      }
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(warm, { timeout: 6000 });
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 4000);
    return () => window.clearTimeout(id);
  }, [shell.groups, router]);

  return (
    <>
      {/* Tablet (md–lg) icon rail + desktop (lg+) expandable rail */}
      <aside
        className={cn(
          "fixed z-40 hidden max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden md:flex",
          "w-[4.25rem] items-center",
          sidebarExpanded ? "lg:w-[14rem] lg:items-stretch" : "lg:w-[3.75rem] lg:items-center",
        )}
        style={{
          top: surgeMode ? "0.4rem" : "0.75rem",
          insetInlineStart: surgeMode ? "0.4rem" : "0.75rem",
        }}
      >
        <div
          className={cn(
            "flex w-full max-h-full flex-col overflow-x-hidden overflow-y-auto rounded-[1.75rem] border border-border/60 bg-sidebar shadow-elevated-sm",
            surgeMode ? "py-2" : "py-3",
            "items-center px-1.5",
            sidebarExpanded && "lg:items-stretch lg:px-2",
          )}
        >
          <Button
            asChild
            variant="default"
            size="icon"
            className={cn("mb-2 font-bold", sidebarExpanded && "lg:h-10 lg:w-full")}
          >
            <Link href="/" prefetch title="FEC OS">
              <span className={cn(sidebarExpanded && "lg:hidden")}>F</span>
              {sidebarExpanded ? (
                <span className="hidden truncate lg:inline">{t("app.name")}</span>
              ) : null}
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size={sidebarExpanded ? "sm" : "icon"}
            className={cn("mb-3 hidden lg:inline-flex", sidebarExpanded && "w-full justify-start")}
            title={expandLabel}
            aria-label={expandLabel}
            aria-pressed={sidebarExpanded}
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
          >
            <ExpandIcon className="h-4 w-4 stroke-[1.5]" />
            {sidebarExpanded ? (
              <span>{t("nav.pinSidebar")}</span>
            ) : (
              <span className="sr-only">{t("nav.expandMenu")}</span>
            )}
          </Button>
          {employeeHome ? (
            <EmployeeSectionRail
              roles={roles}
              pathname={pathname}
              t={t}
              expanded={sidebarExpanded}
            />
          ) : null}
          <ShellSidebarNav
            groups={shell.groups}
            pathname={pathname}
            sidebarExpanded={sidebarExpanded}
            surgeMode={surgeMode}
            prefetchRoute={prefetchRoute}
          />
          {hasOverflow && (
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size={sidebarExpanded ? "default" : "icon"}
                  title={t("nav.moreModules")}
                  aria-label={t("nav.moreModules")}
                  className={cn(
                    "mt-1.5 h-11 w-11 lg:h-auto lg:w-auto",
                    sidebarExpanded && "lg:h-10 lg:w-full lg:justify-start lg:px-2.5",
                  )}
                >
                  <MoreHorizontal className="h-[18px] w-[18px] stroke-[1.5]" />
                  {sidebarExpanded ? (
                    <span className="hidden truncate lg:inline">{t("nav.moreModules")}</span>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent
                side={isRtl ? "right" : "left"}
                className="flex w-80 flex-col border-border bg-background"
              >
                <SheetHeader className="shrink-0">
                  <SheetTitle>{t("nav.allModules")}</SheetTitle>
                </SheetHeader>
                <div className="mt-4 flex min-h-0 flex-1 flex-col">
                  <OverflowNavPanel
                    pathname={pathname}
                    departments={departments}
                    t={t}
                    prefetchRoute={prefetchRoute}
                    onNavigate={() => setMoreOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </aside>
    </>
  );
}

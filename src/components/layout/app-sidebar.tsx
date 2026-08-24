"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, MoreHorizontal, PanelLeft, PanelLeftClose, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUserRoles } from "@/hooks/use-auth";
import {
  getDepartmentFlyoutLinks,
  getPrimaryRailNav,
  getVisibleDepartments,
  isDepartmentActive,
  isNavItemActive,
  isSidebarNavGroupActive,
  isSidebarNavGroupItemActive,
  type NavItem,
  type PrimaryRailItem,
  type RailFlyoutLink,
  type SidebarNavGroup,
  type VisibleNavDepartment,
} from "@/lib/nav-config";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const FLYOUT_CLOSE_MS = 180;
const FLYOUT_Z = "z-[80]";

function isFlyoutLinkActive(link: RailFlyoutLink, pathname: string): boolean {
  return link.fromGroup
    ? isSidebarNavGroupItemActive(link.href, pathname)
    : isNavItemActive(link.href, pathname);
}

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
}: {
  group: SidebarNavGroup;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const Icon = group.icon;
  const groupActive = isSidebarNavGroupActive(
    group.pathPrefix,
    pathname,
    group.items.map((item) => item.href),
  );

  return (
    <Collapsible defaultOpen={groupActive}>
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

  const filteredItems = q
    ? dept.items.filter((item) => t(item.labelKey).toLowerCase().includes(q))
    : dept.items;

  const filteredGroups = q
    ? dept.groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              t(item.labelKey).toLowerCase().includes(q) || t(group.labelKey).toLowerCase().includes(q),
          ),
        }))
        .filter((group) => group.items.length > 0)
    : dept.groups;

  if (filteredItems.length === 0 && filteredGroups.length === 0) return null;

  return (
    <li className={compact ? "col-span-2" : undefined}>
      <Collapsible defaultOpen={deptActive || Boolean(q)}>
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
            {filteredGroups.map((group) => (
              <SidebarNavGroupSection
                key={group.id}
                group={group}
                pathname={pathname}
                t={t}
                prefetchRoute={prefetchRoute}
                onNavigate={onNavigate}
                compact={compact}
              />
            ))}
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

function FlyoutLinkList({
  links,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
}: {
  links: RailFlyoutLink[];
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5 p-1.5">
      {links.map((link) => {
        const Icon = link.icon;
        const active = isFlyoutLinkActive(link, pathname);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              prefetch
              onClick={onNavigate}
              onMouseEnter={() => prefetchRoute(link.href)}
              className={cn(
                "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-elevated-xs"
                  : "text-foreground/80 hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 stroke-[1.5] opacity-80" aria-hidden />
              <span className="min-w-0 flex-1 leading-snug font-medium">{t(link.labelKey)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RailIconWithFlyout({
  item,
  pathname,
  department,
  t,
  prefetchRoute,
  openId,
  setOpenId,
  expanded,
}: {
  item: PrimaryRailItem;
  pathname: string;
  department: VisibleNavDepartment | null;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  openId: string | null;
  setOpenId: Dispatch<SetStateAction<string | null>>;
  expanded: boolean;
}) {
  const Icon = item.icon;
  const label = t(item.labelKey);
  const groupLabel = department ? t(department.labelKey) : label;
  const { i18n } = useTranslation();
  const flyoutSide = i18n.dir() === "rtl" ? "left" : "right";
  const links = useMemo(
    () => (department ? getDepartmentFlyoutLinks(department) : []),
    [department],
  );
  const moduleActive = department ? isDepartmentActive(department, pathname) : false;
  const open = openId === item.departmentId;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFlyout = links.length > 0;

  const clearClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearClose();
    closeTimer.current = setTimeout(() => {
      setOpenId((current) => (current === item.departmentId ? null : current));
    }, FLYOUT_CLOSE_MS);
  }, [clearClose, item.departmentId, setOpenId]);

  const openFlyout = useCallback(() => {
    if (!hasFlyout) return;
    clearClose();
    setOpenId(item.departmentId);
    for (const link of links.slice(0, 8)) prefetchRoute(link.href);
  }, [clearClose, hasFlyout, item.departmentId, links, prefetchRoute, setOpenId]);

  useEffect(() => () => clearClose(), [clearClose]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpenId((current) => (current === item.departmentId ? null : current));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={moduleActive ? "default" : "ghost"}
          size={expanded ? "default" : "icon"}
          title={groupLabel}
          aria-label={groupLabel}
          aria-expanded={open}
          aria-haspopup={hasFlyout ? "menu" : undefined}
          onMouseEnter={openFlyout}
          onMouseLeave={scheduleClose}
          onFocus={openFlyout}
          onClick={() => {
            if (!hasFlyout) return;
            if (open) setOpenId(null);
            else openFlyout();
          }}
          className={cn(
            expanded && "h-10 w-full justify-start px-2.5",
            open && !moduleActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <Icon className="h-[18px] w-[18px] stroke-[1.5]" />
          {expanded ? <span className="truncate">{groupLabel}</span> : null}
        </Button>
      </PopoverTrigger>

      {hasFlyout && (
        <PopoverContent
          side={flyoutSide}
          align="start"
          sideOffset={10}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={clearClose}
          onMouseLeave={scheduleClose}
          role="menu"
          aria-label={groupLabel}
          className={cn(
            FLYOUT_Z,
            "w-[16.5rem] border-border/80 bg-popover p-0 text-popover-foreground shadow-elevated-md",
            "rounded-[1.5rem] outline-none",
          )}
        >
          <div className="border-b border-border/70 bg-surface-2/90 px-3.5 py-2.5">
            <p className="section-kicker uppercase tracking-wide">
              {t("nav.subFeatures")}
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">{groupLabel}</p>
          </div>
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto overscroll-contain">
            <FlyoutLinkList
              links={links}
              pathname={pathname}
              t={t}
              prefetchRoute={prefetchRoute}
              onNavigate={() => setOpenId(null)}
            />
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

function ModuleSubsSheet({
  item,
  pathname,
  department,
  t,
  prefetchRoute,
  open,
  onOpenChange,
}: {
  item: PrimaryRailItem;
  pathname: string;
  department: VisibleNavDepartment | null;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const links = useMemo(
    () => (department ? getDepartmentFlyoutLinks(department) : []),
    [department],
  );
  const title = department ? t(department.labelKey) : t(item.labelKey);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[70vh] flex-col rounded-t-[var(--radius-2xl)] border-border bg-background"
      >
        <SheetHeader className="shrink-0">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
          <FlyoutLinkList
            links={links}
            pathname={pathname}
            t={t}
            prefetchRoute={prefetchRoute}
            onNavigate={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const roles = useUserRoles();
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const [moreOpen, setMoreOpen] = useState(false);
  const [flyoutId, setFlyoutId] = useState<string | null>(null);
  const [mobileModuleHref, setMobileModuleHref] = useState<string | null>(null);
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded);
  const setSidebarExpanded = useAppStore((s) => s.setSidebarExpanded);
  const surgeMode = useAppStore((s) => s.surgeMode);
  const expandLabel = sidebarExpanded ? t("nav.pinSidebar") : t("nav.showLabels");
  const ExpandIcon = sidebarExpanded ? PanelLeftClose : PanelLeft;

  const prefetchRoute = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  const primary = useMemo(() => {
    const rail = getPrimaryRailNav(roles);
    const seen = new Set<string>();
    return rail.filter((item) => {
      if (seen.has(item.departmentId)) return false;
      seen.add(item.departmentId);
      return true;
    });
  }, [roles]);
  const departments = useMemo(() => getVisibleDepartments(roles), [roles]);
  const departmentsById = useMemo(
    () => new Map(departments.map((dept) => [dept.id, dept])),
    [departments],
  );
  const overflowItemCount = useMemo(
    () =>
      departments.reduce(
        (n, d) => n + d.items.length + d.groups.reduce((g, gr) => g + gr.items.length, 0),
        0,
      ),
    [departments],
  );
  const hasOverflow = overflowItemCount > primary.length;

  const mobileRail = useMemo(() => {
    const first = primary.slice(0, 4);
    const admin = primary.find((item) => item.departmentId === "admin");
    if (!admin || first.some((item) => item.departmentId === "admin")) return first;
    return [...first.slice(0, 3), admin];
  }, [primary]);
  const mobileModule = useMemo(
    () => primary.find((item) => item.departmentId === mobileModuleHref) ?? null,
    [primary, mobileModuleHref],
  );

  useEffect(() => {
    setFlyoutId(null);
    setMobileModuleHref(null);
  }, [pathname]);

  useEffect(() => {
    if (primary.length === 0) return;
    const prefetchAll = () => {
      for (const item of primary) router.prefetch(item.href);
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(prefetchAll, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = window.setTimeout(prefetchAll, 2000);
    return () => window.clearTimeout(id);
  }, [primary, router]);

  return (
    <>
      {/* Desktop compact icon rail + module flyouts */}
      <aside
        className={cn(
          "fixed z-40 hidden max-h-[calc(100vh-1.5rem)] md:flex flex-col overflow-hidden",
          sidebarExpanded ? "items-stretch" : "items-center",
        )}
        style={{
          top: surgeMode ? "0.4rem" : "0.75rem",
          insetInlineStart: surgeMode ? "0.4rem" : "0.75rem",
          width: sidebarExpanded ? (surgeMode ? "13.25rem" : "14rem") : "3.75rem",
        }}
      >
        <div
          className={cn(
            "flex w-full max-h-full flex-col overflow-x-hidden overflow-y-auto rounded-[1.75rem] border border-border/60 bg-sidebar shadow-elevated-sm",
            surgeMode ? "py-2" : "py-3",
            sidebarExpanded ? "items-stretch px-2" : "items-center",
          )}
        >
          <Button
            asChild
            variant="default"
            size={sidebarExpanded ? "default" : "icon"}
            className={cn("mb-2 font-bold", sidebarExpanded && "w-full")}
          >
            <Link href="/" prefetch title="FEC OS">
              {sidebarExpanded ? "FEC OS" : "F"}
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size={sidebarExpanded ? "sm" : "icon"}
            className={cn("mb-3", sidebarExpanded && "w-full justify-start")}
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
          <nav className={cn("flex flex-col", surgeMode ? "gap-0.5" : "gap-1", sidebarExpanded ? "px-0" : "items-center px-1.5")}>
            {primary.map((item) => (
              <RailIconWithFlyout
                key={item.departmentId}
                item={item}
                pathname={pathname}
                department={departmentsById.get(item.departmentId) ?? null}
                t={t}
                prefetchRoute={prefetchRoute}
                openId={flyoutId}
                setOpenId={setFlyoutId}
                expanded={sidebarExpanded}
              />
            ))}
          </nav>
          {hasOverflow && (
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size={sidebarExpanded ? "default" : "icon"}
                  title={t("nav.moreModules")}
                  aria-label={t("nav.moreModules")}
                  className={cn("mt-1.5", sidebarExpanded && "h-10 w-full justify-start px-2.5")}
                >
                  <MoreHorizontal className="h-[18px] w-[18px] stroke-[1.5]" />
                  {sidebarExpanded ? <span className="truncate">{t("nav.moreModules")}</span> : null}
                </Button>
              </SheetTrigger>
              <SheetContent side={isRtl ? "right" : "left"} className="flex w-80 flex-col border-border bg-background">
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

      {/* Mobile bottom nav — tap module → sub-features sheet */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border/80 bg-card/95 px-2 py-1.5 shadow-elevated-md backdrop-blur-sm md:hidden">
        {mobileRail.map((item) => {
          const Icon = item.icon;
          const department = departmentsById.get(item.departmentId);
          const active = department ? isDepartmentActive(department, pathname) : false;
          const groupLabel = department ? t(department.labelKey) : t(item.labelKey);
          const shortLabel = groupLabel.split(/[\s&]/)[0];
          return (
            <button
              key={item.departmentId}
              type="button"
              title={groupLabel}
              aria-label={groupLabel}
              onClick={() => setMobileModuleHref(item.departmentId)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-xs font-medium",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full",
                  active && "bg-primary text-primary-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5 stroke-[1.5]", active && "text-primary-foreground")} />
              </span>
              <span className="truncate">{shortLabel}</span>
            </button>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              title={t("nav.more")}
              aria-label={t("nav.more")}
              className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <Menu className="h-5 w-5 stroke-[1.5]" />
              {t("nav.more")}
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="flex h-[75vh] flex-col rounded-t-[var(--radius-2xl)] border-border bg-background"
          >
            <SheetHeader className="shrink-0">
              <SheetTitle>{t("nav.navigation")}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex min-h-0 flex-1 flex-col pb-4">
              <OverflowNavPanel
                pathname={pathname}
                departments={departments}
                t={t}
                prefetchRoute={prefetchRoute}
                onNavigate={() => setMoreOpen(false)}
                compact
              />
            </div>
          </SheetContent>
        </Sheet>
      </nav>

      {mobileModule && (
        <ModuleSubsSheet
          item={mobileModule}
          pathname={pathname}
          department={departmentsById.get(mobileModule.departmentId) ?? null}
          t={t}
          prefetchRoute={prefetchRoute}
          open={Boolean(mobileModuleHref)}
          onOpenChange={(next) => {
            if (!next) setMobileModuleHref(null);
          }}
        />
      )}
    </>
  );
}

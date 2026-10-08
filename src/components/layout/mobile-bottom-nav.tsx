"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Clock,
  Home,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { useSidebarNavOrder } from "@/hooks/use-sidebar-nav-order";
import {
  clusterItemsBySection,
  getEmployeeFlatRail,
  getVisibleDepartments,
  isNavItemActive,
  isSidebarNavGroupItemActive,
  mergeReportingManagerDepartments,
  navHrefPath,
  usesEmployeeFlatRail,
  type NavItem,
  type VisibleNavDepartment,
} from "@/lib/nav-config";
import { applySidebarItemOrder, orderDepartments } from "@/lib/nav-order";
import { MOBILE_TABS, isMobileTabActive, type MobileTabId } from "@/lib/mobile-nav";
import { canUserDo } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const TAB_ICONS: Record<Exclude<MobileTabId, "more">, LucideIcon> = {
  home: Home,
  people: Users,
  attendance: Clock,
  operations: LayoutDashboard,
};

function MobileCollapsibleSection({
  label,
  pathname,
  children,
}: {
  label: string;
  pathname: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(true);
  }, [pathname]);

  return (
    <li className="col-span-2 min-w-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group/section flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]/section:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="grid grid-cols-2 gap-1.5 pt-1.5">{children}</ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function employeeRailActive(href: string, pathname: string): boolean {
  if (href === "/hr/me" && (pathname === "/" || pathname === "/hr/me")) return true;
  const path = navHrefPath(href);
  if (path === null) return false;
  return isNavItemActive(path, pathname);
}

function EmployeeRailLinks({
  items,
  pathname,
  t,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  t: (key: string) => string;
  onNavigate: () => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-1.5 pb-6">
      {items.map((item) => {
        const active = employeeRailActive(item.href, pathname);
        const Icon = item.icon;
        return (
          <li key={`${item.labelKey}:${item.href}`}>
            <Link
              href={item.href}
              prefetch
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-2.5 py-2.5 text-sm touch-manipulation",
                active
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "border-border/70 bg-card text-foreground hover:bg-secondary/70",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" aria-hidden />
              <span className="truncate">{t(item.labelKey)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function MoreModulesList({
  departments,
  pathname,
  t,
  onNavigate,
}: {
  departments: VisibleNavDepartment[];
  pathname: string;
  t: (key: string) => string;
  onNavigate: () => void;
}) {
  return (
    <ul className="space-y-4 pb-6">
      {departments.map((dept) => {
        const DeptIcon = dept.icon;
        return (
          <li key={dept.id}>
            <p className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <DeptIcon className="h-3.5 w-3.5 stroke-[1.5]" aria-hidden />
              {t(dept.labelKey)}
            </p>
            <ul className="grid grid-cols-2 gap-1.5">
              {clusterItemsBySection(dept.items).flatMap((block) => {
                const links = block.items.map((item) => {
                  const path = navHrefPath(item.href);
                  const active = path !== null && isNavItemActive(path, pathname);
                  const Icon = item.icon;
                  return (
                    <li key={`${item.labelKey}:${item.href}`}>
                      <Link
                        href={item.href}
                        prefetch
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2 rounded-2xl border px-2.5 py-2.5 text-sm touch-manipulation",
                          active
                            ? "border-primary bg-primary font-semibold text-primary-foreground"
                            : "border-border/70 bg-card text-foreground hover:bg-secondary/70",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" aria-hidden />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                });
                if (!block.sectionKey) return links;
                return [
                  <MobileCollapsibleSection
                    key={`${dept.id}-${block.sectionKey}`}
                    label={t(block.sectionKey)}
                    pathname={pathname}
                  >
                    {links}
                  </MobileCollapsibleSection>,
                ];
              })}
              {dept.groups.flatMap((group) => {
                const blocks = clusterItemsBySection(group.items);
                return blocks.flatMap((block) => {
                  const links = block.items.map((item) => {
                    const active = isSidebarNavGroupItemActive(item.href, pathname);
                    const Icon = group.icon;
                    return (
                      <li key={`${item.labelKey}:${item.href}`} className="min-w-0">
                        <Link
                          href={item.href}
                          prefetch
                          onClick={onNavigate}
                          className={cn(
                            "flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2.5 text-sm touch-manipulation",
                            active
                              ? "border-primary bg-primary font-semibold text-primary-foreground"
                              : "border-border/70 bg-card text-foreground hover:bg-secondary/70",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                        </Link>
                      </li>
                    );
                  });
                  if (!block.sectionKey) return links;
                  return [
                    <MobileCollapsibleSection
                      key={`${group.id}-${block.sectionKey}`}
                      label={t(block.sectionKey)}
                      pathname={pathname}
                    >
                      {links}
                    </MobileCollapsibleSection>,
                  ];
                });
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Phone bottom nav. Always in the DOM for ops shell; `md:hidden` keeps desktop ≥768 untouched.
 * Do not gate on `useIsMobile` / matchMedia (iOS Safari SSR/hydration traps).
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const roles = useUserRoles();
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSignOut = async () => {
    setMoreOpen(false);
    await signOut();
    router.replace("/auth");
  };

  const { hasDirectReports } = useHasDirectReports();
  const employeeRail = useMemo(
    () => (usesEmployeeFlatRail(roles, hasDirectReports) ? getEmployeeFlatRail(roles) : []),
    [hasDirectReports, roles],
  );
  const employeeTabs = employeeRail.slice(0, 4);
  const employeeOverflow = employeeRail.slice(employeeTabs.length);
  const tabs = useMemo(
    () =>
      MOBILE_TABS.filter((tab) => {
        if (tab.capability === null || canUserDo(roles, tab.capability)) return true;
        return hasDirectReports && tab.id === "attendance";
      }),
    [hasDirectReports, roles],
  );

  const { order, itemOrders } = useSidebarNavOrder();
  const departments = useMemo(
    () =>
      applySidebarItemOrder(
        orderDepartments(mergeReportingManagerDepartments(getVisibleDepartments(roles), hasDirectReports), order),
        itemOrders,
      ),
    [hasDirectReports, itemOrders, order, roles],
  );

  if (tabs.length === 0) return null;

  return (
    <>
      <nav
        aria-label={t("nav.mobileNav")}
        data-mobile-nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1">
          {employeeRail.length > 0
            ? employeeTabs.map((item) => {
                const active = employeeRailActive(item.href, pathname);
                const Icon = item.icon;
                const label = t(item.labelKey);
                return (
                  <li key={item.href} className="min-w-0 flex-1">
                    <Button
                      type="button"
                      variant="ghost"
                      asChild
                      className={cn(
                        "h-auto min-h-12 w-full flex-col gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-semibold leading-tight",
                        active ? "bg-primary/10 text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Link
                        href={item.href}
                        prefetch
                        aria-label={label}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMoreOpen(false)}
                      >
                        <Icon className={cn("h-5 w-5 stroke-[1.5]", active && "text-primary")} aria-hidden />
                        <span className="truncate">{label}</span>
                      </Link>
                    </Button>
                  </li>
                );
              })
            : null}
          {employeeRail.length > 0 && employeeOverflow.length > 0 ? (
            <li className="min-w-0 flex-1">
              <Button
                type="button"
                variant="ghost"
                aria-label={t("nav.tabs.more")}
                aria-current={employeeOverflow.some((item) => employeeRailActive(item.href, pathname)) || moreOpen ? "page" : undefined}
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(true)}
                className={cn(
                  "h-auto min-h-12 w-full flex-col gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-semibold leading-tight",
                  moreOpen || employeeOverflow.some((item) => employeeRailActive(item.href, pathname))
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <MoreHorizontal
                  className={cn(
                    "h-5 w-5 stroke-[1.5]",
                    (moreOpen || employeeOverflow.some((item) => employeeRailActive(item.href, pathname))) && "text-primary",
                  )}
                  aria-hidden
                />
                <span className="truncate">{t("nav.tabs.more")}</span>
              </Button>
            </li>
          ) : null}
          {employeeRail.length === 0
            ? tabs.map((tab) => {
            const active = isMobileTabActive(tab.id, pathname, moreOpen);
            if (tab.id === "more") {
              return (
                <li key={tab.id} className="min-w-0 flex-1">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t(tab.labelKey)}
                    aria-current={active ? "page" : undefined}
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen(true)}
                    className={cn(
                      "h-auto min-h-12 w-full flex-col gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-semibold leading-tight",
                      active ? "bg-primary/10 text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <MoreHorizontal
                      className={cn("h-5 w-5 stroke-[1.5]", active && "text-primary")}
                      aria-hidden
                    />
                    <span className="truncate">{t(tab.labelKey)}</span>
                  </Button>
                </li>
              );
            }

            const Icon = TAB_ICONS[tab.id];
            return (
              <li key={tab.id} className="min-w-0 flex-1">
                <Button
                  type="button"
                  variant="ghost"
                  asChild
                  className={cn(
                    "h-auto min-h-12 w-full flex-col gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-semibold leading-tight",
                    active ? "bg-primary/10 text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Link
                    href={tab.href!}
                    prefetch
                    aria-label={t(tab.labelKey)}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon
                      className={cn("h-5 w-5 stroke-[1.5]", active && "text-primary")}
                      aria-hidden
                    />
                    <span className="truncate">{t(tab.labelKey)}</span>
                  </Link>
                </Button>
              </li>
            );
          })
            : null}
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[85dvh] flex-col rounded-t-[1.75rem] border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>{t("nav.allModules")}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {employeeOverflow.length > 0 ? (
              <EmployeeRailLinks
                items={employeeOverflow}
                pathname={pathname}
                t={t}
                onNavigate={() => setMoreOpen(false)}
              />
            ) : (
              <MoreModulesList
                departments={departments}
                pathname={pathname}
                t={t}
                onNavigate={() => setMoreOpen(false)}
              />
            )}
          </div>
          <div className="shrink-0 border-t border-border/70 pt-3">
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4" />
              {t("common.signOut")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

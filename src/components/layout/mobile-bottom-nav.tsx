"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Home, ListChecks, LogOut, MoreHorizontal, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MobileActionBar } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import {
  getVisibleDepartments,
  isNavItemActive,
  isSidebarNavGroupItemActive,
  type VisibleNavDepartment,
} from "@/lib/nav-config";
import { MOBILE_TABS, isMobileTabActive, type MobileTabId } from "@/lib/mobile-nav";
import { canUserDo } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const TAB_ICONS: Record<Exclude<MobileTabId, "more">, LucideIcon> = {
  home: Home,
  sites: Building2,
  tasks: ListChecks,
};

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
              {dept.items.map((item) => {
                const active = isNavItemActive(item.href, pathname);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
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
              {dept.groups.flatMap((group) =>
                group.items.map((item) => {
                  const active = isSidebarNavGroupItemActive(item.href, pathname);
                  const Icon = group.icon;
                  return (
                    <li key={item.href}>
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
                }),
              )}
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

  const tabs = useMemo(
    () => MOBILE_TABS.filter((tab) => tab.capability === null || canUserDo(roles, tab.capability)),
    [roles],
  );

  const departments = useMemo(() => getVisibleDepartments(roles), [roles]);

  if (tabs.length === 0) return null;

  return (
    <>
      <MobileActionBar label={t("nav.mobileNav")}>
          {tabs.map((tab) => {
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
                      "h-auto min-h-12 w-full flex-col gap-0.5 rounded-2xl px-1 py-2 text-xs font-semibold leading-tight",
                      active ? "text-foreground" : "text-muted-foreground",
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
                    "h-auto min-h-12 w-full flex-col gap-0.5 rounded-2xl px-1 py-2 text-xs font-semibold leading-tight",
                    active ? "text-foreground" : "text-muted-foreground",
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
          })}
      </MobileActionBar>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[85dvh] flex-col rounded-t-[1.75rem] border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>{t("nav.allModules")}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <MoreModulesList
              departments={departments}
              pathname={pathname}
              t={t}
              onNavigate={() => setMoreOpen(false)}
            />
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

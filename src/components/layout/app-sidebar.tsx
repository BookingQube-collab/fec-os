"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, MoreHorizontal, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { useUserRoles } from "@/hooks/use-auth";
import {
  getPrimaryRailNav,
  getVisibleDepartments,
  isDepartmentActive,
  isNavItemActive,
  isSidebarNavGroupActive,
  isSidebarNavGroupItemActive,
  type NavItem,
  type SidebarNavGroup,
  type VisibleNavDepartment,
} from "@/lib/nav-config";
import { cn } from "@/lib/utils";

function NavIcon({
  href,
  icon: Icon,
  label,
  active,
  onPrefetch,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onPrefetch?: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      title={label}
      onMouseEnter={() => onPrefetch?.(href)}
      onFocus={() => onPrefetch?.(href)}
      className={cn(
        "group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors duration-150",
        active
          ? "bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] text-white shadow-[0_8px_20px_rgba(139,92,246,0.35)]"
          : "text-[#9CA3AF] hover:bg-[#EEF0FF] hover:text-[#6366F1]",
      )}
    >
      <Icon className="h-5 w-5" />
    </Link>
  );
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
      onClick={onNavigate}
      onMouseEnter={() => prefetchRoute(item.href)}
      className={cn(
        "flex items-center gap-3 rounded-xl text-sm transition-colors",
        compact ? "px-3 py-2.5 shadow-sm" : "px-3 py-2",
        active
          ? "bg-white font-medium text-[#6366F1] shadow-sm"
          : compact
            ? "bg-white text-[#374151] hover:text-[#6366F1]"
            : "text-[#6B7280] hover:bg-white/80",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
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
  const groupActive = isSidebarNavGroupActive(group.pathPrefix, pathname);

  return (
    <Collapsible defaultOpen={groupActive}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 rounded-xl text-sm",
          compact ? "bg-white px-3 py-2.5 shadow-sm" : "px-2 py-1.5",
          groupActive ? "font-medium text-[#6366F1]" : compact ? "text-[#374151]" : "text-[#6B7280] hover:bg-white/80",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-start truncate">{t(group.labelKey)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className={cn("space-y-0.5", compact ? "mt-1 grid grid-cols-1 gap-1" : "ms-6 mt-1 border-s border-[#E2E8F0] ps-2")}>
          {group.items.map((item) => {
            const active = isSidebarNavGroupItemActive(item.href, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  className={cn(
                    "block rounded-lg px-2 py-1.5 text-sm truncate",
                    active ? "bg-white font-medium text-[#6366F1] shadow-sm" : "text-[#6B7280] hover:bg-white/80",
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
            "group flex w-full items-center gap-2 rounded-xl text-xs font-semibold uppercase tracking-wide",
            compact ? "bg-[#EEF0FF]/60 px-3 py-2" : "px-2 py-2",
            deptActive ? "text-[#6366F1]" : "text-[#9CA3AF] hover:text-[#6366F1]",
          )}
        >
          <DeptIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-start truncate">{t(dept.labelKey)}</span>
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
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("nav.searchModules")}
          className="h-9 border-[#E2E8F0] bg-white ps-9 text-sm"
        />
      </div>
      <ul
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          compact ? "grid grid-cols-2 gap-3 content-start" : "space-y-3",
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

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const roles = useUserRoles();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const prefetchRoute = useCallback(
    (href: string) => {
      router.prefetch(href);
    },
    [router],
  );

  const primary = useMemo(() => getPrimaryRailNav(roles), [roles]);
  const departments = useMemo(() => getVisibleDepartments(roles), [roles]);
  const overflowItemCount = useMemo(
    () => departments.reduce((n, d) => n + d.items.length + d.groups.reduce((g, gr) => g + gr.items.length, 0), 0),
    [departments],
  );
  const hasOverflow = overflowItemCount > primary.length;

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
      {/* Desktop curved floating sidebar */}
      <aside
        className="fixed z-30 hidden md:flex flex-col items-center"
        style={{ top: "1.25rem", bottom: "1.25rem", left: "1rem", width: "4.5rem" }}
      >
        <div
          className="flex h-full w-full flex-col items-center rounded-[36px] border border-white/80 bg-white py-6 shadow-sm"
          style={{
            clipPath: "polygon(0% 0%, 100% 0%, 100% 38%, 88% 50%, 100% 62%, 100% 100%, 0% 100%)",
          }}
        >
          <Link
            href="/"
            className="mb-6 grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] text-lg font-bold text-white shadow-lg"
          >
            F
          </Link>
          <nav className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
            {primary.map((item) => (
              <NavIcon
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={t(item.labelKey)}
                active={isNavItemActive(item.href, pathname)}
                onPrefetch={prefetchRoute}
              />
            ))}
          </nav>
          {hasOverflow && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  title={t("nav.moreModules")}
                  className="mt-2 flex h-11 w-11 items-center justify-center rounded-2xl text-[#9CA3AF] hover:bg-[#EEF0FF] hover:text-[#6366F1]"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-80 flex-col border-[#EEF0FF] bg-[#F8FAFF]">
                <SheetHeader className="shrink-0">
                  <SheetTitle>{t("nav.allModules")}</SheetTitle>
                </SheetHeader>
                <div className="mt-4 flex min-h-0 flex-1 flex-col">
                  <OverflowNavPanel
                    pathname={pathname}
                    departments={departments}
                    t={t}
                    prefetchRoute={prefetchRoute}
                    onNavigate={() => setOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/60 bg-white px-2 py-2 shadow-sm md:hidden">
        {primary.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(item.href, pathname);
          const shortLabel = t(item.labelKey).split(" ")[0];
          return (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={() => prefetchRoute(item.href)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 text-[10px]",
                active ? "text-[#6366F1]" : "text-[#9CA3AF]",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{shortLabel}</span>
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button" className="flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] text-[#9CA3AF]">
              <Menu className="h-5 w-5" />
              {t("nav.more")}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="flex h-[75vh] flex-col rounded-t-[28px] border-[#EEF0FF] bg-[#F8FAFF]">
            <SheetHeader className="shrink-0">
              <SheetTitle>{t("nav.navigation")}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex min-h-0 flex-1 flex-col pb-4">
              <OverflowNavPanel
                pathname={pathname}
                departments={departments}
                t={t}
                prefetchRoute={prefetchRoute}
                onNavigate={() => setOpen(false)}
                compact
              />
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}

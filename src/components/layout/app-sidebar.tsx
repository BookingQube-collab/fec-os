"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, PanelLeft, PanelLeftClose, Search, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";

import { BitsShine } from "@/components/layout/bits-shine";
import { ItemDragBucket, ItemDragRow, ItemDragScope, NavDragRow } from "@/components/layout/nav-drag-row";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { useSidebarNavOrder } from "@/hooks/use-sidebar-nav-order";
import {
  clusterItemsBySection,
  getDepartmentFlyoutLinks,
  getDepartmentFlyoutTree,
  employeePinnedRailItems,
  getEmployeeFlatRail,
  getEmployeeSectionNav,
  getPrimaryRailNav,
  getVisibleDepartments,
  isDepartmentActive,
  isNavItemActive,
  isSidebarNavGroupActive,
  isSidebarNavGroupItemActive,
  mergeReportingManagerDepartments,
  navHrefPath,
  reportingManagerRailItems,
  showsMyDayNav,
  usesEmployeeFlatRail,
  type NavItem,
  type PrimaryRailItem,
  type RailFlyoutLink,
  type SidebarNavGroup,
  type VisibleNavDepartment,
} from "@/lib/nav-config";
import {
  applySidebarItemOrder,
  canReorderSidebarNav,
  moveNavDepartment,
  moveNavItem,
  orderDepartments,
  orderPrimaryRail,
} from "@/lib/nav-order";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Heavy route chunks — never auto-prefetch; hover/focus also skipped. */
const SIDEBAR_HEAVY_ROUTES = new Set([
  "/people/attendance/reports",
  "/people/payroll",
  "/operations/weekly-review",
  "/operations/corporate-deals",
]);

/** Lightweight high-frequency rail targets only (not every primary module). */
const SIDEBAR_WARM_PREFETCH = ["/", "/people", "/events", "/maintenance", "/procurement"] as const;

const FLYOUT_CLOSE_MS = 180;

function navItemIsActive(href: string, pathname: string): boolean {
  const path = navHrefPath(href);
  if (path === null) return false;
  return isNavItemActive(path, pathname);
}

function isFlyoutLinkActive(link: RailFlyoutLink, pathname: string): boolean {
  const path = navHrefPath(link.href);
  if (path === null) return false;
  return link.fromGroup
    ? isSidebarNavGroupItemActive(path, pathname)
    : isNavItemActive(path, pathname);
}

function NavLinkRow({
  item,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
  compact,
  flyout,
}: {
  item: NavItem;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
  flyout?: boolean;
}) {
  const Icon = item.icon;
  const active = navItemIsActive(item.href, pathname);

  return (
    <Link
      href={item.href}
      prefetch
      onClick={onNavigate}
      onMouseEnter={() => prefetchRoute(item.href)}
      aria-current={flyout && active ? "page" : undefined}
      className={cn(
        flyout
          ? "nav-flyout-row"
          : cn(
              "flex items-center gap-2.5 rounded-full text-sm transition-colors",
              compact ? "px-3 py-2" : "px-2.5 py-1.5",
              active
                ? "bg-primary font-semibold text-primary-foreground shadow-elevated-xs"
                : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            ),
      )}
    >
      <Icon className={flyout ? "nav-flyout-row__icon" : "h-4 w-4 shrink-0 stroke-[1.5]"} aria-hidden />
      <span className={flyout ? "nav-flyout-row__label" : "truncate"}>{t(item.labelKey)}</span>
    </Link>
  );
}

type SidebarGroupLink = SidebarNavGroup["items"][number];

function clusterSidebarItems(items: SidebarGroupLink[]) {
  return clusterItemsBySection(items);
}

function SidebarGroupLinkList({
  items,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
  flyout,
}: {
  items: SidebarGroupLink[];
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  flyout?: boolean;
}) {
  return (
    <ul className={flyout ? "nav-flyout-list" : "space-y-0.5"}>
      {items.map((item) => {
        const active = isSidebarNavGroupItemActive(item.href, pathname);
        return (
          <li key={`${item.labelKey}:${item.href}`} className="min-w-0">
            <ItemDragRow item={item}>
            <Link
              href={item.href}
              prefetch
              onClick={onNavigate}
              onMouseEnter={() => prefetchRoute(item.href)}
              aria-current={flyout && active ? "page" : undefined}
              className={cn(
                flyout
                  ? "nav-flyout-row"
                  : cn(
                      "block max-w-full truncate rounded-full px-2.5 py-1.5 text-sm",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary font-semibold text-primary-foreground shadow-elevated-xs"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                    ),
              )}
            >
              {flyout ? <span className="nav-flyout-row__label">{t(item.labelKey)}</span> : t(item.labelKey)}
            </Link>
            </ItemDragRow>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarNavCluster({
  labelKey,
  items,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
  forceOpen,
  flyout,
}: {
  labelKey: string;
  items: SidebarGroupLink[];
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  forceOpen?: boolean;
  flyout?: boolean;
}) {
  const active = items.some((item) => isSidebarNavGroupItemActive(item.href, pathname));
  const [open, setOpen] = useState(active || Boolean(forceOpen));

  useEffect(() => {
    setOpen(Boolean(forceOpen) || active);
  }, [forceOpen, active, pathname]);

  return (
    <li className="min-w-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          data-expanded={flyout && open ? "true" : undefined}
          className={cn(
            flyout
              ? "nav-flyout-row group/section"
              : cn(
                  "group/section flex w-full min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-start text-xs font-semibold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : open
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
                ),
          )}
        >
          <span className={flyout ? "nav-flyout-row__label" : "min-w-0 flex-1 truncate"}>{t(labelKey)}</span>
          <ChevronDown
            className={cn(
              "shrink-0 transition-transform group-data-[state=open]/section:rotate-180 motion-reduce:transition-none",
              flyout ? "nav-flyout-row__chevron" : "h-3 w-3",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={flyout ? "nav-flyout-nested" : "mt-0.5 ps-1.5"}>
            <SidebarGroupLinkList
              items={items}
              pathname={pathname}
              t={t}
              prefetchRoute={prefetchRoute}
              onNavigate={onNavigate}
              flyout={flyout}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
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
  flyout,
}: {
  group: SidebarNavGroup;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
  /** Open while searching so matches stay visible. Never auto-open for the active route. */
  forceOpen?: boolean;
  flyout?: boolean;
}) {
  const Icon = group.icon;
  const groupActive = isSidebarNavGroupActive(
    group.pathPrefix,
    pathname,
    group.items.map((item) => item.href),
  );
  const [open, setOpen] = useState(Boolean(forceOpen));
  const blocks = clusterSidebarItems(group.items);
  const sectioned = blocks.some((block) => block.sectionKey);
  const warm = sectioned && (open || groupActive);

  useEffect(() => {
    setOpen(Boolean(forceOpen));
  }, [pathname, forceOpen]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        data-expanded={flyout && open ? "true" : undefined}
        className={cn(
          flyout
            ? "nav-flyout-row group/nav"
            : cn(
                "group/nav flex w-full min-w-0 items-center gap-2 rounded-full text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                compact ? "px-3 py-2" : "px-2 py-1.5",
                compact && !warm && "bg-card",
                warm
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : groupActive
                    ? "font-semibold text-foreground"
                    : compact
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-secondary/70",
              ),
        )}
      >
        <Icon className={flyout ? "nav-flyout-row__icon" : "h-4 w-4 shrink-0 stroke-[1.5]"} aria-hidden />
        <span className={flyout ? "nav-flyout-row__label" : "min-w-0 flex-1 truncate text-start"}>
          {t(group.labelKey)}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 transition-transform group-data-[state=open]/nav:rotate-180 motion-reduce:transition-none",
            flyout ? "nav-flyout-row__chevron" : "h-3.5 w-3.5",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {sectioned ? (
          <div
            className={cn(
              "min-w-0",
              flyout
                ? "nav-flyout-nested"
                : compact
                  ? "mt-1"
                  : "ms-4 mt-1 border-s border-sidebar-border ps-1.5",
            )}
          >
            <ul className={flyout ? "nav-flyout-list" : "min-w-0 space-y-0.5"}>
              {blocks.map((block) =>
                block.sectionKey ? (
                  <SidebarNavCluster
                    key={block.sectionKey}
                    labelKey={block.sectionKey}
                    items={block.items}
                    pathname={pathname}
                    t={t}
                    prefetchRoute={prefetchRoute}
                    onNavigate={onNavigate}
                    forceOpen={forceOpen}
                    flyout={flyout}
                  />
                ) : (
                  <li key={block.items.map((item) => item.href).join("|")} className="min-w-0">
                    <SidebarGroupLinkList
                      items={block.items}
                      pathname={pathname}
                      t={t}
                      prefetchRoute={prefetchRoute}
                      onNavigate={onNavigate}
                      flyout={flyout}
                    />
                  </li>
                ),
              )}
            </ul>
          </div>
        ) : flyout ? (
          <div className="nav-flyout-nested">
            <SidebarGroupLinkList
              items={group.items}
              pathname={pathname}
              t={t}
              prefetchRoute={prefetchRoute}
              onNavigate={onNavigate}
              flyout
            />
          </div>
        ) : (
          <ul
            className={cn(
              "space-y-0.5",
              compact ? "mt-1 grid grid-cols-1 gap-1" : "ms-5 mt-1 border-s border-border ps-2",
            )}
          >
            {group.items.map((item) => {
              const active = isSidebarNavGroupItemActive(item.href, pathname);
              return (
                <li key={`${item.labelKey}:${item.href}`} className="min-w-0">
                  <ItemDragRow item={item}>
                  <Link
                    href={item.href}
                    prefetch
                    onClick={onNavigate}
                    onMouseEnter={() => prefetchRoute(item.href)}
                    className={cn(
                      "block max-w-full truncate rounded-full px-2.5 py-1.5 text-sm",
                      active
                        ? "bg-primary font-semibold text-primary-foreground shadow-elevated-xs"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                  </ItemDragRow>
                </li>
              );
            })}
          </ul>
        )}
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
  canDrag,
  onMove,
}: {
  dept: VisibleNavDepartment;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
  searchQuery?: string;
  canDrag?: boolean;
  onMove?: (activeId: string, overId: string) => void;
}) {
  const DeptIcon = dept.icon;
  const deptActive = isDepartmentActive(dept, pathname);
  const q = searchQuery?.trim().toLowerCase() ?? "";
  const searchOpen = Boolean(q);
  const [open, setOpen] = useState(false);

  const filteredItems = q
    ? dept.items.filter((item) => {
        const section = item.sectionKey ? t(item.sectionKey).toLowerCase() : "";
        return t(item.labelKey).toLowerCase().includes(q) || section.includes(q);
      })
    : dept.items;

  const filteredGroups = q
    ? dept.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const section = item.sectionKey ? t(item.sectionKey).toLowerCase() : "";
            return (
              t(item.labelKey).toLowerCase().includes(q) ||
              t(group.labelKey).toLowerCase().includes(q) ||
              section.includes(q)
            );
          }),
        }))
        .filter((group) => group.items.length > 0)
    : dept.groups;

  useEffect(() => {
    setOpen(searchOpen);
  }, [pathname, searchOpen]);

  if (filteredItems.length === 0 && filteredGroups.length === 0) return null;

  return (
    <li className={compact ? "col-span-2" : undefined}>
      <NavDragRow
        id={dept.id}
        enabled={Boolean(canDrag && onMove)}
        label={t("sidebarOrder.drag")}
        onMove={onMove ?? (() => undefined)}
      >
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
              <ItemDragBucket bucket={dept.id}>
              <ul className={cn(compact && "grid grid-cols-2 gap-2")}>
                {clusterItemsBySection(filteredItems).map((block) => {
                  const rows = (
                    <ul className={cn(compact && "grid grid-cols-2 gap-2", !compact && "space-y-0.5")}>
                      {block.items.map((item) => (
                        <li key={`${item.labelKey}:${item.href}`}>
                          <ItemDragRow item={item}>
                          <NavLinkRow
                            item={item}
                            pathname={pathname}
                            t={t}
                            prefetchRoute={prefetchRoute}
                            onNavigate={onNavigate}
                            compact={compact}
                          />
                          </ItemDragRow>
                        </li>
                      ))}
                    </ul>
                  );
                  if (!block.sectionKey) {
                    return (
                      <li key={`plain:${block.items[0]?.href}`} className="min-w-0">
                        {rows}
                      </li>
                    );
                  }
                  return (
                    <li key={block.sectionKey} className={cn("min-w-0", compact && "col-span-2")}>
                      <CollapsibleNavSection
                        label={t(block.sectionKey)}
                        sectionKey={block.sectionKey}
                        pathname={pathname}
                        active={block.items.some((item) => navItemIsActive(item.href, pathname))}
                        forceOpen={searchOpen}
                        triggerClassName="nav-section-trigger"
                      >
                        {rows}
                      </CollapsibleNavSection>
                    </li>
                  );
                })}
              </ul>
              </ItemDragBucket>
            )}
            {filteredGroups.map((group) => (
              <ItemDragBucket key={group.id} bucket={`${dept.id}:${group.id}`}>
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
              </ItemDragBucket>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      </NavDragRow>
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
  canDrag,
  onMove,
}: {
  pathname: string;
  departments: VisibleNavDepartment[];
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
  canDrag?: boolean;
  onMove?: (activeId: string, overId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canDrag ? (
        <Link
          href="/admin/sidebar#arrange-automatically"
          onClick={() => onNavigate?.()}
          className="mb-3 flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-foreground"
        >
          <Sparkles className="h-4 w-4 shrink-0 stroke-[1.5]" aria-hidden />
          <span>{t("sidebarOrder.arrangeAuto")}</span>
        </Link>
      ) : null}
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
            canDrag={canDrag && !searchQuery.trim()}
            onMove={onMove}
          />
        ))}
      </ul>
    </div>
  );
}

const PEOPLE_NAV_SECTION_PREFIX = "nav.peopleSection";
const PEOPLE_WORKSPACE_SECTION = "nav.peopleSectionWorkspace";

/** People & HR: Workspace stays open. The section that holds the current page opens too. Every other section starts closed. */
function peopleNavSectionStartsOpen(sectionKey: string, active: boolean, forceOpen?: boolean) {
  if (forceOpen) return true;
  return sectionKey === PEOPLE_WORKSPACE_SECTION || active;
}

/**
 * Section heading that hides and shows its rows.
 * Click or keyboard toggles. Search forces the block open.
 * People & HR starts with only Workspace open (plus the section that contains the current page).
 * That choice resets on navigation. Other departments stay expanded.
 */
function CollapsibleNavSection({
  label,
  sectionKey,
  pathname,
  active = false,
  forceOpen,
  triggerClassName,
  children,
}: {
  label: string;
  sectionKey?: string;
  pathname: string;
  /** True when the current route is one of this section's links. */
  active?: boolean;
  forceOpen?: boolean;
  triggerClassName: string;
  children: ReactNode;
}) {
  const peopleSection = Boolean(sectionKey?.startsWith(PEOPLE_NAV_SECTION_PREFIX));
  const [open, setOpen] = useState(() =>
    peopleSection && sectionKey
      ? peopleNavSectionStartsOpen(sectionKey, active, forceOpen)
      : true,
  );

  useEffect(() => {
    if (!peopleSection || !sectionKey) {
      setOpen(true);
      return;
    }
    setOpen(peopleNavSectionStartsOpen(sectionKey, active, forceOpen));
  }, [pathname, forceOpen, peopleSection, sectionKey, active]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        data-expanded={open ? "true" : undefined}
        className={cn("group/section", triggerClassName)}
      >
        <span className="min-w-0 flex-1 truncate text-start">{label}</span>
        <ChevronDown
          className="nav-flyout-row__chevron transition-transform group-data-[state=open]/section:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function FlyoutLinkItems({
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
    <ul className="nav-flyout-list">
      {links.map((link) => {
        const Icon = link.icon;
        const active = isFlyoutLinkActive(link, pathname);
        return (
          <li key={`${link.labelKey}:${link.href}`}>
            <ItemDragRow item={link}>
            <Link
              href={link.href}
              prefetch
              onClick={onNavigate}
              onMouseEnter={() => prefetchRoute(link.href)}
              aria-current={active ? "page" : undefined}
              className="nav-flyout-row"
            >
              <Icon className="nav-flyout-row__icon" aria-hidden />
              <span className="nav-flyout-row__label">{t(link.labelKey)}</span>
            </Link>
            </ItemDragRow>
          </li>
        );
      })}
    </ul>
  );
}

function FlyoutLinkList({
  links,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
  dragBucket,
  embedded,
}: {
  links: RailFlyoutLink[];
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  dragBucket?: string;
  /** Parent already provides the flyout column, so sections are not wrapped again. */
  embedded?: boolean;
}) {
  const blocks = clusterItemsBySection(links);
  const body = (
    <div className={embedded ? "contents" : "nav-flyout-body"}>
      {blocks.map((block) => {
        const items = (
          <FlyoutLinkItems
            links={block.items}
            pathname={pathname}
            t={t}
            prefetchRoute={prefetchRoute}
            onNavigate={onNavigate}
          />
        );
        if (!block.sectionKey) {
          return <div key={`plain:${block.items[0]?.href}`}>{items}</div>;
        }
        return (
          <CollapsibleNavSection
            key={block.sectionKey}
            label={t(block.sectionKey)}
            sectionKey={block.sectionKey}
            pathname={pathname}
            active={block.items.some((link) => isFlyoutLinkActive(link, pathname))}
            triggerClassName="nav-flyout-section"
          >
            {items}
          </CollapsibleNavSection>
        );
      })}
    </div>
  );
  if (!dragBucket) return body;
  return <ItemDragBucket bucket={dragBucket}>{body}</ItemDragBucket>;
}

/** Parent → indented children for department flyouts (HR Time & Attendance, etc.). */
function DepartmentFlyoutTree({
  department,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
  compact,
  flyout,
}: {
  department: VisibleNavDepartment;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
  compact?: boolean;
  flyout?: boolean;
}) {
  const tree = useMemo(() => getDepartmentFlyoutTree(department), [department]);
  const sectionedItems = tree.items.some((item) => item.sectionKey);

  if (tree.groups.length === 0) {
    return (
      <FlyoutLinkList
        links={getDepartmentFlyoutLinks(department)}
        pathname={pathname}
        t={t}
        prefetchRoute={prefetchRoute}
        onNavigate={onNavigate}
        dragBucket={department.id}
      />
    );
  }

  return (
    <div className={cn(flyout ? "nav-flyout-body" : cn("space-y-1", compact ? "p-1" : "p-1.5"))}>
      {tree.items.length > 0 && sectionedItems ? (
        <FlyoutLinkList
          links={tree.items.map((item) => ({ ...item, fromGroup: false }))}
          pathname={pathname}
          t={t}
          prefetchRoute={prefetchRoute}
          onNavigate={onNavigate}
          dragBucket={department.id}
          embedded={flyout}
        />
      ) : null}
      {tree.items.length > 0 && !sectionedItems ? (
        <ItemDragBucket bucket={department.id}>
        <ul className={flyout ? "nav-flyout-list" : "space-y-0.5 pb-1"}>
          {tree.items.map((item) => (
            <li key={`${item.labelKey}:${item.href}`}>
              <ItemDragRow item={item}>
              <NavLinkRow
                item={item}
                pathname={pathname}
                t={t}
                prefetchRoute={prefetchRoute}
                onNavigate={onNavigate}
                compact={compact}
                flyout={flyout}
              />
              </ItemDragRow>
            </li>
          ))}
        </ul>
        </ItemDragBucket>
      ) : null}
      {tree.groups.map((group) => (
        <ItemDragBucket key={group.id} bucket={`${department.id}:${group.id}`}>
        <SidebarNavGroupSection
          key={group.id}
          group={group}
          pathname={pathname}
          t={t}
          prefetchRoute={prefetchRoute}
          onNavigate={onNavigate}
          compact={compact}
          flyout={flyout}
        />
        </ItemDragBucket>
      ))}
    </div>
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
  const isRtl = i18n.dir() === "rtl";
  const flyoutSide = isRtl ? "left" : "right";
  // Collapsed rail is 3.75rem with a 2.75rem icon. 20px offset clears that rail.
  const flyoutSideOffset = 20;
  const railGuard = 88;
  const flyoutCollisionPadding = isRtl
    ? { top: 16, right: railGuard, bottom: 16, left: 16 }
    : { top: 16, right: 16, bottom: 16, left: railGuard };
  const links = useMemo(
    () => (department ? getDepartmentFlyoutLinks(department) : []),
    [department],
  );
  const hasGroups = Boolean(department && department.groups.length > 0);
  const moduleActive = department ? isDepartmentActive(department, pathname) : false;
  const open = openId === item.departmentId;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreHoverRef = useRef(false);
  const hasFlyout = links.length > 0;
  // Only stay open while browsing (hover/click). Navigating must collapse —
  // do not keep the tree open just because the route is under this module.
  const showInlineTree =
    expanded &&
    department &&
    open &&
    (hasGroups || (department.id === "people" && links.length > 0));

  const clearClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const closeFlyout = useCallback(() => {
    clearClose();
    setOpenId((current) => (current === item.departmentId ? null : current));
  }, [clearClose, item.departmentId, setOpenId]);

  const closeAfterNavigate = useCallback(() => {
    ignoreHoverRef.current = true;
    closeFlyout();
  }, [closeFlyout]);

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
    <div className={cn("w-full", expanded && "space-y-0.5")}>
      <Popover
        open={!expanded && open}
        onOpenChange={(next) => {
          if (!next) closeFlyout();
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
            onMouseEnter={() => {
              if (ignoreHoverRef.current) return;
              if (!expanded) openFlyout();
            }}
            onMouseLeave={() => {
              ignoreHoverRef.current = false;
              if (!expanded) scheduleClose();
            }}
            onFocus={() => {
              if (ignoreHoverRef.current) return;
              if (!expanded) openFlyout();
            }}
            onClick={() => {
              if (!hasFlyout) return;
              if (open) closeFlyout();
              else openFlyout();
            }}
            className={cn(
              expanded && "h-auto min-h-11 w-full justify-start gap-2.5 px-3",
              open &&
                !moduleActive &&
                "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px] stroke-[1.5]" />
            {expanded ? (
              <span className="min-w-0 flex-1 whitespace-normal text-start text-sm leading-5">{groupLabel}</span>
            ) : null}
          </Button>
        </PopoverTrigger>

        {hasFlyout && !expanded && (
          <PopoverContent
            side={flyoutSide}
            align="start"
            sideOffset={flyoutSideOffset}
            collisionPadding={flyoutCollisionPadding}
            dir={isRtl ? "rtl" : "ltr"}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
            role="menu"
            aria-label={groupLabel}
            className="nav-rail-flyout w-[19rem] max-w-[calc(100vw-6.5rem)] border-sidebar-border bg-popover p-0 text-popover-foreground shadow-elevated-md outline-none"
          >
            <div className="nav-rail-flyout__titlebar">
              <p className="nav-rail-flyout__title">{groupLabel}</p>
            </div>
            <div
              className="nav-rail-flyout__scroll"
              onDragStartCapture={() => clearClose()}
            >
              {department && hasGroups ? (
                <DepartmentFlyoutTree
                  department={department}
                  pathname={pathname}
                  t={t}
                  prefetchRoute={prefetchRoute}
                  onNavigate={closeAfterNavigate}
                  flyout
                />
              ) : (
                <FlyoutLinkList
                  links={links}
                  pathname={pathname}
                  t={t}
                  prefetchRoute={prefetchRoute}
                  onNavigate={closeAfterNavigate}
                  dragBucket={department?.id}
                />
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>

      {showInlineTree && department ? (
        <div className="nav-rail-inline">
          <DepartmentFlyoutTree
            department={department}
            pathname={pathname}
            t={t}
            prefetchRoute={prefetchRoute}
            onNavigate={closeAfterNavigate}
            flyout
          />
        </div>
      ) : null}
    </div>
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
  const hasGroups = Boolean(department && department.groups.length > 0);
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
          {department && hasGroups ? (
            <DepartmentFlyoutTree
              department={department}
              pathname={pathname}
              t={t}
              prefetchRoute={prefetchRoute}
              onNavigate={() => onOpenChange(false)}
              flyout
            />
          ) : (
            <FlyoutLinkList
              links={links}
              pathname={pathname}
              t={t}
              prefetchRoute={prefetchRoute}
              onNavigate={() => onOpenChange(false)}
              dragBucket={department?.id}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReportingManagerRail({
  items,
  pathname,
  t,
  expanded,
}: {
  items: NavItem[];
  pathname: string;
  t: (key: string) => string;
  expanded: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2 flex w-full flex-col items-center gap-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const label = t(item.labelKey);
        const active =
          isNavItemActive(item.href, pathname) || (item.href === "/hr/me" && (pathname === "/" || pathname === "/hr/me"));
        return (
          <Link
            key={item.href}
            href={item.href}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-2.5 rounded-full text-sm",
              expanded
                ? "w-11 justify-center lg:w-full lg:justify-start lg:px-2.5"
                : "w-11 justify-center",
              active
                ? "bg-primary font-semibold text-primary-foreground shadow-elevated-xs"
                : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            )}
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
  const { roles: roleRows } = useAuth();
  const canReorder = canReorderSidebarNav(roleRows);
  const { order, itemOrders, save, saveItems } = useSidebarNavOrder();
  const { hasDirectReports } = useHasDirectReports();
  const showMyDay = showsMyDayNav(roles, hasDirectReports);
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  const [moreOpen, setMoreOpen] = useState(false);
  const [flyoutId, setFlyoutId] = useState<string | null>(null);
  const [tabletSheetId, setTabletSheetId] = useState<string | null>(null);
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded);
  const setSidebarExpanded = useAppStore((s) => s.setSidebarExpanded);
  const surgeMode = useAppStore((s) => s.surgeMode);
  const expandLabel = sidebarExpanded ? t("nav.pinSidebar") : t("nav.showLabels");
  const ExpandIcon = sidebarExpanded ? PanelLeftClose : PanelLeft;

  const prefetchRoute = useCallback(
    (href: string) => {
      const path = (href.split("#")[0] ?? href).split("?")[0] || "/";
      if (SIDEBAR_HEAVY_ROUTES.has(path)) return;
      router.prefetch(path);
    },
    [router],
  );

  const moveDepartment = useCallback(
    (activeId: string, overId: string) => {
      if (activeId.startsWith("nav-item:")) return;
      const next = moveNavDepartment(order, activeId, overId);
      void save(next).catch((error: Error) => toast.error(error.message));
    },
    [order, save],
  );
  const moveItem = useCallback(
    (bucket: string, activeKey: string, overKey: string) => {
      const next = moveNavItem(itemOrders, bucket, activeKey, overKey);
      void saveItems(next).catch((error: Error) => toast.error(error.message));
    },
    [itemOrders, saveItems],
  );
  const primary = useMemo(() => {
    const rail = orderPrimaryRail(getPrimaryRailNav(roles), order);
    const seen = new Set<string>();
    return rail.filter((item) => {
      if (seen.has(item.departmentId)) return false;
      seen.add(item.departmentId);
      return true;
    });
  }, [order, roles]);
  const departments = useMemo(
    () =>
      applySidebarItemOrder(
        orderDepartments(mergeReportingManagerDepartments(getVisibleDepartments(roles), hasDirectReports), order),
        itemOrders,
      ),
    [hasDirectReports, itemOrders, order, roles],
  );
  const managerRail = useMemo(
    () => reportingManagerRailItems(hasDirectReports, new Set(primary.map((item) => item.departmentId))),
    [hasDirectReports, primary],
  );
  const employeeFlat = useMemo(
    () => (usesEmployeeFlatRail(roles, hasDirectReports) ? getEmployeeFlatRail(roles) : []),
    [hasDirectReports, roles],
  );
  const pinnedEssentials = useMemo(
    () => employeePinnedRailItems(roles, hasDirectReports, new Set(primary.map((item) => item.href))),
    [hasDirectReports, primary, roles],
  );
  const railExtras = useMemo(() => [...managerRail, ...pinnedEssentials], [managerRail, pinnedEssentials]);
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
  const tabletSheetItem = useMemo(
    () => primary.find((item) => item.departmentId === tabletSheetId) ?? null,
    [primary, tabletSheetId],
  );

  useEffect(() => {
    setFlyoutId(null);
    setTabletSheetId(null);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (primary.length === 0) return;
    const warm = () => {
      const connection = (
        navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
      ).connection;
      if (connection?.saveData) return;
      if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return;
      const allowed = new Set(primary.map((item) => item.href));
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
  }, [primary, router]);

  return (
    <ItemDragScope enabled={canReorder} label={t("sidebarOrder.dragItem")} onMove={moveItem}>
      {/* Phone uses the bottom nav. Tablet (md–lg) icon rail + desktop (lg+) expandable rail. */}
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
                <span className="hidden lg:inline">
                  <BitsShine text={t("app.name")} color="#ffffff" shineColor="#6d4aff" speed={6} />
                </span>
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
          {canReorder ? (
            <Link
              href="/admin/sidebar#arrange-automatically"
              title={t("sidebarOrder.arrangeAuto")}
              aria-label={t("sidebarOrder.arrangeAuto")}
              className={cn(
                "mb-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10 text-foreground",
                sidebarExpanded &&
                  "lg:h-auto lg:w-full lg:justify-start lg:gap-2 lg:rounded-full lg:px-2.5 lg:py-2 lg:text-xs lg:font-semibold",
              )}
            >
              <Sparkles className="h-4 w-4 shrink-0 stroke-[1.5]" aria-hidden />
              {sidebarExpanded ? (
                <span className="hidden min-w-0 truncate lg:inline">{t("sidebarOrder.arrangeAuto")}</span>
              ) : (
                <span className="sr-only">{t("sidebarOrder.arrangeAuto")}</span>
              )}
            </Link>
          ) : null}
          <nav
            className={cn(
              "flex flex-col items-center",
              surgeMode ? "gap-0.5" : "gap-1",
              sidebarExpanded && "lg:items-stretch lg:px-0",
            )}
          >
            {employeeFlat.length > 0 ? (
              <ReportingManagerRail
                items={employeeFlat}
                pathname={pathname}
                t={t}
                expanded={sidebarExpanded}
              />
            ) : (
              <>
            {showMyDay ? (
              <EmployeeSectionRail
                roles={roles}
                pathname={pathname}
                t={t}
                expanded={sidebarExpanded}
              />
            ) : null}
            <ReportingManagerRail
              items={railExtras}
              pathname={pathname}
              t={t}
              expanded={sidebarExpanded}
            />
            {primary.map((item) => {
              const department = departmentsById.get(item.departmentId) ?? null;
              const moduleActive = department ? isDepartmentActive(department, pathname) : false;
              const groupLabel = department ? t(department.labelKey) : t(item.labelKey);
              const Icon = item.icon;
              return (
                <div key={item.departmentId} className="w-full">
                  <div className="lg:hidden">
                    <Button
                      type="button"
                      variant={moduleActive ? "default" : "ghost"}
                      size="icon"
                      title={groupLabel}
                      aria-label={groupLabel}
                      aria-haspopup="dialog"
                      onClick={() => setTabletSheetId(item.departmentId)}
                      className="h-11 w-11"
                    >
                      <Icon className="h-[18px] w-[18px] stroke-[1.5]" />
                    </Button>
                  </div>
                  <div className="hidden lg:block">
                    <NavDragRow
                      id={item.departmentId}
                      enabled={canReorder && sidebarExpanded}
                      label={t("sidebarOrder.drag")}
                      onMove={moveDepartment}
                    >
                      <RailIconWithFlyout
                        item={item}
                        pathname={pathname}
                        department={department}
                        t={t}
                        prefetchRoute={prefetchRoute}
                        openId={flyoutId}
                        setOpenId={setFlyoutId}
                        expanded={sidebarExpanded}
                      />
                    </NavDragRow>
                  </div>
                </div>
              );
            })}
              </>
            )}
          </nav>
          {employeeFlat.length === 0 && hasOverflow && (
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
                    canDrag={canReorder}
                    onMove={moveDepartment}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </aside>

      {tabletSheetItem && (
        <ModuleSubsSheet
          item={tabletSheetItem}
          pathname={pathname}
          department={departmentsById.get(tabletSheetItem.departmentId) ?? null}
          t={t}
          prefetchRoute={prefetchRoute}
          open={Boolean(tabletSheetId)}
          onOpenChange={(next) => {
            if (!next) setTabletSheetId(null);
          }}
        />
      )}
    </ItemDragScope>
  );
}

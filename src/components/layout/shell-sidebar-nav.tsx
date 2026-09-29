"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isShellLinkActive, type ShellGroupView } from "@/lib/shell-groups";
import { cn } from "@/lib/utils";

function GroupLinks({
  group,
  pathname,
  t,
  prefetchRoute,
  onNavigate,
}: {
  group: ShellGroupView;
  pathname: string;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
  onNavigate?: () => void;
}) {
  const hrefs = group.items.map((item) => item.href);
  return (
    <ul className="space-y-0.5 p-1">
      {group.items.map((item) => {
        const active = isShellLinkActive(item.href, pathname, hrefs);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch
              data-shell-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              onMouseEnter={() => prefetchRoute(item.href)}
              onFocus={() => prefetchRoute(item.href)}
              className={cn(
                "block truncate rounded-full px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-foreground/80 hover:bg-secondary hover:text-foreground",
              )}
            >
              {t(item.labelKey)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ExpandedGroup({
  group,
  pathname,
  expandedOpen,
  setExpandedOpen,
  t,
  prefetchRoute,
}: {
  group: ShellGroupView;
  pathname: string;
  expandedOpen: boolean;
  setExpandedOpen: (open: boolean) => void;
  t: (key: string) => string;
  prefetchRoute: (href: string) => void;
}) {
  const label = t(group.labelKey);
  const Icon = group.icon;
  const hrefs = group.items.map((item) => item.href);
  const active = group.items.some((item) => isShellLinkActive(item.href, pathname, hrefs));

  if (group.items.length === 1) {
    const item = group.items[0];
    return (
      <Link
        href={item.href}
        prefetch
        data-shell-active={active ? "true" : "false"}
        aria-current={active ? "page" : undefined}
        title={label}
        onMouseEnter={() => prefetchRoute(item.href)}
        className={cn(
          "relative flex h-11 items-center gap-2.5 rounded-full px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )}
      >
        <span className="ds-nav-indicator absolute inset-y-2 start-1 w-0.5 rounded-full bg-[var(--electric)]" data-active={active ? "true" : "false"} />
        <Icon className="h-[18px] w-[18px] shrink-0 stroke-[1.5]" aria-hidden />
        <span className="truncate">{label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={expandedOpen}
        onClick={() => setExpandedOpen(!expandedOpen)}
        className={cn(
          "relative flex h-11 w-full items-center gap-2.5 rounded-full px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
        )}
      >
        <span className="ds-nav-indicator absolute inset-y-2 start-1 w-0.5 rounded-full bg-[var(--electric)]" data-active={active ? "true" : "false"} />
        <Icon className="h-[18px] w-[18px] shrink-0 stroke-[1.5]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-start">{label}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none", expandedOpen && "rotate-180")}
          aria-hidden
        />
      </button>
      {expandedOpen ? (
        <div className="ms-3 mt-0.5 max-h-64 overflow-y-auto border-s border-border/70 ps-1">
          <GroupLinks group={group} pathname={pathname} t={t} prefetchRoute={prefetchRoute} />
        </div>
      ) : null}
    </div>
  );
}

export function ShellSidebarNav({
  groups,
  pathname,
  sidebarExpanded,
  surgeMode,
  prefetchRoute,
}: {
  groups: ShellGroupView[];
  pathname: string;
  sidebarExpanded: boolean;
  surgeMode: boolean;
  prefetchRoute: (href: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const flyoutSide = i18n.dir() === "rtl" ? "left" : "right";
  const activeTreeId = useMemo(() => {
    const active = groups.find((group) =>
      group.items.some((item) =>
        isShellLinkActive(
          item.href,
          pathname,
          group.items.map((entry) => entry.href),
        ),
      ),
    );
    return active?.id ?? null;
  }, [groups, pathname]);
  const [treeOverride, setTreeOverride] = useState<string | null | undefined>(undefined);
  const [flyoutId, setFlyoutId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const treeId = treeOverride === undefined ? activeTreeId : treeOverride;

  useEffect(() => {
    setFlyoutId(null);
    setSheetId(null);
    setTreeOverride(undefined);
  }, [pathname]);

  const sheetGroup = groups.find((group) => group.id === sheetId) ?? null;

  return (
    <TooltipProvider delayDuration={250}>
      <nav
        aria-label={t("nav.navigation")}
        className={cn(
          "flex w-full flex-col",
          surgeMode ? "gap-0.5" : "gap-1",
          sidebarExpanded ? "lg:items-stretch" : "items-center",
        )}
      >
        {groups.map((group) => {
          const label = t(group.labelKey);
          const Icon = group.icon;
          const hrefs = group.items.map((item) => item.href);
          const active = group.items.some((item) => isShellLinkActive(item.href, pathname, hrefs));
          const sole = group.items.length === 1 ? group.items[0] : null;

          return (
            <div key={group.id} className="w-full">
              <div className="flex justify-center lg:hidden">
                <Button
                  type="button"
                  variant={active ? "default" : "ghost"}
                  size="icon"
                  className="relative h-11 w-11"
                  aria-label={label}
                  aria-haspopup={sole ? undefined : "dialog"}
                  aria-current={sole && active ? "page" : undefined}
                  onClick={() => {
                    if (sole) return;
                    setSheetId(group.id);
                  }}
                  asChild={Boolean(sole)}
                >
                  {sole ? (
                    <Link href={sole.href} prefetch title={label}>
                      <span className="ds-nav-indicator absolute inset-y-2 start-1 w-0.5 rounded-full bg-[var(--electric)]" data-active={active ? "true" : "false"} />
                      <Icon className="h-[18px] w-[18px] stroke-[1.5]" aria-hidden />
                    </Link>
                  ) : (
                    <>
                      <span className="ds-nav-indicator absolute inset-y-2 start-1 w-0.5 rounded-full bg-[var(--electric)]" data-active={active ? "true" : "false"} />
                      <Icon className="h-[18px] w-[18px] stroke-[1.5]" aria-hidden />
                    </>
                  )}
                </Button>
              </div>

              <div className="hidden lg:block">
                {sidebarExpanded ? (
                  <ExpandedGroup
                    group={group}
                    pathname={pathname}
                    expandedOpen={treeId === group.id}
                    setExpandedOpen={(next) => setTreeOverride(next ? group.id : null)}
                    t={t}
                    prefetchRoute={prefetchRoute}
                  />
                ) : sole ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant={active ? "default" : "ghost"} size="icon" className="relative h-11 w-11" asChild>
                        <Link href={sole.href} prefetch aria-label={label} aria-current={active ? "page" : undefined}>
                          <span className="ds-nav-indicator absolute inset-y-2 start-1 w-0.5 rounded-full bg-[var(--electric)]" data-active={active ? "true" : "false"} />
                          <Icon className="h-[18px] w-[18px] stroke-[1.5]" aria-hidden />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side={flyoutSide}>{label}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Popover
                    open={flyoutId === group.id}
                    onOpenChange={(next) => setFlyoutId(next ? group.id : null)}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant={active ? "default" : "ghost"}
                            size="icon"
                            className="relative h-11 w-11"
                            aria-label={label}
                            aria-haspopup="menu"
                            aria-expanded={flyoutId === group.id}
                          >
                            <span className="ds-nav-indicator absolute inset-y-2 start-1 w-0.5 rounded-full bg-[var(--electric)]" data-active={active ? "true" : "false"} />
                            <Icon className="h-[18px] w-[18px] stroke-[1.5]" aria-hidden />
                          </Button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side={flyoutSide}>{label}</TooltipContent>
                    </Tooltip>
                    <PopoverContent
                      side={flyoutSide}
                      align="start"
                      sideOffset={10}
                      className="z-[80] w-72 rounded-[1.25rem] p-0"
                      onOpenAutoFocus={(event) => event.preventDefault()}
                    >
                      <div className="border-b border-border/70 px-3.5 py-2.5">
                        <p className="text-sm font-semibold">{label}</p>
                      </div>
                      <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
                        <GroupLinks
                          group={group}
                          pathname={pathname}
                          t={t}
                          prefetchRoute={prefetchRoute}
                          onNavigate={() => setFlyoutId(null)}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </nav>

      <Sheet open={Boolean(sheetGroup)} onOpenChange={(next) => { if (!next) setSheetId(null); }}>
        <SheetContent side="bottom" className="flex max-h-[70vh] flex-col rounded-t-[var(--radius-2xl)] lg:hidden">
          <SheetHeader className="shrink-0">
            <SheetTitle>{sheetGroup ? t(sheetGroup.labelKey) : ""}</SheetTitle>
          </SheetHeader>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
            {sheetGroup ? (
              <GroupLinks
                group={sheetGroup}
                pathname={pathname}
                t={t}
                prefetchRoute={prefetchRoute}
                onNavigate={() => setSheetId(null)}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}

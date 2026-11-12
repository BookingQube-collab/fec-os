"use client";

import {
  Activity,
  Bell,
  Bot,
  FileStack,
  Home,
  MessagesSquare,
  Palette,
  PlusSquare,
  Search,
  Settings,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PillTabScroller, pillTabItemClass } from "@/components/react-bits/pill-tab-scroller";
import { usePermission } from "@/hooks/use-permission";
import { EMBER_TABS, type EmberTabId } from "@/lib/ember";

const ICONS: Record<EmberTabId, LucideIcon> = {
  workspace: Home,
  rooms: MessagesSquare,
  newRoom: PlusSquare,
  dms: Users,
  activity: Activity,
  search: Search,
  files: FileStack,
  bots: Bot,
  agents: Sparkles,
  profile: UserRound,
  push: Bell,
  settings: Settings,
  styles: Palette,
};

export function EmberModuleNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const canManage = usePermission("ember.manage");

  const tabs = EMBER_TABS.filter((tab) => tab.capability === "ember.view" || canManage);

  return (
    <PillTabScroller label={t("emberNav.label")}>
      {tabs.map((tab) => {
        const active =
          tab.id === "workspace" ? pathname === "/ember" : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = ICONS[tab.id];
        return (
          <Link key={tab.id} href={tab.href} aria-current={active ? "page" : undefined} className={pillTabItemClass(active)}>
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            {t(`emberNav.${tab.navKey}`)}
          </Link>
        );
      })}
    </PillTabScroller>
  );
}

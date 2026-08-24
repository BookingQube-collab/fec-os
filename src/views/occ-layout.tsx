"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AlertTriangle, LayoutGrid, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

const TABS = [
  { href: "/occ", labelKey: "command.tabs.estate", icon: LayoutGrid, exact: true },
  { href: "/occ/exceptions", labelKey: "command.tabs.exceptions", icon: AlertTriangle, exact: false },
  { href: "/occ/protocols", labelKey: "command.tabs.protocols", icon: ShieldAlert, exact: false },
] as const;

function OccLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          kicker={t("command.kicker")}
          title={t("command.title")}
          subtitle={t("command.subtitle")}
        />
        <nav className="flex items-center gap-1" aria-label={t("command.tabsAria")}>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Button key={tab.href} asChild variant={active ? "default" : "ghost"} size="sm">
                <Link href={tab.href}>
                  <Icon className="h-3.5 w-3.5 stroke-[1.5]" />
                  {t(tab.labelKey)}
                </Link>
              </Button>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}

export default OccLayout;

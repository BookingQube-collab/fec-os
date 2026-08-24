"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/layout/page-header";
import { E3_NAV_ITEMS } from "@/lib/compliance-tracker/constants";
import { cn } from "@/lib/utils";

export function E3TrackerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShieldCheck}
        kicker={t("e3Tracker.layout.kicker")}
        title={t("e3Tracker.layout.title")}
        subtitle={t("e3Tracker.layout.subtitle")}
      />
      <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
        {E3_NAV_ITEMS.map((item) => {
          const active =
            item.href === "/compliance/e3-tracker"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-elevated-xs"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

export function E3TrackerPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="page-title text-[1.35rem]">{title}</h2>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

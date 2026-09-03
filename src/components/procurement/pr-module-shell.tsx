"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/procurement", labelKey: "procurement.chrome.purchases", match: "purchases" as const },
  { href: "/vendors", labelKey: "procurement.chrome.vendors", match: "vendors" as const, capability: "vendors.view" as const },
  { href: "/procurement/analytics", labelKey: "procurement.chrome.analytics", match: "analytics" as const },
  { href: "/procurement/help", labelKey: "procurement.chrome.help", match: "help" as const },
  {
    href: "/procurement/config",
    labelKey: "procurement.chrome.config",
    match: "config" as const,
    capability: "procurement.configure" as const,
  },
];

function chromeMatch(pathname: string, match: (typeof ITEMS)[number]["match"]) {
  if (match === "vendors") return pathname.startsWith("/vendors");
  if (match === "analytics") return pathname.startsWith("/procurement/analytics");
  if (match === "help") return pathname.startsWith("/procurement/help");
  if (match === "config") return pathname.startsWith("/procurement/config");
  return (
    pathname === "/procurement" ||
    pathname.startsWith("/procurement/requisitions") ||
    pathname.startsWith("/procurement/my-requests") ||
    pathname.startsWith("/procurement/approvals")
  );
}

export function PrModuleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const canVendors = usePermission("vendors.view");
  const canConfig = usePermission("procurement.configure");

  return (
    <div className="pr-module space-y-5">
      <nav className="pr-chrome-nav" aria-label={t("procurement.chrome.nav")}>
        {ITEMS.map((item) => {
          if (item.capability === "vendors.view" && !canVendors) return null;
          if (item.capability === "procurement.configure" && !canConfig) return null;
          const active = chromeMatch(pathname, item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("pr-chrome-link", active && "pr-chrome-link-active")}
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

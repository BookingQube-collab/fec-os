"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { E3_NAV_ITEMS } from "@/lib/compliance-tracker/constants";
import { cn } from "@/lib/utils";

export function E3TrackerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5 font-sans">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#0B1F3A]">
          E3 AMC & Compliance Tracker
        </h1>
        <p className="mt-1 text-sm text-[#475569]">
          Annual maintenance contracts, licenses, and compliance across all FEC locations.
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 border-b border-[#E2E8F0] pb-3">
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
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[#0B1F3A] text-white"
                  : "text-[#0B1F3A] hover:bg-[#F2F4F7] hover:text-[#E8821E]",
              )}
            >
              {item.label}
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
        <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-[#64748B]">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

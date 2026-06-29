"use client";

import { usePathname } from "next/navigation";

import { ComplianceExpiryBanner } from "@/components/compliance/compliance-expiry-banner";

/** Shows compliance expiry alert banner on dashboard and compliance pages for eligible roles. */
export function GlobalComplianceExpiryBanner() {
  const pathname = usePathname() ?? "";
  const show =
    pathname === "/" ||
    pathname.startsWith("/compliance") ||
    pathname.startsWith("/compliance-documents");

  if (!show) return null;

  return <ComplianceExpiryBanner />;
}

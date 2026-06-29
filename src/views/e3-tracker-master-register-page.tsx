"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileStack } from "lucide-react";

import { E3ComplianceRegisterTable } from "@/components/compliance-tracker/E3ComplianceRegisterTable";
import { E3RegisterPagination } from "@/components/compliance-tracker/E3RegisterPagination";
import { E3TrackerPageShell } from "@/components/compliance-tracker/E3TrackerLayout";
import { FilterRow } from "@/components/compliance-tracker/FilterRow";
import { KpiStrip } from "@/components/compliance-tracker/KpiStrip";
import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useE3TrackerRegister } from "@/hooks/queries/useE3TrackerQueries";
import { LICENSE_DOCUMENT_CATEGORIES } from "@/lib/compliance-tracker/license-documents-config";

export default function E3MasterRegisterPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState({ location: "All", field: "All" });
  const [licenseOnly, setLicenseOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useE3TrackerRegister({
    ...filter,
    page,
    categories: licenseOnly ? [...LICENSE_DOCUMENT_CATEGORIES] : undefined,
  });

  const kpis = data?.kpis ?? { total: 0, compliant: 0, expiring30: 0, overdue: 0, missing: 0 };
  const rows = data?.items ?? [];

  function handleFilterChange(next: { location: string; field: string }) {
    setFilter(next);
    setPage(1);
  }

  return (
    <E3TrackerPageShell
      title="Master Register"
      subtitle="Full compliance register across all categories, locations, and areas."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterRow value={filter} onChange={handleFilterChange} />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="license-only"
              checked={licenseOnly}
              onCheckedChange={(checked) => {
                setLicenseOnly(checked === true);
                setPage(1);
              }}
            />
            <Label htmlFor="license-only" className="text-sm font-medium text-[#0B1F3A]">
              {t("e3Tracker.licenseDocs.filterOnly")}
            </Label>
          </div>
          <Button variant="outline" size="sm" asChild className="border-[#E8A33D]">
            <Link href="/compliance/e3-tracker/license-documents">
              <FileStack className="mr-1.5 h-4 w-4" />
              {t("e3Tracker.licenseDocs.title")}
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? <KpiSkeletonStrip count={5} /> : <KpiStrip kpis={kpis} />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : (
        <>
          <E3ComplianceRegisterTable rows={rows} showBulkActions />
          <E3RegisterPagination
            page={data?.page ?? 1}
            limit={data?.limit ?? 50}
            total={data?.total ?? 0}
            onPageChange={setPage}
          />
        </>
      )}
    </E3TrackerPageShell>
  );
}
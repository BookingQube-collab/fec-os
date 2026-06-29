"use client";



import { useState } from "react";



import { E3ComplianceRegisterTable } from "@/components/compliance-tracker/E3ComplianceRegisterTable";

import { E3RegisterPagination } from "@/components/compliance-tracker/E3RegisterPagination";

import { E3TrackerPageShell } from "@/components/compliance-tracker/E3TrackerLayout";

import { FilterRow } from "@/components/compliance-tracker/FilterRow";

import { KpiStrip } from "@/components/compliance-tracker/KpiStrip";

import { useE3TrackerMissingDocuments } from "@/hooks/queries/useE3TrackerQueries";

import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";

import { Skeleton } from "@/components/ui/skeleton";



export default function E3MissingDocumentsPage() {

  const [filter, setFilter] = useState({ location: "All", field: "All" });

  const [page, setPage] = useState(1);

  const { data, isLoading } = useE3TrackerMissingDocuments({ ...filter, page });



  const kpis = data?.kpis ?? { total: 0, compliant: 0, expiring30: 0, overdue: 0, missing: 0 };

  const rows = data?.items ?? [];



  function handleFilterChange(next: { location: string; field: string }) {

    setFilter(next);

    setPage(1);

  }



  return (

    <E3TrackerPageShell

      title="Missing Documents"

      subtitle="Items with no expiry date on file. Status is always computed as Missing."

    >

      <FilterRow value={filter} onChange={handleFilterChange} />

      {isLoading ? <KpiSkeletonStrip count={5} /> : <KpiStrip kpis={kpis} />}

      {isLoading ? (

        <div className="space-y-2">

          {Array.from({ length: 8 }).map((_, i) => (

            <Skeleton key={i} className="h-10 w-full rounded-md" />

          ))}

        </div>

      ) : (

        <>

          <E3ComplianceRegisterTable

            rows={rows}

            emptyMessage="No missing documents for the current filters."

          />

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



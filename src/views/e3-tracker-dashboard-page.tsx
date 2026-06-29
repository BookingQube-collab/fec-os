"use client";



import { Suspense, useMemo, useState } from "react";

import dynamic from "next/dynamic";



import { E3TrackerPageShell } from "@/components/compliance-tracker/E3TrackerLayout";

import { FilterRow } from "@/components/compliance-tracker/FilterRow";

import { KpiStrip } from "@/components/compliance-tracker/KpiStrip";

import { useE3TrackerSummary } from "@/hooks/queries/useE3TrackerQueries";

import { E3_LOCATIONS, type ComplianceStatus } from "@/lib/compliance-tracker/constants";

import { enrichItem, formatDisplayDate, statusBadgeStyle } from "@/lib/compliance-tracker/status";

import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";

import { Skeleton } from "@/components/ui/skeleton";



const E3TrackerDashboardCharts = dynamic(

  () =>

    import("@/components/compliance-tracker/E3TrackerDashboardCharts").then(

      (m) => m.E3TrackerDashboardCharts,

    ),

  {

    ssr: false,

    loading: () => (

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">

        {Array.from({ length: 3 }).map((_, i) => (

          <Skeleton key={i} className="h-72 rounded-lg" />

        ))}

      </div>

    ),

  },

);



const STATUS_ORDER = ["Compliant", "Upcoming", "Warning", "Critical", "Overdue", "Missing"] as const;



export default function E3TrackerDashboardPage() {

  const [filter, setFilter] = useState({ location: "All", field: "All" });

  const { data, isLoading } = useE3TrackerSummary(filter);



  const kpis = data?.kpis ?? { total: 0, compliant: 0, expiring30: 0, overdue: 0, missing: 0 };



  const statusByLocation = useMemo(() => {

    const grouped = data?.statusByLocation ?? [];

    return E3_LOCATIONS.map((location) => {

      const entry: Record<string, string | number> = { location: location.split(" ")[0] };

      for (const status of STATUS_ORDER) {

        entry[status] = grouped.find((g) => g.location === location && g.status === status)?.count ?? 0;

      }

      return entry;

    });

  }, [data?.statusByLocation]);



  const statusPie = data?.statusCounts ?? [];

  const categoryChart = (data?.categoryCounts ?? []).slice(0, 11);

  const soonest = data?.topExpiring ?? [];



  return (

    <E3TrackerPageShell

      title="Compliance Dashboard"

      subtitle="Portfolio-wide KPIs, charts, and soonest expiring items."

    >

      <FilterRow value={filter} onChange={setFilter} />

      {isLoading ? <KpiSkeletonStrip count={5} /> : <KpiStrip kpis={kpis} />}



      {isLoading ? (

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">

          {Array.from({ length: 3 }).map((_, i) => (

            <Skeleton key={i} className="h-72 rounded-lg" />

          ))}

        </div>

      ) : (

        <Suspense

          fallback={

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">

              {Array.from({ length: 3 }).map((_, i) => (

                <Skeleton key={i} className="h-72 rounded-lg" />

              ))}

            </div>

          }

        >

          <E3TrackerDashboardCharts

            statusByLocation={statusByLocation}

            statusPie={statusPie}

            categoryChart={categoryChart}

          />

        </Suspense>

      )}



      <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">

        <h3 className="font-display mb-3 text-lg font-semibold text-[#0B1F3A]">

          Top 10 Soonest Expiring

        </h3>

        {isLoading ? (

          <div className="space-y-2">

            {Array.from({ length: 5 }).map((_, i) => (

              <Skeleton key={i} className="h-10 w-full rounded-md" />

            ))}

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead>

                <tr className="border-b text-left text-[#64748B]">

                  <th className="pb-2 pr-4">ID</th>

                  <th className="pb-2 pr-4">Location</th>

                  <th className="pb-2 pr-4">Category</th>

                  <th className="pb-2 pr-4">Item</th>

                  <th className="pb-2 pr-4">Expiry</th>

                  <th className="pb-2 pr-4">Days</th>

                  <th className="pb-2">Status</th>

                </tr>

              </thead>

              <tbody>

                {soonest.map((row) => {

                  const enriched = row.computed_status ? row : enrichItem(row);

                  return (

                    <tr key={row.id} className="border-b border-[#F1F5F9]">

                      <td className="py-2 pr-4 font-mono text-xs">{enriched.id}</td>

                      <td className="py-2 pr-4">{enriched.location}</td>

                      <td className="py-2 pr-4">{enriched.category}</td>

                      <td className="py-2 pr-4">{enriched.item}</td>

                      <td className="py-2 pr-4">{formatDisplayDate(enriched.expiry_date)}</td>

                      <td className="py-2 pr-4">{enriched.days_to_expiry}</td>

                      <td className="py-2">

                        <span

                          className="rounded px-2 py-0.5 text-xs font-semibold"

                          style={statusBadgeStyle(enriched.computed_status as ComplianceStatus)}

                        >

                          {enriched.computed_status}

                        </span>

                      </td>

                    </tr>

                  );

                })}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </E3TrackerPageShell>

  );

}



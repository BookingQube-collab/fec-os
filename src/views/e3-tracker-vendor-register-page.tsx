"use client";



import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";

import { useMemo, useState } from "react";



import { E3TrackerPageShell } from "@/components/compliance-tracker/E3TrackerLayout";

import { FilterRow } from "@/components/compliance-tracker/FilterRow";

import { KpiStrip } from "@/components/compliance-tracker/KpiStrip";

import { useE3TrackerVendors } from "@/hooks/queries/useE3TrackerQueries";

import { searchFilter } from "@/lib/compliance-tracker/aggregations";

import { E3_VENDOR_STATUS_COLORS } from "@/lib/compliance-tracker/constants";

import { Input } from "@/components/ui/input";

import {

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableHeader,

  TableRow,

} from "@/components/ui/table";

import { KpiSkeletonStrip } from "@/components/loading/page-skeleton";

import { Skeleton } from "@/components/ui/skeleton";



type SortKey =

  | "vendor"

  | "locationsServed"

  | "totalContracts"

  | "compliant"

  | "expiring30"

  | "overdue"

  | "missing"

  | "complianceScore"

  | "overallStatus";



export default function E3VendorRegisterPage() {

  const [filter, setFilter] = useState({ location: "All", field: "All" });

  const [search, setSearch] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("vendor");

  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data, isLoading } = useE3TrackerVendors(filter);



  const kpis = data?.kpis ?? { total: 0, compliant: 0, expiring30: 0, overdue: 0, missing: 0 };

  const vendors = useMemo(() => data?.vendors ?? [], [data?.vendors]);



  const tableRows = useMemo(() => {

    let rows = searchFilter(vendors, search, ["vendor", "overallStatus"]);

    rows = [...rows].sort((a, b) => {

      const av = a[sortKey];

      const bv = b[sortKey];

      if (typeof av === "number" && typeof bv === "number") {

        return sortDir === "asc" ? av - bv : bv - av;

      }

      const cmp = String(av).localeCompare(String(bv));

      return sortDir === "asc" ? cmp : -cmp;

    });

    return rows;

  }, [vendors, search, sortKey, sortDir]);



  function toggleSort(key: SortKey) {

    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));

    else {

      setSortKey(key);

      setSortDir("asc");

    }

  }



  function SortIcon({ column }: { column: SortKey }) {

    if (sortKey !== column) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;

    return sortDir === "asc" ? (

      <ArrowUp className="ml-1 inline h-3 w-3" />

    ) : (

      <ArrowDown className="ml-1 inline h-3 w-3" />

    );

  }



  return (

    <E3TrackerPageShell

      title="Vendor Register"

      subtitle="Aggregated vendor compliance scores scoped to location and area filters."

    >

      <FilterRow value={filter} onChange={setFilter} />

      {isLoading ? <KpiSkeletonStrip count={5} /> : <KpiStrip kpis={kpis} />}



      <div className="relative max-w-md">

        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        <Input

          value={search}

          onChange={(e) => setSearch(e.target.value)}

          placeholder="Search vendors..."

          className="pl-9"

          disabled={isLoading}

        />

      </div>



      {isLoading ? (

        <div className="space-y-2">

          {Array.from({ length: 8 }).map((_, i) => (

            <Skeleton key={i} className="h-10 w-full rounded-md" />

          ))}

        </div>

      ) : (

        <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">

          <Table>

            <TableHeader>

              <TableRow className="bg-[#0B1F3A] hover:bg-[#0B1F3A]">

                {(

                  [

                    ["vendor", "Vendor"],

                    ["locationsServed", "Locations Served"],

                    ["totalContracts", "Total Contracts"],

                    ["compliant", "Compliant"],

                    ["expiring30", "Expiring ≤30 Days"],

                    ["overdue", "Overdue"],

                    ["missing", "Missing"],

                    ["complianceScore", "Compliance Score %"],

                    ["overallStatus", "Overall Status"],

                  ] as const

                ).map(([key, label]) => (

                  <TableHead

                    key={key}

                    className="cursor-pointer whitespace-nowrap text-white"

                    onClick={() => toggleSort(key)}

                  >

                    {label}

                    <SortIcon column={key} />

                  </TableHead>

                ))}

              </TableRow>

            </TableHeader>

            <TableBody>

              {tableRows.map((row) => {

                const colors = E3_VENDOR_STATUS_COLORS[row.overallStatus];

                return (

                  <TableRow key={row.vendor}>

                    <TableCell className="font-medium">{row.vendor}</TableCell>

                    <TableCell>{row.locationsServed}</TableCell>

                    <TableCell>{row.totalContracts}</TableCell>

                    <TableCell>{row.compliant}</TableCell>

                    <TableCell>{row.expiring30}</TableCell>

                    <TableCell>{row.overdue}</TableCell>

                    <TableCell>{row.missing}</TableCell>

                    <TableCell>{row.complianceScore}%</TableCell>

                    <TableCell>

                      <span

                        className="inline-block rounded px-2 py-0.5 text-xs font-semibold"

                        style={{ backgroundColor: colors.bg, color: colors.text }}

                      >

                        {row.overallStatus}

                      </span>

                    </TableCell>

                  </TableRow>

                );

              })}

            </TableBody>

          </Table>

        </div>

      )}

    </E3TrackerPageShell>

  );

}



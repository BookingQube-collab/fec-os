"use client";



import { Search } from "lucide-react";

import { useMemo, useState } from "react";



import { E3TrackerPageShell } from "@/components/compliance-tracker/E3TrackerLayout";

import { FilterRow } from "@/components/compliance-tracker/FilterRow";

import { KpiStrip } from "@/components/compliance-tracker/KpiStrip";

import { useE3TrackerScheduler } from "@/hooks/queries/useE3TrackerQueries";

import { searchFilter } from "@/lib/compliance-tracker/aggregations";

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



const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];



export default function E3MonthlySchedulerPage() {

  const [filter, setFilter] = useState({ location: "All", field: "All" });

  const [search, setSearch] = useState("");

  const { data, isLoading } = useE3TrackerScheduler(filter);



  const schedulerRows = useMemo(() => data?.items ?? [], [data?.items]);

  const schedulerKpis = data?.kpis ?? { total: 0, scheduled: 0, pendingSetup: 0, dueThisMonth: 0 };



  const tableRows = useMemo(

    () =>

      searchFilter(schedulerRows, search, [

        "id",

        "location",

        "category",

        "item",

        "vendor",

        "frequency",

      ]),

    [schedulerRows, search],

  );



  return (

    <E3TrackerPageShell

      title="Monthly Scheduler"

      subtitle="AMC service schedule by month. Dots indicate due months based on frequency and anchor date."

    >

      <FilterRow value={filter} onChange={setFilter} />

      {isLoading ? (

        <KpiSkeletonStrip count={4} />

      ) : (

        <KpiStrip

          kpis={{ total: 0, compliant: 0, expiring30: 0, overdue: 0, missing: 0 }}

          extra={[

            {

              label: "Total AMC Items",

              value: schedulerKpis.total,

              bg: "#0B1F3A",

              text: "#FFFFFF",

            },

            {

              label: "Scheduled",

              value: schedulerKpis.scheduled,

              bg: "#1E7B45",

              text: "#FFFFFF",

            },

            {

              label: "Pending Setup",

              value: schedulerKpis.pendingSetup,

              bg: "#E8A33D",

              text: "#0A1228",

            },

            {

              label: "Due This Month",

              value: schedulerKpis.dueThisMonth,

              bg: "#C0392B",

              text: "#FFFFFF",

            },

          ]}

        />

      )}



      <div className="relative max-w-md">

        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        <Input

          value={search}

          onChange={(e) => setSearch(e.target.value)}

          placeholder="Search scheduler..."

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

                <TableHead className="text-white">ID</TableHead>

                <TableHead className="text-white">Location</TableHead>

                <TableHead className="text-white">Area</TableHead>

                <TableHead className="text-white">Category</TableHead>

                <TableHead className="min-w-[160px] text-white">Item</TableHead>

                <TableHead className="text-white">Vendor</TableHead>

                <TableHead className="text-white">Frequency</TableHead>

                <TableHead className="text-white">Status</TableHead>

                {MONTHS.map((m) => (

                  <TableHead key={m} className="text-center text-white">

                    {m}

                  </TableHead>

                ))}

              </TableRow>

            </TableHeader>

            <TableBody>

              {tableRows.map((row) => (

                <TableRow key={row.id}>

                  <TableCell className="font-mono text-xs">{row.id}</TableCell>

                  <TableCell>{row.location}</TableCell>

                  <TableCell>{row.area}</TableCell>

                  <TableCell>{row.category}</TableCell>

                  <TableCell>{row.item}</TableCell>

                  <TableCell>{row.vendor}</TableCell>

                  <TableCell>{row.frequency}</TableCell>

                  <TableCell>

                    <span

                      className="rounded px-2 py-0.5 text-xs font-semibold"

                      style={{

                        backgroundColor:

                          row.schedulerStatus === "Scheduled" ? "#1E7B45" : "#E8A33D",

                        color: row.schedulerStatus === "Scheduled" ? "#FFFFFF" : "#0A1228",

                      }}

                    >

                      {row.schedulerStatus}

                    </span>

                  </TableCell>

                  {row.dueMonths.map((due, idx) => (

                    <TableCell key={MONTHS[idx]} className="text-center">

                      {due ? (

                        <span

                          className="inline-block h-2.5 w-2.5 rounded-full"

                          style={{ backgroundColor: "#E8A33D" }}

                          title={`Due in ${MONTHS[idx]}`}

                        />

                      ) : (

                        <span className="text-[#CBD5E1]">·</span>

                      )}

                    </TableCell>

                  ))}

                </TableRow>

              ))}

            </TableBody>

          </Table>

        </div>

      )}

    </E3TrackerPageShell>

  );

}



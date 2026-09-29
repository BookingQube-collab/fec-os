"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getArcadeMonthlyReport, getArcadeWeeklyReport } from "@/lib/arcade-supply.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeReports() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const weekly = useQuery({ queryKey: [...queryKeys.arcade.all, "weekly"], queryFn: () => getArcadeWeeklyReport({}) });
  const monthly = useQuery({ queryKey: [...queryKeys.arcade.all, "monthly", month], queryFn: () => getArcadeMonthlyReport({ month }) });
  const report = weekly.data;
  return (
    <div className="grid gap-4 print:block">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-semibold">Reports & analytics</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => window.print()}>Print</Button>
          <Button type="button" variant="outline" onClick={() => report && void exportExcel(report)}>Excel</Button>
          <Button type="button" onClick={() => report && void exportPdf(report)}>PDF</Button>
        </div>
      </div>
      {report ? (
        <article className="grid gap-3 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{report.title}</h2>
          <p className="text-sm">{report.weekStart} to {report.weekEnd}</p>
          <p className="text-sm">Opened {report.opened} · resolved {report.resolved} · pending {report.pending} · waiting parts {report.waitingParts} · waiting suppliers {report.waitingSuppliers} · repeats {report.repeatFaults}</p>
          <p className="text-sm">Availability {report.availability ?? "—"}% · PM compliance {report.pmCompliance ?? "—"}% · parts {report.partsConsumed} · cost {report.partsCost}</p>
          {report.siteGroups.map((site) => (
            <section key={site.siteName}>
              <h3 className="font-medium">{site.siteName}</h3>
              <p className="text-sm text-muted-foreground">{site.active} machines · {site.working} working · {site.down} down · {site.underRepair} under repair · {site.waitingPart} waiting part · {site.availability ?? "—"}%</p>
              {site.faults.map((fault) => <p key={fault.ticketNumber} className="text-sm">{fault.ticketNumber} · {fault.machine} · {fault.status} · {fault.summary}</p>)}
            </section>
          ))}
        </article>
      ) : <p className="text-sm text-muted-foreground">Building the weekly report from recorded activity…</p>}
      <section className="grid gap-2">
        <h2 className="font-semibold">Monthly</h2>
        <input className="h-10 max-w-xs rounded-md border px-2" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        {monthly.data ? (
          <div className="grid gap-1 text-sm">
            <p>Faults {monthly.data.faults} (previous {monthly.data.previousFaults}) · resolved {monthly.data.resolved} · pending {monthly.data.pending} · resolution {monthly.data.resolutionRate ?? "—"}%</p>
            <p>Availability {monthly.data.availability ?? "—"}% · downtime {monthly.data.downtimeHours} h · MTTR {monthly.data.mttrHours ?? "not enough history"} h · MTBF {monthly.data.mtbfDays ?? "not enough history"} days</p>
            <p>Repeat faults {monthly.data.repeatFaults} · parts cost {monthly.data.partsCost} · supplier response {monthly.data.supplierResponseHours ?? "—"} h</p>
            <p>Highest failure: {monthly.data.highestFailureMachines[0]?.machineName ?? "—"} · worst site: {monthly.data.sitesByFaults[0]?.siteName ?? "—"}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

async function exportExcel(report: NonNullable<Awaited<ReturnType<typeof getArcadeWeeklyReport>>>) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(report.faults);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Faults");
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(report.siteGroups.map(({ faults: _faults, ...site }) => site)), "Sites");
  XLSX.writeFile(book, `arcade-weekly-${report.weekStart}.xlsx`);
}

async function exportPdf(report: NonNullable<Awaited<ReturnType<typeof getArcadeWeeklyReport>>>) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(report.title, 14, 16);
  doc.setFontSize(10);
  const lines = [
    `${report.weekStart} to ${report.weekEnd}`,
    `Opened ${report.opened}, resolved ${report.resolved}, pending ${report.pending}`,
    `Availability ${report.availability ?? "—"}%`,
    ...report.siteGroups.flatMap((site) => [`${site.siteName}: ${site.working}/${site.active} working`, ...site.faults.map((fault) => `${fault.ticketNumber} ${fault.summary}`)]),
  ];
  let y = 26;
  for (const line of lines) {
    doc.text(line.slice(0, 110), 14, y);
    y += 6;
    if (y > 280) break;
  }
  doc.save(`arcade-weekly-${report.weekStart}.pdf`);
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { arcadeStatusName } from "@/components/arcade/ui";
import { ArcadeWorkbookImport } from "@/components/arcade/workbook-import";
import { Button } from "@/components/ui/button";
import { getArcadeMonthlyReport, getArcadeWeeklyReport } from "@/lib/arcade-supply.functions";
import { queryKeys } from "@/lib/query-keys";

export function ArcadeReports() {
  const { t } = useTranslation();
  const [month, setMonth] = useState("2026-08");
  const weekly = useQuery({ queryKey: [...queryKeys.arcade.all, "weekly"], queryFn: () => getArcadeWeeklyReport({}) });
  const monthly = useQuery({ queryKey: [...queryKeys.arcade.all, "monthly", month], queryFn: () => getArcadeMonthlyReport({ month }) });
  const report = weekly.data;
  return (
    <div className="grid gap-4 print:block">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-semibold">{t("arcadeScreens.reportsTitle")}</h1>
        <div className="flex gap-2">
          <ArcadeWorkbookImport />
          <Button type="button" variant="outline" onClick={() => window.print()}>{t("arcadeScreens.print")}</Button>
          <Button type="button" variant="outline" onClick={() => report && void exportExcel(report, t)}>{t("hr.reports.exportExcel")}</Button>
          <Button type="button" onClick={() => report && void exportPdf(report, t)}>{t("hr.reports.exportPdf")}</Button>
        </div>
      </div>
      {report ? (
        <article className="grid gap-3 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{report.title}</h2>
          <p className="text-sm">{t("arcadeScreens.weekRange", { from: report.weekStart, to: report.weekEnd })}</p>
          <p className="text-sm">{t("arcadeScreens.weeklyLine", { opened: report.opened, resolved: report.resolved, pending: report.pending, parts: report.waitingParts, suppliers: report.waitingSuppliers, repeats: report.repeatFaults })}</p>
          <p className="text-sm">{t("arcadeScreens.weeklyMeta", { availability: report.availability ?? "—", pm: report.pmCompliance ?? "—", parts: report.partsConsumed, cost: report.partsCost })}</p>
          {report.siteGroups.map((site) => (
            <section key={site.siteName}>
              <h3 className="font-medium">{site.siteName}</h3>
              <p className="text-sm text-muted-foreground">{t("arcadeOps.siteLine", { machines: site.active, working: site.working, repair: site.underRepair, waiting: site.waitingPart })} · {site.down} {t("arcadeOps.down")} · {site.availability ?? "—"}%</p>
              {site.faults.map((fault) => <p key={fault.ticketNumber} className="text-sm">{fault.ticketNumber} · {fault.machine} · {arcadeStatusName(t, fault.status)} · {fault.summary}</p>)}
            </section>
          ))}
        </article>
      ) : <p className="text-sm text-muted-foreground">{t("arcadeScreens.buildingReport")}</p>}
      <section className="grid gap-2">
        <h2 className="font-semibold">{t("arcadeScreens.monthly")}</h2>
        <input className="h-10 max-w-xs rounded-md border px-2" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        {monthly.data ? (
          <div className="grid gap-1 text-sm">
            <p>{t("arcadeScreens.monthlyFaults", { faults: monthly.data.faults, previous: monthly.data.previousFaults, resolved: monthly.data.resolved, pending: monthly.data.pending, rate: monthly.data.resolutionRate ?? "—" })}</p>
            <p>{t("arcadeScreens.monthlyTime", { availability: monthly.data.availability ?? "—", down: monthly.data.downtimeHours, mttr: monthly.data.mttrHours ?? t("arcadeScreens.notEnough"), mtbf: monthly.data.mtbfDays ?? t("arcadeScreens.notEnough") })}</p>
            <p>{t("arcadeScreens.monthlyExtra", { repeats: monthly.data.repeatFaults, cost: monthly.data.partsCost, hours: monthly.data.supplierResponseHours ?? "—" })}</p>
            <p>{t("arcadeScreens.monthlyWorst", { machine: monthly.data.highestFailureMachines[0]?.machineName ?? "—", site: monthly.data.sitesByFaults[0]?.siteName ?? "—" })}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1">{t("arcadeScreens.machine")}</th>
                    <th>{t("common.site")}</th>
                    <th>{t("arcadeScreens.status")}</th>
                    <th>{t("arcadeImport.issue")}</th>
                    <th>{t("arcadeImport.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.data.activity.map((row) => (
                    <tr key={`${row.machineName}-${row.reportedOn}-${row.summary.slice(0, 24)}`} className="border-t align-top">
                      <td className="py-1 font-medium">{row.machineName}</td>
                      <td>{row.siteName}</td>
                      <td>{arcadeStatusName(t, row.status)}</td>
                      <td>{row.summary}</td>
                      <td className="whitespace-nowrap">{row.reportedOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {monthly.data.activity.length === 0 ? <p className="text-muted-foreground">{t("arcadeImport.noActivity")}</p> : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

type ReportTranslate = (key: string, options?: Record<string, unknown>) => string;

async function exportExcel(report: NonNullable<Awaited<ReturnType<typeof getArcadeWeeklyReport>>>, t: ReportTranslate) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(report.faults);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t("arcadeScreens.sheetFaults").slice(0, 31));
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(report.siteGroups.map(({ faults: _faults, ...site }) => site)), t("arcadeScreens.sheetSites").slice(0, 31));
  XLSX.writeFile(book, `arcade-weekly-${report.weekStart}.xlsx`);
}

async function exportPdf(report: NonNullable<Awaited<ReturnType<typeof getArcadeWeeklyReport>>>, t: ReportTranslate) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(report.title, 14, 16);
  doc.setFontSize(10);
  const lines = [
    t("arcadeScreens.weekRange", { from: report.weekStart, to: report.weekEnd }),
    t("arcadeScreens.weeklyLine", { opened: report.opened, resolved: report.resolved, pending: report.pending, parts: report.waitingParts, suppliers: report.waitingSuppliers, repeats: report.repeatFaults }),
    t("arcadeScreens.weeklyMeta", { availability: report.availability ?? "—", pm: report.pmCompliance ?? "—", parts: report.partsConsumed, cost: report.partsCost }),
    ...report.siteGroups.flatMap((site) => [t("arcadeScreens.siteWorking", { name: site.siteName, working: site.working, active: site.active }), ...site.faults.map((fault) => `${fault.ticketNumber} ${fault.summary}`)]),
  ];
  let y = 26;
  for (const line of lines) {
    doc.text(line.slice(0, 110), 14, y);
    y += 6;
    if (y > 280) break;
  }
  doc.save(`arcade-weekly-${report.weekStart}.pdf`);
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { EventReportAiBrief } from "@/components/events/event-report-ai-brief";
import { EventReportsDetailTable, formatReportCell } from "@/components/events/event-reports-detail-table";
import { EventReportsVisuals } from "@/components/events/event-reports-visuals";
import { EventSourceBanner } from "@/components/events/event-source-banner";
import { PageHeader } from "@/components/layout/page-header";
import { DownloadReportButton } from "@/components/reports/download-report-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEventReports } from "@/hooks/queries/useEvents";
import { useReportExport } from "@/hooks/use-report-export";
import { EVENT_REPORT_IDS, FINANCE_REPORT_IDS, type EventReportId } from "@/lib/events/reports";
import { buildEventReportVisuals } from "@/lib/events/report-visuals";
import { downloadCsvContent } from "@/lib/staff-import";
import { useAppStore } from "@/stores/app-store";

export default function EventsReportsPage() {
  const { t, i18n } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [eventId, setEventId] = useState("all");
  const [pmStaffId, setPmStaffId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reportId, setReportId] = useState<EventReportId>("project_status");
  const [aiBrief, setAiBrief] = useState("");

  useEffect(() => {
    setAiBrief("");
  }, [reportId, eventId, pmStaffId, from, to]);

  const filters = useMemo(
    () => ({
      locationId,
      eventId: eventId === "all" ? null : eventId,
      pmStaffId: pmStaffId === "all" ? null : pmStaffId,
      from: from || null,
      to: to || null,
    }),
    [locationId, eventId, pmStaffId, from, to],
  );
  const q = useEventReports(filters);
  const canFinance = q.data?.canFinance ?? false;
  const visibleIds = EVENT_REPORT_IDS.filter((id) => canFinance || !FINANCE_REPORT_IDS.has(id));
  const activeId = visibleIds.includes(reportId) ? reportId : "project_status";
  const report = q.data?.reports.find((r) => r.id === activeId) ?? null;
  const rows = report?.rows ?? [];
  const visuals = useMemo(
    () => buildEventReportVisuals(activeId, report?.rows ?? []),
    [activeId, report],
  );
  const tabLabel = t(`events.reports.kinds.${activeId}`);

  const exportCsv = () => {
    if (!report) return;
    const headers = report.columns.map((c) => t(c.labelKey));
    const lines = [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
      ...report.rows.map((row) =>
        report.columns
          .map((c) => {
            const raw = formatReportCell(row[c.key] ?? null, c, activeId, t, i18n.language);
            return `"${String(raw).replace(/"/g, '""')}"`;
          })
          .join(","),
      ),
    ];
    downloadCsvContent(lines.join("\n"), `event-${activeId}.csv`);
  };

  const exportRows = useMemo(
    () =>
      rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const col of report?.columns ?? []) {
          if (col.money || col.pct) {
            out[col.key] = row[col.key];
          } else {
            out[col.key] = formatReportCell(row[col.key] ?? null, col, activeId, t, i18n.language);
          }
        }
        return out;
      }),
    [rows, report, activeId, t, i18n.language],
  );

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: `Event_${activeId}`,
    title: `${t("events.reports.title")} — ${tabLabel}`,
    venueLabel: locationId ?? t("events.filters.all"),
    filters: {
      event: eventId === "all" ? t("events.filters.all") : eventId,
      pm: pmStaffId === "all" ? t("events.filters.all") : pmStaffId,
      from: from || null,
      to: to || null,
    },
    kpis: visuals.kpis.map((k) => ({
      label: t(k.labelKey),
      value:
        k.format === "money"
          ? `QAR ${k.value}`
          : k.format === "pct"
            ? `${Math.round(k.value)}%`
            : k.value,
    })),
    columns: (report?.columns ?? []).map((c) => ({
      key: c.key,
      header: t(c.labelKey),
      format: c.money ? ("qar" as const) : c.pct ? ("pct" as const) : ("text" as const),
    })),
    rows: exportRows,
    narrative: aiBrief || null,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={t("events.kicker")}
        title={t("events.reports.title")}
        subtitle={t("events.reports.subtitle")}
        actions={
          <DownloadReportButton
            onCsv={exportCsv}
            onPdf={exportPdf}
            onExcel={exportExcel}
            disabled={!rows.length}
            label={t("events.reports.exportNamed", { name: tabLabel })}
            csvLabel={t("events.reports.exportCsv")}
            pdfLabel={t("events.reports.exportPdf")}
            excelLabel={t("events.reports.exportExcel")}
          />
        }
      />
      <EventSourceBanner />

      <div className="flex flex-wrap gap-3 rounded-2xl border border-border/40 bg-card p-4">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t("events.reports.filters.event")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("events.filters.all")}</SelectItem>
            {(q.data?.events ?? []).map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>
                {[ev.event_number, ev.name].filter(Boolean).join(" · ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pmStaffId} onValueChange={setPmStaffId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={t("events.fields.pm")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("events.filters.all")}</SelectItem>
            {(q.data?.pms ?? []).map((pm) => (
              <SelectItem key={pm.id} value={pm.id}>
                {pm.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-1">
        {visibleIds.map((id) => (
          <Button
            key={id}
            size="sm"
            variant={activeId === id ? "default" : "outline"}
            onClick={() => setReportId(id)}
          >
            {t(`events.reports.kinds.${id}`)}
          </Button>
        ))}
      </div>

      {q.isLoading || rows.length > 0 ? (
        <EventReportsVisuals model={visuals} loading={q.isLoading} />
      ) : null}

      <EventReportAiBrief
        key={`${activeId}-${eventId}-${pmStaffId}-${from}-${to}`}
        reportId={activeId}
        reportLabel={tabLabel}
        columns={(report?.columns ?? []).map((c) => c.key)}
        rows={rows}
        visuals={visuals}
        portfolio={(q.data?.reports ?? []).map((block) => ({
          id: block.id,
          label: t(`events.reports.kinds.${block.id}`),
          row_count: block.rows.length,
        }))}
        onBriefChange={setAiBrief}
      />

      <section className="overflow-hidden rounded-2xl border border-border/40 bg-card shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{tabLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {q.isLoading
                ? t("events.reports.loading")
                : t("events.reports.rowCount", { n: rows.length })}
            </p>
          </div>
        </div>
        {q.isLoading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t("events.reports.loading")}</p>
        ) : !report || rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t("events.reports.empty")}</p>
        ) : (
          <EventReportsDetailTable reportId={activeId} columns={report.columns} rows={rows} />
        )}
      </section>
    </div>
  );
}

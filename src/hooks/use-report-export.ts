"use client";

import { useCallback } from "react";

export interface ReportColumn<T> {
  key: keyof T | string;
  header: string;
  format?: "text" | "qar" | "pct" | "date";
}

export interface ReportKpi {
  label: string;
  value: string | number;
}

export interface UseReportExportOptions<T extends Record<string, unknown>> {
  pageKey: string;
  title: string;
  venueLabel: string;
  filters?: Record<string, string | null | undefined>;
  kpis: ReportKpi[];
  columns: ReportColumn<T>[];
  rows: T[];
}

function formatCell(value: unknown, format?: ReportColumn<unknown>["format"]): string {
  if (value == null || value === "") return "—";
  if (format === "qar") return `QAR ${Number(value).toLocaleString("en-QA")}`;
  if (format === "pct") return `${value}%`;
  if (format === "date" && typeof value === "string") {
    return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return String(value);
}

function fileBase(pageKey: string, venue: string) {
  const d = new Date().toISOString().slice(0, 10);
  const v = venue.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30) || "All";
  return `FEC_${pageKey}_${v}_${d}`;
}

export function useReportExport<T extends Record<string, unknown>>(opts: UseReportExportOptions<T>) {
  const filterLine = Object.entries(opts.filters ?? {})
    .filter(([, v]) => v && v !== "all")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  const exportPdf = useCallback(async () => {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const autoTable = autoTableModule.default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(opts.title, 14, 16);
    doc.setFontSize(9);
    doc.text(`Venue: ${opts.venueLabel}${filterLine ? ` · ${filterLine}` : ""}`, 14, 22);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);

    let y = 34;
    const kpiText = opts.kpis.map((k) => `${k.label}: ${k.value}`).join("  |  ");
    doc.text(kpiText.slice(0, 200), 14, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [opts.columns.map((c) => c.header)],
      body: opts.rows.map((row) =>
        opts.columns.map((c) => formatCell(row[c.key as keyof T], c.format)),
      ),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
    });

    doc.save(`${fileBase(opts.pageKey, opts.venueLabel)}.pdf`);
  }, [opts, filterLine]);

  const exportExcel = useCallback(async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const kpiRows: (string | number)[][] = [
      [opts.title],
      [`Venue: ${opts.venueLabel}`],
      ...(filterLine ? [[`Filters: ${filterLine}`] as (string | number)[]] : []),
      [],
      ...opts.kpis.map((k) => [k.label, k.value]),
      [],
      opts.columns.map((c) => c.header),
      ...opts.rows.map((row) =>
        opts.columns.map((c) => {
          const v = row[c.key as keyof T];
          if (c.format === "qar") return Number(v ?? 0);
          if (v == null) return "";
          return v as string | number;
        }),
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(kpiRows);
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${fileBase(opts.pageKey, opts.venueLabel)}.xlsx`);
  }, [opts, filterLine]);

  return { exportPdf, exportExcel };
}

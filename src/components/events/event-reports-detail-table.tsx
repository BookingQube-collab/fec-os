"use client";

import { useTranslation } from "react-i18next";

import { EventHealthBadge } from "@/components/events/event-health-badge";
import { PrStatusPill } from "@/components/procurement/pr-status-pill";
import { Badge } from "@/components/ui/badge";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtQar } from "@/lib/currency";
import type { EventReportId, ReportColumn } from "@/lib/events/reports";

export type ReportRow = Record<string, string | number | null>;

const DATE_KEYS = new Set(["due", "opening", "dates"]);
const SEVERITY_KEYS = new Set(["priority", "severity"]);
const YESNO_KEYS = new Set(["required", "approved", "snag", "safety"]);

type CellKind = "health" | "status" | "yesno" | "pctbar" | "severity" | "pill" | "date" | "money" | "text";

function cellKind(reportId: EventReportId, col: ReportColumn): CellKind {
  if (col.money) return "money";
  if (col.pct) return "pctbar";
  if (col.key === "health") return "health";
  if (DATE_KEYS.has(col.key)) return "date";
  if (SEVERITY_KEYS.has(col.key)) return "severity";
  if (col.key === "status" || col.key === "reason" || col.key === "kind") return col.key === "status" ? "status" : "pill";
  if (YESNO_KEYS.has(col.key)) return "yesno";
  if (col.key === "complete" && reportId === "event_readiness") return "yesno";
  if (col.key === "checklist" && reportId === "lessons_learned") return "yesno";
  return "text";
}

export function formatReportDate(value: string, locale: string): string {
  const loc = locale.startsWith("ar") ? "ar" : "en-GB";
  const parts = value.split(" → ").map((part) => {
    const iso = part.trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(loc, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  });
  return parts.join(" → ");
}

function translateStatus(t: (key: string, opts?: { defaultValue?: string }) => string, value: string): string {
  const paths = [
    `events.status.${value}`,
    `events.taskStatus.${value}`,
    `events.issueStatus.${value}`,
    `events.assetStatus.${value}`,
    `events.risk.${value}`,
    `events.payableStatus.${value}`,
    `events.invoiceStatus.${value}`,
    `procurement.status.${value}`,
    `events.reports.reason.${value}`,
    `events.reports.kind.${value}`,
    `events.reports.${value}`,
  ];
  for (const path of paths) {
    const label = t(path);
    if (label !== path) return label;
  }
  return value;
}

function statusVariant(value: string): "success" | "warning" | "destructive" | "info" | "muted" {
  if (
    ["completed", "closed", "resolved", "paid", "approved", "active", "returned", "on_site", "moved", "yes"].includes(
      value,
    )
  ) {
    return "success";
  }
  if (["blocked", "overdue", "missing", "cancelled", "rejected", "critical", "no"].includes(value)) {
    return "destructive";
  }
  if (["in_progress", "pending", "open", "mitigating", "partial", "waiting", "under_review"].includes(value)) {
    return "warning";
  }
  if (["draft", "planned", "not_started"].includes(value)) return "muted";
  return "info";
}

function severityVariant(value: string): "success" | "warning" | "destructive" | "info" | "muted" {
  if (value === "critical") return "destructive";
  if (value === "high" || value === "urgent") return "warning";
  if (value === "low") return "muted";
  return "info";
}

function PctBar({ value }: { value: number }) {
  const fill = value < 50 ? "#c93c37" : value < 75 ? "#c47a0a" : "#0f7a5a";
  return (
    <div className="flex min-w-[6.75rem] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: fill }}
        />
      </div>
      <span className="w-8 tabular-nums text-xs text-muted-foreground">{Math.round(value)}%</span>
    </div>
  );
}

export function formatReportCell(
  value: string | number | null,
  col: ReportColumn,
  reportId: EventReportId,
  t: (key: string, opts?: { defaultValue?: string }) => string,
  locale: string,
): string {
  if (value == null || value === "") return "—";
  const kind = cellKind(reportId, col);
  if (kind === "money" && typeof value === "number") return fmtQar(value);
  if (kind === "pctbar" && typeof value === "number") return `${Math.round(value)}%`;
  if (kind === "date") return formatReportDate(String(value), locale);
  if (kind === "health") return t(`events.rag.${value}`, { defaultValue: String(value) });
  if (kind === "yesno") return t(`events.reports.${String(value).toLowerCase()}`, { defaultValue: String(value) });
  if (kind === "severity") {
    return t(`events.risk.${value}`, {
      defaultValue: t(`events.priority.${value}`, { defaultValue: String(value) }),
    });
  }
  if (kind === "status" || kind === "pill") return translateStatus(t, String(value));
  return String(value);
}

function CellView({
  value,
  col,
  reportId,
  row,
}: {
  value: string | number | null;
  col: ReportColumn;
  reportId: EventReportId;
  row: ReportRow;
}) {
  const { t, i18n } = useTranslation();
  if (value == null || value === "") return <span className="text-muted-foreground">—</span>;

  const kind = cellKind(reportId, col);

  if (kind === "money" && typeof value === "number") {
    return <span className="tabular-nums">{fmtQar(value)}</span>;
  }
  if (kind === "pctbar" && typeof value === "number") return <PctBar value={value} />;
  if (kind === "date") return <span className="whitespace-nowrap">{formatReportDate(String(value), i18n.language)}</span>;
  if (kind === "health") return <EventHealthBadge rag={String(value)} />;
  if (kind === "yesno") {
    const yes = String(value).toLowerCase() === "yes";
    return (
      <Badge variant={yes ? "success" : "muted"}>{t(`events.reports.${yes ? "yes" : "no"}`)}</Badge>
    );
  }
  if (kind === "severity") {
    const raw = String(value);
    return (
      <Badge variant={severityVariant(raw)}>
        {t(`events.risk.${raw}`, { defaultValue: t(`events.priority.${raw}`, { defaultValue: raw }) })}
      </Badge>
    );
  }
  if (kind === "status") {
    const raw = String(value);
    if (reportId === "pending_procurement" && row.kind === "PR") {
      return <PrStatusPill status={raw} />;
    }
    return <Badge variant={statusVariant(raw)}>{translateStatus(t, raw)}</Badge>;
  }
  if (kind === "pill") {
    const raw = String(value);
    return <Badge variant={statusVariant(raw)}>{translateStatus(t, raw)}</Badge>;
  }
  return <span>{String(value)}</span>;
}

export function EventReportsDetailTable({
  reportId,
  columns,
  rows,
}: {
  reportId: EventReportId;
  columns: ReportColumn[];
  rows: ReportRow[];
}) {
  const { t } = useTranslation();
  return (
    <div className="relative max-h-[min(32rem,70vh)] w-full overflow-auto">
      <table className="w-full caption-bottom text-sm text-foreground">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead key={col.key} className="sticky top-0 z-10 bg-card">
                {t(col.labelKey)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={`${reportId}-${idx}`} className="hover:bg-secondary/50">
              {columns.map((col) => (
                <TableCell key={col.key} className={col.money || col.pct ? "tabular-nums" : undefined}>
                  <CellView value={row[col.key] ?? null} col={col} reportId={reportId} row={row} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </div>
  );
}

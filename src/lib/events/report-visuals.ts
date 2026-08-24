import type { KpiTint } from "@/lib/ui/command-surface";
import type { EventReportId } from "@/lib/events/reports";

export type ReportRow = Record<string, string | number | null>;

export type ReportKpiSpec = {
  id: string;
  labelKey: string;
  value: number;
  format: "number" | "pct" | "money";
  tint: KpiTint;
};

export type NamedValue = { key: string; value: number };

export type ReportDonutSpec = {
  id: string;
  titleKey: string;
  labelKind: "health" | "status" | "severity" | "yesno" | "reason" | "kind" | "raw";
  data: NamedValue[];
};

export type ReportBarSpec = {
  id: string;
  titleKey: string;
  layout: "vertical" | "horizontal";
  format: "number" | "pct" | "money";
  data: NamedValue[];
};

export type ReportGroupedSpec = {
  id: string;
  titleKey: string;
  format: "money" | "number";
  series: Array<{ key: string; labelKey: string }>;
  data: Array<{ key: string } & Record<string, string | number>>;
};

export type EventReportVisualModel = {
  kpis: ReportKpiSpec[];
  donuts: ReportDonutSpec[];
  bars: ReportBarSpec[];
  grouped: ReportGroupedSpec[];
};

const EMPTY: EventReportVisualModel = { kpis: [], donuts: [], bars: [], grouped: [] };
const BAR_CAP = 12;

function asNum(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asStr(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  return String(value);
}

function isYes(value: string | number | null | undefined): boolean {
  return asStr(value).toLowerCase() === "yes";
}

function avg(rows: ReportRow[], key: string): number | null {
  const vals = rows.map((r) => asNum(r[key])).filter((n): n is number => n != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function sum(rows: ReportRow[], key: string): number {
  return rows.reduce((acc, r) => acc + (asNum(r[key]) ?? 0), 0);
}

function countBy(rows: ReportRow[], key: string): NamedValue[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = asStr(row[key]) || "—";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([k, value]) => ({ key: k, value }));
}

function countYesNo(rows: ReportRow[], key: string): NamedValue[] {
  let yes = 0;
  let no = 0;
  for (const row of rows) {
    const raw = asStr(row[key]).toLowerCase();
    if (raw === "yes") yes += 1;
    else if (raw === "no") no += 1;
  }
  return [
    yes ? { key: "yes", value: yes } : null,
    no ? { key: "no", value: no } : null,
  ].filter((x): x is NamedValue => x != null);
}

function sumBy(rows: ReportRow[], groupKey: string, valueKey: string): NamedValue[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = asStr(row[groupKey]) || "—";
    map.set(k, (map.get(k) ?? 0) + (asNum(row[valueKey]) ?? 0));
  }
  return [...map.entries()].map(([k, value]) => ({ key: k, value }));
}

function avgBy(rows: ReportRow[], groupKey: string, valueKey: string): NamedValue[] {
  const map = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const k = asStr(row[groupKey]);
    const v = asNum(row[valueKey]);
    if (!k || v == null) continue;
    const cur = map.get(k) ?? { sum: 0, n: 0 };
    cur.sum += v;
    cur.n += 1;
    map.set(k, cur);
  }
  return [...map.entries()].map(([k, { sum: s, n }]) => ({ key: k, value: Math.round(s / n) }));
}

function topN(data: NamedValue[], n = BAR_CAP, byAbs = false): NamedValue[] {
  return [...data]
    .sort((a, b) => (byAbs ? Math.abs(b.value) - Math.abs(a.value) : b.value - a.value))
    .slice(0, n);
}

function meaningful(data: NamedValue[]): NamedValue[] {
  return data.filter((d) => d.value !== 0);
}

function kpi(
  id: string,
  value: number,
  tint: KpiTint,
  format: ReportKpiSpec["format"] = "number",
): ReportKpiSpec {
  return { id, labelKey: `events.reports.kpis.${id}`, value, format, tint };
}

function donut(
  id: string,
  labelKind: ReportDonutSpec["labelKind"],
  data: NamedValue[],
): ReportDonutSpec | null {
  const cleaned = data.filter((d) => d.value > 0);
  if (!cleaned.length) return null;
  return { id, titleKey: `events.reports.charts.${id}`, labelKind, data: cleaned };
}

function bar(
  id: string,
  data: NamedValue[],
  format: ReportBarSpec["format"] = "number",
  layout: ReportBarSpec["layout"] = "horizontal",
  byAbs = false,
): ReportBarSpec | null {
  const cleaned = topN(meaningful(data), BAR_CAP, byAbs);
  if (!cleaned.length) return null;
  return { id, titleKey: `events.reports.charts.${id}`, layout, format, data: cleaned };
}

function groupedMoney(
  id: string,
  rows: ReportRow[],
  seriesKeys: string[],
): ReportGroupedSpec | null {
  const data = rows
    .map((row) => {
      const point: { key: string } & Record<string, string | number> = {
        key: asStr(row.event) || "—",
      };
      let any = false;
      for (const sk of seriesKeys) {
        const n = asNum(row[sk]);
        if (n != null) {
          point[sk] = n;
          any = true;
        }
      }
      return any ? point : null;
    })
    .filter((p): p is { key: string } & Record<string, string | number> => p != null)
    .slice(0, BAR_CAP);
  if (!data.length) return null;
  return {
    id,
    titleKey: `events.reports.charts.${id}`,
    format: "money",
    series: seriesKeys.map((key) => ({ key, labelKey: `events.reports.series.${key}` })),
    data,
  };
}

export function buildEventReportVisuals(id: EventReportId, rows: ReportRow[]): EventReportVisualModel {
  if (!rows.length) return EMPTY;

  const kpis: ReportKpiSpec[] = [];
  const donuts: ReportDonutSpec[] = [];
  const bars: ReportBarSpec[] = [];
  const grouped: ReportGroupedSpec[] = [];

  const pushDonut = (spec: ReportDonutSpec | null) => {
    if (spec) donuts.push(spec);
  };
  const pushBar = (spec: ReportBarSpec | null) => {
    if (spec) bars.push(spec);
  };
  const pushGrouped = (spec: ReportGroupedSpec | null) => {
    if (spec) grouped.push(spec);
  };

  switch (id) {
    case "project_status": {
      const critical = rows.filter((r) => {
        const h = asStr(r.health);
        return h === "critical" || h === "red";
      }).length;
      const readiness = avg(rows, "readiness");
      kpis.push(
        kpi("events", rows.length, "slate"),
        kpi("criticalHealth", critical, critical ? "red" : "green"),
      );
      if (readiness != null) kpis.push(kpi("avgReadiness", Math.round(readiness), "sky", "pct"));
      pushDonut(donut("healthMix", "health", countBy(rows, "health")));
      pushBar(bar("readinessByEvent", avgBy(rows, "event", "readiness"), "pct"));
      break;
    }
    case "event_readiness": {
      const complete = rows.filter((r) => isYes(r.complete)).length;
      const requiredOpen = rows.filter((r) => isYes(r.required) && !isYes(r.complete)).length;
      kpis.push(
        kpi("items", rows.length, "slate"),
        kpi("complete", complete, "green"),
        kpi("requiredOpen", requiredOpen, requiredOpen ? "orange" : "green"),
      );
      pushDonut(donut("completeMix", "yesno", countYesNo(rows, "complete")));
      pushGrouped(
        groupedCountByEvent(rows, (r) => isYes(r.complete), "completeByEvent"),
      );
      break;
    }
    case "department_completion": {
      const overdue = sum(rows, "overdue");
      const blocked = sum(rows, "blocked");
      const completion = avg(rows, "pct");
      kpis.push(kpi("departments", rows.length, "slate"));
      if (completion != null) kpis.push(kpi("avgCompletion", Math.round(completion), "sky", "pct"));
      kpis.push(
        kpi("overdue", overdue, overdue ? "orange" : "green"),
        kpi("blocked", blocked, blocked ? "red" : "green"),
      );
      pushBar(bar("byDepartment", avgBy(rows, "department", "pct"), "pct"));
      pushBar(bar("byEvent", sumBy(rows, "event", "overdue")));
      break;
    }
    case "overdue_blocked": {
      const blocked = rows.filter((r) => asStr(r.status) === "blocked").length;
      const overdue = rows.length - blocked;
      kpis.push(
        kpi("rows", rows.length, "slate"),
        kpi("overdue", overdue, overdue ? "orange" : "green"),
        kpi("blocked", blocked, blocked ? "red" : "green"),
      );
      pushDonut(donut("statusMix", "status", countBy(rows, "status")));
      pushBar(bar("byEvent", countBy(rows, "event")));
      break;
    }
    case "budget_vs_actual": {
      kpis.push(
        kpi("revised", sum(rows, "revised"), "slate", "money"),
        kpi("actual", sum(rows, "actual"), "sky", "money"),
        kpi("remaining", sum(rows, "remaining"), "green", "money"),
      );
      pushGrouped(groupedMoney("budgetVsActual", rows, ["revised", "actual", "forecast"]));
      break;
    }
    case "budget_variance": {
      const variance = sum(rows, "varianceForecast");
      const over = rows.filter((r) => (asNum(r.varianceForecast) ?? 0) < 0).length;
      kpis.push(
        kpi("events", rows.length, "slate"),
        kpi("forecastVariance", variance, variance < 0 ? "red" : "green", "money"),
        kpi("overBudget", over, over ? "orange" : "green"),
      );
      pushBar(bar("varianceByEvent", sumBy(rows, "event", "varianceForecast"), "money", "horizontal", true));
      break;
    }
    case "profitability": {
      const margin = avg(rows, "actualMargin") ?? avg(rows, "forecastMargin");
      kpis.push(
        kpi("revenue", sum(rows, "revenue"), "slate", "money"),
        kpi("profit", sum(rows, "actualProfit"), "green", "money"),
      );
      if (margin != null) kpis.push(kpi("avgMargin", Math.round(margin), "sky", "pct"));
      pushGrouped(groupedMoney("revenueVsCost", rows, ["revenue", "actual"]));
      break;
    }
    case "pending_procurement": {
      const prs = rows.filter((r) => asStr(r.kind) === "PR").length;
      kpis.push(
        kpi("pending", rows.length, "orange"),
        kpi("amount", sum(rows, "amount"), "slate", "money"),
        kpi("prs", prs, "sky"),
      );
      pushDonut(donut("statusMix", "status", countBy(rows, "status")));
      pushBar(bar("amountByKind", sumBy(rows, "kind", "amount"), "money", "vertical"));
      break;
    }
    case "procurement_risks": {
      const overdue = rows.filter((r) => asStr(r.reason) === "overdue").length;
      const critical = rows.filter((r) => {
        const p = asStr(r.priority);
        return p === "critical" || p === "high" || p === "urgent" || asStr(r.reason) === "critical";
      }).length;
      kpis.push(
        kpi("risks", rows.length, "orange"),
        kpi("overdue", overdue, overdue ? "red" : "green"),
        kpi("critical", critical, critical ? "red" : "green"),
      );
      pushDonut(donut("reasonMix", "reason", countBy(rows, "reason")));
      pushBar(bar("byEvent", countBy(rows, "event")));
      break;
    }
    case "staffing_readiness":
    case "bump_in_progress": {
      const progress = avg(rows, "taskPct") ?? avg(rows, "checklist");
      const overdue = sum(rows, "overdue");
      kpis.push(kpi("events", rows.length, "slate"));
      if (progress != null) kpis.push(kpi("avgCompletion", Math.round(progress), "sky", "pct"));
      kpis.push(kpi("overdue", overdue, overdue ? "orange" : "green"));
      const progressBars = avgBy(rows, "event", "taskPct");
      pushBar(bar("progressByEvent", progressBars.length ? progressBars : avgBy(rows, "event", "checklist"), "pct"));
      break;
    }
    case "open_snags":
    case "critical_safety": {
      const critical = rows.filter((r) => {
        const s = asStr(r.severity);
        return s === "critical" || s === "high" || s === "urgent";
      }).length;
      kpis.push(
        kpi(id === "open_snags" ? "snags" : "safety", rows.length, id === "open_snags" ? "orange" : "red"),
        kpi("critical", critical, critical ? "red" : "green"),
        kpi("events", new Set(rows.map((r) => asStr(r.event))).size, "slate"),
      );
      pushDonut(donut("severityMix", "severity", countBy(rows, "severity")));
      pushBar(bar("byEvent", countBy(rows, "event")));
      break;
    }
    case "asset_movement": {
      const missing = rows.filter((r) => asStr(r.status) === "missing").length;
      kpis.push(
        kpi("items", rows.length, "slate"),
        kpi("qty", sum(rows, "qty"), "sky"),
        kpi("missing", missing, missing ? "red" : "green"),
      );
      pushDonut(donut("statusMix", "status", countBy(rows, "status")));
      break;
    }
    case "go_live_status": {
      const approved = rows.filter((r) => isYes(r.approved)).length;
      const pending = rows.length - approved;
      kpis.push(
        kpi("events", rows.length, "slate"),
        kpi("approved", approved, "green"),
        kpi("goLivePending", pending, pending ? "orange" : "green"),
      );
      pushDonut(donut("approvedMix", "yesno", countYesNo(rows, "approved")));
      pushBar(bar("checklistByEvent", avgBy(rows, "event", "checklist"), "pct"));
      break;
    }
    case "risk_register": {
      const critical = rows.filter((r) => asStr(r.severity) === "critical" || asStr(r.severity) === "high").length;
      const open = rows.filter((r) => {
        const s = asStr(r.status);
        return s === "open" || s === "mitigating";
      }).length;
      kpis.push(
        kpi("risks", rows.length, "slate"),
        kpi("open", open, open ? "orange" : "green"),
        kpi("critical", critical, critical ? "red" : "green"),
      );
      pushDonut(donut("severityMix", "severity", countBy(rows, "severity")));
      pushBar(bar("byEvent", countBy(rows, "event")));
      break;
    }
    case "issues": {
      const snags = rows.filter((r) => isYes(r.snag)).length;
      const safety = rows.filter((r) => isYes(r.safety)).length;
      kpis.push(
        kpi("rows", rows.length, "slate"),
        kpi("snags", snags, snags ? "orange" : "green"),
        kpi("safety", safety, safety ? "red" : "green"),
      );
      pushDonut(donut("severityMix", "severity", countBy(rows, "severity")));
      pushDonut(donut("statusMix", "status", countBy(rows, "status")));
      break;
    }
    case "lessons_learned": {
      const withLessons = rows.filter((r) => asStr(r.lessons).trim().length > 0).length;
      const done = rows.filter((r) => isYes(r.checklist)).length;
      kpis.push(
        kpi("events", rows.length, "slate"),
        kpi("withLessons", withLessons, withLessons ? "green" : "amber"),
        kpi("checklistDone", done, done ? "green" : "orange"),
      );
      pushDonut(donut("lessonsMix", "yesno", countYesNo(rows, "checklist")));
      break;
    }
    default:
      break;
  }

  return { kpis, donuts, bars, grouped };
}

function groupedCountByEvent(
  rows: ReportRow[],
  isComplete: (row: ReportRow) => boolean,
  id: string,
): ReportGroupedSpec | null {
  const map = new Map<string, { complete: number; open: number }>();
  for (const row of rows) {
    const key = asStr(row.event) || "—";
    const cur = map.get(key) ?? { complete: 0, open: 0 };
    if (isComplete(row)) cur.complete += 1;
    else cur.open += 1;
    map.set(key, cur);
  }
  const data = [...map.entries()]
    .map(([key, v]) => ({ key, complete: v.complete, open: v.open }))
    .sort((a, b) => b.complete + b.open - (a.complete + a.open))
    .slice(0, BAR_CAP);
  if (!data.length) return null;
  return {
    id,
    titleKey: `events.reports.charts.${id}`,
    format: "number",
    series: [
      { key: "complete", labelKey: "events.reports.series.complete" },
      { key: "open", labelKey: "events.reports.series.open" },
    ],
    data,
  };
}


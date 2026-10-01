"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  CircleCheck,
  ClipboardList,
  Clock,
  Coins,
  Gauge,
  Package,
  Pencil,
  Repeat,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { arcadeStatusName, Field, StatusBadge } from "@/components/arcade/ui";
import { ArcadeWorkbookImport } from "@/components/arcade/workbook-import";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";
import {
  FecCard,
  FecLoader,
  FecModal,
  FecModalContent,
  FecModalFooter,
  FecModalHeader,
  FecModalTitle,
  FecPageHeader,
  FecSearch,
  FecTable,
  FecTableBody,
  FecTableCell,
  FecTableHead,
  FecTableHeader,
  FecTableRow,
} from "@/components/fec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { listArcadeMachines } from "@/lib/arcade.functions";
import { FAULT_STATUSES } from "@/lib/arcade/domain";
import {
  availabilityForSites,
  faultTileCounts,
  filterArcadeReportFaults,
  partTotals,
  type WeeklyFaultRow,
  type WeeklyReport,
} from "@/lib/arcade/reports";
import { getArcadeFault, updateArcadeFault } from "@/lib/arcade-work.functions";
import { getArcadeWeeklyReport } from "@/lib/arcade-supply.functions";
import { venueTitle } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import type { KpiTint } from "@/lib/ui/command-surface";
import { cn } from "@/lib/utils";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LOOKBACK_MS = 70 * 24 * 60 * 60 * 1000;
const controlClass = "flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-elevated-xs";

function defaultReportRange() {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - LOOKBACK_MS).toISOString().slice(0, 10);
  return { from, to };
}

function readDay(value: string | null, fallback: string) {
  return value && DAY.test(value) ? value : fallback;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function isFaultStatus(value: string): value is (typeof FAULT_STATUSES)[number] {
  return (FAULT_STATUSES as readonly string[]).includes(value);
}

type Draft = {
  id: string;
  ticketNumber: string;
  description: string;
  status: string;
  locationId: string;
  machineId: string;
  machineName: string;
  reportedOn: string;
  originalReportedOn: string;
  problem: string;
  diagnosis: string;
  actionTaken: string;
  partsUsed: string;
  testingPerformed: string;
  finalResult: string;
  recommendations: string;
  hydrated: boolean;
};

export function ArcadeReports() {
  const { t } = useTranslation();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const canOperate = usePermission("arcade.operate");
  const canClose = usePermission("arcade.close");
  const sitesQuery = useSites();
  const defaults = defaultReportRange();
  const from = readDay(search.get("from"), defaults.from);
  const to = readDay(search.get("to"), defaults.to);
  const rangeFrom = from <= to ? from : to;
  const rangeTo = from <= to ? to : from;
  const siteId = search.get("site") ?? "";
  const status = search.get("status") ?? "";
  const urlQ = search.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    setQ(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (q === urlQ) return;
    const id = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (!params.get("from")) params.set("from", rangeFrom);
      if (!params.get("to")) params.set("to", rangeTo);
      if (q.trim()) params.set("q", q.trim());
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => window.clearTimeout(id);
  }, [pathname, q, rangeFrom, rangeTo, router, urlQ]);

  function commit(patch: Record<string, string>) {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("from")) params.set("from", rangeFrom);
    if (!params.get("to")) params.set("to", rangeTo);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const weekly = useQuery({
    queryKey: [...queryKeys.arcade.all, "weekly", rangeFrom, rangeTo],
    queryFn: () => getArcadeWeeklyReport({ from: rangeFrom, to: rangeTo }),
  });
  const report = weekly.data;
  const detail = useQuery({
    queryKey: queryKeys.arcade.fault(draft?.id),
    queryFn: () => getArcadeFault({ id: draft!.id }),
    enabled: Boolean(draft?.id),
  });
  const machines = useQuery({
    queryKey: queryKeys.arcade.machines({ locationId: draft?.locationId ?? null, pageSize: 200, purpose: "report-edit" }),
    queryFn: () => listArcadeMachines({ page: 1, pageSize: 200, locationId: draft?.locationId || null }),
    enabled: Boolean(draft?.locationId),
  });

  useEffect(() => {
    const row = detail.data?.fault;
    if (!row || !draft || draft.hydrated || draft.id !== row.id) return;
    setDraft({
      ...draft,
      hydrated: true,
      problem: row.problem ?? "",
      diagnosis: row.diagnosis ?? "",
      actionTaken: row.action_taken ?? "",
      partsUsed: row.parts_used ?? "",
      testingPerformed: row.testing_performed ?? "",
      finalResult: row.final_result ?? "",
      recommendations: row.recommendations ?? "",
    });
  }, [detail.data, draft]);

  const rows = useMemo(
    () => filterArcadeReportFaults(report?.faults ?? [], { siteId: siteId || undefined, status: status || undefined, q }),
    [q, report?.faults, siteId, status],
  );
  const counts = useMemo(() => faultTileCounts(rows), [rows]);
  const availability = report ? availabilityForSites(report.siteGroups, siteId || undefined) : null;
  const parts = useMemo(() => {
    if (!report) return null;
    const narrowed = Boolean(status || q.trim());
    return partTotals(report.partLines, {
      siteId: siteId || undefined,
      machineIds: narrowed ? new Set(rows.map((row) => row.machineId)) : null,
    });
  }, [q, report, rows, siteId, status]);
  const pm = !siteId && report && report.pmCompliance != null ? report.pmCompliance : null;

  const siteOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of report?.siteGroups ?? []) map.set(site.locationId, site.siteName);
    for (const fault of report?.faults ?? []) {
      if (!map.has(fault.locationId)) map.set(fault.locationId, fault.site);
    }
    const locations = sitesQuery.data ?? [];
    return [...map.entries()]
      .map(([id, name]) => {
        const location = locations.find((site) => site.id === id);
        return { id, name: location ? venueTitle(location, name) : name };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [report, sitesQuery.data]);

  const editSites = useMemo(() => {
    const locations = sitesQuery.data ?? [];
    if (!locations.length) return siteOptions;
    return locations
      .map((site) => ({ id: site.id, name: venueTitle(site, t("common.site")) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [siteOptions, sitesQuery.data, t]);

  const statusOptions = useMemo(() => {
    const present = new Set((report?.faults ?? []).map((fault) => fault.status));
    if (status) present.add(status);
    const known = FAULT_STATUSES.filter((item) => present.has(item));
    const extra = [...present].filter((item) => !isFaultStatus(item)).sort();
    return [...known, ...extra];
  }, [report?.faults, status]);

  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (next: Draft) => {
      if (!isFaultStatus(next.status)) throw new Error(t("arcadeScreens.pickStatus"));
      const description = next.description.trim();
      if (description.length < 8) throw new Error(t("arcadeScreens.issueTooShort"));
      if (!next.machineId || !next.locationId) throw new Error(t("arcadeScreens.selectMachine"));
      const closing = next.status === "RESOLVED" || next.status === "CLOSED";
      return updateArcadeFault({
        id: next.id,
        status: next.status,
        description,
        locationId: next.locationId,
        machineId: next.machineId,
        ...(next.reportedOn !== next.originalReportedOn && DAY.test(next.reportedOn)
          ? { reportedAt: `${next.reportedOn}T12:00:00.000Z` }
          : {}),
        ...(closing
          ? {
              problem: next.problem,
              diagnosis: next.diagnosis,
              actionTaken: next.actionTaken,
              partsUsed: next.partsUsed,
              testingPerformed: next.testingPerformed,
              finalResult: next.finalResult,
              recommendations: next.recommendations,
            }
          : {}),
      });
    },
    onSuccess: async () => {
      toast.success(t("arcadeScreens.faultSaved"));
      setDraft(null);
      await qc.invalidateQueries({ queryKey: queryKeys.arcade.all });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("arcadeScreens.updateFailed")),
  });

  const tiles: { key: string; title: string; value: string | number; tint: KpiTint; icon: typeof Gauge }[] = [];
  if (report) {
    tiles.push(
      { key: "opened", title: t("arcadeScreens.opened"), value: counts.opened, tint: "sky", icon: ClipboardList },
      { key: "resolved", title: t("arcadeScreens.resolved"), value: counts.resolved, tint: "green", icon: CircleCheck },
      { key: "pending", title: t("arcadeScreens.pending"), value: counts.pending, tint: "amber", icon: Clock },
      { key: "parts-wait", title: t("arcadeScreens.waitingParts"), value: counts.waitingParts, tint: "orange", icon: Package },
      { key: "suppliers", title: t("arcadeScreens.waitingSuppliers"), value: counts.waitingSuppliers, tint: "slate", icon: Truck },
      { key: "repeats", title: t("arcadeScreens.repeats"), value: counts.repeats, tint: "red", icon: Repeat },
    );
    if (availability != null) {
      tiles.push({ key: "availability", title: t("arcadeScreens.availability"), value: `${availability}%`, tint: "green", icon: Gauge });
    }
    if (pm != null) {
      tiles.push({ key: "pm", title: t("arcadeScreens.pmCompliance"), value: `${pm}%`, tint: "sky", icon: ShieldCheck });
    }
    if (parts) {
      tiles.push(
        { key: "parts", title: t("arcadeScreens.parts"), value: formatAmount(parts.parts), tint: "amber", icon: Boxes },
        { key: "cost", title: t("arcadeScreens.cost"), value: formatAmount(parts.cost), tint: "slate", icon: Coins },
      );
    }
  }

  const machineChoices = machines.data?.rows ?? [];
  const machineMissing = draft && draft.machineId && !machineChoices.some((row) => row.id === draft.machineId);
  const closing = draft?.status === "RESOLVED" || draft?.status === "CLOSED";

  return (
    <div className="grid gap-5 print:block">
      <FecPageHeader
        icon={BarChart3}
        kicker={t("nav.arcade")}
        title={t("arcadeScreens.reportsTitle")}
        subtitle={report ? t("arcadeScreens.weekRange", { from: report.weekStart, to: report.weekEnd }) : t("arcadeScreens.buildingReport")}
        actions={(
          <div className="flex flex-wrap gap-2 print:hidden">
            <ArcadeWorkbookImport />
            <Button type="button" variant="outline" onClick={() => window.print()}>{t("arcadeScreens.print")}</Button>
            <Button type="button" variant="outline" disabled={!report} onClick={() => report && void exportExcel(report, rows, t)}>{t("hr.reports.exportExcel")}</Button>
            <Button type="button" disabled={!report} onClick={() => report && void exportPdf(report, rows, { ...counts, availability, pm, parts: parts?.parts ?? null, cost: parts?.cost ?? null }, t)}>{t("hr.reports.exportPdf")}</Button>
          </div>
        )}
      />

      <FecCard className="print:hidden">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Field label={t("arcadeScreens.dateFrom")}>
            <Input type="date" value={rangeFrom} max={rangeTo} onChange={(event) => commit({ from: event.target.value })} />
          </Field>
          <Field label={t("arcadeScreens.dateTo")}>
            <Input type="date" value={rangeTo} min={rangeFrom} onChange={(event) => commit({ to: event.target.value })} />
          </Field>
          <Field label={t("common.site")}>
            <select className={controlClass} value={siteId} aria-label={t("common.site")} onChange={(event) => commit({ site: event.target.value })}>
              <option value="">{t("arcadeScreens.allSites")}</option>
              {siteOptions.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </Field>
          <Field label={t("arcadeScreens.status")}>
            <select className={controlClass} value={status} aria-label={t("arcadeScreens.status")} onChange={(event) => commit({ status: event.target.value })}>
              <option value="">{t("arcadeScreens.allStatuses")}</option>
              {statusOptions.map((item) => <option key={item} value={item}>{arcadeStatusName(t, item)}</option>)}
            </select>
          </Field>
          <Field label={t("common.search")}>
            <FecSearch value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("arcadeScreens.searchMachineIssue")} aria-label={t("arcadeScreens.searchMachineIssue")} />
          </Field>
        </div>
      </FecCard>

      {weekly.isPending && !report ? <FecLoader label={t("arcadeScreens.buildingReport")} /> : null}
      {weekly.isError ? <p className="text-sm text-destructive">{weekly.error instanceof Error ? weekly.error.message : t("arcadeOps.failed")}</p> : null}

      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {tiles.map((tile) => (
              <TintedKpiCard key={tile.key} compact tint={tile.tint} icon={tile.icon} title={tile.title} value={tile.value} />
            ))}
          </div>
          <FecCard padded={false}>
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-semibold">{report.title}</h2>
              <p className="text-xs text-muted-foreground">{t("arcadeScreens.records", { count: rows.length })}</p>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("arcadeScreens.noMatchingFaults")}</p>
            ) : (
              <FecTable>
                <FecTableHeader>
                  <FecTableRow>
                    <FecTableHead>{t("arcadeScreens.machine")}</FecTableHead>
                    <FecTableHead>{t("common.site")}</FecTableHead>
                    <FecTableHead>{t("arcadeScreens.status")}</FecTableHead>
                    <FecTableHead>{t("arcadeImport.issue")}</FecTableHead>
                    <FecTableHead>{t("arcadeImport.date")}</FecTableHead>
                    <FecTableHead className="print:hidden"><span className="sr-only">{t("common.edit")}</span></FecTableHead>
                  </FecTableRow>
                </FecTableHeader>
                <FecTableBody>
                  {rows.map((row) => (
                    <FecTableRow key={row.id}>
                      <FecTableCell className="font-medium">{row.machine}</FecTableCell>
                      <FecTableCell>{siteOptions.find((site) => site.id === row.locationId)?.name ?? row.site}</FecTableCell>
                      <FecTableCell>
                        <span className="flex flex-wrap gap-1">
                          <StatusBadge status={row.status} />
                          {row.isRepeat ? <StatusBadge status="REPEAT" /> : null}
                        </span>
                      </FecTableCell>
                      <FecTableCell className="max-w-md whitespace-normal">{row.summary}</FecTableCell>
                      <FecTableCell className="whitespace-nowrap tabular-nums">{row.reportedOn}</FecTableCell>
                      <FecTableCell className="print:hidden">
                        {canOperate ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => setDraft(draftFrom(row))}>
                            <Pencil className="me-1.5 h-3.5 w-3.5" />
                            {t("common.edit")}
                          </Button>
                        ) : null}
                      </FecTableCell>
                    </FecTableRow>
                  ))}
                </FecTableBody>
              </FecTable>
            )}
          </FecCard>
        </>
      ) : null}

      <FecModal open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null); }}>
        <FecModalContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {draft ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate(draft);
              }}
            >
              <FecModalHeader>
                <FecModalTitle>{t("arcadeScreens.editFault")}</FecModalTitle>
                <p className="text-sm text-muted-foreground">{draft.ticketNumber}</p>
              </FecModalHeader>
              <Field label={t("arcadeImport.issue")}>
                <Textarea required minLength={8} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("common.site")}>
                  <select
                    className={controlClass}
                    value={draft.locationId}
                    aria-label={t("common.site")}
                    onChange={(event) => setDraft({ ...draft, locationId: event.target.value, machineId: "", machineName: "" })}
                  >
                    <option value="">{t("arcadeScreens.selectSite")}</option>
                    {editSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                  </select>
                </Field>
                <Field label={t("arcadeScreens.machine")}>
                  <select
                    className={controlClass}
                    value={draft.machineId}
                    aria-label={t("arcadeScreens.machine")}
                    onChange={(event) => {
                      const machine = machineChoices.find((row) => row.id === event.target.value);
                      setDraft({ ...draft, machineId: event.target.value, machineName: machine?.name ?? draft.machineName });
                    }}
                  >
                    <option value="">{t("arcadeScreens.selectMachine")}</option>
                    {machineMissing ? <option value={draft.machineId}>{draft.machineName}</option> : null}
                    {machineChoices.map((row) => <option key={row.id} value={row.id}>{row.asset_code} · {row.name}</option>)}
                  </select>
                </Field>
                <Field label={t("arcadeScreens.status")}>
                  <select
                    className={controlClass}
                    value={draft.status}
                    aria-label={t("arcadeScreens.status")}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                  >
                    {(isFaultStatus(draft.status) ? [...FAULT_STATUSES] : [draft.status, ...FAULT_STATUSES])
                      .filter((item) => item !== "CLOSED" || canClose || draft.status === "CLOSED")
                      .map((item) => (
                        <option key={item} value={item}>{arcadeStatusName(t, item)}</option>
                      ))}
                  </select>
                </Field>
                <Field label={t("arcadeImport.date")}>
                  <Input type="date" value={draft.reportedOn} onChange={(event) => setDraft({ ...draft, reportedOn: event.target.value })} />
                </Field>
              </div>
              {closing ? (
                <div className={cn("grid gap-3 sm:grid-cols-2")}>
                  {([
                    ["problem", draft.problem],
                    ["diagnosis", draft.diagnosis],
                    ["actionTaken", draft.actionTaken],
                    ["partsUsed", draft.partsUsed],
                    ["testingPerformed", draft.testingPerformed],
                    ["finalResult", draft.finalResult],
                    ["recommendations", draft.recommendations],
                  ] as const).map(([key, value]) => (
                    <Field key={key} label={t(`arcadeScreens.${key}`)}>
                      <Textarea value={value} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
                    </Field>
                  ))}
                  <p className="text-xs text-muted-foreground sm:col-span-2">{t("arcadeScreens.closureHint")}</p>
                </div>
              ) : null}
              <FecModalFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>{t("common.cancel")}</Button>
                <Button type="submit" disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button>
              </FecModalFooter>
            </form>
          ) : null}
        </FecModalContent>
      </FecModal>
    </div>
  );
}

function draftFrom(row: WeeklyFaultRow): Draft {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    description: row.summary,
    status: row.status,
    locationId: row.locationId,
    machineId: row.machineId,
    machineName: row.machine,
    reportedOn: row.reportedOn,
    originalReportedOn: row.reportedOn,
    problem: "",
    diagnosis: "",
    actionTaken: "",
    partsUsed: "",
    testingPerformed: "",
    finalResult: "",
    recommendations: "",
    hydrated: false,
  };
}

type ReportTranslate = (key: string, options?: Record<string, unknown>) => string;

type ExportTiles = {
  opened: number;
  resolved: number;
  pending: number;
  waitingParts: number;
  waitingSuppliers: number;
  repeats: number;
  availability: number | null;
  pm: number | null;
  parts: number | null;
  cost: number | null;
};

async function exportExcel(report: WeeklyReport, rows: WeeklyFaultRow[], t: ReportTranslate) {
  const { downloadXlsx, objectsToRows } = await import("@/lib/spreadsheet/workbook");
  await downloadXlsx(`arcade-weekly-${report.weekStart}.xlsx`, [
    { name: t("arcadeScreens.sheetFaults"), rows: objectsToRows(rows) },
    {
      name: t("arcadeScreens.sheetSites"),
      rows: objectsToRows(report.siteGroups.map(({ faults: _faults, ...site }) => site)),
    },
  ]);
}

async function exportPdf(report: WeeklyReport, rows: WeeklyFaultRow[], tiles: ExportTiles, t: ReportTranslate) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(report.title, 14, 16);
  doc.setFontSize(10);
  const lines = [
    t("arcadeScreens.weekRange", { from: report.weekStart, to: report.weekEnd }),
    t("arcadeScreens.weeklyLine", { opened: tiles.opened, resolved: tiles.resolved, pending: tiles.pending, parts: tiles.waitingParts, suppliers: tiles.waitingSuppliers, repeats: tiles.repeats }),
    t("arcadeScreens.weeklyMeta", { availability: tiles.availability ?? "—", pm: tiles.pm ?? "—", parts: tiles.parts ?? "—", cost: tiles.cost ?? "—" }),
    ...rows.slice(0, 40).map((fault) => `${fault.ticketNumber} ${fault.machine} ${fault.summary}`),
  ];
  let y = 26;
  for (const line of lines) {
    doc.text(line.slice(0, 110), 14, y);
    y += 6;
    if (y > 280) break;
  }
  doc.save(`arcade-weekly-${report.weekStart}.pdf`);
}

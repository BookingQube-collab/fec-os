"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReportExport } from "@/hooks/use-report-export";
import { canUserDo } from "@/lib/rbac";
import {
  getQuotaDashboard,
  listQuotaEmployees,
  listRecruitmentLookups,
  listWorkforceQuotas,
  upsertWorkforceQuota,
} from "@/lib/hr-recruitment.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useUserRoles } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type EmpFilter = "active" | "on_leave" | "serving_notice" | "all";

export default function HrQuotaPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const roles = useUserRoles();
  const canManage = canUserDo(roles, "quota.manage");
  const [groupBy, setGroupBy] = useState<"location" | "department">("location");
  const [empOpen, setEmpOpen] = useState(false);
  const [empScope, setEmpScope] = useState<{
    locationId?: string | null;
    departmentId?: string | null;
    designation?: string | null;
    employmentCategory?: string | null;
    statusFilter: EmpFilter;
    title: string;
  } | null>(null);

  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designation, setDesignation] = useState("");
  const [category, setCategory] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [effectiveOn, setEffectiveOn] = useState(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }),
  );

  const lookups = useQuery({
    queryKey: queryKeys.people.hrQuota({ view: "lookups" }),
    queryFn: () => listRecruitmentLookups(),
    staleTime: STALE.people,
  });

  const dashboard = useQuery({
    queryKey: queryKeys.people.hrQuota({ groupBy }),
    queryFn: () => getQuotaDashboard({ groupBy }),
    staleTime: STALE.people,
  });

  const quotas = useQuery({
    queryKey: queryKeys.people.hrQuota({ view: "list" }),
    queryFn: () => listWorkforceQuotas({}),
    staleTime: STALE.people,
  });

  const employees = useQuery({
    queryKey: queryKeys.people.hrQuota({ view: "employees", ...empScope }),
    queryFn: () =>
      listQuotaEmployees({
        locationId: empScope?.locationId ?? null,
        departmentId: empScope?.departmentId ?? null,
        designation: empScope?.designation ?? null,
        employmentCategory: (empScope?.employmentCategory as never) ?? null,
        statusFilter: empScope?.statusFilter ?? "all",
      }),
    enabled: empOpen && Boolean(empScope),
    staleTime: STALE.people,
  });

  const exportRows = useMemo(
    () =>
      (dashboard.data?.tiles ?? []).map((tile) => ({
        location: tile.locationName ?? "—",
        department: tile.departmentName ?? "—",
        designation: tile.designation ?? "—",
        category: tile.employmentCategory ?? "—",
        approved: tile.approvedQuota,
        active: tile.activeCount,
        onLeave: tile.onLeaveCount,
        notice: tile.servingNoticeCount,
        open: tile.openVacanciesCount,
        selected: tile.selectedNotJoinedCount,
        available: tile.availablePositions,
        variance: tile.excessShortage,
      })),
    [dashboard.data?.tiles],
  );

  const { exportPdf, exportExcel } = useReportExport({
    pageKey: "HR_Quota",
    title: t("hr.quota.title"),
    venueLabel: groupBy,
    kpis: [
      { label: t("hr.quota.openVacancies"), value: dashboard.data?.summary.openVacancies ?? 0 },
      { label: t("hr.quota.shortage"), value: dashboard.data?.summary.quotaShortage ?? 0 },
      { label: t("hr.quota.excess"), value: dashboard.data?.summary.quotaExcess ?? 0 },
    ],
    columns: [
      { key: "location", header: t("hr.quota.location") },
      { key: "department", header: t("hr.quota.department") },
      { key: "approved", header: t("hr.quota.approved") },
      { key: "active", header: t("hr.quota.active") },
      { key: "onLeave", header: t("hr.quota.onLeave") },
      { key: "notice", header: t("hr.quota.servingNotice") },
      { key: "open", header: t("hr.quota.openVacancies") },
      { key: "available", header: t("hr.quota.available") },
      { key: "variance", header: t("hr.quota.variance") },
    ],
    rows: exportRows,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrQuota() });
    void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
  };

  const save = useMutation({
    mutationFn: () =>
      upsertWorkforceQuota({
        locationId: locationId || null,
        departmentId: departmentId || null,
        designation: designation || null,
        employmentCategory: (category || null) as never,
        approvedHeadcount: Number(headcount) || 0,
        effectiveOn,
      }),
    onSuccess: () => {
      toast.success(t("hr.quota.saved"));
      setDesignation("");
      setHeadcount("1");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEmployees = (
    tile: (typeof exportRows)[number] extends never ? never : NonNullable<typeof dashboard.data>["tiles"][number],
    statusFilter: EmpFilter,
    title: string,
  ) => {
    setEmpScope({
      locationId: tile.locationId,
      departmentId: tile.departmentId,
      designation: tile.designation,
      employmentCategory: tile.employmentCategory,
      statusFilter,
      title,
    });
    setEmpOpen(true);
  };

  return (
    <CapabilityGate
      capability="quota.view"
      fallback={
        <PageHeader
          icon={BarChart3}
          kicker={t("hr.quota.kicker")}
          title={t("hr.quota.title")}
          subtitle={t("hr.quota.noAccess")}
        />
      }
    >
      <HrShell>
        <PageHeader
          icon={BarChart3}
          kicker={t("hr.quota.kicker")}
          title={t("hr.quota.title")}
          subtitle={t("hr.quota.subtitle")}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void exportExcel()}>
                {t("hr.quota.exportExcel")}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void exportPdf()}>
                {t("hr.quota.exportPdf")}
              </Button>
            </div>
          }
        />

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HrPanel className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("hr.quota.openVacancies")}</p>
            <p className="mt-1 text-2xl font-semibold">{dashboard.data?.summary.openVacancies ?? "—"}</p>
          </HrPanel>
          <HrPanel className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("hr.quota.shortage")}</p>
            <p className="mt-1 text-2xl font-semibold text-amber-700">{dashboard.data?.summary.quotaShortage ?? "—"}</p>
          </HrPanel>
          <HrPanel className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("hr.quota.excess")}</p>
            <p className="mt-1 text-2xl font-semibold text-sky-800">{dashboard.data?.summary.quotaExcess ?? "—"}</p>
          </HrPanel>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["location", "department"] as const).map((g) => (
            <Button
              key={g}
              type="button"
              size="sm"
              variant={groupBy === g ? "default" : "secondary"}
              onClick={() => setGroupBy(g)}
            >
              {t(`hr.quota.groupBy.${g}`)}
            </Button>
          ))}
        </div>

        {canManage ? (
          <HrSection title={t("hr.quota.addTitle")}>
            <HrPanel className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>{t("hr.quota.location")}</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">{t("hr.quota.any")}</option>
                  {(lookups.data?.locations ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("hr.quota.department")}</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  <option value="">{t("hr.quota.any")}</option>
                  {(lookups.data?.departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("hr.quota.designation")}</Label>
                <Input className="mt-1" value={designation} onChange={(e) => setDesignation(e.target.value)} />
              </div>
              <div>
                <Label>{t("hr.quota.category")}</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">{t("hr.quota.any")}</option>
                  {(lookups.data?.categories ?? []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t("hr.quota.approved")}</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                />
              </div>
              <div>
                <Label>{t("hr.quota.effectiveOn")}</Label>
                <Input
                  className="mt-1"
                  type="date"
                  value={effectiveOn}
                  onChange={(e) => setEffectiveOn(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
                  {t("hr.quota.save")}
                </Button>
              </div>
            </HrPanel>
          </HrSection>
        ) : null}

        <HrSection title={t("hr.quota.dashboardTitle")}>
          {!dashboard.data?.tiles.length ? (
            <HrEmptyState title={t("hr.quota.empty")} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("hr.quota.scope")}</th>
                    <th className="px-3 py-2">{t("hr.quota.approved")}</th>
                    <th className="px-3 py-2">{t("hr.quota.active")}</th>
                    <th className="px-3 py-2">{t("hr.quota.onLeave")}</th>
                    <th className="px-3 py-2">{t("hr.quota.servingNotice")}</th>
                    <th className="px-3 py-2">{t("hr.quota.openVacancies")}</th>
                    <th className="px-3 py-2">{t("hr.quota.selected")}</th>
                    <th className="px-3 py-2">{t("hr.quota.available")}</th>
                    <th className="px-3 py-2">{t("hr.quota.variance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.data.tiles.map((tile) => (
                    <tr key={tile.key} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {groupBy === "location"
                            ? tile.locationName ?? t("hr.quota.any")
                            : tile.departmentName ?? t("hr.quota.any")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[tile.departmentName, tile.designation, tile.employmentCategory]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2">{tile.approvedQuota}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="font-medium text-sky-800 underline-offset-2 hover:underline"
                          onClick={() => openEmployees(tile, "active", t("hr.quota.active"))}
                        >
                          {tile.activeCount}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() => openEmployees(tile, "on_leave", t("hr.quota.onLeave"))}
                        >
                          {tile.onLeaveCount}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() => openEmployees(tile, "serving_notice", t("hr.quota.servingNotice"))}
                        >
                          {tile.servingNoticeCount}
                        </button>
                      </td>
                      <td className="px-3 py-2">{tile.openVacanciesCount}</td>
                      <td className="px-3 py-2">{tile.selectedNotJoinedCount}</td>
                      <td className="px-3 py-2">{tile.availablePositions}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            tile.excessShortage > 0 && "bg-sky-100 text-sky-900",
                            tile.excessShortage < 0 && "bg-amber-100 text-amber-900",
                          )}
                        >
                          {tile.excessShortage > 0
                            ? `+${tile.excessShortage}`
                            : tile.excessShortage}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HrSection>

        {quotas.data?.length ? (
          <HrSection title={t("hr.quota.configured")}>
            <ul className="space-y-2 text-sm">
              {quotas.data.map((q) => (
                <li key={q.id} className="rounded-md border px-3 py-2">
                  <span className="font-medium">{q.approvedHeadcount}</span>
                  {" · "}
                  {[q.locationName, q.departmentName, q.designation, q.employmentCategory]
                    .filter(Boolean)
                    .join(" · ") || t("hr.quota.any")}
                  <span className="text-muted-foreground"> · {q.effectiveOn}</span>
                </li>
              ))}
            </ul>
          </HrSection>
        ) : null}

        <Dialog open={empOpen} onOpenChange={setEmpOpen}>
          <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                {empScope?.title ?? t("hr.quota.employees")}
              </DialogTitle>
            </DialogHeader>
            {!employees.data?.length ? (
              <p className="text-sm text-muted-foreground">{t("hr.quota.noEmployees")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {employees.data.map((e) => (
                  <li key={e.staffId} className="rounded-md border px-3 py-2">
                    <div className="font-medium">{e.fullName}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{e.employmentCategory ?? "—"}</span>
                      <Badge variant="secondary">
                        CV {e.cvAvailable ? t("hr.quota.yes") : t("hr.quota.no")}
                      </Badge>
                      <Badge variant="secondary">
                        QID{" "}
                        {e.qidAvailable
                          ? e.qidExpired
                            ? t("hr.quota.expired")
                            : e.qidExpiry ?? t("hr.quota.yes")
                          : t("hr.quota.no")}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      </HrShell>
    </CapabilityGate>
  );
}

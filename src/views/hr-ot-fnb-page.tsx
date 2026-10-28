"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coffee, Timer, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrKpiTile } from "@/components/hr/hr-kpi-tile";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import {
  getOtPolicySnapshot,
  listFnbCafeOtClaims,
  listStaffForFnbCafeOt,
  submitFnbCafeOtClaim,
} from "@/lib/hr-ot.functions";
import {
  FNB_CAFE_OT_AUTO_APPROVED_STATUS,
  fnbCafeOtFieldErrors,
  groupOtClaimsIntoRequests,
  HR_OT_RATE_TYPES,
  isFnbCafeOtEntryReady,
  previewFnbCafeOtAmount,
  type FnbCafeOtFieldError,
  type HrOtRateType,
} from "@/lib/hr-ot";
import { invalidateOtLists } from "@/lib/people-query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { userFacingActionError } from "@/lib/user-facing-action-error";
import { cn } from "@/lib/utils";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtMins(m: number | null | undefined) {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${String(min).padStart(2, "0")}m`;
}

type FnbStaffPick = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  locationName: string | null;
};

type FnbOtDraft = {
  periodFrom: string;
  periodTo: string;
  requiredHours: string;
  rateType: HrOtRateType;
  purpose: string;
};

function emptyDraft(): FnbOtDraft {
  return {
    periodFrom: monthStartIso(),
    periodTo: todayIso(),
    requiredHours: "1",
    rateType: "weekday",
    purpose: "",
  };
}

function fieldErrorLabel(t: (key: string) => string, code: FnbCafeOtFieldError) {
  switch (code) {
    case "staff":
      return t("hr.ot.fnb.staffMissing");
    case "period":
      return t("hr.ot.fnb.periodInvalid");
    case "hours":
      return t("hr.ot.fnb.hoursInvalid");
    case "purpose":
      return t("hr.ot.purposeMissing");
  }
}

function rateMultiplierFor(
  rateType: HrOtRateType,
  policy:
    | {
        rateWeekday: number;
        rateWeeklyOff: number;
        ratePublicHoliday: number;
        rateEid: number;
      }
    | undefined,
) {
  if (rateType === "weekday") return policy?.rateWeekday ?? 1.25;
  if (rateType === "weekly_off") return policy?.rateWeeklyOff ?? 1.5;
  if (rateType === "public_holiday") return policy?.ratePublicHoliday ?? 1.5;
  return policy?.rateEid ?? 2.5;
}

export default function HrOtFnbPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<FnbOtDraft>(emptyDraft);
  const [showErrors, setShowErrors] = useState(false);

  const teamStaff = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-fnb-staff" }),
    queryFn: async () => {
      const result = await listStaffForFnbCafeOt();
      if (result && typeof result === "object" && "ok" in result) {
        if (!result.ok) throw new Error(result.error ?? "Failed to load team");
        return (result.data ?? []) as FnbStaffPick[];
      }
      return (result ?? []) as FnbStaffPick[];
    },
    staleTime: STALE.people,
  });

  const policy = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-policy" }),
    queryFn: () => getOtPolicySnapshot(),
    staleTime: STALE.peopleCatalog,
  });

  const recent = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-fnb-recent" }),
    queryFn: () => listFnbCafeOtClaims({ limit: 40 }),
    staleTime: STALE.people,
  });

  const staffById = useMemo(() => {
    const map = new Map<string, FnbStaffPick>();
    for (const row of teamStaff.data ?? []) map.set(row.id, row);
    return map;
  }, [teamStaff.data]);

  const selectedStaff = useMemo(
    () => selectedIds.map((id) => staffById.get(id)).filter((row): row is FnbStaffPick => Boolean(row)),
    [selectedIds, staffById],
  );

  const staffOptions = useMemo(
    () =>
      (teamStaff.data ?? []).map((row) => ({
        value: row.id,
        label: row.employeeCode ? `${row.fullName} (${row.employeeCode})` : row.fullName,
        description: [row.jobTitle, row.locationName, row.department].filter(Boolean).join(" · "),
        keywords: `${row.fullName} ${row.employeeCode ?? ""} ${row.department ?? ""} ${row.jobTitle ?? ""}`,
      })),
    [teamStaff.data],
  );

  const patchDraft = (patch: Partial<FnbOtDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const setSelectedStaffIds = (nextIds: string[]) => {
    setSelectedIds(nextIds);
    setShowErrors(false);
  };

  const removeStaff = (staffId: string) => {
    setSelectedStaffIds(selectedIds.filter((id) => id !== staffId));
  };

  const hoursNum = Number(draft.requiredHours);
  const formErrors = useMemo(
    () =>
      fnbCafeOtFieldErrors({
        staffId: selectedStaff[0]?.id ?? null,
        periodFrom: draft.periodFrom,
        periodTo: draft.periodTo,
        requiredHours: hoursNum,
        purpose: draft.purpose,
      }),
    [draft.periodFrom, draft.periodTo, draft.purpose, hoursNum, selectedStaff],
  );

  const ready =
    selectedStaff.length > 0 &&
    selectedStaff.every((person) =>
      isFnbCafeOtEntryReady({
        staffId: person.id,
        periodFrom: draft.periodFrom,
        periodTo: draft.periodTo,
        requiredHours: hoursNum,
        purpose: draft.purpose,
      }),
    );

  const estimate =
    Number.isFinite(hoursNum) && hoursNum > 0
      ? previewFnbCafeOtAmount({
          requiredHours: hoursNum,
          rateMultiplier: rateMultiplierFor(draft.rateType, policy.data),
        })
      : 0;

  const submit = useMutation({
    mutationFn: submitFnbCafeOtClaim,
    onSuccess: (result) => {
      toast.success(
        t("hr.ot.fnb.submitted", {
          count: result.requestCount,
          status: t(`hr.ot.status.${FNB_CAFE_OT_AUTO_APPROVED_STATUS}`),
        }),
      );
      setSelectedIds([]);
      setDraft(emptyDraft());
      setShowErrors(false);
      invalidateOtLists(qc);
    },
    onError: (e: Error) => toast.error(userFacingActionError(e, t("hr.ot.fnb.submitFailed"))),
  });

  const recentFnbGroups = useMemo(
    () => groupOtClaimsIntoRequests(recent.data ?? []).slice(0, 20),
    [recent.data],
  );

  const recentSummary = useMemo(() => {
    let hours = 0;
    let amount = 0;
    for (const group of recentFnbGroups) {
      hours += group.totalClaimedMinutes / 60;
      amount += group.totalAmountQar;
    }
    return {
      total: recentFnbGroups.length,
      hours: Math.round(hours * 100) / 100,
      amount: Math.round(amount * 100) / 100,
    };
  }, [recentFnbGroups]);

  return (
    <CapabilityGate
      capability="hr.ot.fnb"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.ot.fnb.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Coffee}
          kicker={t("hr.ot.fnb.kicker")}
          title={t("hr.ot.fnb.title")}
          subtitle={t("hr.ot.fnb.subtitle")}
        >
          {policy.data ? (
            <p className="text-xs text-muted-foreground hr-enter">
              <Link href="/people/hr/ot" className="underline underline-offset-2">
                {t("hr.ot.fnb.backToOps")}
              </Link>
              {" · "}
              {t("hr.ot.policyHint", {
                min: policy.data.minClaimableMinutes,
                weekday: policy.data.rateWeekday,
                off: policy.data.rateWeeklyOff,
                holiday: policy.data.ratePublicHoliday,
                eid: policy.data.rateEid,
              })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground hr-enter">
              <Link href="/people/hr/ot" className="underline underline-offset-2">
                {t("hr.ot.fnb.backToOps")}
              </Link>
            </p>
          )}

          <HrPanel delay={1}>
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t("hr.ot.fnb.formTitle")}</h3>
                  <p className="text-xs text-muted-foreground">{t("hr.ot.fnb.formHint")}</p>
                </div>
                <Badge variant="secondary">{t("hr.ot.fnb.autoApprovedBadge")}</Badge>
              </div>

              <div>
                <Label htmlFor="fnb-ot-staff">{t("hr.ot.staffSearch")}</Label>
                <SearchableSelect
                  id="fnb-ot-staff"
                  multiple
                  values={selectedIds}
                  onValuesChange={setSelectedStaffIds}
                  options={staffOptions}
                  placeholder={t("hr.ot.staffSearchPlaceholder")}
                  selectedCountLabel={(count) => t("hr.ot.staffSelectedCount", { count })}
                  noMatchesLabel={
                    teamStaff.isLoading
                      ? t("hr.ot.fnb.loadingTeam")
                      : t("hr.ot.fnb.noTeamStaff")
                  }
                  disabled={teamStaff.isLoading}
                />
                {selectedStaff.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedStaff.map((person) => (
                      <Badge
                        key={person.id}
                        variant="outline"
                        className="gap-1 border-emerald-500/40 pe-1 text-[10px] text-emerald-800 dark:text-emerald-300"
                      >
                        {person.employeeCode
                          ? `${person.fullName} (${person.employeeCode})`
                          : person.fullName}
                        <button
                          type="button"
                          className="rounded-sm hover:bg-muted"
                          onClick={() => removeStaff(person.id)}
                          aria-label={t("hr.ot.removeStaff", { name: person.fullName })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">{t("hr.ot.fnb.pickStaff")}</p>
                )}
                {teamStaff.isError ? (
                  <p className="mt-1 text-xs text-destructive">
                    {userFacingActionError(teamStaff.error, t("hr.ot.teamLoadFailed"))}
                  </p>
                ) : !teamStaff.isLoading && staffOptions.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{t("hr.ot.fnb.noTeamStaff")}</p>
                ) : null}
              </div>

              <div className="rounded-md border border-[var(--hr-border)] p-3">
                <p className="mb-3 text-xs text-muted-foreground">{t("hr.ot.fnb.applySharedHint")}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="fnb-ot-from">{t("hr.ot.fnb.periodFrom")}</Label>
                    <Input
                      id="fnb-ot-from"
                      type="date"
                      value={draft.periodFrom}
                      onChange={(e) => patchDraft({ periodFrom: e.target.value })}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="fnb-ot-to">{t("hr.ot.fnb.periodTo")}</Label>
                    <Input
                      id="fnb-ot-to"
                      type="date"
                      value={draft.periodTo}
                      onChange={(e) => patchDraft({ periodTo: e.target.value })}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="fnb-ot-hours">{t("hr.ot.fnb.requiredHours")}</Label>
                    <Input
                      id="fnb-ot-hours"
                      type="number"
                      min={1}
                      max={200}
                      step={0.25}
                      value={draft.requiredHours}
                      onChange={(e) => patchDraft({ requiredHours: e.target.value })}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="fnb-ot-rate">{t("hr.ot.rateType")}</Label>
                    <select
                      id="fnb-ot-rate"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={draft.rateType}
                      onChange={(e) =>
                        patchDraft({ rateType: e.target.value as HrOtRateType })
                      }
                    >
                      {HR_OT_RATE_TYPES.map((rate) => (
                        <option key={rate} value={rate}>
                          {t(`hr.ot.rateTypes.${rate}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="fnb-ot-purpose">{t("hr.ot.purpose")}</Label>
                  <Textarea
                    id="fnb-ot-purpose"
                    rows={2}
                    maxLength={1000}
                    value={draft.purpose}
                    onChange={(e) => patchDraft({ purpose: e.target.value })}
                    placeholder={t("hr.ot.fnb.purposePlaceholder")}
                  />
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {t("hr.ot.fnb.amountHint", {
                    amount: estimate.toFixed(2),
                    note: t("hr.ot.fnb.amountHintBasic"),
                  })}
                  {selectedStaff.length > 1
                    ? ` · ${t("hr.ot.fnb.perStaffEstimate", { count: selectedStaff.length })}`
                    : null}
                </p>

                {showErrors && formErrors.length > 0 ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-destructive">
                    {formErrors.map((code) => (
                      <li key={code}>{fieldErrorLabel(t, code)}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {selectedStaff.length > 0 ? (
                <div className="space-y-2">
                  {selectedStaff.map((person) => (
                    <div
                      key={person.id}
                      className="rounded-md border border-[var(--hr-border)] p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{person.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("hr.ot.employeeId")}: {person.employeeCode ?? "—"} ·{" "}
                            {t("hr.ot.phone")}: {person.phone ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("hr.ot.department")}: {person.department ?? "—"} ·{" "}
                            {t("hr.ot.jobTitle")}: {person.jobTitle ?? "—"}
                            {person.locationName ? ` · ${person.locationName}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {draft.periodFrom} → {draft.periodTo} · {draft.requiredHours || "—"}h ·{" "}
                            {t(`hr.ot.rateTypes.${draft.rateType}`)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => removeStaff(person.id)}
                        >
                          {t("hr.ot.remove")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={submit.isPending}
                  onClick={() => {
                    if (!ready) {
                      setShowErrors(true);
                      toast.error(t("hr.ot.fnb.completeAll"));
                      return;
                    }
                    submit.mutate({
                      entries: selectedStaff.map((person) => ({
                        staffId: person.id,
                        periodFrom: draft.periodFrom,
                        periodTo: draft.periodTo,
                        requiredHours: Number(draft.requiredHours),
                        rateType: draft.rateType,
                        purpose: draft.purpose.trim(),
                      })),
                    });
                  }}
                >
                  {submit.isPending ? t("hr.ot.fnb.submitting") : t("hr.ot.fnb.submit")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedStaff.length > 0
                    ? t("hr.ot.staffSelectedCount", { count: selectedStaff.length })
                    : t("hr.ot.fnb.staffMissing")}
                </span>
              </div>
            </div>
          </HrPanel>

          <div className="grid gap-3 sm:grid-cols-3 hr-enter">
            <HrKpiTile
              label={t("hr.ot.fnb.summaryRecent")}
              value={recentSummary.total}
              tone="cream"
              delay={0}
            />
            <HrKpiTile
              label={t("hr.ot.colHours")}
              value={`${recentSummary.hours}h`}
              tone="mustard"
              delay={1}
            />
            <HrKpiTile
              label={t("hr.ot.colAmount")}
              value={recentSummary.amount.toFixed(2)}
              tone="ok"
              delay={2}
            />
          </div>

          <HrPanel delay={2} flat className="overflow-hidden">
            <div className="space-y-2 border-b border-[var(--hr-border)] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{t("hr.ot.fnb.recentTitle")}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{t("hr.ot.fnb.recentHint")}</p>
            </div>
            {recent.isLoading ? (
              <div className="p-4 sm:p-5">
                <p className="text-xs text-muted-foreground">{t("hr.ot.fnb.loadingTeam")}</p>
              </div>
            ) : recentFnbGroups.length === 0 ? (
              <div className="p-4 sm:p-5">
                <HrEmptyState message={t("hr.ot.fnb.recentEmpty")} icon={Coffee} />
              </div>
            ) : (
              <div className="space-y-3 p-2 sm:p-3">
                <div className="hr-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("hr.ot.colRequest")}</th>
                        <th>{t("hr.ot.colStaff")}</th>
                        <th>{t("hr.ot.fnb.colPeriod")}</th>
                        <th>{t("hr.ot.colHours")}</th>
                        <th>{t("hr.ot.colAmount")}</th>
                        <th>{t("hr.ot.colStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentFnbGroups.map((group) => {
                        const first = group.claims[0];
                        const periodLabel =
                          first?.periodFrom && first?.periodTo
                            ? `${first.periodFrom} → ${first.periodTo}`
                            : group.workDates.join(", ") || "—";
                        const rateType = first?.rateType ?? "weekday";
                        return (
                          <tr key={group.key}>
                            <td className="align-middle">
                              <p className="font-mono text-xs tabular-nums">
                                {group.requestNumber ?? "—"}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t(`hr.ot.rateTypes.${rateType}`)}
                              </p>
                            </td>
                            <td className="align-middle">
                              <p className="font-medium">
                                {group.staffNames.join(", ") || t("hr.ot.requestFallback")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {[group.locationName, group.department].filter(Boolean).join(" · ") ||
                                  "—"}
                              </p>
                            </td>
                            <td className="align-middle text-xs tabular-nums">{periodLabel}</td>
                            <td className="align-middle tabular-nums text-xs">
                              {fmtMins(group.totalClaimedMinutes)}
                            </td>
                            <td className="align-middle tabular-nums text-xs">
                              {group.totalAmountQar.toFixed(2)}
                            </td>
                            <td className="align-middle">
                              <Badge
                                variant={
                                  group.status === "gm_approved" ||
                                  group.status === "payroll_posted" ||
                                  group.status === FNB_CAFE_OT_AUTO_APPROVED_STATUS
                                    ? "success"
                                    : "secondary"
                                }
                                className={cn(
                                  group.status === FNB_CAFE_OT_AUTO_APPROVED_STATUS &&
                                    "border-emerald-500/40",
                                )}
                              >
                                {t(`hr.ot.status.${group.status}`)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

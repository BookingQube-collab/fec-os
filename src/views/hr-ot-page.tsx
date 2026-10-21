"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Timer, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import {
  SupervisorOtPrintDialog,
  type SupervisorOtPrintPayload,
  type SupervisorOtPrintStaff,
} from "@/components/hr/supervisor-ot-print-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import {
  actOnOtRequestBatch,
  getOtMonthlySummaries,
  getOtPolicySnapshot,
  listOtClaims,
  listStaffForSupervisorOt,
  reviseSupervisorOtRequest,
  setStaffContractWorkingDays,
  submitSupervisorOtClaim,
} from "@/lib/hr-ot.functions";
import {
  canEditOtBeforeHoo,
  canRequestOtChanges,
  filterOtRequestGroups,
  groupOtClaimsIntoRequests,
  HR_OT_HIERARCHY_STEPS,
  HR_OT_RATE_TYPES,
  isSupervisorOtStaffEntryReady,
  normalizeSupervisorOtDays,
  partitionSupervisorOtPicks,
  sumSupervisorOtDayHours,
  supervisorOtStaffFieldErrors,
  type HrOtRateType,
  type HrOtStatus,
  type OtRequestGroup,
  type SupervisorOtStaffFieldError,
} from "@/lib/hr-ot";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { canUserDo } from "@/lib/rbac";
import { userFacingActionError } from "@/lib/user-facing-action-error";
import { cn } from "@/lib/utils";

function fmtMins(m: number | null | undefined) {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${String(min).padStart(2, "0")}m`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type OtStaffPick = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  locationName: string | null;
  contractWorkingDays: number | null;
  supervisorContract: boolean;
};

type StaffOtDraft = {
  /** Per-date extra hours (string for controlled inputs). */
  hoursByDate: Record<string, string>;
  dateDraft: string;
  rateType: HrOtRateType;
  purpose: string;
};

function emptyStaffOtDraft(today = todayIso()): StaffOtDraft {
  return {
    hoursByDate: { [today]: "1" },
    dateDraft: today,
    rateType: "weekday",
    purpose: "",
  };
}

function draftWorkDates(draft: StaffOtDraft): string[] {
  return Object.keys(draft.hoursByDate).sort();
}

function draftDayEntries(draft: StaffOtDraft) {
  return normalizeSupervisorOtDays(
    draftWorkDates(draft).map((workDate) => ({
      workDate,
      hours: Number(draft.hoursByDate[workDate]),
    })),
  );
}

function SupervisorOtRequest({ onSubmitted }: { onSubmitted: () => void }) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const canSetContract = canUserDo(roles, "hr.profile.edit");
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [contractDraftByStaff, setContractDraftByStaff] = useState<Record<string, "26" | "28">>({});
  const [draftByStaff, setDraftByStaff] = useState<Record<string, StaffOtDraft>>({});
  const [printPayload, setPrintPayload] = useState<SupervisorOtPrintPayload | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [showCardErrors, setShowCardErrors] = useState(false);

  const teamStaff = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-staff-team" }),
    queryFn: async () => {
      const result = await listStaffForSupervisorOt();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: open,
    staleTime: STALE.people,
  });

  const staffById = useMemo(() => {
    const map = new Map<string, OtStaffPick>();
    for (const row of teamStaff.data ?? []) map.set(row.id, row);
    return map;
  }, [teamStaff.data]);

  const selectedStaff = useMemo(
    () => selectedIds.map((id) => staffById.get(id)).filter((row): row is OtStaffPick => Boolean(row)),
    [selectedIds, staffById],
  );

  const { eligible, ineligible } = useMemo(
    () => partitionSupervisorOtPicks(selectedStaff),
    [selectedStaff],
  );

  const staffOptions = useMemo(
    () =>
      (teamStaff.data ?? []).map((row) => ({
        value: row.id,
        label: row.employeeCode ? `${row.fullName} (${row.employeeCode})` : row.fullName,
        description: [
          row.jobTitle,
          row.locationName,
          row.supervisorContract
            ? `${row.contractWorkingDays}d`
            : row.contractWorkingDays
              ? `${row.contractWorkingDays}d`
              : t("hr.ot.needsContract"),
        ]
          .filter(Boolean)
          .join(" · "),
        keywords: `${row.fullName} ${row.employeeCode ?? ""} ${row.department ?? ""} ${row.jobTitle ?? ""}`,
      })),
    [t, teamStaff.data],
  );

  const fieldErrorLabel = (code: SupervisorOtStaffFieldError) => {
    switch (code) {
      case "contract":
        return t("hr.ot.needsContract");
      case "dates":
        return t("hr.ot.staffDatesMissingOne");
      case "hours":
        return t("hr.ot.hoursInvalid");
      case "purpose":
        return t("hr.ot.purposeMissing");
      default:
        return code;
    }
  };

  const errorsByStaff = useMemo(() => {
    const map = new Map<string, SupervisorOtStaffFieldError[]>();
    for (const person of selectedStaff) {
      const draft = draftByStaff[person.id] ?? emptyStaffOtDraft();
      map.set(
        person.id,
        supervisorOtStaffFieldErrors({
          supervisorContract: person.supervisorContract,
          days: draftDayEntries(draft),
          purpose: draft.purpose,
        }),
      );
    }
    return map;
  }, [draftByStaff, selectedStaff]);

  const allSelectedReady =
    selectedStaff.length > 0 &&
    selectedStaff.every((person) => {
      const draft = draftByStaff[person.id] ?? emptyStaffOtDraft();
      return isSupervisorOtStaffEntryReady({
        supervisorContract: person.supervisorContract,
        days: draftDayEntries(draft),
        purpose: draft.purpose,
      });
    });

  const saveContract = useMutation({
    mutationFn: setStaffContractWorkingDays,
    onSuccess: () => {
      toast.success(t("hr.ot.contractSaved"));
      void teamStaff.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = useMutation({
    mutationFn: submitSupervisorOtClaim,
    onError: (e: Error) => toast.error(e.message),
  });

  function draftFor(staffId: string): StaffOtDraft {
    return draftByStaff[staffId] ?? emptyStaffOtDraft();
  }

  function patchDraft(staffId: string, patch: Partial<StaffOtDraft>) {
    setDraftByStaff((current) => ({
      ...current,
      [staffId]: { ...(current[staffId] ?? emptyStaffOtDraft()), ...patch },
    }));
  }

  function setSelectedStaffIds(nextIds: string[]) {
    setSelectedIds(nextIds);
    setShowCardErrors(false);
    setDraftByStaff((current) => {
      const next: Record<string, StaffOtDraft> = {};
      for (const id of nextIds) {
        next[id] = current[id] ?? emptyStaffOtDraft();
      }
      return next;
    });
  }

  function addDateFor(staffId: string) {
    const draft = draftFor(staffId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dateDraft)) return;
    if (draft.hoursByDate[draft.dateDraft] != null) return;
    patchDraft(staffId, {
      hoursByDate: { ...draft.hoursByDate, [draft.dateDraft]: "1" },
    });
  }

  function removeDateFor(staffId: string, date: string) {
    const draft = draftFor(staffId);
    const next = { ...draft.hoursByDate };
    delete next[date];
    patchDraft(staffId, { hoursByDate: next });
  }

  function setHoursFor(staffId: string, date: string, hours: string) {
    const draft = draftFor(staffId);
    patchDraft(staffId, {
      hoursByDate: { ...draft.hoursByDate, [date]: hours },
    });
  }

  function removeStaff(staffId: string) {
    setSelectedStaffIds(selectedIds.filter((id) => id !== staffId));
  }

  function contractDraftFor(person: OtStaffPick): "26" | "28" {
    return contractDraftByStaff[person.id] ?? (person.contractWorkingDays === 28 ? "28" : "26");
  }

  return (
    <HrPanel delay={1}>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{t("hr.ot.supervisorTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("hr.ot.supervisorHint")}</p>
          </div>
          <Button type="button" size="sm" variant={open ? "secondary" : "default"} onClick={() => setOpen((v) => !v)}>
            {open ? t("hr.ot.cancel") : t("hr.ot.newRequest")}
          </Button>
        </div>
        {open ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="ot-staff-search">{t("hr.ot.staffSearch")}</Label>
              <SearchableSelect
                id="ot-staff-search"
                multiple
                values={selectedIds}
                onValuesChange={setSelectedStaffIds}
                placeholder={t("hr.ot.staffSearchPlaceholder")}
                selectedCountLabel={(count) => t("hr.ot.staffSelectedCount", { count })}
                options={staffOptions}
                noMatchesLabel={
                  !teamStaff.isLoading && staffOptions.length === 0
                    ? t("hr.ot.noTeamStaff")
                    : t("hr.ot.noStaff")
                }
                disabled={teamStaff.isLoading}
              />
              {selectedStaff.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedStaff.map((person) => (
                    <Badge
                      key={person.id}
                      variant="outline"
                      className={cn(
                        "gap-1 pe-1 text-[10px]",
                        person.supervisorContract
                          ? "border-emerald-500/40 text-emerald-800 dark:text-emerald-300"
                          : "border-amber-500/40 text-amber-800 dark:text-amber-300",
                      )}
                    >
                      {person.employeeCode ? `${person.fullName} (${person.employeeCode})` : person.fullName}
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
              ) : null}
              {teamStaff.isError ? (
                <p className="mt-1 text-xs text-destructive">
                  {userFacingActionError(teamStaff.error, t("hr.ot.teamLoadFailed"))}
                </p>
              ) : !teamStaff.isLoading && staffOptions.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{t("hr.ot.noTeamStaff")}</p>
              ) : null}
            </div>

            {selectedStaff.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t("hr.ot.eligibilitySummary", {
                    eligible: eligible.length,
                    ineligible: ineligible.length,
                  })}
                </p>
                {selectedStaff.map((person) => (
                  <div
                    key={person.id}
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      person.supervisorContract
                        ? "border-[var(--hr-border)]"
                        : "border-amber-500/35 bg-amber-500/5",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{person.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("hr.ot.employeeId")}: {person.employeeCode ?? "—"} · {t("hr.ot.phone")}:{" "}
                          {person.phone ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("hr.ot.department")}: {person.department ?? "—"} · {t("hr.ot.jobTitle")}:{" "}
                          {person.jobTitle ?? "—"}
                          {person.locationName ? ` · ${person.locationName}` : ""}
                        </p>
                        <p className="mt-1 text-xs">
                          {t("hr.ot.contractDays")}: {person.contractWorkingDays ?? "—"}
                          {" · "}
                          {person.supervisorContract ? (
                            <span className="text-emerald-700 dark:text-emerald-300">{t("hr.ot.eligibleBadge")}</span>
                          ) : (
                            <span className="text-amber-800 dark:text-amber-300">{t("hr.ot.needsContract")}</span>
                          )}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="secondary" onClick={() => removeStaff(person.id)}>
                        {t("hr.ot.remove")}
                      </Button>
                    </div>
                    {!person.supervisorContract && canSetContract ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div>
                          <Label htmlFor={`ot-contract-days-${person.id}`}>{t("hr.ot.contractDays")}</Label>
                          <select
                            id={`ot-contract-days-${person.id}`}
                            className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                            value={contractDraftFor(person)}
                            onChange={(e) =>
                              setContractDraftByStaff((current) => ({
                                ...current,
                                [person.id]: e.target.value as "26" | "28",
                              }))
                            }
                          >
                            <option value="26">26</option>
                            <option value="28">28</option>
                          </select>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={saveContract.isPending}
                          onClick={() =>
                            saveContract.mutate({
                              staffId: person.id,
                              contractWorkingDays: Number(contractDraftFor(person)) as 26 | 28,
                            })
                          }
                        >
                          {t("hr.ot.saveContract")}
                        </Button>
                      </div>
                    ) : null}
                    {!person.supervisorContract ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {person.contractWorkingDays == null
                          ? t("hr.ot.contractMissing")
                          : t("hr.ot.contractOther")}
                      </p>
                    ) : null}
                    {(() => {
                      const draft = draftFor(person.id);
                      const fieldErrors = errorsByStaff.get(person.id) ?? [];
                      const showErrors = showCardErrors && fieldErrors.length > 0;
                      return (
                        <div className="mt-3 space-y-3 border-t border-[var(--hr-border)]/60 pt-3">
                          <div className="flex flex-wrap items-end gap-2">
                            <div>
                              <Label htmlFor={`ot-date-${person.id}`}>{t("hr.ot.dates")}</Label>
                              <Input
                                id={`ot-date-${person.id}`}
                                type="date"
                                value={draft.dateDraft}
                                onChange={(e) => patchDraft(person.id, { dateDraft: e.target.value })}
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => addDateFor(person.id)}
                            >
                              {t("hr.ot.addDate")}
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("hr.ot.requiredHoursPerDay")}</Label>
                            {draftWorkDates(draft).length === 0 ? (
                              <p className="text-xs text-muted-foreground">{t("hr.ot.staffDatesMissingOne")}</p>
                            ) : (
                              draftWorkDates(draft).map((date) => (
                                <div
                                  key={date}
                                  className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--hr-border)]/70 p-2"
                                >
                                  <div className="min-w-[9rem]">
                                    <Label htmlFor={`ot-day-${person.id}-${date}`}>{date}</Label>
                                    <Input
                                      id={`ot-day-${person.id}-${date}`}
                                      type="number"
                                      min={1}
                                      max={24}
                                      step={0.5}
                                      value={draft.hoursByDate[date] ?? ""}
                                      onChange={(e) => setHoursFor(person.id, date, e.target.value)}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeDateFor(person.id, date)}
                                  >
                                    {date} ×
                                  </Button>
                                </div>
                              ))
                            )}
                            {draftWorkDates(draft).length > 1 ? (
                              <p className="text-xs text-muted-foreground">
                                {t("hr.ot.hoursTotal", {
                                  hours: sumSupervisorOtDayHours(draftDayEntries(draft)),
                                })}
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <Label htmlFor={`ot-rate-${person.id}`}>{t("hr.ot.rateType")}</Label>
                            <select
                              id={`ot-rate-${person.id}`}
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                              value={draft.rateType}
                              onChange={(e) =>
                                patchDraft(person.id, { rateType: e.target.value as HrOtRateType })
                              }
                            >
                              {HR_OT_RATE_TYPES.map((rate) => (
                                <option key={rate} value={rate}>
                                  {t(`hr.ot.rateTypes.${rate}`)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label htmlFor={`ot-purpose-${person.id}`}>{t("hr.ot.purpose")}</Label>
                            <Textarea
                              id={`ot-purpose-${person.id}`}
                              value={draft.purpose}
                              maxLength={1000}
                              onChange={(e) => patchDraft(person.id, { purpose: e.target.value })}
                            />
                          </div>
                          {showErrors ? (
                            <ul className="space-y-0.5 text-xs text-destructive">
                              {fieldErrors.map((code) => (
                                <li key={code}>{fieldErrorLabel(code)}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                ))}
                {eligible.length === 0 ? (
                  <p className="text-xs text-amber-800 dark:text-amber-300">{t("hr.ot.noneEligible")}</p>
                ) : ineligible.length > 0 ? (
                  <p className="text-xs text-muted-foreground">{t("hr.ot.completeAllSelected")}</p>
                ) : null}
              </div>
            ) : null}

            <Button
              type="button"
              disabled={selectedStaff.length === 0 || submit.isPending}
              onClick={() => {
                if (!allSelectedReady) {
                  setShowCardErrors(true);
                  toast.error(t("hr.ot.completeAllSelected"));
                  return;
                }
                const printStaff: SupervisorOtPrintStaff[] = selectedStaff.map((row) => {
                  const draft = draftFor(row.id);
                  return {
                    id: row.id,
                    fullName: row.fullName,
                    employeeCode: row.employeeCode,
                    phone: row.phone,
                    department: row.department,
                    jobTitle: row.jobTitle,
                    days: draftDayEntries(draft),
                    purpose: draft.purpose.trim(),
                    rateType: draft.rateType,
                  };
                });
                submit.mutate(
                  {
                    entries: printStaff.map((row) => ({
                      staffId: row.id,
                      days: row.days,
                      rateType: row.rateType,
                      purpose: row.purpose,
                    })),
                  },
                  {
                    onSuccess: (result) => {
                      const numbers = (result.requests ?? [])
                        .map((r) => r.requestNumber)
                        .filter(Boolean)
                        .slice(0, 3);
                      const numberByStaff = new Map(
                        (result.requests ?? []).map((r) => [r.staffId, r.requestNumber] as const),
                      );
                      toast.success(
                        t("hr.ot.submittedRequest", {
                          days: result.count,
                          staff: result.staffCount,
                          requests: result.requestCount ?? result.staffCount,
                          numbers: numbers.join(", ") || result.requestNumber || "—",
                        }),
                      );
                      setPrintPayload({
                        staff: printStaff.map((row) => ({
                          ...row,
                          requestNumber: numberByStaff.get(row.id) ?? result.requestNumber ?? null,
                        })),
                        requestDate: todayIso(),
                        status: result.status,
                        requestNumber: result.requestNumber,
                      });
                      setPrintOpen(true);
                      setShowCardErrors(false);
                      setSelectedStaffIds([]);
                      onSubmitted();
                    },
                  },
                );
              }}
            >
              {t("hr.ot.submit")}
            </Button>
          </div>
        ) : null}
      </div>

      <SupervisorOtPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        payload={printPayload}
      />
    </HrPanel>
  );
}

function OtHierarchyStepper({ status }: { status: HrOtStatus }) {
  const { t } = useTranslation();
  const currentIdx = HR_OT_HIERARCHY_STEPS.indexOf(
    status as (typeof HR_OT_HIERARCHY_STEPS)[number],
  );
  const terminal =
    status === "rejected" || status === "cancelled" || status === "changes_requested";
  return (
    <ol className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
      {HR_OT_HIERARCHY_STEPS.map((step, idx) => {
        const done = !terminal && currentIdx >= idx;
        const current = !terminal && currentIdx === idx;
        return (
          <li
            key={step}
            className={cn(
              "rounded-full border px-2 py-0.5",
              done
                ? "border-[var(--hr-charcoal)] bg-[var(--hr-charcoal)] text-white"
                : "border-[var(--hr-border)] text-muted-foreground",
              current && "ring-1 ring-[var(--hr-charcoal)]",
            )}
          >
            {t(`hr.ot.hierarchy.${step}`)}
          </li>
        );
      })}
      {terminal ? (
        <li
          className={cn(
            "rounded-full border px-2 py-0.5",
            status === "changes_requested"
              ? "border-amber-500/50 text-amber-800 dark:text-amber-300"
              : "border-destructive/40 text-destructive",
          )}
        >
          {t(`hr.ot.status.${status}`)}
        </li>
      ) : null}
    </ol>
  );
}

function printPayloadFromGroup(group: OtRequestGroup): SupervisorOtPrintPayload {
  const byStaff = new Map<string, SupervisorOtPrintStaff>();
  for (const claim of group.claims) {
    const hours = Math.round((claim.claimedMinutes / 60) * 100) / 100;
    const existing = byStaff.get(claim.staffId);
    if (existing) {
      if (!existing.days.some((day) => day.workDate === claim.workDate)) {
        existing.days.push({ workDate: claim.workDate, hours });
        existing.days.sort((a, b) => a.workDate.localeCompare(b.workDate));
      }
      if (!existing.requestNumber && claim.requestNumber) {
        existing.requestNumber = claim.requestNumber;
      }
      continue;
    }
    byStaff.set(claim.staffId, {
      id: claim.staffId,
      fullName: claim.staffName ?? "—",
      employeeCode: claim.employeeCode ?? null,
      phone: claim.phone ?? null,
      department: claim.department ?? null,
      jobTitle: claim.jobTitle ?? null,
      days: [{ workDate: claim.workDate, hours }],
      purpose: claim.purpose ?? "",
      rateType: claim.rateType,
      requestNumber: claim.requestNumber ?? group.requestNumber,
    });
  }
  return {
    staff: [...byStaff.values()],
    requestDate: (group.submittedAt ?? todayIso()).slice(0, 10),
    status: group.status,
    requestNumber: group.requestNumber,
  };
}

function draftFromOtGroup(group: OtRequestGroup): StaffOtDraft {
  const hoursByDate: Record<string, string> = {};
  for (const claim of group.claims) {
    const hours = Math.round((claim.claimedMinutes / 60) * 100) / 100;
    hoursByDate[claim.workDate] = String(hours);
  }
  const dates = Object.keys(hoursByDate).sort();
  return {
    hoursByDate,
    dateDraft: dates[dates.length - 1] ?? todayIso(),
    rateType: group.claims[0]?.rateType ?? "weekday",
    purpose: group.purpose ?? "",
  };
}

export default function HrOtPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  const canHrApprove = usePermission("hr.ot.approve");
  const canHooApprove = isHeadOfOperationsTitle(profile?.job_title);
  const [status, setStatus] = useState<"queue" | "hr_approved" | "payroll_posted" | "all">("queue");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [department, setDepartment] = useState("");
  const [locationId, setLocationId] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [groupBy, setGroupBy] = useState<"employee" | "department" | "employment_type" | "location">(
    "employee",
  );
  const [previewPayload, setPreviewPayload] = useState<SupervisorOtPrintPayload | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<OtRequestGroup | null>(null);
  const [editDraft, setEditDraft] = useState<StaffOtDraft | null>(null);
  const [editShowErrors, setEditShowErrors] = useState(false);

  // Server: status + date range (keeps the 500-row window useful). Name/dept/site filter client-side.
  const listFilters = useMemo(
    () => ({
      status,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }),
    [status, dateFrom, dateTo],
  );

  const list = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot", ...listFilters }),
    queryFn: () => listOtClaims(listFilters),
    staleTime: STALE.people,
  });

  const allRequestGroups = useMemo(
    () => groupOtClaimsIntoRequests(list.data ?? []),
    [list.data],
  );

  const requestGroups = useMemo(
    () =>
      filterOtRequestGroups(allRequestGroups, {
        q: search,
        department,
        locationId,
      }),
    [allRequestGroups, search, department, locationId],
  );

  const filterOptions = useMemo(() => {
    const departments = [
      ...new Set(allRequestGroups.map((g) => g.department).filter((d): d is string => Boolean(d))),
    ].sort((a, b) => a.localeCompare(b));
    const locations = new Map<string, string>();
    for (const g of allRequestGroups) {
      if (g.locationId && g.locationName) locations.set(g.locationId, g.locationName);
    }
    return {
      departments,
      locations: [...locations.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [allRequestGroups]);

  const summaries = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-summary", month, groupBy }),
    queryFn: () => getOtMonthlySummaries({ month, groupBy }),
    staleTime: STALE.people,
  });

  const policy = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-policy" }),
    queryFn: () => getOtPolicySnapshot(),
    staleTime: STALE.people,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
  };

  const actBatch = useMutation({
    mutationFn: actOnOtRequestBatch,
    onSuccess: () => {
      toast.success(t("hr.ot.updated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(userFacingActionError(e, t("hr.ot.updateFailed"))),
  });

  const revise = useMutation({
    mutationFn: reviseSupervisorOtRequest,
    onSuccess: (result) => {
      toast.success(
        result.resubmitted ? t("hr.ot.resubmitted") : t("hr.ot.updated"),
      );
      setEditGroup(null);
      setEditDraft(null);
      setEditShowErrors(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(userFacingActionError(e, t("hr.ot.updateFailed"))),
  });

  const runBatchAction = (
    group: OtRequestGroup,
    action:
      | "verify"
      | "ops_approve"
      | "approve"
      | "request_changes"
      | "resubmit"
      | "reject"
      | "cancel"
      | "payroll_posted",
  ) => {
    if (group.requestBatchId) {
      actBatch.mutate({ requestBatchId: group.requestBatchId, action });
      return;
    }
    const claimIds = group.claims.map((c) => c.id);
    if (!claimIds.length) return;
    actBatch.mutate({ claimIds, action });
  };

  function openEditRequest(group: OtRequestGroup) {
    setEditGroup(group);
    setEditDraft(draftFromOtGroup(group));
    setEditShowErrors(false);
  }

  function patchEditDraft(patch: Partial<StaffOtDraft>) {
    setEditDraft((current) => {
      if (!current) return current;
      return { ...current, ...patch };
    });
  }

  const editFieldErrors = useMemo(() => {
    if (!editDraft || !editGroup) return [] as SupervisorOtStaffFieldError[];
    return supervisorOtStaffFieldErrors({
      supervisorContract: true,
      days: draftDayEntries(editDraft),
      purpose: editDraft.purpose,
    });
  }, [editDraft, editGroup]);

  const clearListFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setDepartment("");
    setLocationId("");
  };

  const hasExtraFilters = Boolean(search || dateFrom || dateTo || department || locationId);

  const filters = useMemo(() => {
    const chips: Array<{ value: "queue" | "hr_approved" | "payroll_posted" | "all"; label: string }> = [
      { value: "queue", label: t("hr.ot.queue") },
    ];
    if (canHrApprove || canHooApprove) {
      chips.push(
        { value: "hr_approved", label: t("hr.ot.status.hr_approved") },
        { value: "payroll_posted", label: t("hr.ot.status.payroll_posted") },
      );
    }
    chips.push({ value: "all", label: t("hr.ot.status.all") });
    return chips;
  }, [canHrApprove, canHooApprove, t]);

  return (
    <CapabilityGate
      capability="hr.ot.verify"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.ot.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Timer}
          kicker={t("hr.ot.kicker")}
          title={t("hr.ot.title")}
          subtitle={t("hr.ot.subtitle")}
        >
          {policy.data ? (
            <p className="text-xs text-muted-foreground hr-enter">
              {t("hr.ot.policyHint", {
                min: policy.data.minClaimableMinutes,
                weekday: policy.data.rateWeekday,
                off: policy.data.rateWeeklyOff,
                holiday: policy.data.ratePublicHoliday,
                eid: policy.data.rateEid,
              })}
            </p>
          ) : null}

          <SupervisorOtRequest onSubmitted={invalidate} />

          <div className="hr-filter-bar hr-enter">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                className={cn(
                  "hr-chip",
                  status === f.value && "border-[var(--hr-charcoal)] bg-[var(--hr-charcoal)] text-white",
                )}
                onClick={() => setStatus(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 rounded-lg border border-[var(--hr-border)] bg-background/60 p-3 sm:grid-cols-2 lg:grid-cols-6 hr-enter">
            <div className="lg:col-span-2">
              <Label htmlFor="ot-claim-search">{t("hr.ot.filterSearch")}</Label>
              <Input
                id="ot-claim-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("hr.ot.filterSearchPlaceholder")}
              />
            </div>
            <div>
              <Label htmlFor="ot-date-from">{t("hr.ot.filterDateFrom")}</Label>
              <Input
                id="ot-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ot-date-to">{t("hr.ot.filterDateTo")}</Label>
              <Input
                id="ot-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ot-filter-dept">{t("hr.ot.department")}</Label>
              <select
                id="ot-filter-dept"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="">{t("hr.ot.filterAllDepartments")}</option>
                {filterOptions.departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ot-filter-loc">{t("hr.ot.filterLocation")}</Label>
              <select
                id="ot-filter-loc"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">{t("hr.ot.filterAllLocations")}</option>
                {filterOptions.locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            {hasExtraFilters ? (
              <div className="flex items-end lg:col-span-6">
                <Button type="button" size="sm" variant="ghost" onClick={clearListFilters}>
                  {t("hr.ot.clearFilters")}
                </Button>
              </div>
            ) : null}
          </div>

          <HrPanel delay={1}>
            <div className="space-y-2 p-4 sm:p-5">
              {requestGroups.length === 0 ? (
                <HrEmptyState message={t("hr.ot.empty")} icon={Timer} />
              ) : (
                requestGroups.map((group) => {
                  const rateType = group.claims[0]?.rateType ?? "weekday";
                  const isSubmitter = Boolean(user?.id && group.submittedBy === user.id);
                  const canPreview =
                    canHooApprove ||
                    canHrApprove ||
                    isSubmitter ||
                    group.status === "ops_approved" ||
                    group.status === "hr_approved" ||
                    group.status === "payroll_posted";
                  return (
                    <div key={group.key} className="hr-list-row items-start">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {group.requestNumber ? (
                            <span className="mr-2 font-mono text-xs text-muted-foreground">
                              {group.requestNumber}
                            </span>
                          ) : null}
                          {group.staffNames.join(", ") || t("hr.ot.requestFallback")}
                          <span className="text-muted-foreground">
                            {" "}
                            · {group.workDates.join(", ")} · {t(`hr.ot.rateTypes.${rateType}`)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {group.claimSource === "supervisor"
                            ? t("hr.ot.sourceSupervisor")
                            : t("hr.ot.attendancePath")}
                          {group.locationName ? ` · ${group.locationName}` : ""}
                          {group.department ? ` · ${group.department}` : ""}
                          {group.claims[0]?.contractWorkingDays
                            ? ` · ${group.claims[0].contractWorkingDays}d`
                            : ""}
                          {group.purpose ? ` · ${group.purpose}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("hr.ot.oneRequestMeta", {
                            days: group.workDates.length,
                            staff: group.staffNames.length || 1,
                          })}{" "}
                          · {t("hr.ot.claimed")}: {fmtMins(group.totalClaimedMinutes)} ·{" "}
                          {t("hr.ot.approved")}: {fmtMins(group.totalApprovedMinutes)} ·{" "}
                          {group.totalAmountQar.toFixed(2)} QAR
                        </p>
                        {group.claims.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t("hr.ot.perDayHours")}:{" "}
                            {group.claims
                              .map((claim) => {
                                const hours =
                                  Math.round((claim.claimedMinutes / 60) * 100) / 100;
                                return `${claim.workDate} (${hours}h)`;
                              })
                              .join(" · ")}
                          </p>
                        ) : null}
                        {group.missingBasicPay ? (
                          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                            {t("hr.ot.missingBasicNote")}
                          </p>
                        ) : null}
                        <OtHierarchyStepper status={group.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{t(`hr.ot.status.${group.status}`)}</Badge>
                        {canPreview ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPreviewPayload(printPayloadFromGroup(group));
                              setPreviewOpen(true);
                            }}
                          >
                            {t("hr.ot.preview")}
                          </Button>
                        ) : null}
                        {group.status === "submitted" ? (
                          <>
                            <Button
                              size="sm"
                              disabled={actBatch.isPending}
                              onClick={() => runBatchAction(group, "verify")}
                            >
                              {t("hr.ot.verify")}
                            </Button>
                            {canRequestOtChanges(group.status) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actBatch.isPending}
                                onClick={() => runBatchAction(group, "request_changes")}
                              >
                                {t("hr.ot.changeRequest")}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actBatch.isPending}
                              onClick={() => runBatchAction(group, "reject")}
                            >
                              {t("hr.ot.reject")}
                            </Button>
                          </>
                        ) : null}
                        {group.status === "manager_verified" && canHooApprove ? (
                          <>
                            <Button
                              size="sm"
                              disabled={actBatch.isPending}
                              onClick={() => runBatchAction(group, "ops_approve")}
                            >
                              {t("hr.ot.opsApprove")}
                            </Button>
                            {canRequestOtChanges(group.status) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actBatch.isPending}
                                onClick={() => runBatchAction(group, "request_changes")}
                              >
                                {t("hr.ot.changeRequest")}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actBatch.isPending}
                              onClick={() => runBatchAction(group, "reject")}
                            >
                              {t("hr.ot.reject")}
                            </Button>
                          </>
                        ) : null}
                        {group.status === "ops_approved" && canHrApprove ? (
                          <>
                            <Button
                              size="sm"
                              disabled={actBatch.isPending}
                              onClick={() => runBatchAction(group, "approve")}
                            >
                              {t("hr.ot.approve")}
                            </Button>
                            {canRequestOtChanges(group.status) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actBatch.isPending}
                                onClick={() => runBatchAction(group, "request_changes")}
                              >
                                {t("hr.ot.changeRequest")}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actBatch.isPending}
                              onClick={() => runBatchAction(group, "reject")}
                            >
                              {t("hr.ot.reject")}
                            </Button>
                          </>
                        ) : null}
                        {group.status === "hr_approved" && canHrApprove ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actBatch.isPending}
                            onClick={() => runBatchAction(group, "payroll_posted")}
                          >
                            {t("hr.ot.markPayroll")}
                          </Button>
                        ) : null}
                        {isSubmitter && canEditOtBeforeHoo(group.status) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actBatch.isPending || revise.isPending}
                            onClick={() => openEditRequest(group)}
                          >
                            {group.status === "changes_requested"
                              ? t("hr.ot.editAndResubmit")
                              : t("hr.ot.editRequest")}
                          </Button>
                        ) : null}
                        {isSubmitter && canEditOtBeforeHoo(group.status) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actBatch.isPending}
                            onClick={() => runBatchAction(group, "cancel")}
                          >
                            {t("hr.ot.cancel")}
                          </Button>
                        ) : null}
                        {isSubmitter && !canEditOtBeforeHoo(group.status) ? (
                          <span className="text-[10px] text-muted-foreground">
                            {t("hr.ot.editLocked")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </HrPanel>

          <HrPanel delay={2}>
            <div className="space-y-3 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">{t("hr.ot.summariesTitle")}</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label>{t("hr.ot.month")}</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <div>
                  <Label>{t("hr.ot.groupBy")}</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={groupBy}
                    onChange={(e) =>
                      setGroupBy(e.target.value as typeof groupBy)
                    }
                  >
                    <option value="employee">{t("hr.ot.group.employee")}</option>
                    <option value="department">{t("hr.ot.group.department")}</option>
                    <option value="employment_type">{t("hr.ot.group.employment_type")}</option>
                    <option value="location">{t("hr.ot.group.location")}</option>
                  </select>
                </div>
              </div>
              {(summaries.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("hr.ot.summariesEmpty")}</p>
              ) : (
                <div className="space-y-1">
                  {(summaries.data ?? []).map((row) => (
                    <div key={row.key} className="flex justify-between gap-2 text-sm border-b border-[var(--hr-border)] py-2">
                      <span>
                        {row.staffName ??
                          row.department ??
                          row.employmentType ??
                          row.locationName ??
                          row.key}
                        <span className="text-muted-foreground"> · {row.claims} {t("hr.ot.claims")}</span>
                      </span>
                      <span className="tabular-nums">
                        {fmtMins(row.approvedMinutes)} · {row.amountQar.toFixed(2)} QAR
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </HrPanel>
        </HrSection>

        <SupervisorOtPrintDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          payload={previewPayload}
        />

        <Dialog
          open={Boolean(editGroup && editDraft)}
          onOpenChange={(open) => {
            if (!open) {
              setEditGroup(null);
              setEditDraft(null);
              setEditShowErrors(false);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editGroup?.status === "changes_requested"
                  ? t("hr.ot.editAndResubmit")
                  : t("hr.ot.editRequest")}
              </DialogTitle>
              <DialogDescription>
                {editGroup?.requestNumber
                  ? t("hr.ot.editRequestHint", { number: editGroup.requestNumber })
                  : t("hr.ot.editRequestHintGeneric")}
              </DialogDescription>
            </DialogHeader>
            {editDraft && editGroup ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label htmlFor="ot-edit-date">{t("hr.ot.dates")}</Label>
                    <Input
                      id="ot-edit-date"
                      type="date"
                      value={editDraft.dateDraft}
                      onChange={(e) => patchEditDraft({ dateDraft: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!/^\d{4}-\d{2}-\d{2}$/.test(editDraft.dateDraft)) return;
                      if (editDraft.hoursByDate[editDraft.dateDraft] != null) return;
                      patchEditDraft({
                        hoursByDate: {
                          ...editDraft.hoursByDate,
                          [editDraft.dateDraft]: "1",
                        },
                      });
                    }}
                  >
                    {t("hr.ot.addDate")}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>{t("hr.ot.requiredHoursPerDay")}</Label>
                  {draftWorkDates(editDraft).map((date) => (
                    <div
                      key={date}
                      className="flex flex-wrap items-end gap-2 rounded-md border border-[var(--hr-border)]/70 p-2"
                    >
                      <div className="min-w-[9rem]">
                        <Label htmlFor={`ot-edit-hours-${date}`}>{date}</Label>
                        <Input
                          id={`ot-edit-hours-${date}`}
                          type="number"
                          min={1}
                          max={24}
                          step={0.5}
                          value={editDraft.hoursByDate[date] ?? ""}
                          onChange={(e) =>
                            patchEditDraft({
                              hoursByDate: {
                                ...editDraft.hoursByDate,
                                [date]: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const next = { ...editDraft.hoursByDate };
                          delete next[date];
                          patchEditDraft({ hoursByDate: next });
                        }}
                      >
                        {date} ×
                      </Button>
                    </div>
                  ))}
                  {draftWorkDates(editDraft).length > 1 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("hr.ot.hoursTotal", {
                        hours: sumSupervisorOtDayHours(draftDayEntries(editDraft)),
                      })}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="ot-edit-rate">{t("hr.ot.rateType")}</Label>
                  <select
                    id="ot-edit-rate"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={editDraft.rateType}
                    onChange={(e) =>
                      patchEditDraft({ rateType: e.target.value as HrOtRateType })
                    }
                  >
                    {HR_OT_RATE_TYPES.map((rate) => (
                      <option key={rate} value={rate}>
                        {t(`hr.ot.rateTypes.${rate}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="ot-edit-purpose">{t("hr.ot.purpose")}</Label>
                  <Textarea
                    id="ot-edit-purpose"
                    value={editDraft.purpose}
                    maxLength={1000}
                    onChange={(e) => patchEditDraft({ purpose: e.target.value })}
                  />
                </div>
                {editShowErrors && editFieldErrors.length > 0 ? (
                  <ul className="space-y-0.5 text-xs text-destructive">
                    {editFieldErrors.map((code) => (
                      <li key={code}>
                        {code === "dates"
                          ? t("hr.ot.staffDatesMissingOne")
                          : code === "hours"
                            ? t("hr.ot.hoursInvalid")
                            : code === "purpose"
                              ? t("hr.ot.purposeMissing")
                              : code}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditGroup(null);
                  setEditDraft(null);
                  setEditShowErrors(false);
                }}
              >
                {t("hr.ot.cancel")}
              </Button>
              <Button
                type="button"
                disabled={revise.isPending || !editDraft || !editGroup}
                onClick={() => {
                  if (!editDraft || !editGroup) return;
                  const days = draftDayEntries(editDraft);
                  const errors = supervisorOtStaffFieldErrors({
                    supervisorContract: true,
                    days,
                    purpose: editDraft.purpose,
                  });
                  if (errors.length > 0) {
                    setEditShowErrors(true);
                    toast.error(t("hr.ot.completeAllSelected"));
                    return;
                  }
                  revise.mutate({
                    requestBatchId: editGroup.requestBatchId,
                    claimIds: editGroup.requestBatchId
                      ? undefined
                      : editGroup.claims.map((c) => c.id),
                    days,
                    rateType: editDraft.rateType,
                    purpose: editDraft.purpose.trim(),
                    resubmit: editGroup.status === "changes_requested",
                  });
                }}
              >
                {editGroup?.status === "changes_requested"
                  ? t("hr.ot.resubmit")
                  : t("hr.ot.saveChanges")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </HrShell>
    </CapabilityGate>
  );
}

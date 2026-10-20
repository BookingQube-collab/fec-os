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
} from "@/components/hr/supervisor-ot-print-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useUserRoles } from "@/hooks/use-auth";
import {
  actOnOtClaim,
  getOtMonthlySummaries,
  getOtPolicySnapshot,
  listOtClaims,
  listStaffForSupervisorOt,
  setStaffContractWorkingDays,
  submitSupervisorOtClaim,
} from "@/lib/hr-ot.functions";
import { HR_OT_RATE_TYPES, partitionSupervisorOtPicks, type HrOtRateType } from "@/lib/hr-ot";
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

function SupervisorOtRequest({ onSubmitted }: { onSubmitted: () => void }) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const canSetContract = canUserDo(roles, "hr.profile.edit");
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [contractDraftByStaff, setContractDraftByStaff] = useState<Record<string, "26" | "28">>({});
  const [dates, setDates] = useState<string[]>([todayIso()]);
  const [dateDraft, setDateDraft] = useState(todayIso());
  const [hours, setHours] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [rateType, setRateType] = useState<HrOtRateType>("weekday");
  const [printPayload, setPrintPayload] = useState<SupervisorOtPrintPayload | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

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

  const requiredHoursValue = Number(hours);
  const hoursValid = Number.isFinite(requiredHoursValue) && requiredHoursValue > 0;

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

  const canSubmit =
    eligible.length > 0 &&
    dates.length > 0 &&
    purpose.trim().length >= 3 &&
    hoursValid &&
    !submit.isPending;

  function addDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) return;
    setDates((current) => (current.includes(dateDraft) ? current : [...current, dateDraft].sort()));
  }

  function removeStaff(staffId: string) {
    setSelectedIds((current) => current.filter((id) => id !== staffId));
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
                onValuesChange={setSelectedIds}
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
                  </div>
                ))}
                {eligible.length === 0 ? (
                  <p className="text-xs text-amber-800 dark:text-amber-300">{t("hr.ot.noneEligible")}</p>
                ) : ineligible.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("hr.ot.submitEligibleOnly", { count: eligible.length })}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="ot-date">{t("hr.ot.dates")}</Label>
                <Input id="ot-date" type="date" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} />
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addDate}>
                {t("hr.ot.addDate")}
              </Button>
              <div className="flex flex-wrap gap-1">
                {dates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    className="hr-chip"
                    onClick={() => setDates((current) => current.filter((item) => item !== date))}
                  >
                    {date} ×
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ot-hours">{t("hr.ot.requiredHours")}</Label>
                <Input
                  id="ot-hours"
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ot-rate">{t("hr.ot.rateType")}</Label>
                <select
                  id="ot-rate"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value as HrOtRateType)}
                >
                  {HR_OT_RATE_TYPES.map((rate) => (
                    <option key={rate} value={rate}>
                      {t(`hr.ot.rateTypes.${rate}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="ot-purpose">{t("hr.ot.purpose")}</Label>
              <Textarea
                id="ot-purpose"
                value={purpose}
                maxLength={1000}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>

            <Button
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                if (eligible.length === 0) return;
                if (!hoursValid) {
                  toast.error(t("hr.ot.hoursInvalid"));
                  return;
                }
                const purposeText = purpose.trim();
                const printStaff = eligible.map((row) => ({
                  id: row.id,
                  fullName: row.fullName,
                  employeeCode: row.employeeCode,
                  phone: row.phone,
                  department: row.department,
                  jobTitle: row.jobTitle,
                }));
                const workDates = [...dates];
                submit.mutate(
                  {
                    staffIds: printStaff.map((row) => row.id),
                    workDates,
                    requiredHours: requiredHoursValue,
                    purpose: purposeText,
                    rateType,
                  },
                  {
                    onSuccess: (result) => {
                      toast.success(t("hr.ot.submittedMany", { count: result.count }));
                      setPrintPayload({
                        staff: printStaff,
                        workDates,
                        requiredHours: requiredHoursValue,
                        purpose: purposeText,
                        requestDate: todayIso(),
                      });
                      setPrintOpen(true);
                      setPurpose("");
                      setSelectedIds([]);
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

export default function HrOtPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"queue" | "hr_approved" | "payroll_posted" | "all">("queue");
  const [month, setMonth] = useState(currentMonth);
  const [groupBy, setGroupBy] = useState<"employee" | "department" | "employment_type" | "location">(
    "employee",
  );

  const list = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot", status }),
    queryFn: () => listOtClaims({ status }),
    staleTime: STALE.people,
  });

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

  const act = useMutation({
    mutationFn: actOnOtClaim,
    onSuccess: () => {
      toast.success(t("hr.ot.updated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filters = useMemo(
    () =>
      [
        { value: "queue" as const, label: t("hr.ot.queue") },
        { value: "hr_approved" as const, label: t("hr.ot.status.hr_approved") },
        { value: "payroll_posted" as const, label: t("hr.ot.status.payroll_posted") },
        { value: "all" as const, label: t("hr.ot.status.all") },
      ] as const,
    [t],
  );

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

          <HrPanel delay={1}>
            <div className="space-y-2 p-4 sm:p-5">
              {(list.data ?? []).length === 0 ? (
                <HrEmptyState message={t("hr.ot.empty")} icon={Timer} />
              ) : (
                (list.data ?? []).map((row) => (
                  <div key={row.id} className="hr-list-row">
                    <div>
                      <p className="font-medium">
                        {row.staffName} · {row.workDate} · {t(`hr.ot.rateTypes.${row.rateType}`)}
                      </p>
                      {row.claimSource === "supervisor" ? (
                        <p className="text-xs text-muted-foreground">
                          {row.locationName ?? "—"} · {t("hr.ot.sourceSupervisor")}
                          {row.contractWorkingDays ? ` · ${row.contractWorkingDays}d` : ""}
                          {row.purpose ? ` · ${row.purpose}` : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {row.locationName ?? "—"} · {t("hr.ot.scheduled")}:{" "}
                          {row.scheduledIn ? new Date(row.scheduledIn).toLocaleTimeString() : "—"}–
                          {row.scheduledOut ? new Date(row.scheduledOut).toLocaleTimeString() : "—"} ·{" "}
                          {t("hr.ot.attendance")}:{" "}
                          {row.actualIn ? new Date(row.actualIn).toLocaleTimeString() : "—"}–
                          {row.actualOut ? new Date(row.actualOut).toLocaleTimeString() : "—"}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t("hr.ot.eligible")}: {fmtMins(row.eligibleMinutes)} · {t("hr.ot.claimed")}:{" "}
                        {fmtMins(row.claimedMinutes)} · {t("hr.ot.approved")}:{" "}
                        {fmtMins(row.approvedMinutes)} · ×{row.rateMultiplier} · {row.amountQar.toFixed(2)}{" "}
                        QAR
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{t(`hr.ot.status.${row.status}`)}</Badge>
                      {row.status === "submitted" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ claimId: row.id, action: "verify" })}
                          >
                            {t("hr.ot.verify")}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ claimId: row.id, action: "reject" })}
                          >
                            {t("hr.ot.reject")}
                          </Button>
                        </>
                      ) : null}
                      {row.status === "manager_verified" ? (
                        <>
                          <Button
                            size="sm"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ claimId: row.id, action: "approve" })}
                          >
                            {t("hr.ot.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ claimId: row.id, action: "reject" })}
                          >
                            {t("hr.ot.reject")}
                          </Button>
                        </>
                      ) : null}
                      {row.status === "hr_approved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ claimId: row.id, action: "payroll_posted" })}
                        >
                          {t("hr.ot.markPayroll")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
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
      </HrShell>
    </CapabilityGate>
  );
}

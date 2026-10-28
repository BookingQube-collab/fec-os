"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coffee, Timer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
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
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { userFacingActionError } from "@/lib/user-facing-action-error";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
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

type FnbStaffDraft = {
  periodFrom: string;
  periodTo: string;
  requiredHours: string;
  rateType: HrOtRateType;
  purpose: string;
};

function emptyDraft(): FnbStaffDraft {
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

export default function HrOtFnbPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, FnbStaffDraft>>({});
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
    staleTime: STALE.people,
  });

  const recent = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "ot-fnb-recent" }),
    queryFn: () => listFnbCafeOtClaims({ limit: 40 }),
    staleTime: STALE.people,
  });

  const selectedStaff = useMemo(() => {
    const byId = new Map((teamStaff.data ?? []).map((row) => [row.id, row]));
    return selectedIds.map((id) => byId.get(id)).filter((row): row is FnbStaffPick => Boolean(row));
  }, [selectedIds, teamStaff.data]);

  const staffOptions = useMemo(
    () =>
      (teamStaff.data ?? []).map((row) => ({
        value: row.id,
        label: row.employeeCode ? `${row.fullName} (${row.employeeCode})` : row.fullName,
        keywords: `${row.fullName} ${row.employeeCode ?? ""} ${row.department ?? ""} ${row.jobTitle ?? ""}`,
      })),
    [teamStaff.data],
  );

  const patchDraft = (staffId: string, patch: Partial<FnbStaffDraft>) => {
    setDrafts((current) => ({
      ...current,
      [staffId]: { ...(current[staffId] ?? emptyDraft()), ...patch },
    }));
  };

  const draftFor = (staffId: string) => drafts[staffId] ?? emptyDraft();

  const ready = selectedStaff.every((person) => {
    const draft = draftFor(person.id);
    return isFnbCafeOtEntryReady({
      staffId: person.id,
      periodFrom: draft.periodFrom,
      periodTo: draft.periodTo,
      requiredHours: Number(draft.requiredHours),
      purpose: draft.purpose,
    });
  });

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
      setDrafts({});
      setShowErrors(false);
      void qc.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === "people" && key[1] === "attendance-hr";
        },
      });
    },
    onError: (e: Error) => toast.error(userFacingActionError(e, t("hr.ot.fnb.submitFailed"))),
  });

  const recentFnbGroups = useMemo(
    () => groupOtClaimsIntoRequests(recent.data ?? []).slice(0, 20),
    [recent.data],
  );

  const rateWeekday = policy.data?.rateWeekday ?? 1.25;

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
          <p className="text-xs text-muted-foreground">
            <Link href="/people/hr/ot" className="underline underline-offset-2">
              {t("hr.ot.fnb.backToOps")}
            </Link>
            {policy.data
              ? ` · ${t("hr.ot.policyHint", {
                  min: policy.data.minClaimableMinutes,
                  weekday: policy.data.rateWeekday,
                  off: policy.data.rateWeeklyOff,
                  holiday: policy.data.ratePublicHoliday,
                  eid: policy.data.rateEid,
                })}`
              : null}
          </p>

          <HrPanel className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">{t("hr.ot.fnb.formTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("hr.ot.fnb.formHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fnb-ot-staff">{t("hr.ot.staffSearch")}</Label>
              <SearchableSelect
                id="fnb-ot-staff"
                multiple
                values={selectedIds}
                onValuesChange={(next) => {
                  setSelectedIds(next);
                  setDrafts((current) => {
                    const copy = { ...current };
                    for (const id of next) {
                      if (!copy[id]) copy[id] = emptyDraft();
                    }
                    return copy;
                  });
                }}
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
              {teamStaff.isError ? (
                <p className="mt-1 text-xs text-destructive">
                  {userFacingActionError(teamStaff.error, t("hr.ot.teamLoadFailed"))}
                </p>
              ) : null}
            </div>

            {selectedStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("hr.ot.fnb.pickStaff")}</p>
            ) : (
              <ul className="space-y-4">
                {selectedStaff.map((person) => {
                  const draft = draftFor(person.id);
                  const errors = fnbCafeOtFieldErrors({
                    staffId: person.id,
                    periodFrom: draft.periodFrom,
                    periodTo: draft.periodTo,
                    requiredHours: Number(draft.requiredHours),
                    purpose: draft.purpose,
                  });
                  const hours = Number(draft.requiredHours);
                  const estimate =
                    Number.isFinite(hours) && hours > 0
                      ? previewFnbCafeOtAmount({
                          requiredHours: hours,
                          rateMultiplier:
                            draft.rateType === "weekday"
                              ? rateWeekday
                              : draft.rateType === "weekly_off"
                                ? (policy.data?.rateWeeklyOff ?? 1.5)
                                : draft.rateType === "public_holiday"
                                  ? (policy.data?.ratePublicHoliday ?? 1.5)
                                  : (policy.data?.rateEid ?? 2.5),
                        })
                      : 0;
                  return (
                    <li
                      key={person.id}
                      className="space-y-3 rounded-lg border border-border/60 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{person.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("hr.ot.employeeId")}: {person.employeeCode ?? "—"} ·{" "}
                            {t("hr.ot.department")}: {person.department ?? "—"} ·{" "}
                            {t("hr.ot.jobTitle")}: {person.jobTitle ?? "—"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setSelectedIds((ids) => ids.filter((id) => id !== person.id))
                          }
                        >
                          {t("hr.ot.remove")}
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1">
                          <Label htmlFor={`fnb-from-${person.id}`}>{t("hr.ot.fnb.periodFrom")}</Label>
                          <Input
                            id={`fnb-from-${person.id}`}
                            type="date"
                            value={draft.periodFrom}
                            onChange={(e) => patchDraft(person.id, { periodFrom: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`fnb-to-${person.id}`}>{t("hr.ot.fnb.periodTo")}</Label>
                          <Input
                            id={`fnb-to-${person.id}`}
                            type="date"
                            value={draft.periodTo}
                            onChange={(e) => patchDraft(person.id, { periodTo: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`fnb-hours-${person.id}`}>
                            {t("hr.ot.fnb.requiredHours")}
                          </Label>
                          <Input
                            id={`fnb-hours-${person.id}`}
                            type="number"
                            min={1}
                            max={200}
                            step={0.25}
                            value={draft.requiredHours}
                            onChange={(e) =>
                              patchDraft(person.id, { requiredHours: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`fnb-rate-${person.id}`}>{t("hr.ot.rateType")}</Label>
                          <select
                            id={`fnb-rate-${person.id}`}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                            value={draft.rateType}
                            onChange={(e) =>
                              patchDraft(person.id, {
                                rateType: e.target.value as HrOtRateType,
                              })
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

                      <div className="space-y-1">
                        <Label htmlFor={`fnb-purpose-${person.id}`}>{t("hr.ot.purpose")}</Label>
                        <Textarea
                          id={`fnb-purpose-${person.id}`}
                          rows={2}
                          value={draft.purpose}
                          onChange={(e) => patchDraft(person.id, { purpose: e.target.value })}
                          placeholder={t("hr.ot.fnb.purposePlaceholder")}
                        />
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {t("hr.ot.fnb.amountHint", {
                          amount: estimate.toFixed(2),
                          note: t("hr.ot.fnb.amountHintBasic"),
                        })}
                      </p>

                      {showErrors && errors.length > 0 ? (
                        <ul className="space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
                          {errors.map((code) => (
                            <li key={code}>{fieldErrorLabel(t, code)}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={submit.isPending || selectedStaff.length === 0}
                onClick={() => {
                  if (!ready) {
                    setShowErrors(true);
                    toast.error(t("hr.ot.fnb.completeAll"));
                    return;
                  }
                  submit.mutate({
                    entries: selectedStaff.map((person) => {
                      const draft = draftFor(person.id);
                      return {
                        staffId: person.id,
                        periodFrom: draft.periodFrom,
                        periodTo: draft.periodTo,
                        requiredHours: Number(draft.requiredHours),
                        rateType: draft.rateType,
                        purpose: draft.purpose.trim(),
                      };
                    }),
                  });
                }}
              >
                {submit.isPending ? t("hr.ot.fnb.submitting") : t("hr.ot.fnb.submit")}
              </Button>
              <Badge variant="secondary">{t("hr.ot.fnb.autoApprovedBadge")}</Badge>
            </div>
          </HrPanel>

          <HrPanel className="space-y-3">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t("hr.ot.fnb.recentTitle")}</h3>
            </div>
            <p className="text-xs text-muted-foreground">{t("hr.ot.fnb.recentHint")}</p>
            {recentFnbGroups.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("hr.ot.fnb.recentEmpty")}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {recentFnbGroups.map((group) => {
                  const first = group.claims[0];
                  const periodLabel =
                    first?.periodFrom && first?.periodTo
                      ? `${first.periodFrom} → ${first.periodTo}`
                      : group.workDates.join(", ");
                  return (
                    <li key={group.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <p className="font-medium">
                          {group.requestNumber ?? t("hr.ot.requestFallback")} ·{" "}
                          {group.staffNames.join(", ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {periodLabel} · {(group.totalClaimedMinutes / 60).toFixed(2)}h ·{" "}
                          {group.totalAmountQar.toFixed(2)} QAR
                        </p>
                      </div>
                      <Badge variant="outline">{t(`hr.ot.status.${group.status}`)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

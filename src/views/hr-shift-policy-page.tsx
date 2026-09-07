"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  applyDefaultAttendanceSiteShiftPolicies,
  listAttendanceSiteShiftPolicies,
  saveAttendanceSiteShiftPolicy,
} from "@/lib/attendance-hr.functions";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_BUFFER_MINUTES,
  EXTENDED_SHIFT_HOURS,
  PERMANENT_SHIFT_HOURS,
  URBAN_ARENA_BREAK_MINUTES,
} from "@/lib/attendance-hr/shift-policy";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type Draft = {
  breakMinutes: string;
  bufferMinutes: string;
  permanentHours: string;
  secondmentHours: string;
  jokerHours: string;
};

function parseDraftPolicy(draft: Draft) {
  return {
    breakMinutes: Number(draft.breakMinutes),
    bufferMinutes: Number(draft.bufferMinutes),
    permanentHours: Number(draft.permanentHours),
    secondmentHours: Number(draft.secondmentHours),
    jokerHours: Number(draft.jokerHours),
  };
}

export default function HrShiftPolicyPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState("");
  const [draft, setDraft] = useState<Draft>({
    breakMinutes: String(DEFAULT_BREAK_MINUTES),
    bufferMinutes: String(DEFAULT_BUFFER_MINUTES),
    permanentHours: String(PERMANENT_SHIFT_HOURS),
    secondmentHours: String(EXTENDED_SHIFT_HOURS),
    jokerHours: String(EXTENDED_SHIFT_HOURS),
  });

  const q = useQuery({
    queryKey: queryKeys.people.hrSiteShiftPolicy(),
    queryFn: () => listAttendanceSiteShiftPolicies(),
    staleTime: STALE.people,
  });

  const selected = useMemo(
    () => (q.data?.sites ?? []).find((s) => s.locationId === locationId) ?? null,
    [q.data?.sites, locationId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraft({
      breakMinutes: String(selected.breakMinutes),
      bufferMinutes: String(selected.bufferMinutes),
      permanentHours: String(selected.permanentHours),
      secondmentHours: String(selected.secondmentHours),
      jokerHours: String(selected.jokerHours),
    });
  }, [selected]);

  useEffect(() => {
    if (locationId || !q.data?.sites?.length) return;
    setLocationId(q.data.sites[0].locationId);
  }, [locationId, q.data?.sites]);

  const validateDraft = () => {
    if (!locationId) throw new Error(t("hr.shiftPolicy.needLocation"));
    const values = parseDraftPolicy(draft);
    if (!Number.isFinite(values.breakMinutes) || values.breakMinutes < 0 || values.breakMinutes > 240) {
      throw new Error(t("hr.shiftPolicy.breakInvalid"));
    }
    if (!Number.isFinite(values.bufferMinutes) || values.bufferMinutes < 0 || values.bufferMinutes > 120) {
      throw new Error(t("hr.shiftPolicy.bufferInvalid"));
    }
    for (const [label, value] of [
      [t("people.staff.employmentTypes.permanent"), values.permanentHours],
      [t("people.staff.employmentTypes.secondment"), values.secondmentHours],
      [t("people.staff.employmentTypes.joker"), values.jokerHours],
    ] as const) {
      if (!Number.isFinite(value) || value < 1 || value > 16) {
        throw new Error(t("hr.shiftPolicy.hoursInvalid", { role: label }));
      }
    }
    return {
      locationId,
      breakMinutes: Math.round(values.breakMinutes),
      bufferMinutes: Math.round(values.bufferMinutes),
      permanentHours: values.permanentHours,
      secondmentHours: values.secondmentHours,
      jokerHours: values.jokerHours,
    };
  };

  const save = useMutation({
    mutationFn: () => saveAttendanceSiteShiftPolicy(validateDraft()),
    onSuccess: () => {
      toast.success(t("hr.shiftPolicy.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrSiteShiftPolicy() });
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyAll = useMutation({
    mutationFn: () => {
      const values = validateDraft();
      return applyDefaultAttendanceSiteShiftPolicies({
        sourceLocationId: values.locationId,
        breakMinutes: values.breakMinutes,
        bufferMinutes: values.bufferMinutes,
        permanentHours: values.permanentHours,
        secondmentHours: values.secondmentHours,
        jokerHours: values.jokerHours,
      });
    },
    onSuccess: (result) => {
      toast.success(t("hr.shiftPolicy.appliedAll", { count: result.updated }));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrSiteShiftPolicy() });
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleRows = [
    {
      key: "permanent" as const,
      label: t("people.staff.employmentTypes.permanent"),
      value: draft.permanentHours,
      onChange: (v: string) => setDraft((d) => ({ ...d, permanentHours: v })),
      hint: t("hr.shiftPolicy.defaultHours", { hours: PERMANENT_SHIFT_HOURS }),
    },
    {
      key: "secondment" as const,
      label: t("people.staff.employmentTypes.secondment"),
      value: draft.secondmentHours,
      onChange: (v: string) => setDraft((d) => ({ ...d, secondmentHours: v })),
      hint: t("hr.shiftPolicy.defaultHours", { hours: EXTENDED_SHIFT_HOURS }),
    },
    {
      key: "joker" as const,
      label: t("people.staff.employmentTypes.joker"),
      value: draft.jokerHours,
      onChange: (v: string) => setDraft((d) => ({ ...d, jokerHours: v })),
      hint: t("hr.shiftPolicy.defaultHours", { hours: EXTENDED_SHIFT_HOURS }),
    },
  ];

  const selectedLabel = selected
    ? formatLocationLabel(selected.code, selected.name)
    : t("hr.shiftPolicy.selectLocation");

  return (
    <CapabilityGate
      capability="hr.manage"
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.shiftPolicy.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Clock3}
          kicker={t("hr.shiftPolicy.kicker")}
          title={t("hr.shiftPolicy.title")}
          subtitle={t("hr.shiftPolicy.subtitle")}
        >
          <HrPanel delay={0}>
            <div className="space-y-5 p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">
                {t("hr.shiftPolicy.help", {
                  permanentHours: PERMANENT_SHIFT_HOURS,
                  extendedHours: EXTENDED_SHIFT_HOURS,
                  defaultBreak: DEFAULT_BREAK_MINUTES,
                  uaBreak: URBAN_ARENA_BREAK_MINUTES,
                })}
              </p>

              <div className="max-w-md space-y-1.5">
                <Label htmlFor="hr-shift-location">{t("hr.shiftPolicy.location")}</Label>
                <SearchableSelect
                  id="hr-shift-location"
                  value={locationId}
                  onValueChange={setLocationId}
                  placeholder={t("hr.shiftPolicy.selectLocation")}
                  emptyOption={{ value: "", label: t("hr.shiftPolicy.selectLocation") }}
                  options={(q.data?.sites ?? []).map((s) => ({
                    value: s.locationId,
                    label: formatLocationLabel(s.code, s.name),
                    keywords: `${s.code} ${s.name}`,
                  }))}
                />
              </div>

              {q.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </p>
              ) : null}

              {selected ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-xl border border-border/70">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">{t("hr.shiftPolicy.role")}</th>
                          <th className="px-3 py-2 text-left">{t("hr.shiftPolicy.expectedHours")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roleRows.map((row) => (
                          <tr key={row.key} className="border-t border-border/60">
                            <td className="px-3 py-2 font-medium">{row.label}</td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-9 w-28"
                                type="number"
                                min={1}
                                max={16}
                                step={0.5}
                                value={row.value}
                                onChange={(e) => row.onChange(e.target.value)}
                              />
                              <p className="mt-1 text-[11px] text-muted-foreground">{row.hint}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-6">
                    <div className="max-w-xs space-y-1.5">
                      <Label htmlFor="hr-shift-break">{t("hr.shiftPolicy.breakMinutes")}</Label>
                      <Input
                        id="hr-shift-break"
                        className="h-9 w-28"
                        type="number"
                        min={0}
                        max={240}
                        value={draft.breakMinutes}
                        onChange={(e) => setDraft((d) => ({ ...d, breakMinutes: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">{t("hr.shiftPolicy.breakHelp")}</p>
                    </div>

                    <div className="max-w-xs space-y-1.5">
                      <Label htmlFor="hr-shift-buffer">{t("hr.shiftPolicy.bufferMinutes")}</Label>
                      <Input
                        id="hr-shift-buffer"
                        className="h-9 w-28"
                        type="number"
                        min={0}
                        max={120}
                        value={draft.bufferMinutes}
                        onChange={(e) => setDraft((d) => ({ ...d, bufferMinutes: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">{t("hr.shiftPolicy.bufferHelp")}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={save.isPending || !locationId}
                      onClick={() => save.mutate()}
                    >
                      {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      {t("common.save")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={applyAll.isPending || !locationId}
                      onClick={() => {
                        if (
                          !window.confirm(
                            t("hr.shiftPolicy.applyAllConfirm", { location: selectedLabel }),
                          )
                        ) {
                          return;
                        }
                        applyAll.mutate();
                      }}
                    >
                      {applyAll.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      {t("hr.shiftPolicy.applyAll")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("hr.shiftPolicy.applyAllHelp")}</p>
                </div>
              ) : null}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

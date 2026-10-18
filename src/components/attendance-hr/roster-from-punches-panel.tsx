"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  listRoamingStaffForPunchRoster,
  previewPunchRosterMonth,
  savePunchRosterMonth,
} from "@/lib/attendance-hr/roster-from-punches.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type Props = {
  dateFrom: string;
  dateTo: string;
  locationId?: string | null;
  deviceId?: string | null;
  deviceUserKeys?: string[];
};

export function RosterFromPunchesPanel({
  dateFrom,
  dateTo,
  locationId,
  deviceId,
  deviceUserKeys,
}: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [staffIds, setStaffIds] = useState<string[]>([]);

  const roaming = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "roster-from-punches-staff" }),
    queryFn: () => listRoamingStaffForPunchRoster(),
    staleTime: STALE.people,
    retry: false,
  });

  // Hide quietly when the login cannot open the shift roster.
  const forbidden =
    roaming.isError &&
    /forbidden|capability|roster/i.test(roaming.error instanceof Error ? roaming.error.message : "");

  const options = useMemo(
    () =>
      (roaming.data ?? []).map((person) => ({
        value: person.staffId,
        label: person.fullName,
        description: person.employeeCode ?? undefined,
        keywords: `${person.fullName} ${person.employeeCode ?? ""}`,
      })),
    [roaming.data],
  );

  useEffect(() => {
    if (!staffIds.length) return;
    const valid = new Set(options.map((row) => row.value));
    const next = staffIds.filter((id) => valid.has(id));
    if (next.length !== staffIds.length) setStaffIds(next);
  }, [staffIds, options]);

  // Explicit roaming staff selection wins over the device-user filter on the page.
  const filter = {
    dateFrom,
    dateTo,
    staffIds: staffIds.length ? staffIds : undefined,
    locationId: locationId || null,
    deviceId: deviceId || null,
    deviceUserKeys: staffIds.length ? undefined : deviceUserKeys?.length ? deviceUserKeys : undefined,
  };

  const preview = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "roster-from-punches-preview", ...filter }),
    queryFn: () => previewPunchRosterMonth(filter),
    enabled: Boolean(roaming.data?.length) && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) && /^\d{4}-\d{2}-\d{2}$/.test(dateTo),
    staleTime: STALE.people,
  });

  const save = useMutation({
    mutationFn: () => savePunchRosterMonth(filter),
    onSuccess: (result) => {
      toast.success(
        t("attendanceHr.deviceLogs.rosterFromPunchesResult", {
          inserted: result.inserted,
          incomplete: result.skippedIncomplete,
          existing: result.skippedExisting,
        }),
      );
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
      void qc.invalidateQueries({ queryKey: queryKeys.people.rosterRegister() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (forbidden || roaming.isPending) return null;
  if (roaming.isError) return null;
  if (!options.length) return null;

  const plan = preview.data;
  const ready = Boolean(plan && plan.savedEligible > 0) && !save.isPending;

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarPlus className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            {t("attendanceHr.deviceLogs.rosterFromPunchesTitle")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("attendanceHr.deviceLogs.rosterFromPunchesHint")}
          </p>
        </div>
        <Button
          type="button"
          className="min-h-10 shrink-0"
          disabled={!ready}
          onClick={() => save.mutate()}
        >
          {save.isPending
            ? t("common.saving", { defaultValue: "Saving…" })
            : t("attendanceHr.deviceLogs.rosterFromPunchesSave")}
        </Button>
      </div>

      <div className="min-w-56 max-w-xl space-y-1.5">
        <Label htmlFor="roster-from-punches-staff">
          {t("attendanceHr.deviceLogs.rosterFromPunchesStaff")}
        </Label>
        <SearchableSelect
          id="roster-from-punches-staff"
          multiple
          values={staffIds}
          onValuesChange={setStaffIds}
          placeholder={t("attendanceHr.deviceLogs.rosterFromPunchesAllRoaming")}
          searchPlaceholder={t("attendanceHr.deviceLogs.searchPlaceholder")}
          emptyOption={{ value: "", label: t("attendanceHr.deviceLogs.rosterFromPunchesAllRoaming") }}
          options={options}
          selectedCountLabel={(count) => t("attendanceHr.deviceLogs.selectedUsers", { count })}
          aria-label={t("attendanceHr.deviceLogs.rosterFromPunchesStaff")}
          triggerClassName="h-10 min-h-10 w-full font-normal"
          className="w-full"
        />
      </div>

      {preview.isError ? (
        <p className="text-xs text-destructive">{preview.error.message}</p>
      ) : plan ? (
        <p className="text-xs text-muted-foreground">
          {t("attendanceHr.deviceLogs.rosterFromPunchesPreview", {
            eligible: plan.savedEligible,
            incomplete: plan.skippedIncomplete,
            existing: plan.skippedExisting,
          })}
        </p>
      ) : preview.isFetching ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : null}
    </div>
  );
}

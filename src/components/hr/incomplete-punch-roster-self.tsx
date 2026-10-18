"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSites } from "@/hooks/queries/useSites";
import { formatPunchTime12h, formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import {
  listMyIncompletePunchRoster,
  saveMyIncompletePunchRoster,
} from "@/lib/attendance-hr/roster-from-punches.functions";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { formatLocationLabel, rosterSheetLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

type Draft = {
  locationId: string;
  shiftStart: string;
  shiftEnd: string;
};

export function IncompletePunchRosterSelf() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const period = useMemo(
    () => defaultPayrollPeriod(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" })),
    [],
  );
  const { data: sites } = useSites();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const incomplete = useQuery({
    queryKey: queryKeys.people.attendanceHr({
      view: "my-incomplete-punch-roster",
      from: period.dateFrom,
      to: period.dateTo,
    }),
    queryFn: () =>
      listMyIncompletePunchRoster({ dateFrom: period.dateFrom, dateTo: period.dateTo }),
    staleTime: STALE.people,
  });

  const save = useMutation({
    mutationFn: (input: { workDate: string; locationId: string; shiftStart: string; shiftEnd: string }) =>
      saveMyIncompletePunchRoster(input),
    onSuccess: (_data, vars) => {
      toast.success(t("hr.me.incompletePunchRosterSaved", { date: formatWorkDateDdMmYyyy(vars.workDate) }));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = incomplete.data ?? [];
  if (incomplete.isLoading) return null;
  if (incomplete.isError || rows.length === 0) return null;

  const locationOptions = (sites ?? [])
    .filter((site) => site.status === "active")
    .map((site) => ({
      id: site.id,
      label: formatLocationLabel(site.code, rosterSheetLabel(site.code, site.name)),
    }));

  function draftFor(row: (typeof rows)[number]): Draft {
    return (
      drafts[row.workDate] ?? {
        locationId: row.locationId,
        shiftStart: row.suggestedShiftStart ?? "",
        shiftEnd: "",
      }
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">{t("hr.me.incompletePunchRosterTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("hr.me.incompletePunchRosterHint")}</p>
      </div>
      <ul className="space-y-3">
        {rows.map((row) => {
          const draft = draftFor(row);
          const ready =
            Boolean(draft.locationId) &&
            /^\d{2}:\d{2}$/.test(draft.shiftStart) &&
            /^\d{2}:\d{2}$/.test(draft.shiftEnd);
          return (
            <li key={row.workDate} className="space-y-2 rounded-xl border border-border/60 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{formatWorkDateDdMmYyyy(row.workDate)}</p>
                <p className="text-xs text-muted-foreground">
                  {t("hr.me.incompletePunchRosterInOnly", {
                    time: formatPunchTime12h(row.punchInAt) || "—",
                  })}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("hr.me.incompletePunchRosterLocation")}</Label>
                  <Select
                    value={draft.locationId}
                    onValueChange={(value) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.workDate]: { ...draftFor(row), locationId: value },
                      }))
                    }
                  >
                    <SelectTrigger aria-label={t("hr.me.incompletePunchRosterLocation")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locationOptions.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`incomplete-start-${row.workDate}`}>
                    {t("hr.me.incompletePunchRosterStart")}
                  </Label>
                  <Input
                    id={`incomplete-start-${row.workDate}`}
                    type="time"
                    value={draft.shiftStart}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.workDate]: { ...draftFor(row), shiftStart: event.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor={`incomplete-end-${row.workDate}`}>
                    {t("hr.me.incompletePunchRosterEnd")}
                  </Label>
                  <Input
                    id={`incomplete-end-${row.workDate}`}
                    type="time"
                    value={draft.shiftEnd}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.workDate]: { ...draftFor(row), shiftEnd: event.target.value },
                      }))
                    }
                  />
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!ready || save.isPending}
                onClick={() =>
                  save.mutate({
                    workDate: row.workDate,
                    locationId: draft.locationId,
                    shiftStart: draft.shiftStart,
                    shiftEnd: draft.shiftEnd,
                  })
                }
              >
                {t("hr.me.incompletePunchRosterSave")}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

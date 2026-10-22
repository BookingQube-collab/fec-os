"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useUserRoles } from "@/hooks/use-auth";
import { approveRosterPunchFill, listRosterPunchFillStaff } from "@/lib/attendance-hr/roster-punch-fill.functions";
import { mayFillRosterDevicePunches } from "@/lib/attendance-hr/roster-punch-fill";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function RosterPunchFill({
  jobTitle,
  embedded = false,
}: {
  jobTitle?: string | null;
  /** Hide title/hint when the parent already labels the job (e.g. Correction tabs). */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const allowed = mayFillRosterDevicePunches({ roles, jobTitle });
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [result, setResult] = useState<{ filledDays: number; skippedDays: number } | null>(null);

  const people = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "roster-punch-fill-staff" }),
    queryFn: () => listRosterPunchFillStaff(),
    enabled: allowed,
    staleTime: STALE.people,
  });

  const approve = useMutation({
    mutationFn: () => approveRosterPunchFill({ staffId, dateFrom, dateTo }),
    onSuccess: (filled) => {
      setResult(filled);
      toast.success(t("hr.me.rosterFillResult", { filled: filled.filledDays, skipped: filled.skippedDays }));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!allowed) return null;

  const options = (people.data ?? []).map((person) => ({
    value: person.staffId,
    label: person.fullName,
    description: person.employeeCode ?? undefined,
    keywords: `${person.fullName} ${person.employeeCode ?? ""}`,
  }));
  const ready = Boolean(staffId) && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) && /^\d{4}-\d{2}-\d{2}$/.test(dateTo);

  return (
    <form
      id="me-roster-punch-fill"
      className="space-y-3 rounded-2xl border border-border/70 bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || approve.isPending) return;
        setResult(null);
        approve.mutate();
      }}
    >
      {!embedded ? (
        <div>
          <h3 className="text-sm font-semibold">{t("hr.me.rosterFillTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("hr.me.rosterFillHint")}</p>
        </div>
      ) : null}
      <div>
        <Label className="text-xs">{t("hr.me.rosterFillStaff")}</Label>
        <SearchableSelect
          className="mt-1"
          value={staffId}
          onValueChange={setStaffId}
          aria-label={t("hr.me.rosterFillStaff")}
          placeholder={people.isPending ? t("common.loading", { defaultValue: "Loading…" }) : t("hr.me.rosterFillChoose")}
          disabled={people.isPending || options.length === 0}
          options={options}
        />
        {people.isError ? <p className="mt-1 text-xs text-destructive">{people.error.message}</p> : null}
        {!people.isPending && !people.isError && options.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t("hr.me.rosterFillEmpty")}</p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs" htmlFor="roster-fill-from">
            {t("hr.me.rosterFillFrom")}
          </Label>
          <Input
            id="roster-fill-from"
            className="mt-1"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="roster-fill-to">
            {t("hr.me.rosterFillTo")}
          </Label>
          <Input
            id="roster-fill-to"
            className="mt-1"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>
      </div>
      <Button type="submit" className="min-h-11" disabled={!ready || approve.isPending}>
        {t("hr.me.rosterFillApprove")}
      </Button>
      {result ? (
        <p className="text-sm text-muted-foreground">
          {t("hr.me.rosterFillResult", { filled: result.filledDays, skipped: result.skippedDays })}
        </p>
      ) : null}
    </form>
  );
}

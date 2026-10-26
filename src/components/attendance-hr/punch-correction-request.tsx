"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserRoles } from "@/hooks/use-auth";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { formatPunchTime12h } from "@/lib/attendance-display";
import { findCorrectionDay, listCorrectionSubjects, submitMissedPunchRequest } from "@/lib/attendance-hr.functions";
import { canRequestAttendanceCorrection } from "@/lib/attendance-hr/missed-punch-approval";
import { opsApprovalLaneForStaff, opsStepApproverLabel } from "@/lib/approval-ops-routing";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { userFacingActionError } from "@/lib/user-facing-action-error";

function clockText(iso: string | null): string {
  return formatPunchTime12h(iso) || "—";
}

export function PunchCorrectionRequest({
  jobTitle = null,
  department = null,
  selfStaff = null,
  embedded = false,
}: {
  jobTitle?: string | null;
  department?: string | null;
  selfStaff?: { staffId: string; fullName: string; employeeCode: string | null } | null;
  /** Hide title/hint when the parent already labels the job (e.g. Correction tabs). */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const { hasDirectReports, isPending: reportsPending } = useHasDirectReports();
  const canRequest = canRequestAttendanceCorrection({ roles, hasDirectReports, jobTitle });
  const qc = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [punchIn, setPunchIn] = useState("");
  const [punchOut, setPunchOut] = useState("");
  const [reason, setReason] = useState("");

  const subjects = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "correction-subjects" }),
    queryFn: () => listCorrectionSubjects(),
    enabled: canRequest && !reportsPending,
    staleTime: STALE.people,
  });
  const selfOpsLane = opsApprovalLaneForStaff(jobTitle, department);
  const selfOption = selfStaff
    ? [
        {
          ...selfStaff,
          jobTitle,
          department,
          opsLane: selfOpsLane,
          self: true as const,
        },
      ]
    : [];
  const people = subjects.data?.length ? subjects.data : selfOption;
  const selectedStaffId = staffId || people.find((person) => person.self)?.staffId || people[0]?.staffId || "";
  const selectedPerson = people.find((person) => person.staffId === selectedStaffId);
  const forTeam = Boolean(selectedPerson && !selectedPerson.self);
  const opsLabel = opsStepApproverLabel(
    selectedPerson?.opsLane ?? selfOpsLane,
  );
  const day = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "correction-day", staffId: selectedStaffId, workDate }),
    queryFn: () => findCorrectionDay({ staffId: selectedStaffId, workDate }),
    enabled: canRequest && Boolean(selectedStaffId) && /^\d{4}-\d{2}-\d{2}$/.test(workDate),
    staleTime: STALE.people,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const summaryId = day.data?.summaryId;
      if (!summaryId) throw new Error("This date has no attendance to correct.");
      if (!punchIn && !punchOut) throw new Error("Enter the corrected punch-in, punch-out, or both.");
      // One form → one MP request with punch-in and/or punch-out on the same row.
      const result = await submitMissedPunchRequest({
        summaryId,
        punchInTime: punchIn || null,
        punchOutTime: punchOut || null,
        reason: reason.trim() || undefined,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (result) => {
      if (result.routedTo === "final") {
        toast.success("Approved. Attendance is updated.");
      } else if (result.routedTo === "ops") {
        toast.success(
          result.approverCount === 0
            ? `Approved and waiting for ${opsLabel}. No ${opsLabel} login is linked yet.`
            : `Approved and sent to ${opsLabel}.`,
        );
      } else if (result.routedTo === "ops_first") {
        toast.success(
          result.approverCount === 0
            ? `Request saved. No ${opsLabel} login is linked yet.`
            : `Sent to ${opsLabel}.`,
        );
      } else if (result.approverCount === 0) toast.message(t("hr.me.savedNoSupervisor"));
      else toast.success(t("hr.me.sentToSupervisor"));
      setPunchIn("");
      setPunchOut("");
      setReason("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (error: Error) =>
      toast.error(userFacingActionError(error, "Could not submit the punch correction. Try again.")),
  });

  if (reportsPending || !canRequest) return null;

  return (
    <form
      className="space-y-3 rounded-2xl border border-border/70 bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit.mutate();
      }}
    >
      {!embedded ? (
        <div>
          <h3 className="text-sm font-semibold">{t("hr.me.correctionRequestTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {forTeam
              ? t("hr.me.correctionRequestHintTeam", { ops: opsLabel })
              : t("hr.me.correctionRequestHintSelf", { ops: opsLabel })}
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Person</Label>
          <Select value={selectedStaffId || undefined} onValueChange={setStaffId} disabled={!people.length}>
            <SelectTrigger className="mt-1">
              <SelectValue
                placeholder={subjects.isPending && people.length === 0 ? "Loading people" : "Choose a person"}
              />
            </SelectTrigger>
            <SelectContent>
              {people.map((person) => (
                <SelectItem key={person.staffId} value={person.staffId}>
                  {person.fullName}
                  {person.employeeCode ? ` · ${person.employeeCode}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {subjects.isError ? (
            <p className="mt-1 text-xs text-destructive">
              {subjects.error.message}
              <button type="button" className="ms-2 underline" onClick={() => void subjects.refetch()}>
                Retry
              </button>
            </p>
          ) : null}
        </div>
        <div>
          <Label className="text-xs" htmlFor="correction-date">
            Date
          </Label>
          <Input
            id="correction-date"
            className="mt-1 min-h-11"
            type="date"
            value={workDate}
            onChange={(event) => setWorkDate(event.target.value)}
            required
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="correction-in">
            {t("hr.me.punchIn")}
            {day.data?.summaryId ? ` · now ${clockText(day.data.actualIn)}` : ""}
          </Label>
          <Input
            id="correction-in"
            className="mt-1 min-h-11"
            type="time"
            value={punchIn}
            onChange={(event) => setPunchIn(event.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="correction-out">
            {t("hr.me.punchOut")}
            {day.data?.summaryId ? ` · now ${clockText(day.data.actualOut)}` : ""}
          </Label>
          <Input
            id="correction-out"
            className="mt-1 min-h-11"
            type="time"
            value={punchOut}
            onChange={(event) => setPunchOut(event.target.value)}
          />
        </div>
      </div>
      {workDate && day.data && !day.data.summaryId ? (
        <p className="text-xs text-muted-foreground">No attendance is recorded for that date.</p>
      ) : null}
      {day.data?.summaryId && !day.data.correctable ? (
        <p className="text-xs text-muted-foreground">This day cannot be corrected.</p>
      ) : null}
      <div>
        <Label className="text-xs" htmlFor="correction-reason">
          {t("hr.me.punchReason")}
        </Label>
        <Input
          id="correction-reason"
          className="mt-1 min-h-11"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What was punched wrongly"
        />
      </div>
      <Button
        type="submit"
        className="min-h-11"
        disabled={
          submit.isPending ||
          !day.data?.summaryId ||
          !day.data.correctable ||
          (!punchIn && !punchOut)
        }
      >
        {forTeam ? `Approve and send to ${opsLabel}` : t("hr.me.sendToSupervisor")}
      </Button>
    </form>
  );
}

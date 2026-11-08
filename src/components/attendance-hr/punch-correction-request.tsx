"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useUserRoles } from "@/hooks/use-auth";
import { useHasDirectReports } from "@/hooks/use-my-direct-reports";
import { formatPunchTime12h } from "@/lib/attendance-display";
import { findCorrectionDay, listCorrectionSubjects, submitMissedPunchRequest } from "@/lib/attendance-hr.functions";
import { isFnbManager } from "@/lib/arcade/access";
import {
  canRequestAttendanceCorrection,
  isHeadOfOperationsTitle,
  missedPunchSubmitterAutoCompletesManagerSeat,
} from "@/lib/attendance-hr/missed-punch-approval";
import { opsApprovalLaneForStaff, opsStepApproverLabel } from "@/lib/approval-ops-routing";
import { invalidateMissedPunchLists } from "@/lib/people-query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { userFacingActionError } from "@/lib/user-facing-action-error";

function clockText(iso: string | null): string {
  return formatPunchTime12h(iso) || "—";
}

/** Client preview of teamCorrectionRoute when the ops seat is known only by title. */
function submitsAsOpsSeat(jobTitle: string | null | undefined, department: string | null | undefined): boolean {
  return isHeadOfOperationsTitle(jobTitle) || isFnbManager(jobTitle, department);
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
  const personOptions = useMemo(
    () =>
      people.map((person) => {
        const code = person.employeeCode?.trim() || "";
        const label = code ? `${person.fullName} · ${code}` : person.fullName;
        return {
          value: person.staffId,
          label,
          keywords: `${person.fullName} ${code}`.trim(),
        };
      }),
    [people],
  );
  const selectedStaffId = staffId || people.find((person) => person.self)?.staffId || people[0]?.staffId || "";
  const selectedPerson = people.find((person) => person.staffId === selectedStaffId);
  const forTeam = Boolean(selectedPerson && !selectedPerson.self);
  const opsLabel = opsStepApproverLabel(
    selectedPerson?.opsLane ?? selfOpsLane,
  );
  // Mirror teamCorrectionRoute on the client (title-only): ops seat → final,
  // Sr. Site → ops, Venue / Site / regular supervisor → Sr. Site (line_manager).
  const teamSubmitRoute = submitsAsOpsSeat(jobTitle, department)
    ? "final"
    : missedPunchSubmitterAutoCompletesManagerSeat(jobTitle)
      ? "ops"
      : "line_manager";
  const submitLabel = !forTeam
    ? t("hr.me.sendToSupervisor")
    : teamSubmitRoute === "final"
      ? t("hr.me.approveCorrection")
      : teamSubmitRoute === "ops"
        ? t("hr.me.approveAndSendTo", { who: opsLabel })
        : t("hr.me.sendToWho", { who: t("hr.me.step.manager") });
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
      invalidateMissedPunchLists(qc);
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
      <div className="grid min-w-0 grid-cols-1 gap-3 overflow-x-clip sm:grid-cols-2">
        <div className="min-w-0">
          <Label className="text-xs">Person</Label>
          <SearchableSelect
            className="mt-1"
            value={selectedStaffId}
            onValueChange={setStaffId}
            aria-label="Person"
            placeholder={
              subjects.isPending && people.length === 0 ? "Loading people" : "Search by name"
            }
            disabled={!people.length}
            options={personOptions}
          />
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
        {submitLabel}
      </Button>
    </form>
  );
}

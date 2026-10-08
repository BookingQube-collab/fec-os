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
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

function clockText(iso: string | null): string {
  return formatPunchTime12h(iso) || "—";
}

export function PunchCorrectionRequest() {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const { hasDirectReports, isPending: reportsPending } = useHasDirectReports();
  const canRequest = canRequestAttendanceCorrection({ roles, hasDirectReports });
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
  const people = subjects.data ?? [];
  const selectedStaffId = staffId || people.find((person) => person.self)?.staffId || people[0]?.staffId || "";
  const selectedPerson = people.find((person) => person.staffId === selectedStaffId);
  const forTeam = Boolean(selectedPerson && !selectedPerson.self);
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
      const sides = [
        punchIn ? (["in", punchIn] as const) : null,
        punchOut ? (["out", punchOut] as const) : null,
      ].filter((side): side is readonly ["in" | "out", string] => side !== null);
      if (!sides.length) throw new Error("Enter the corrected punch-in, punch-out, or both.");
      let approverCount = 0;
      let routedTo: "line_manager" | "hr" = "line_manager";
      for (const [punchType, punchTime] of sides) {
        const result = await submitMissedPunchRequest({
          summaryId,
          punchType,
          punchTime,
          reason: reason.trim() || undefined,
          ...(punchIn ? { requestedPunchIn: punchIn } : {}),
          ...(punchOut ? { requestedPunchOut: punchOut } : {}),
        });
        approverCount = result.approverCount;
        routedTo = result.routedTo;
      }
      return { approverCount, routedTo };
    },
    onSuccess: (result) => {
      if (result.routedTo === "hr") {
        toast.success(
          result.approverCount === 0
            ? "Approved and waiting for HR. No HR login is linked yet."
            : "Approved and sent to HR.",
        );
      } else if (result.approverCount === 0) toast.message(t("hr.me.savedNoSupervisor"));
      else toast.success("Sent to your line manager.");
      setPunchIn("");
      setPunchOut("");
      setReason("");
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (error: Error) => toast.error(error.message),
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
      <div>
        <h3 className="text-sm font-semibold">Request a punch correction</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {forTeam
            ? "This person reports to you. You request and approve the correction, and it goes to HR with the punch-in and punch-out you enter, plus the previous punches. It does not wait for your line manager or Head of Operations."
            : "Correct a wrong punch-in or punch-out for yourself. Your line manager approves it, then Head of Operations, then HR."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Person</Label>
          <Select value={selectedStaffId || undefined} onValueChange={setStaffId} disabled={!people.length}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={subjects.isPending ? "Loading people" : "Choose a person"} />
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
        {forTeam ? "Approve and send to HR" : "Send to line manager"}
      </Button>
    </form>
  );
}

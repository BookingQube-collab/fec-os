"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createEventHireAndAssign,
  deleteEventStaffAssignment,
  upsertEventStaffAssignment,
} from "@/lib/event-staff-assignments.functions";
import {
  assignmentTypeLabel,
  EVENT_STAFF_ASSIGNMENT_TYPES,
  looksLikeLabourPoolStaff,
  type EventStaffAssignmentType,
} from "@/lib/events/staff-assignments";
import type { EventStaffAssignmentRow } from "@/lib/events/types";

type StaffOption = {
  id: string;
  full_name: string;
  employment_type?: string | null;
  status?: string | null;
  job_title?: string | null;
};

export function EventStaffingPanel({
  eventId,
  assignments,
  staff,
  canEdit,
  canHire,
  defaultFrom,
  defaultTo,
  onChanged,
}: {
  eventId: string;
  assignments: EventStaffAssignmentRow[];
  staff: StaffOption[];
  canEdit: boolean;
  canHire: boolean;
  defaultFrom: string;
  defaultTo: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<EventStaffAssignmentType>("loaned");
  const [staffId, setStaffId] = useState("");
  const [role, setRole] = useState("Crew");
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [hireName, setHireName] = useState("");
  const [hireRole, setHireRole] = useState("Crew");
  const [hireFrom, setHireFrom] = useState(defaultFrom);
  const [hireTo, setHireTo] = useState(defaultTo);
  const [hirePhone, setHirePhone] = useState("");

  const staffOptions = useMemo(() => {
    if (type !== "labour") return staff;
    const pool = staff.filter((s) =>
      looksLikeLabourPoolStaff({
        employment_type: s.employment_type,
        status: s.status,
      }),
    );
    return pool.length ? pool : staff;
  }, [staff, type]);

  async function addAssignment() {
    if (!staffId) return;
    setBusy(true);
    try {
      await upsertEventStaffAssignment({
        eventId,
        staff_id: staffId,
        assignment_type: type,
        role_label: role.trim() || "crew",
        date_from: dateFrom,
        date_to: dateTo,
        notes: notes.trim() || null,
      });
      setStaffId("");
      setNotes("");
      onChanged();
      toast.success(t("events.staffing.toasts.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(id: string) {
    setBusy(true);
    try {
      await deleteEventStaffAssignment({ id });
      onChanged();
      toast.success(t("events.staffing.toasts.removed"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createHire() {
    if (!hireName.trim()) return;
    setBusy(true);
    try {
      await createEventHireAndAssign({
        eventId,
        fullName: hireName.trim(),
        role_label: hireRole.trim() || "crew",
        date_from: hireFrom,
        date_to: hireTo,
        phone: hirePhone.trim() || undefined,
      });
      setHireName("");
      setHirePhone("");
      onChanged();
      toast.success(t("events.staffing.toasts.hireCreated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/40 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("events.staffing.crewList")}</h2>
          <p className="text-xs text-muted-foreground">{t("events.staffing.hint")}</p>
        </div>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("events.staffing.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("events.staffing.columns.person")}</TableHead>
                <TableHead>{t("events.staffing.columns.type")}</TableHead>
                <TableHead>{t("events.staffing.columns.role")}</TableHead>
                <TableHead>{t("events.staffing.columns.dates")}</TableHead>
                <TableHead>{t("events.staffing.columns.pay")}</TableHead>
                {canEdit ? <TableHead className="w-24" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{row.staff_name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.staff_job_title ?? "—"}
                        {row.assignment_type === "event_hire" ? (
                          <Badge variant="outline" className="ms-2 text-[10px]">
                            {t("events.staffing.eventHireBadge")}
                          </Badge>
                        ) : null}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">{assignmentTypeLabel(row.assignment_type)}</Badge>
                      {row.status === "closed" ? (
                        <Badge variant="outline">{t("events.staffing.closedBadge")}</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{row.role_label}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {row.date_from} → {row.date_to}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.pay_on_event_run
                      ? t("events.staffing.payOn")
                      : t("events.staffing.payOff")}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void removeAssignment(row.id)}
                      >
                        {t("common.remove")}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {canEdit ? (
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("events.staffing.addExisting")}</h2>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as EventStaffAssignmentType);
                setStaffId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_STAFF_ASSIGNMENT_TYPES.filter((x) => x !== "event_hire").map((x) => (
                  <SelectItem key={x} value={x}>
                    {assignmentTypeLabel(x)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={staffId || "none"} onValueChange={(v) => setStaffId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("events.overview.selectStaff")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("events.overview.selectStaff")}</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                    {looksLikeLabourPoolStaff(s) ? " · labour" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t("events.overview.roleLabel")}
            />
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("events.staffing.notesPlaceholder")}
            />
            <Button size="sm" disabled={!staffId || busy} onClick={() => void addAssignment()}>
              {t("events.staffing.addAssignment")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("events.staffing.loanedNote")}</p>
        </section>
      ) : null}

      {canEdit && canHire ? (
        <section className="rounded-2xl border border-border/40 bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("events.staffing.hireTitle")}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{t("events.staffing.hireHint")}</p>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            <Input
              value={hireName}
              onChange={(e) => setHireName(e.target.value)}
              placeholder={t("events.staffing.hireName")}
            />
            <Input
              value={hireRole}
              onChange={(e) => setHireRole(e.target.value)}
              placeholder={t("events.overview.roleLabel")}
            />
            <Input
              value={hirePhone}
              onChange={(e) => setHirePhone(e.target.value)}
              placeholder={t("events.staffing.hirePhone")}
            />
            <Input type="date" value={hireFrom} onChange={(e) => setHireFrom(e.target.value)} />
            <Input type="date" value={hireTo} onChange={(e) => setHireTo(e.target.value)} />
            <Button size="sm" disabled={!hireName.trim() || busy} onClick={() => void createHire()}>
              {t("events.staffing.createHire")}
            </Button>
          </div>
        </section>
      ) : null}

      {canEdit && !canHire ? (
        <p className="text-xs text-muted-foreground">{t("events.staffing.hireNeedsPeople")}</p>
      ) : null}
    </div>
  );
}

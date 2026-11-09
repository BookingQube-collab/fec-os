"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { peopleEventHref } from "@/lib/people-event-selection";

type Focus = "crew" | "shifts" | "attendance" | "payroll" | "corrections";

/**
 * Banner on Events workforce tabs: setup stays here; ongoing HR manage is in People.
 */
export function EventWorkforcePeopleLinks({
  eventId,
  focus = "crew",
}: {
  eventId: string;
  focus?: Focus;
}) {
  const { t } = useTranslation();
  const attendanceHref = peopleEventHref("/people/event-attendance", eventId);
  const crewHref = peopleEventHref("/people/event-crew", eventId);
  const shiftsHref = peopleEventHref("/people/event-shifts", eventId);
  const payrollHref = peopleEventHref("/people/event-payroll", eventId);
  const rolesHref = peopleEventHref("/people/event-roles", eventId);
  const primary =
    focus === "attendance"
      ? { href: attendanceHref, label: t("peopleEvent.links.openAttendance") }
      : focus === "payroll"
        ? { href: payrollHref, label: t("peopleEvent.links.openPayroll") }
        : focus === "corrections"
          ? { href: attendanceHref, label: t("peopleEvent.links.openAttendance") }
          : focus === "shifts"
            ? { href: shiftsHref, label: t("peopleEvent.links.openShifts") }
            : { href: crewHref, label: t("peopleEvent.links.openCrew") };

  const hint =
    focus === "crew"
      ? t("peopleEvent.staffingHub.hint")
      : focus === "shifts"
        ? t("peopleEvent.shifts.setupHint")
        : t("peopleEvent.setupHint");

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/40 bg-muted/30 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant="secondary">
          <Link href={primary.href}>
            <ExternalLink className="me-1.5 h-3.5 w-3.5" />
            {primary.label}
          </Link>
        </Button>
        {focus === "crew" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={rolesHref}>{t("peopleEvent.links.openRoles")}</Link>
          </Button>
        ) : null}
        {focus !== "crew" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={crewHref}>{t("peopleEvent.links.openCrew")}</Link>
          </Button>
        ) : null}
        {focus !== "shifts" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={shiftsHref}>{t("peopleEvent.links.openShifts")}</Link>
          </Button>
        ) : null}
        {focus !== "attendance" && focus !== "corrections" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={attendanceHref}>{t("peopleEvent.links.openAttendance")}</Link>
          </Button>
        ) : null}
        {focus !== "payroll" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={payrollHref}>{t("peopleEvent.links.openPayroll")}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

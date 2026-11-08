"use client";

/* Hallmark · redesign · app dashboard · preserve FEC People/HR tokens
 * macrostructure: Stat-Led workbench · tone: utilitarian ops · enrichment: none
 * previous: sparse 3-card hub · this: KPI strip + charts + module tabs
 */

import Link from "next/link";
import { Calendar, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { PeopleEventWorkforceDashboard } from "@/components/people/people-event-workforce-dashboard";
import { PeopleEventWorkforceTabs } from "@/components/people/people-event-workforce-tabs";
import { Button } from "@/components/ui/button";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { canActorPerform } from "@/lib/arcade/access";
import type { Capability } from "@/lib/rbac";

export default function PeopleEventsHubPage() {
  const { t } = useTranslation();
  const roles = useUserRoles();
  const { profile } = useAuth();
  const actorOpts = {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  };

  const can = (caps: readonly Capability[]) =>
    caps.some((cap) => canActorPerform(roles, cap, actorOpts));

  const canCrew = can(["people.view_roster", "events.view", "attendance.view"]);
  const canAttendance = can(["attendance.view"]);
  const canPayroll = can(["payroll.view"]);
  const canOpenEventsSetup = can(["events.view"]);
  const hasAnyModule = canCrew || canAttendance || canPayroll;

  return (
    <HrShell>
      <HrSection
        icon={Calendar}
        kicker={t("peopleEvent.kicker")}
        title={t("peopleEvent.hub.title")}
        subtitle={t("peopleEvent.hub.subtitleDashboard")}
        actions={
          canOpenEventsSetup ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/events">
                <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                {t("peopleEvent.hub.openEventsSetup")}
              </Link>
            </Button>
          ) : null
        }
      >
        {!hasAnyModule ? (
          <HrPanel>
            <HrEmptyState message={t("peopleEvent.noAccess")} icon={Calendar} />
          </HrPanel>
        ) : (
          <>
            <PeopleEventWorkforceTabs active="overview" />
            <PeopleEventWorkforceDashboard
              canCrew={canCrew}
              canAttendance={canAttendance}
              canPayroll={canPayroll}
            />
          </>
        )}
      </HrSection>
    </HrShell>
  );
}

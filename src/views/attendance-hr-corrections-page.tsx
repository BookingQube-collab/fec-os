"use client";

import { FecPageHeader } from "@/components/fec";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { MissedPunchApprovalQueue } from "@/components/attendance-hr/missed-punch-approval-queue";
import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Button } from "@/components/ui/button";

export default function AttendanceHrCorrectionsPage() {
  return (
    <div className="space-y-6">
      <FecPageHeader
        icon={ClipboardCheck}
        kicker="Time & Attendance"
        title="Corrections"
        subtitle="Missed punch requests wait on the site supervisor, then Head of Operations, then HR. Approvers see the step waiting for them. Admin also sees the supervisor and operations steps."
      />
      <AttendanceHrNav />
      <NeumorphicCard className="space-y-3 p-5">
        <MissedPunchApprovalQueue />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" asChild>
            <Link href="/people/attendance/reports">Open attendance listing</Link>
          </Button>
        </div>
      </NeumorphicCard>
    </div>
  );
}

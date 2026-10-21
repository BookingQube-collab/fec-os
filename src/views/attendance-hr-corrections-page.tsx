"use client";

import { FecPageHeader } from "@/components/fec";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { MissedPunchApprovalQueue } from "@/components/attendance-hr/missed-punch-approval-queue";
import { PunchCorrectionRequest } from "@/components/attendance-hr/punch-correction-request";
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
        subtitle="Your own correction goes to your Venue / Site supervisor first (even when a Team Lead is in between), then Head of Operations (or F&B Manager for F&B staff), then HR. When you report to that ops seat already, it waits there first. A team correction filed by a site supervisor is approved by them and sent to that same ops step, then HR."
      />
      <AttendanceHrNav />
      <NeumorphicCard className="space-y-3 p-5">
        <PunchCorrectionRequest />
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

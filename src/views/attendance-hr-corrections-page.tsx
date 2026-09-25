"use client";

import { FecPageHeader } from "@/components/fec";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listAttendanceCorrections, reviewAttendanceCorrection } from "@/lib/attendance-hr.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";

export default function AttendanceHrCorrectionsPage() {
  const locationId = useAppStore((s) => s.currentLocationId);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "corrections", locationId }),
    queryFn: () => listAttendanceCorrections({ locationId: locationId || null }),
    staleTime: STALE.people,
  });
  const reviewMut = useMutation({
    mutationFn: reviewAttendanceCorrection,
    onSuccess: () => {
      toast.success("Correction updated");
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <FecPageHeader
        icon={ClipboardCheck}
        kicker="Time & Attendance"
        title="Corrections"
        subtitle="Supervisors submit. HR/admin approve. You cannot approve your own request."
      />
      <AttendanceHrNav />
      <NeumorphicCard className="space-y-3 p-5">
        {(q.data ?? []).length === 0 ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium">No submitted correction requests.</p>
            <p className="text-muted-foreground">
              This queue only lists supervisor/HR correction requests (pending or reviewed). Payroll{" "}
              <span className="font-medium text-foreground">Fix</span> blockers (missed punch, short
              hours, review required) are attendance readiness issues — they do not appear here
              unless someone submits a correction request.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" asChild>
                <Link href="/people/payroll">Open payroll Fix / readiness</Link>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <Link href="/people/attendance/reports">Open attendance listing</Link>
              </Button>
            </div>
          </div>
        ) : null}
        {(q.data ?? []).map((row) => (
          <div
            key={row.id as string}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium">
                {String(row.kind)} · {String(row.work_date ?? "")}
              </p>
              <p className="text-xs text-muted-foreground">{String(row.reason)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  row.status === "pending" ? "warning" : row.status === "approved" ? "success" : "muted"
                }
              >
                {String(row.status)}
              </Badge>
              {row.status === "pending" ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => reviewMut.mutate({ id: row.id as string, decision: "approved" })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => reviewMut.mutate({ id: row.id as string, decision: "rejected" })}
                  >
                    Reject
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </NeumorphicCard>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Building2, Upload } from "lucide-react";

import { AttendanceHrNav } from "@/components/attendance-hr/attendance-hr-nav";
import { PageHeader } from "@/components/layout/page-header";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAttendanceHrSite } from "@/lib/attendance-hr.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function AttendanceHrSitePage() {
  const params = useParams<{ id: string }>();
  const locationId = params.id;
  const q = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "site", locationId }),
    queryFn: () => getAttendanceHrSite({ locationId }),
    staleTime: STALE.people,
  });
  const data = q.data;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        kicker="Time & Attendance"
        title="Site attendance"
        subtitle="Today’s summary, assigned staff, devices, last sync, unmatched User IDs and import history."
        actions={
          <Button asChild>
            <Link href="/people/attendance/import"><Upload className="h-4 w-4" /> Upload</Link>
          </Button>
        }
      />
      <AttendanceHrNav />
      <div className="grid gap-4 lg:grid-cols-2">
        <NeumorphicCard className="p-5">
          <h2 className="mb-2 text-sm font-semibold">Today ({data?.date})</h2>
          <p className="text-sm text-muted-foreground">{data?.daily.length ?? 0} daily rows</p>
          <div className="mt-3 max-h-72 overflow-auto text-sm">
            {(data?.daily ?? []).slice(0, 40).map((row) => (
              <div key={row.id as string} className="flex justify-between border-b border-border/40 py-1.5">
                <span className="font-mono text-xs">{String(row.staff_id ?? row.biometric_user_id ?? "—").slice(0, 10)}</span>
                <Badge variant={row.status === "absent" ? "destructive" : row.status === "late" ? "warning" : "success"}>
                  {String(row.status)}
                </Badge>
              </div>
            ))}
          </div>
        </NeumorphicCard>
        <NeumorphicCard className="p-5">
          <h2 className="mb-2 text-sm font-semibold">Devices</h2>
          {(data?.devices ?? []).map((d) => (
            <div key={d.id as string} className="mb-2 rounded-xl border px-3 py-2 text-sm">
              <p className="font-medium">{String(d.device_name)}</p>
              <p className="text-xs text-muted-foreground">
                {String(d.device_code)} · last sync {d.last_sync_at ? String(d.last_sync_at) : "never"}
              </p>
            </div>
          ))}
          <h2 className="mb-2 mt-4 text-sm font-semibold">Unmatched User IDs</h2>
          {(data?.unmatched ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None</p> : null}
          {(data?.unmatched ?? []).map((u) => (
            <p key={u.id as string} className="text-xs">{String(u.biometric_user_id)} {String(u.device_name ?? "")}</p>
          ))}
        </NeumorphicCard>
        <NeumorphicCard className="p-5 lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold">Assigned employees</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.staff ?? []).map((s) => (
              <div key={s.id} className="rounded-xl border px-3 py-2 text-sm">
                <p className="font-medium">{s.full_name}</p>
                <p className="text-xs text-muted-foreground">{s.employee_code} · {s.department ?? "—"}</p>
              </div>
            ))}
          </div>
          <h2 className="mb-2 mt-4 text-sm font-semibold">Import history</h2>
          {(data?.imports ?? []).map((imp) => (
            <p key={imp.id as string} className="text-xs">
              {String(imp.original_filename)} · {String(imp.status)} · {String(imp.created_at)}
              {" · "}
              <a className="underline" href={`/api/people/attendance-hr/files/${imp.id}`}>download</a>
            </p>
          ))}
        </NeumorphicCard>
      </div>
    </div>
  );
}

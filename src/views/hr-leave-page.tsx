"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palmtree } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listLeaveRequests, reviewLeaveRequest } from "@/lib/hr-leave.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrLeavePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "cancelled" | "all">("pending");
  const list = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "leave", status }),
    queryFn: () => listLeaveRequests({ status: status === "all" ? null : status }),
    staleTime: STALE.people,
  });

  const review = useMutation({
    mutationFn: reviewLeaveRequest,
    onSuccess: () => {
      toast.success(t("hr.leave.updated"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.attendanceHr() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="hr.leave.manage"
      fallback={<p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("hr.leave.noAccess")}</p>}
    >
      <div className="space-y-6">
        <PageHeader icon={Palmtree} kicker={t("hr.leave.kicker")} title={t("hr.leave.title")} subtitle={t("hr.leave.subtitle")} />
        <div className="flex flex-wrap gap-2">
          {(["pending", "approved", "rejected", "cancelled", "all"] as const).map((value) => (
            <Button key={value} size="sm" variant={status === value ? "default" : "secondary"} onClick={() => setStatus(value)}>
              {t(`hr.leave.status.${value}`)}
            </Button>
          ))}
        </div>
        <NeumorphicCard className="space-y-2 p-5">
          {(list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hr.leave.empty")}</p>
          ) : (
            (list.data ?? []).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3">
                <div>
                  <p className="font-medium">
                    {row.staffName} · {t(`hr.leave.types.${row.leaveType}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.employeeCode ?? "—"} · {row.dateFrom} → {row.dateTo} · {row.days} {t("hr.leave.days")}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.status === "approved" ? "success" : row.status === "rejected" ? "destructive" : "muted"}>
                    {t(`hr.leave.status.${row.status}`)}
                  </Badge>
                  {row.status === "pending" ? (
                    <>
                      <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: row.id, status: "approved" })}>
                        {t("hr.leave.approve")}
                      </Button>
                      <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ id: row.id, status: "rejected" })}>
                        {t("hr.leave.reject")}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </NeumorphicCard>
      </div>
    </CapabilityGate>
  );
}

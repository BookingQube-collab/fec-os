"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listEmployeeAppStatus } from "@/lib/hr-employee.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export default function HrEmployeeAppAdminPage() {
  const { t } = useTranslation();
  const status = useQuery({
    queryKey: queryKeys.people.attendanceHr({ view: "employee-app" }),
    queryFn: () => listEmployeeAppStatus(),
    staleTime: STALE.people,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Smartphone}
        kicker={t("hr.employeeAdmin.kicker")}
        title={t("hr.employeeAdmin.title")}
        subtitle={t("hr.employeeAdmin.subtitle")}
      />
      <NeumorphicCard className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-muted-foreground">{t("hr.employeeAdmin.openHint")}</p>
        <Button asChild>
          <Link href="/hr/me">{t("hr.employeeAdmin.openApp")}</Link>
        </Button>
      </NeumorphicCard>
      <NeumorphicCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{t("attendanceHr.field.colStaff")}</th>
              <th className="px-3 py-2 text-left">{t("hr.employeeAdmin.lastEvent")}</th>
              <th className="px-3 py-2 text-left">{t("attendanceHr.field.colWhere")}</th>
              <th className="px-3 py-2 text-left">{t("hr.employeeAdmin.enrolled")}</th>
              <th className="px-3 py-2 text-left">{t("attendanceHr.field.colWhen")}</th>
            </tr>
          </thead>
          <tbody>
            {(status.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {t("hr.employeeAdmin.empty")}
                </td>
              </tr>
            ) : (
              (status.data?.rows ?? []).map((row) => (
                <tr key={row.staffId} className="border-t">
                  <td className="px-3 py-2">
                    {row.staffName ?? "—"}
                    {row.isRoaming ? (
                      <Badge variant="info" className="ml-2">
                        {t("attendanceHr.mapping.multiSite")}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={row.eventType === "check_in" ? "success" : "muted"}>{row.eventType}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.locationLabel ?? "—"}
                    {row.insideGeofence == null ? null : (
                      <Badge variant={row.insideGeofence ? "success" : "destructive"} className="ml-2">
                        {row.insideGeofence ? t("attendanceHr.field.inside") : t("attendanceHr.field.outside")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={row.enrolled ? "success" : "muted"}>
                      {row.enrolled ? t("attendanceHr.field.enrolledBadge") : t("attendanceHr.field.notEnrolled")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{new Date(row.recordedAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </NeumorphicCard>
    </div>
  );
}

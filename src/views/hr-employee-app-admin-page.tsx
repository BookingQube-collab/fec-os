"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
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
    <HrShell>
      <HrSection
        icon={Smartphone}
        kicker={t("hr.employeeAdmin.kicker")}
        title={t("hr.employeeAdmin.title")}
        subtitle={t("hr.employeeAdmin.subtitle")}
      >
        <HrPanel delay={0}>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <p className="text-sm text-muted-foreground">{t("hr.employeeAdmin.openHint")}</p>
            <Button asChild>
              <Link href="/hr/me">{t("hr.employeeAdmin.openApp")}</Link>
            </Button>
          </div>
        </HrPanel>

        <HrPanel flat delay={1} className="overflow-hidden">
          <div className="hr-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("attendanceHr.field.colStaff")}</th>
                  <th>{t("hr.employeeAdmin.lastEvent")}</th>
                  <th>{t("attendanceHr.field.colWhere")}</th>
                  <th>{t("hr.employeeAdmin.enrolled")}</th>
                  <th>{t("attendanceHr.field.colWhen")}</th>
                </tr>
              </thead>
              <tbody>
                {(status.data?.rows ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <HrEmptyState message={t("hr.employeeAdmin.empty")} icon={Smartphone} />
                    </td>
                  </tr>
                ) : (
                  (status.data?.rows ?? []).map((row) => (
                    <tr key={row.staffId}>
                      <td>
                        {row.staffName ?? "—"}
                        {row.isRoaming ? (
                          <Badge variant="info" className="ms-2">
                            {t("attendanceHr.mapping.multiSite")}
                          </Badge>
                        ) : null}
                      </td>
                      <td>
                        <Badge variant={row.eventType === "check_in" ? "success" : "muted"}>{row.eventType}</Badge>
                      </td>
                      <td className="text-xs">
                        {row.locationLabel ?? "—"}
                        {row.insideGeofence == null ? null : (
                          <Badge variant={row.insideGeofence ? "success" : "destructive"} className="ms-2">
                            {row.insideGeofence ? t("attendanceHr.field.inside") : t("attendanceHr.field.outside")}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <Badge variant={row.enrolled ? "success" : "muted"}>
                          {row.enrolled ? t("attendanceHr.field.enrolledBadge") : t("attendanceHr.field.notEnrolled")}
                        </Badge>
                      </td>
                      <td className="text-xs">{new Date(row.recordedAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </HrPanel>
      </HrSection>
    </HrShell>
  );
}

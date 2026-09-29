"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { OrgHierarchyBoard } from "@/components/admin/org-hierarchy-board";
import { HrShell } from "@/components/hr/hr-shell";
import { HrSection } from "@/components/hr/hr-section";
import { useAuth } from "@/hooks/use-auth";
import { getOrgChart, placeOrgChartPerson, removeOrgChartPerson } from "@/lib/admin-hierarchy.functions";
import { groupOrgChart, wouldCreateReportingCycle, type OrgChartSnapshot } from "@/lib/org-hierarchy";
import { queryKeys } from "@/lib/query-keys";

function Forbidden() {
  const { t } = useTranslation();
  return (
    <HrShell>
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t("hr.hierarchy.noAccess")}
      </div>
    </HrShell>
  );
}

export default function AdminHierarchyPage() {
  const { t } = useTranslation();
  const { roles, rolesSettled } = useAuth();
  if (!rolesSettled) {
    return (
      <HrShell>
        <p className="text-sm text-muted-foreground">{t("hr.hierarchy.loading")}</p>
      </HrShell>
    );
  }
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  if (maxLevel < 95) return <Forbidden />;
  return (
    <HrShell>
      <HierarchyEditor />
    </HrShell>
  );
}

function HierarchyEditor() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.admin.hierarchy(),
    queryFn: () => getOrgChart(),
  });
  const place = useMutation({
    mutationFn: (input: { staffId: string; managerStaffId: string | null }) => placeOrgChartPerson(input),
    onSuccess: (snapshot, variables) => {
      qc.setQueryData(queryKeys.admin.hierarchy(), snapshot);
      const manager = snapshot.people.find((person) => person.staffId === variables.managerStaffId);
      const person = snapshot.people.find((row) => row.staffId === variables.staffId);
      const name = person?.fullName ?? t("hr.hierarchy.unknownPerson");
      if (!variables.managerStaffId) {
        toast.success(t("hr.hierarchy.placedTop", { name }));
        return;
      }
      toast.success(
        t("hr.hierarchy.placedUnder", {
          name,
          manager: manager?.fullName ?? t("hr.hierarchy.unknownManager"),
        }),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (input: { staffId: string }) => removeOrgChartPerson(input),
    onSuccess: (snapshot) => {
      qc.setQueryData(queryKeys.admin.hierarchy(), snapshot);
      toast.success(t("hr.hierarchy.removed"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saving = place.isPending || remove.isPending;

  const onPlace = (staffId: string, managerStaffId: string | null) => {
    const snapshot = query.data;
    if (!snapshot || saving) return;
    if (managerStaffId === staffId) {
      toast.error(t("hr.hierarchy.selfReport"));
      return;
    }
    const managers = new Map(snapshot.people.map((person) => [person.staffId, person.reportingManagerStaffId]));
    if (wouldCreateReportingCycle(managers, staffId, managerStaffId)) {
      toast.error(t("hr.hierarchy.cycle"));
      return;
    }
    const person = snapshot.people.find((row) => row.staffId === staffId);
    if (!person) return;
    const onChart = groupOrgChart(snapshot.people).onChart;
    const unchanged =
      person.reportingManagerStaffId === managerStaffId &&
      (managerStaffId !== null || person.orgChartPlaced || onChart.has(person.staffId));
    if (unchanged) return;
    place.mutate({ staffId, managerStaffId });
  };

  return (
    <HrSection
      icon={Network}
      kicker={t("hr.hierarchy.kicker")}
      title={t("nav.operationsHierarchy")}
      subtitle={t("hr.hierarchy.subtitle")}
    >
      <Link href="/people/hr" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        {t("hr.hierarchy.back")}
      </Link>

      {query.isLoading ? <p className="text-sm text-muted-foreground">{t("hr.hierarchy.loading")}</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : t("hr.hierarchy.loadError")}
        </p>
      ) : null}
      {query.data ? (
        <OrgHierarchyBoard
          snapshot={query.data satisfies OrgChartSnapshot}
          saving={saving}
          onPlace={onPlace}
          onRemove={(staffId) => {
            if (!saving) remove.mutate({ staffId });
          }}
        />
      ) : null}
    </HrSection>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { OrgHierarchyBoard } from "@/components/admin/org-hierarchy-board";
import { FecPageHeader } from "@/components/fec";
import { useAuth } from "@/hooks/use-auth";
import { getOrgChart, placeOrgChartPerson, removeOrgChartPerson } from "@/lib/admin-hierarchy.functions";
import { groupOrgChart, wouldCreateReportingCycle, type OrgChartSnapshot } from "@/lib/org-hierarchy";
import { queryKeys } from "@/lib/query-keys";

function Forbidden() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      Only the CEO or COO can view the operations hierarchy.
    </div>
  );
}

export default function AdminHierarchyPage() {
  const { roles, rolesSettled } = useAuth();
  if (!rolesSettled) {
    return <p className="text-sm text-muted-foreground">Loading hierarchy…</p>;
  }
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  if (maxLevel < 95) return <Forbidden />;
  return <HierarchyEditor />;
}

function HierarchyEditor() {
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
      if (!variables.managerStaffId) {
        toast.success(`${person?.fullName ?? "They"} now sit at the top of the chart.`);
        return;
      }
      toast.success(`${person?.fullName ?? "They"} now report to ${manager?.fullName ?? "that person"}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (input: { staffId: string }) => removeOrgChartPerson(input),
    onSuccess: (snapshot) => {
      qc.setQueryData(queryKeys.admin.hierarchy(), snapshot);
      toast.success("Removed from the chart.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saving = place.isPending || remove.isPending;

  const onPlace = (staffId: string, managerStaffId: string | null) => {
    const snapshot = query.data;
    if (!snapshot || saving) return;
    if (managerStaffId === staffId) {
      toast.error("A person cannot report to themselves.");
      return;
    }
    const managers = new Map(snapshot.people.map((person) => [person.staffId, person.reportingManagerStaffId]));
    if (wouldCreateReportingCycle(managers, staffId, managerStaffId)) {
      toast.error("That assignment would create a reporting loop.");
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
    <div className="space-y-4">
      <FecPageHeader
        icon={Network}
        kicker="Administration"
        title="Operations hierarchy"
        subtitle="Drag people onto the chart to set who they report to. Missed-punch approval uses these same reporting lines."
      />
      <Link href="/admin" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to Administration
      </Link>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading hierarchy…</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : "Could not load hierarchy."}
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
    </div>
  );
}

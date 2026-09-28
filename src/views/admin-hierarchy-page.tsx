"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { FecButton as Button, FecPageHeader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { assignOperationsReports, getOperationsHierarchy } from "@/lib/admin-hierarchy.functions";
import { queryKeys } from "@/lib/query-keys";

function Forbidden() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      Only the CEO or COO can view the operations hierarchy.
    </div>
  );
}

export default function AdminHierarchyPage() {
  const { roles } = useAuth();
  const maxLevel = roles.reduce((acc, role) => Math.max(acc, role.role_level), 0);
  if (maxLevel < 95) return <Forbidden />;
  return <HierarchyEditor />;
}

function HierarchyEditor() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.admin.hierarchy(),
    queryFn: () => getOperationsHierarchy(),
  });
  const save = useMutation({
    mutationFn: assignOperationsReports,
    onSuccess: (tree) => {
      qc.setQueryData(queryKeys.admin.hierarchy(), tree);
      toast.success("Site supervisors now report to the Head of Operations.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tree = query.data;
  const head = tree?.head ?? null;
  const supervisors = tree?.supervisors ?? [];
  const unassigned = supervisors.filter((person) => person.reportingManagerStaffId !== head?.staffId);

  return (
    <div className="space-y-5">
      <FecPageHeader
        icon={Network}
        kicker="Administration"
        title="Operations hierarchy"
        subtitle="Site supervisors report to the Head of Operations. A missed punch goes to the site supervisor, then to that manager, then to HR."
      />
      <Link href="/admin" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to Administration
      </Link>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading hierarchy…</p> : null}
      {query.isError ? (
        <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Could not load hierarchy."}</p>
      ) : null}

      {tree && !head ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Head of Operations was not found.
        </div>
      ) : null}

      {head ? (
        <div className="space-y-3">
          <article className="rounded-2xl border border-border/50 bg-card p-4 shadow-elevated-xs">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Head of Operations</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{head.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {[head.employeeCode ? `Code ${head.employeeCode}` : null, head.jobTitle, head.locationName]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-2">
              <Badge variant={head.hasLogin ? "success" : "warning"}>
                {head.hasLogin ? "Login linked" : "No login linked"}
              </Badge>
            </div>
          </article>

          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-elevated-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 p-4">
              <div>
                <p className="text-sm font-semibold">Site supervisors</p>
                <p className="text-xs text-muted-foreground">
                  {supervisors.length} report in this chart. After a supervisor approves, {head.fullName}&apos;s login approves the operations step.
                </p>
              </div>
              <Button
                size="sm"
                disabled={!unassigned.length || save.isPending || !head.hasLogin}
                onClick={() =>
                  save.mutate({
                    managerStaffId: head.staffId,
                    staffIds: unassigned.map((person) => person.staffId),
                  })
                }
              >
                {save.isPending ? "Saving…" : unassigned.length ? `Place ${unassigned.length} under ${head.fullName}` : "Hierarchy saved"}
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Supervisor</th>
                  <th className="px-4 py-2 font-medium">Site</th>
                  <th className="px-4 py-2 font-medium">Reports to</th>
                </tr>
              </thead>
              <tbody>
                {supervisors.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-muted-foreground">
                      No site supervisors found.
                    </td>
                  </tr>
                ) : (
                  supervisors.map((person) => (
                    <tr key={person.staffId} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">{person.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {[person.employeeCode, person.jobTitle].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{person.locationName ?? "—"}</td>
                      <td className="px-4 py-3">
                        {person.reportingManagerStaffId === head.staffId ? head.fullName : "Not assigned"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

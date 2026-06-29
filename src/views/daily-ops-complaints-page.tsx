"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { useDailyOpsComplaints } from "@/hooks/queries/useDailyOps";
import { updateComplaintHandler } from "@/lib/daily-ops.functions";
import { COMPLAINT_STATUS_LABELS } from "@/lib/daily-ops/constants";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function DailyOpsComplaintsPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canResolve = usePermission("customer.resolve_complaint");
  const { data, isLoading } = useDailyOpsComplaints(locationId);
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [handledBy, setHandledBy] = useState("");

  const mutation = useMutation({
    mutationFn: () => updateComplaintHandler({ id: editId!, handled_by: handledBy }),
    onSuccess: () => {
      toast.success(t("dailyOps.complaints.saved"));
      setEditId(null);
      void qc.invalidateQueries({ queryKey: ["dailyOps", "complaints"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <DailyOpsPageShell
        title={t("dailyOps.complaints.title")}
        subtitle={t("dailyOps.complaints.subtitle")}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/customer">{t("dailyOps.complaints.fullCustomer")}</Link>
          </Button>
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">{t("dailyOps.complaints.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dailyOps.complaints.when")}</TableHead>
                  <TableHead>{t("dailyOps.complaints.guest")}</TableHead>
                  <TableHead>{t("dailyOps.complaints.severity")}</TableHead>
                  <TableHead>{t("dailyOps.complaints.summary")}</TableHead>
                  <TableHead>{t("dailyOps.complaints.handledBy")}</TableHead>
                  <TableHead>{t("dailyOps.complaints.status")}</TableHead>
                  {canResolve && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={String(row.id)}>
                    <TableCell className="text-xs">
                      {new Date(String(row.created_at)).toLocaleString()}
                    </TableCell>
                    <TableCell>{String(row.guest_name ?? "—")}</TableCell>
                    <TableCell>
                      <Badge variant={row.severity === "critical" ? "destructive" : "secondary"}>
                        {String(row.severity)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{String(row.summary)}</TableCell>
                    <TableCell>{String(row.handled_by ?? "—")}</TableCell>
                    <TableCell className={row.status === "resolved" ? "text-emerald-600" : "text-amber-600"}>
                      {COMPLAINT_STATUS_LABELS[String(row.status)] ?? String(row.status)}
                    </TableCell>
                    {canResolve && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditId(String(row.id));
                            setHandledBy(String(row.handled_by ?? ""));
                          }}
                        >
                          {t("dailyOps.edit")}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {editId && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3 max-w-md mt-4">
            <h3 className="text-sm font-medium">{t("dailyOps.complaints.assignHandler")}</h3>
            <div className="space-y-2">
              <Label>{t("dailyOps.complaints.handledBy")}</Label>
              <Input value={handledBy} onChange={(e) => setHandledBy(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || !handledBy}>
                {t("dailyOps.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                {t("dailyOps.cancel")}
              </Button>
            </div>
          </div>
        )}
      </DailyOpsPageShell>
  );
}

export default DailyOpsComplaintsPage;

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { useDailyOpsMaintenance } from "@/hooks/queries/useDailyOps";
import { upsertMaintenanceIssue } from "@/lib/daily-ops.functions";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PRIORITIES = ["Low", "Medium", "High", "Critical", "Urgent"] as const;

function statusTone(status: string, daysOpen: number) {
  if (["Closed", "Verified"].includes(status)) return "text-emerald-600";
  if (daysOpen > 7 || status === "Open") return "text-red-600";
  return "text-amber-600";
}

function DailyOpsMaintenancePage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canManage = usePermission("daily_ops.manage");
  const { data, isLoading } = useDailyOpsMaintenance(locationId);
  const { data: sites } = useSites();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    location_id: locationId ?? "",
    category: "General",
    zone: "",
    description: "",
    priority: "Medium",
    assigned_to: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      upsertMaintenanceIssue({
        location_id: form.location_id || locationId!,
        category: form.category,
        zone: form.zone || null,
        description: form.description,
        priority: form.priority,
        assigned_to: form.assigned_to || null,
      }),
    onSuccess: () => {
      toast.success(t("dailyOps.maintenance.saved"));
      void qc.invalidateQueries({ queryKey: ["dailyOps", "maintenance"] });
      void qc.invalidateQueries({ queryKey: ["dailyOps", "kpis"] });
      setForm((f) => ({ ...f, description: "", zone: "", assigned_to: "" }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <DailyOpsPageShell title={t("dailyOps.maintenance.title")} subtitle={t("dailyOps.maintenance.subtitle")}>
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">{t("dailyOps.maintenance.list")}</TabsTrigger>
            {canManage && <TabsTrigger value="new">{t("dailyOps.maintenance.new")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="list" className="mt-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
            ) : !data?.length ? (
              <p className="text-sm text-muted-foreground">{t("dailyOps.maintenance.empty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dailyOps.maintenance.reported")}</TableHead>
                      <TableHead>{t("dailyOps.maintenance.area")}</TableHead>
                      <TableHead>{t("dailyOps.maintenance.description")}</TableHead>
                      <TableHead>{t("dailyOps.maintenance.priority")}</TableHead>
                      <TableHead>{t("dailyOps.maintenance.assigned")}</TableHead>
                      <TableHead>{t("dailyOps.maintenance.status")}</TableHead>
                      <TableHead>{t("dailyOps.maintenance.daysOpen")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell>{String(row.date_reported ?? row.log_date)}</TableCell>
                        <TableCell>{String(row.area_equipment ?? row.zone ?? row.category)}</TableCell>
                        <TableCell className="max-w-xs truncate">{String(row.description)}</TableCell>
                        <TableCell>
                          <Badge variant={row.priority === "Critical" ? "destructive" : "secondary"}>
                            {String(row.priority)}
                          </Badge>
                        </TableCell>
                        <TableCell>{String(row.assigned_to ?? "—")}</TableCell>
                        <TableCell className={statusTone(String(row.status), Number(row.days_open ?? 0))}>
                          {String(row.status)}
                        </TableCell>
                        <TableCell className={Number(row.days_open) > 7 ? "text-red-600" : ""}>
                          {Number(row.days_open ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
          {canManage && (
            <TabsContent value="new" className="mt-4 space-y-4 max-w-lg">
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>{t("dailyOps.table.venue")}</Label>
                  <Select
                    value={form.location_id || locationId || ""}
                    onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(sites ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.maintenance.area")}</Label>
                  <Input value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.maintenance.category")}</Label>
                  <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.maintenance.description")}</Label>
                  <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.maintenance.priority")}</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.maintenance.assigned")}</Label>
                  <Input value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} />
                </div>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || form.description.length < 3 || !(form.location_id || locationId)}
                >
                  {t("dailyOps.save")}
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DailyOpsPageShell>
  );
}

export default DailyOpsMaintenancePage;

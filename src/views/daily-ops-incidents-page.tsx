"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { useDailyOpsIncidents } from "@/hooks/queries/useDailyOps";
import { createDailyOpsIncident } from "@/lib/daily-ops.functions";
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  INCIDENT_TYPES,
} from "@/lib/daily-ops/constants";
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

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

function DailyOpsIncidentsPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canManage = usePermission("daily_ops.manage");
  const { data, isLoading } = useDailyOpsIncidents(locationId);
  const { data: sites } = useSites();
  const qc = useQueryClient();

  const now = new Date();
  const [form, setForm] = useState({
    location_id: locationId ?? "",
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    category: "other" as (typeof INCIDENT_TYPES)[number],
    severity: "medium",
    summary: "",
    detail: "",
    action_taken: "",
  });

  const mutation = useMutation({
    mutationFn: () => {
      const occurred_at = new Date(`${form.date}T${form.time}:00`).toISOString();
      return createDailyOpsIncident({
        location_id: form.location_id || locationId!,
        occurred_at,
        category: form.category,
        severity: form.severity,
        summary: form.summary,
        detail: form.detail || null,
        action_taken: form.action_taken || null,
      });
    },
    onSuccess: () => {
      toast.success(t("dailyOps.incidents.saved"));
      void qc.invalidateQueries({ queryKey: ["dailyOps", "incidents"] });
      void qc.invalidateQueries({ queryKey: ["dailyOps", "kpis"] });
      setForm((f) => ({ ...f, summary: "", detail: "", action_taken: "" }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <DailyOpsPageShell title={t("dailyOps.incidents.title")} subtitle={t("dailyOps.incidents.subtitle")}>
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">{t("dailyOps.incidents.list")}</TabsTrigger>
            {canManage && <TabsTrigger value="new">{t("dailyOps.incidents.new")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="list" className="mt-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
            ) : !data?.length ? (
              <p className="text-sm text-muted-foreground">{t("dailyOps.incidents.empty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dailyOps.incidents.when")}</TableHead>
                      <TableHead>{t("dailyOps.incidents.type")}</TableHead>
                      <TableHead>{t("dailyOps.incidents.severity")}</TableHead>
                      <TableHead>{t("dailyOps.incidents.description")}</TableHead>
                      <TableHead>{t("dailyOps.incidents.actionTaken")}</TableHead>
                      <TableHead>{t("dailyOps.incidents.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className="text-xs">
                          {new Date(String(row.occurred_at)).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {INCIDENT_TYPE_LABELS[row.category as keyof typeof INCIDENT_TYPE_LABELS] ?? String(row.category)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.severity === "critical" ? "destructive" : "secondary"}>
                            {String(row.severity)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{String(row.summary)}</TableCell>
                        <TableCell className="max-w-xs truncate">{String(row.action_taken ?? "—")}</TableCell>
                        <TableCell>
                          {INCIDENT_STATUS_LABELS[String(row.status)] ?? String(row.status)}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t("dailyOps.incidents.date")}</Label>
                    <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("dailyOps.incidents.time")}</Label>
                    <Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.incidents.type")}</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((f) => ({ ...f, category: v as (typeof INCIDENT_TYPES)[number] }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCIDENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{INCIDENT_TYPE_LABELS[type]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.incidents.severity")}</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.incidents.description")}</Label>
                  <Textarea value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.incidents.actionTaken")}</Label>
                  <Textarea value={form.action_taken} onChange={(e) => setForm((f) => ({ ...f, action_taken: e.target.value }))} />
                </div>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || form.summary.length < 3 || !(form.location_id || locationId)}
                >
                  {t("dailyOps.incidents.report")}
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DailyOpsPageShell>
  );
}

export default DailyOpsIncidentsPage;

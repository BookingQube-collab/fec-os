"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { useShiftBriefings } from "@/hooks/queries/useDailyOps";
import { upsertShiftBriefing } from "@/lib/daily-ops.functions";
import {
  attendanceTone,
  SHIFT_PERIOD_LABELS,
  SHIFT_PERIODS,
} from "@/lib/daily-ops/constants";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function DailyOpsBriefingsPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canManage = usePermission("daily_ops.manage");
  const { data, isLoading } = useShiftBriefings(locationId);
  const { data: sites } = useSites();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    briefing_date: new Date().toISOString().slice(0, 10),
    location_id: locationId ?? "",
    shift: "morning" as (typeof SHIFT_PERIODS)[number],
    supervisor_name: "",
    staff_scheduled: 0,
    staff_present: 0,
    key_notes: "",
    handover_items: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      upsertShiftBriefing({
        ...form,
        location_id: form.location_id || locationId!,
        key_notes: form.key_notes || null,
        handover_items: form.handover_items || null,
      }),
    onSuccess: () => {
      toast.success(t("dailyOps.briefings.saved"));
      void qc.invalidateQueries({ queryKey: ["dailyOps", "briefings"] });
      void qc.invalidateQueries({ queryKey: ["dailyOps", "kpis"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <DailyOpsPageShell title={t("dailyOps.briefings.title")} subtitle={t("dailyOps.briefings.subtitle")}>
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">{t("dailyOps.briefings.list")}</TabsTrigger>
            {canManage && <TabsTrigger value="new">{t("dailyOps.briefings.new")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="list" className="mt-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
            ) : !data?.length ? (
              <p className="text-sm text-muted-foreground">{t("dailyOps.briefings.empty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dailyOps.briefings.date")}</TableHead>
                      <TableHead>{t("dailyOps.briefings.shift")}</TableHead>
                      <TableHead>{t("dailyOps.briefings.supervisor")}</TableHead>
                      <TableHead>{t("dailyOps.briefings.scheduled")}</TableHead>
                      <TableHead>{t("dailyOps.briefings.present")}</TableHead>
                      <TableHead>{t("dailyOps.briefings.absent")}</TableHead>
                      <TableHead>{t("dailyOps.briefings.attendance")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell>{String(row.briefing_date)}</TableCell>
                        <TableCell>
                          {SHIFT_PERIOD_LABELS[row.shift as keyof typeof SHIFT_PERIOD_LABELS] ?? String(row.shift)}
                        </TableCell>
                        <TableCell>{String(row.supervisor_name)}</TableCell>
                        <TableCell>{Number(row.staff_scheduled)}</TableCell>
                        <TableCell>{Number(row.staff_present)}</TableCell>
                        <TableCell>{Number(row.staff_absent)}</TableCell>
                        <TableCell className={attendanceTone(Number(row.attendance_pct))}>
                          {Number(row.attendance_pct)}%
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
                  <Label>{t("dailyOps.briefings.date")}</Label>
                  <Input
                    type="date"
                    value={form.briefing_date}
                    onChange={(e) => setForm((f) => ({ ...f, briefing_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.table.venue")}</Label>
                  <Select
                    value={form.location_id || locationId || ""}
                    onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(sites ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.briefings.shift")}</Label>
                  <Select
                    value={form.shift}
                    onValueChange={(v) => setForm((f) => ({ ...f, shift: v as (typeof SHIFT_PERIODS)[number] }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SHIFT_PERIODS.map((s) => (
                        <SelectItem key={s} value={s}>{SHIFT_PERIOD_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.briefings.supervisor")}</Label>
                  <Input
                    value={form.supervisor_name}
                    onChange={(e) => setForm((f) => ({ ...f, supervisor_name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t("dailyOps.briefings.scheduled")}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.staff_scheduled}
                      onChange={(e) => setForm((f) => ({ ...f, staff_scheduled: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("dailyOps.briefings.present")}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.staff_present}
                      onChange={(e) => setForm((f) => ({ ...f, staff_present: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.briefings.keyNotes")}</Label>
                  <Textarea
                    value={form.key_notes}
                    onChange={(e) => setForm((f) => ({ ...f, key_notes: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("dailyOps.briefings.handover")}</Label>
                  <Textarea
                    value={form.handover_items}
                    onChange={(e) => setForm((f) => ({ ...f, handover_items: e.target.value }))}
                  />
                </div>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending || !form.supervisor_name || !(form.location_id || locationId)}
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

export default DailyOpsBriefingsPage;

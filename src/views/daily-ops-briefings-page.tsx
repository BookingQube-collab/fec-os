"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { useShiftBriefings } from "@/hooks/queries/useDailyOps";
import { useAuth } from "@/hooks/use-auth";
import { upsertShiftBriefing } from "@/lib/daily-ops.functions";
import {
  attendanceTone,
  SHIFT_PERIOD_LABELS,
  SHIFT_PERIODS,
} from "@/lib/daily-ops/constants";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BriefingTab = "list" | "new";

function emptyBriefingForm(locationId: string | null, supervisorName: string) {
  return {
    briefing_date: new Date().toISOString().slice(0, 10),
    location_id: locationId ?? "",
    shift: "morning" as (typeof SHIFT_PERIODS)[number],
    supervisor_name: supervisorName,
    staff_scheduled: 0,
    staff_present: 0,
    key_notes: "",
    handover_items: "",
  };
}

function DailyOpsBriefingsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canManage = usePermission("daily_ops.manage");
  const { data, isLoading } = useShiftBriefings(locationId);
  const { data: sites, isLoading: sitesLoading } = useSites();
  const qc = useQueryClient();
  const [tab, setTab] = useState<BriefingTab>("list");

  const supervisorDefault = profile?.display_name ?? "";
  const [form, setForm] = useState(() => emptyBriefingForm(locationId, supervisorDefault));

  useEffect(() => {
    if (locationId) {
      setForm((f) => ({ ...f, location_id: locationId }));
    }
  }, [locationId]);

  useEffect(() => {
    if (supervisorDefault) {
      setForm((f) => (f.supervisor_name ? f : { ...f, supervisor_name: supervisorDefault }));
    }
  }, [supervisorDefault]);

  const effectiveLocationId = form.location_id || locationId || "";
  const selectedSite = (sites ?? []).find((s) => s.id === effectiveLocationId);

  const mutation = useMutation({
    mutationFn: () =>
      upsertShiftBriefing({
        ...form,
        location_id: effectiveLocationId,
        supervisor_name: form.supervisor_name.trim(),
        key_notes: form.key_notes || null,
        handover_items: form.handover_items || null,
      }),
    onSuccess: () => {
      toast.success(t("dailyOps.briefings.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.dailyOps.briefings(locationId) });
      void qc.invalidateQueries({ queryKey: queryKeys.dailyOps.kpis(locationId) });
      setTab("list");
      setForm(emptyBriefingForm(locationId, supervisorDefault));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canSubmit =
    Boolean(effectiveLocationId) &&
    form.supervisor_name.trim().length > 0 &&
    !mutation.isPending;

  const openNewBriefing = () => setTab("new");

  return (
    <DailyOpsPageShell
      title={t("dailyOps.briefings.title")}
      subtitle={t("dailyOps.briefings.subtitle")}
      actions={
        canManage ? (
          <Button size="sm" onClick={openNewBriefing}>
            <Plus className="mr-1 h-4 w-4" />
            {t("dailyOps.briefings.new")}
          </Button>
        ) : null
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as BriefingTab)}>
        <TabsList>
          <TabsTrigger value="list">{t("dailyOps.briefings.list")}</TabsTrigger>
          {canManage && (
            <TabsTrigger value="new">
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("dailyOps.briefings.new")}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
          ) : !data?.length ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t("dailyOps.briefings.empty")}</p>
              {canManage ? (
                <Button onClick={openNewBriefing}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t("dailyOps.briefings.emptyCta")}
                </Button>
              ) : null}
            </div>
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

        <TabsContent value="new" className="mt-4 space-y-4 max-w-lg">
          {!canManage ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.briefings.noPermission")}</p>
          ) : (
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
                {locationId ? (
                  sitesLoading ? (
                    <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
                  ) : selectedSite ? (
                    <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                      {selectedSite.code} — {selectedSite.name}
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t("dailyOps.briefings.locationFromBranch", { code: selectedSite.code })}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-amber-600">{t("dailyOps.briefings.selectBranchFirst")}</p>
                  )
                ) : sitesLoading ? (
                  <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
                ) : (
                  <Select
                    value={effectiveLocationId}
                    onValueChange={(v) => setForm((f) => ({ ...f, location_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("dailyOps.briefings.selectVenue")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(sites ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!effectiveLocationId ? (
                  <p className="text-xs text-amber-600">{t("dailyOps.briefings.selectBranchFirst")}</p>
                ) : null}
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
                  placeholder={t("dailyOps.briefings.keyNotesHint")}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("dailyOps.briefings.handover")}</Label>
                <Textarea
                  value={form.handover_items}
                  onChange={(e) => setForm((f) => ({ ...f, handover_items: e.target.value }))}
                  placeholder={t("dailyOps.briefings.handoverHint")}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
                  {t("dailyOps.save")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setTab("list")}>
                  {t("dailyOps.cancel")}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </DailyOpsPageShell>
  );
}

export default DailyOpsBriefingsPage;

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Medal, Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { retryImport } from "@/lib/retry-import";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveNomination,
  assignEmployeeScorecard,
  createAchievement,
  createNomination,
  getPerformanceDashboard,
  listAchievements,
  listAssignments,
  listEvaluations,
  listKraTemplates,
  listNominations,
  listPerformanceCycles,
  listPerformanceKpiTemplates,
  listStaffForAssignment,
  upsertKraTemplate,
  upsertPerformanceKpiTemplate,
} from "@/lib/performance.functions";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";

function ratingTone(band: string | null | undefined) {
  if (band === "excellent" || band === "good") return "rag-green";
  if (band === "needs_attention") return "rag-amber";
  return "rag-red";
}

const PERF_TABS = ["dashboard", "kra", "kpi", "assign", "evaluations", "achievements", "eom"] as const;

const PerformanceDashboardCharts = dynamic(
  () =>
    retryImport(() =>
      import("@/components/people/performance-dashboard-charts").then(
        (m) => m.PerformanceDashboardCharts,
      ),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
    ),
  },
);

export default function PerformancePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "dashboard";
  const tab = PERF_TABS.includes(tabParam as (typeof PERF_TABS)[number]) ? tabParam : "dashboard";

  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "dashboard") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `/people/performance?${qs}` : "/people/performance", { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Medal}
        kicker="People & HR"
        title={t("performance.title")}
        subtitle={t("performance.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/people/scoreboard">{t("nav.scoreboard")}</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/kpi">{t("performance.linkKpiEngine")}</Link>
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard">{t("performance.tabs.dashboard")}</TabsTrigger>
          <TabsTrigger value="kra">{t("performance.tabs.kra")}</TabsTrigger>
          <TabsTrigger value="kpi">{t("performance.tabs.kpi")}</TabsTrigger>
          <TabsTrigger value="assign">{t("performance.tabs.assign")}</TabsTrigger>
          <TabsTrigger value="evaluations">{t("performance.tabs.evaluations")}</TabsTrigger>
          <TabsTrigger value="achievements">{t("performance.tabs.achievements")}</TabsTrigger>
          <TabsTrigger value="eom">{t("performance.tabs.eom")}</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="kra" className="mt-4">
          <KraTemplatesTab />
        </TabsContent>
        <TabsContent value="kpi" className="mt-4">
          <KpiTemplatesTab />
        </TabsContent>
        <TabsContent value="assign" className="mt-4">
          <AssignTab />
        </TabsContent>
        <TabsContent value="evaluations" className="mt-4">
          <EvaluationsTab />
        </TabsContent>
        <TabsContent value="achievements" className="mt-4">
          <AchievementsTab />
        </TabsContent>
        <TabsContent value="eom" className="mt-4">
          <EomTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTab() {
  const { t } = useTranslation();
  const dashQ = useQuery({
    queryKey: queryKeys.performance.dashboard(),
    queryFn: () => getPerformanceDashboard(),
    staleTime: 120_000,
  });
  const d = dashQ.data;

  const cards: { label: string; value: string | number; tint: KpiTint }[] = [
    { label: t("performance.dashboard.openCycle"), value: d?.openCycle?.name ?? "—", tint: "sky" },
    { label: t("performance.dashboard.evaluations"), value: d?.evaluationsTotal ?? "—", tint: "sky" },
    { label: t("performance.dashboard.draft"), value: d?.evaluationsDraft ?? "—", tint: "slate" },
    { label: t("performance.dashboard.finalized"), value: d?.evaluationsFinalized ?? "—", tint: "green" },
    {
      label: t("performance.dashboard.avgScore"),
      value: d?.avgScore != null ? d.avgScore.toFixed(1) : "—",
      tint: "green",
    },
    { label: t("performance.dashboard.achievements"), value: d?.achievements ?? "—", tint: "amber" },
    { label: t("performance.dashboard.shortlist"), value: d?.nominationsShortlisted ?? "—", tint: "orange" },
    { label: t("performance.dashboard.templates"), value: `${d?.kraTemplates ?? 0} / ${d?.kpiTemplates ?? 0}`, tint: "sky" },
  ];

  const charts = d?.charts;
  const hasChartData = Boolean(
    charts &&
      (charts.evaluationsByStatus.length ||
        charts.evaluationsByRating.length ||
        charts.scoreTrend.length ||
        charts.avgByDepartment.length ||
        charts.recognition.length),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <TintedKpiCard key={c.label} title={c.label} value={c.value} tint={c.tint} compact />
        ))}
      </div>
      {dashQ.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : hasChartData && charts ? (
        <PerformanceDashboardCharts {...charts} />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          {t("performance.dashboard.chartPlaceholder")}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("performance.dashboard.extendsKpi")}</p>
    </div>
  );
}

function KraTemplatesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: queryKeys.performance.kraTemplates(),
    queryFn: () => listKraTemplates(),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = listQ.data?.find((x) => x.id === editingId);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [jobRoleKey, setJobRoleKey] = useState("");
  const [itemsText, setItemsText] = useState(
    "goal_1|Primary goal|40\ngoal_2|Secondary goal|35\ngoal_3|Supporting goal|25",
  );

  const loadEdit = (id: string) => {
    const row = listQ.data?.find((x) => x.id === id);
    if (!row) return;
    setEditingId(id);
    setCode(row.code);
    setName(row.name);
    setJobRoleKey(row.job_role_key ?? "");
    setItemsText(
      row.items.map((i) => `${i.code}|${i.title}|${i.weight_pct}`).join("\n") ||
        "goal_1|Primary goal|40\ngoal_2|Secondary goal|35\ngoal_3|Supporting goal|25",
    );
  };

  const save = useMutation({
    mutationFn: () => {
      const items = itemsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, idx) => {
          const [c, title, w] = line.split("|").map((s) => s.trim());
          return {
            code: c || `item_${idx + 1}`,
            title: title || c || `Item ${idx + 1}`,
            weightPct: Number(w || 0),
            sortOrder: idx + 1,
          };
        });
      return upsertKraTemplate({
        id: editingId ?? undefined,
        code,
        name,
        jobRoleKey: jobRoleKey || null,
        items,
      });
    },
    onSuccess: () => {
      toast.success(t("performance.kra.saved"));
      setEditingId(null);
      void qc.invalidateQueries({ queryKey: queryKeys.performance.kraTemplates() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          {t("performance.kra.listTitle")}
        </div>
        <div className="max-h-[480px] space-y-2 overflow-auto p-3">
          {(listQ.data ?? []).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => loadEdit(row.id)}
              className="flex w-full items-start justify-between rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">{row.name}</div>
                <div className="text-xs text-muted-foreground">
                  {row.job_role_key ?? "—"} · {row.items.length} · {row.weightTotal}%
                </div>
              </div>
              <Badge variant={Math.abs(row.weightTotal - 100) < 0.01 ? "secondary" : "destructive"}>
                {Math.abs(row.weightTotal - 100) < 0.01 ? "100%" : `${row.weightTotal}%`}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      <CapabilityGate capability="performance.manage_templates">
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium">
            {editing ? t("performance.kra.editTitle") : t("performance.kra.createTitle")}
          </div>
          <div className="grid gap-2">
            <Label>{t("performance.fields.code")}</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
            <Label>{t("performance.fields.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Label>{t("performance.fields.jobRole")}</Label>
            <Input value={jobRoleKey} onChange={(e) => setJobRoleKey(e.target.value)} />
            <Label>{t("performance.kra.itemsHint")}</Label>
            <Textarea rows={8} value={itemsText} onChange={(e) => setItemsText(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !code || !name}>
              {t("common.save")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setCode("");
                setName("");
                setJobRoleKey("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      </CapabilityGate>
    </div>
  );
}

function KpiTemplatesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: queryKeys.performance.kpiTemplates(),
    queryFn: () => listPerformanceKpiTemplates(),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [jobRoleKey, setJobRoleKey] = useState("");
  const [itemsText, setItemsText] = useState(
    "attendance_punctuality|Attendance %|20|true|98|%\nchecklist_completion|Checklist %|30|true|100|%\ncash_accuracy|Cash accuracy|25|true|100|%\ncomplaint_count|Complaints|25|false|0|count",
  );

  const loadEdit = (id: string) => {
    const row = listQ.data?.find((x) => x.id === id);
    if (!row) return;
    setEditingId(id);
    setCode(row.code);
    setName(row.name);
    setJobRoleKey(row.job_role_key ?? "");
    setItemsText(
      row.items
        .map(
          (i) =>
            `${i.code}|${i.label}|${i.weight}|${i.higher_is_better}|${i.target_value ?? ""}|${i.unit ?? ""}`,
        )
        .join("\n"),
    );
  };

  const save = useMutation({
    mutationFn: () => {
      const items = itemsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, idx) => {
          const [c, label, w, hib, target, unit] = line.split("|").map((s) => s.trim());
          return {
            code: c || `kpi_${idx + 1}`,
            label: label || c || `KPI ${idx + 1}`,
            weight: Number(w || 0),
            higherIsBetter: hib !== "false",
            targetValue: target === "" ? null : Number(target),
            unit: unit || null,
            dataSource: "manual" as const,
            sortOrder: idx + 1,
          };
        });
      return upsertPerformanceKpiTemplate({
        id: editingId ?? undefined,
        code,
        name,
        jobRoleKey: jobRoleKey || null,
        items,
      });
    },
    onSuccess: () => {
      toast.success(t("performance.kpi.saved"));
      void qc.invalidateQueries({ queryKey: queryKeys.performance.kpiTemplates() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          {t("performance.kpi.listTitle")}
        </div>
        <div className="max-h-[480px] space-y-2 overflow-auto p-3">
          {(listQ.data ?? []).map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => loadEdit(row.id)}
              className="flex w-full items-start justify-between rounded-md border border-border px-3 py-2 text-left hover:bg-muted/40"
            >
              <div>
                <div className="text-sm font-medium">{row.name}</div>
                <div className="text-xs text-muted-foreground">
                  {row.job_role_key ?? row.target_role ?? "—"} · {row.items.length} items
                </div>
              </div>
              <Badge variant={row.weightsValid ? "secondary" : "destructive"}>
                {row.weightTotal}%
              </Badge>
            </button>
          ))}
        </div>
      </div>

      <CapabilityGate capability="performance.manage_templates">
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium">{t("performance.kpi.editTitle")}</div>
          <p className="text-xs text-muted-foreground">{t("performance.kpi.extendsNote")}</p>
          <div className="grid gap-2">
            <Label>{t("performance.fields.code")}</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
            <Label>{t("performance.fields.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Label>{t("performance.fields.jobRole")}</Label>
            <Input value={jobRoleKey} onChange={(e) => setJobRoleKey(e.target.value)} />
            <Label>{t("performance.kpi.itemsHint")}</Label>
            <Textarea rows={10} value={itemsText} onChange={(e) => setItemsText(e.target.value)} />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !code || !name}>
            {t("common.save")}
          </Button>
        </div>
      </CapabilityGate>
    </div>
  );
}

function AssignTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const cyclesQ = useQuery({
    queryKey: queryKeys.performance.cycles(),
    queryFn: () => listPerformanceCycles(),
  });
  const openCycle = useMemo(
    () => cyclesQ.data?.find((c) => c.status === "open") ?? cyclesQ.data?.[0],
    [cyclesQ.data],
  );
  const kraQ = useQuery({
    queryKey: queryKeys.performance.kraTemplates(),
    queryFn: () => listKraTemplates(),
  });
  const kpiQ = useQuery({
    queryKey: queryKeys.performance.kpiTemplates(),
    queryFn: () => listPerformanceKpiTemplates(),
  });
  const staffQ = useQuery({
    queryKey: ["performance", "staff", locationId],
    queryFn: () => listStaffForAssignment({ locationId: locationId ?? null }),
  });
  const assignQ = useQuery({
    queryKey: queryKeys.performance.assignments(openCycle?.id),
    queryFn: () => listAssignments({ cycleId: openCycle?.id }),
    enabled: !!openCycle?.id,
  });

  const [staffId, setStaffId] = useState("");
  const [kraTemplateId, setKraTemplateId] = useState("");
  const [kpiTemplateId, setKpiTemplateId] = useState("");

  const assign = useMutation({
    mutationFn: () => {
      if (!openCycle?.id) throw new Error("No open cycle");
      if (!staffId) throw new Error(t("performance.assign.selectStaff"));
      return assignEmployeeScorecard({
        staffId,
        cycleId: openCycle.id,
        kraTemplateId: kraTemplateId || undefined,
        kpiTemplateId: kpiTemplateId || undefined,
      });
    },
    onSuccess: (r) => {
      toast.success(t("performance.assign.success", { name: r.staffName, kra: r.kraCount, kpi: r.kpiCount }));
      void qc.invalidateQueries({ queryKey: queryKeys.performance.assignments(openCycle?.id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <CapabilityGate capability="performance.assign">
        <div className="grid items-end gap-3 rounded-[1.25rem] border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <Label>{t("performance.assign.staff")}</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder={t("performance.assign.selectStaff")} />
              </SelectTrigger>
              <SelectContent>
                {(staffQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name} ({s.employee_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("performance.assign.kraTemplate")}</Label>
            <Select value={kraTemplateId} onValueChange={setKraTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {(kraQ.data ?? []).map((tRow) => (
                  <SelectItem key={tRow.id} value={tRow.id}>
                    {tRow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("performance.assign.kpiTemplate")}</Label>
            <Select value={kpiTemplateId} onValueChange={setKpiTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {(kpiQ.data ?? []).map((tRow) => (
                  <SelectItem key={tRow.id} value={tRow.id}>
                    {tRow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full md:w-auto" onClick={() => assign.mutate()} disabled={assign.isPending}>
            <UserCheck />
            {t("performance.assign.submit")}
          </Button>
        </div>
      </CapabilityGate>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          {t("performance.assign.listTitle")} — {openCycle?.name ?? "—"}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("performance.fields.staff")}</TableHead>
              <TableHead>{t("performance.fields.jobTitle")}</TableHead>
              <TableHead className="text-right">KRAs</TableHead>
              <TableHead className="text-right">KPIs</TableHead>
              <TableHead>{t("performance.fields.status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(assignQ.data ?? []).map((row) => (
              <TableRow key={row.staffId}>
                <TableCell>
                  <div className="font-medium">{row.fullName}</div>
                  <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
                </TableCell>
                <TableCell>{row.jobTitle ?? "—"}</TableCell>
                <TableCell className="text-right">{row.kraCount}</TableCell>
                <TableCell className="text-right">{row.kpiCount}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.evaluationStatus ?? "—"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/people/performance/staff/${row.staffId}`}>
                      {t("performance.profile.open")}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!assignQ.data?.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("performance.assign.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EvaluationsTab() {
  const { t } = useTranslation();
  const listQ = useQuery({
    queryKey: queryKeys.performance.evaluations({}),
    queryFn: () => listEvaluations({}),
  });

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">
        {t("performance.evaluations.listTitle")}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("performance.fields.staff")}</TableHead>
            <TableHead>{t("performance.fields.cycle")}</TableHead>
            <TableHead>{t("performance.fields.status")}</TableHead>
            <TableHead className="text-right">{t("performance.fields.score")}</TableHead>
            <TableHead>{t("performance.fields.rating")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(listQ.data ?? []).map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.staffName}</div>
                <div className="text-xs text-muted-foreground">{row.employeeCode}</div>
              </TableCell>
              <TableCell>{row.cycleName}</TableCell>
              <TableCell>
                <Badge variant="outline">{t(`performance.status.${row.status}`, { defaultValue: row.status })}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {row.total_score != null ? Number(row.total_score).toFixed(1) : "—"}
              </TableCell>
              <TableCell>
                {row.rating_band ? (
                  <Badge className={`bg-${ratingTone(row.rating_band)}/15 text-foreground`}>
                    {row.rating_band}
                  </Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/people/performance/evaluations/${row.id}`}>
                    {t("performance.evaluations.open")}
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!listQ.data?.length && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t("performance.evaluations.empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AchievementsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const listQ = useQuery({
    queryKey: queryKeys.performance.achievements({ locationId }),
    queryFn: () => listAchievements({ locationId: locationId ?? null }),
  });
  const staffQ = useQuery({
    queryKey: ["performance", "staff", locationId],
    queryFn: () => listStaffForAssignment({ locationId: locationId ?? null }),
  });

  const [staffId, setStaffId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [achievedOn, setAchievedOn] = useState(() => new Date().toISOString().slice(0, 10));

  const create = useMutation({
    mutationFn: () =>
      createAchievement({
        staffId,
        title,
        description: description || null,
        achievedOn,
      }),
    onSuccess: () => {
      toast.success(t("performance.achievements.saved"));
      setTitle("");
      setDescription("");
      void qc.invalidateQueries({ queryKey: queryKeys.performance.achievements({ locationId }) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <CapabilityGate capability="performance.evaluate">
        <div className="grid items-end gap-3 rounded-[1.25rem] border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10.5rem_auto]">
          <div className="space-y-2">
            <Label>{t("performance.assign.staff")}</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder={t("performance.assign.selectStaff")} />
              </SelectTrigger>
              <SelectContent>
                {(staffQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("performance.fields.title")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("performance.fields.date")}</Label>
            <Input type="date" value={achievedOn} onChange={(e) => setAchievedOn(e.target.value)} />
          </div>
          <Button
            className="w-full md:w-auto"
            onClick={() => create.mutate()}
            disabled={create.isPending || !staffId || !title}
          >
            <Plus />
            {t("performance.achievements.add")}
          </Button>
          <div className="space-y-2 md:col-span-4">
            <Label>{t("performance.fields.description")}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
      </CapabilityGate>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("performance.fields.staff")}</TableHead>
              <TableHead>{t("performance.fields.title")}</TableHead>
              <TableHead>{t("performance.fields.date")}</TableHead>
              <TableHead>{t("performance.fields.category")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(listQ.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.staffName}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.title}</div>
                  {row.description && (
                    <div className="text-xs text-muted-foreground">{row.description}</div>
                  )}
                </TableCell>
                <TableCell>{row.achieved_on}</TableCell>
                <TableCell>{row.category}</TableCell>
              </TableRow>
            ))}
            {!listQ.data?.length && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {t("performance.achievements.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EomTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locationId = useAppStore((s) => s.currentLocationId);
  const listQ = useQuery({
    queryKey: queryKeys.performance.nominations({}),
    queryFn: () => listNominations({}),
  });
  const staffQ = useQuery({
    queryKey: ["performance", "staff", locationId],
    queryFn: () => listStaffForAssignment({ locationId: locationId ?? null }),
  });

  const [staffId, setStaffId] = useState("");
  const [month, setMonth] = useState(() => `${new Date().toISOString().slice(0, 7)}-01`);
  const [rationale, setRationale] = useState("");

  const nominate = useMutation({
    mutationFn: () =>
      createNomination({
        staffId,
        nominationMonth: month,
        rationale: rationale || null,
      }),
    onSuccess: () => {
      toast.success(t("performance.eom.nominated"));
      setRationale("");
      void qc.invalidateQueries({ queryKey: queryKeys.performance.nominations({}) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      approveNomination({ nominationId: id, approve }),
    onSuccess: (r) => {
      toast.success(r.status === "approved" ? t("performance.eom.approved") : t("performance.eom.rejected"));
      void qc.invalidateQueries({ queryKey: queryKeys.performance.nominations({}) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <Medal className="h-4 w-4" />
          {t("performance.eom.title")}
        </div>
        {t("performance.eom.rulesNote")}
      </div>

      <CapabilityGate capability="performance.evaluate">
        <div className="grid items-end gap-3 rounded-[1.25rem] border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_10.5rem_auto]">
          <div className="space-y-2">
            <Label>{t("performance.assign.staff")}</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue placeholder={t("performance.assign.selectStaff")} />
              </SelectTrigger>
              <SelectContent>
                {(staffQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("performance.eom.month")}</Label>
            <Input type="date" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button
            className="w-full md:w-auto"
            onClick={() => nominate.mutate()}
            disabled={nominate.isPending || !staffId}
          >
            {t("performance.eom.shortlist")}
          </Button>
          <div className="space-y-2 md:col-span-3">
            <Label>{t("performance.eom.rationale")}</Label>
            <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} />
          </div>
        </div>
      </CapabilityGate>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("performance.fields.staff")}</TableHead>
              <TableHead>{t("performance.eom.month")}</TableHead>
              <TableHead>{t("performance.fields.status")}</TableHead>
              <TableHead>{t("performance.eom.eligibility")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(listQ.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.staffName}</TableCell>
                <TableCell>{row.nomination_month}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.status}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.eligibility.eligible ? "secondary" : "destructive"}>
                    {row.eligibility.eligible
                      ? t("performance.eom.eligible")
                      : row.eligibility.reasons.join(", ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {row.status === "shortlisted" && (
                    <CapabilityGate capability="performance.approve_eom">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decide.mutate({ id: row.id, approve: true })}
                        >
                          {t("performance.eom.approve")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => decide.mutate({ id: row.id, approve: false })}
                        >
                          {t("performance.eom.reject")}
                        </Button>
                      </div>
                    </CapabilityGate>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!listQ.data?.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("performance.eom.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

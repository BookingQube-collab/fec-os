"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BellRing,
  Database,
  Download,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { PageHeader } from "@/components/layout/page-header";
import { KPIWidget } from "@/components/dashboard/kpi-widget";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  dispatchCrashAlert,
  getDiagnosticsHub,
  purgeAndHealCache,
  resolveAllIncidents,
  resolveIncident,
  runHealthScan,
  type CrashIncident,
  type DiagnosticsHub,
} from "@/lib/diagnostics.functions";
import { queryKeys } from "@/lib/query-keys";
import { getQueryClient } from "@/lib/query-client";
import { clearAuthSessionCache } from "@/lib/auth-session";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function exportIncidentsCsv(rows: CrashIncident[]) {
  const headers = [
    "id",
    "created_at",
    "severity",
    "status",
    "source",
    "route",
    "message",
    "user_id",
    "resolved_at",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.created_at,
        r.severity,
        r.status,
        r.source,
        r.route ?? "",
        r.message,
        r.user_id ?? "",
        r.resolved_at ?? "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fec-crash-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function purgeLocalClientState() {
  const qc = getQueryClient();
  qc.clear();
  clearAuthSessionCache(qc);
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  window.location.reload();
}

function Forbidden() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {t("diagnostics.forbidden")}
    </div>
  );
}

export default function DiagnosticsPage() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const maxLevel = roles.reduce((acc, r) => Math.max(acc, r.role_level), 0);
  if (maxLevel < 80) return <Forbidden />;
  return (
    <CapabilityGate capability="admin.diagnostics" fallback={<Forbidden />}>
      <DiagnosticsHubView />
    </CapabilityGate>
  );
}

function DiagnosticsHubView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState("incidents");

  const hubQ = useQuery({
    queryKey: queryKeys.admin.diagnostics(),
    queryFn: () => getDiagnosticsHub(),
    refetchInterval: 30_000,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.admin.diagnostics() });

  const scanMut = useMutation({
    mutationFn: () => runHealthScan(),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.admin.diagnostics(), data);
      toast.success(t("diagnostics.toasts.scanDone"));
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const purgeMut = useMutation({
    mutationFn: () => purgeAndHealCache(),
    onSuccess: (r) => {
      toast.success(t("diagnostics.toasts.purged", { count: r.route.cleared + r.session.cleared }));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const alertMut = useMutation({
    mutationFn: () => dispatchCrashAlert(),
    onSuccess: (r) => {
      toast.success(t("diagnostics.toasts.alertSent", { count: r.notified }));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const resolveAllMut = useMutation({
    mutationFn: () => resolveAllIncidents(),
    onSuccess: (r) => {
      toast.success(t("diagnostics.toasts.resolved", { count: r.resolved }));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const resolveOneMut = useMutation({
    mutationFn: (id: string) => resolveIncident({ id }),
    onSuccess: () => {
      toast.success(t("diagnostics.toasts.resolvedOne"));
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const hub = hubQ.data;
  const health = hub?.health;
  const open = hub?.incidents.filter((i) => i.status === "open") ?? [];
  const busy =
    scanMut.isPending ||
    purgeMut.isPending ||
    alertMut.isPending ||
    resolveAllMut.isPending ||
    resolveOneMut.isPending;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Activity}
        kicker={t("diagnostics.kicker")}
        title={t("diagnostics.title")}
        subtitle={t("diagnostics.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={health?.pipeline.status === "armed" ? "success" : "warning"}>
              {t("diagnostics.monitoringActive")}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              disabled={!hub?.incidents.length}
              onClick={() => hub && exportIncidentsCsv(hub.incidents)}
            >
              <Download className="h-3.5 w-3.5" />
              {t("diagnostics.exportCsv")}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => scanMut.mutate()}>
              {scanMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
              {t("diagnostics.runScan")}
            </Button>
          </div>
        }
      />

      <HealthKpis hub={hub} loading={hubQ.isLoading} />

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("diagnostics.healing.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("diagnostics.healing.subtitle")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <HealCard
            tag="API"
            icon={HardDrive}
            title={t("diagnostics.healing.purge.title")}
            body={t("diagnostics.healing.purge.body")}
            action={t("diagnostics.healing.purge.action")}
            pending={purgeMut.isPending}
            disabled={busy}
            onClick={() => purgeMut.mutate()}
          />
          <HealCard
            tag="NOTIF"
            icon={BellRing}
            title={t("diagnostics.healing.alert.title")}
            body={t("diagnostics.healing.alert.body")}
            action={t("diagnostics.healing.alert.action")}
            pending={alertMut.isPending}
            disabled={busy}
            onClick={() => alertMut.mutate()}
          />
          <HealCard
            tag="CLIENT"
            icon={Trash2}
            title={t("diagnostics.healing.client.title")}
            body={t("diagnostics.healing.client.body")}
            action={t("diagnostics.healing.client.action")}
            disabled={busy}
            onClick={purgeLocalClientState}
          />
          <HealCard
            tag="DB"
            icon={Database}
            title={t("diagnostics.healing.resolve.title")}
            body={t("diagnostics.healing.resolve.body")}
            action={t("diagnostics.healing.resolve.action")}
            pending={resolveAllMut.isPending}
            disabled={busy || open.length === 0}
            onClick={() => resolveAllMut.mutate()}
          />
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="incidents">
            {t("diagnostics.tabs.incidents")} ({hub?.openCount ?? 0})
          </TabsTrigger>
          <TabsTrigger value="schema">{t("diagnostics.tabs.schema")}</TabsTrigger>
          <TabsTrigger value="audit">
            {t("diagnostics.tabs.audit")} ({hub?.auditCount ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incidents">
          <IncidentQueue
            incidents={hub?.incidents ?? []}
            loading={hubQ.isLoading}
            refreshing={hubQ.isFetching}
            onRefresh={() => void hubQ.refetch()}
            onResolve={(id) => resolveOneMut.mutate(id)}
            resolving={resolveOneMut.isPending}
          />
        </TabsContent>
        <TabsContent value="schema">
          <SchemaPanel hub={hub} loading={hubQ.isLoading} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditPanel hub={hub} loading={hubQ.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HealthKpis({ hub, loading }: { hub?: DiagnosticsHub; loading: boolean }) {
  const { t } = useTranslation();
  const h = hub?.health;
  const latency = h?.dbLatencyMs != null ? `${h.dbLatencyMs} ms` : loading ? "…" : "—";
  const incidentsValue =
    h?.incidentStatus === "all_clear" ? t("diagnostics.kpi.allClear") : String(h?.openIncidents ?? (loading ? "…" : 0));
  const heapValue =
    h?.heap.heapUsedMb != null ? `${h.heap.heapUsedMb} MB` : loading ? "…" : t("diagnostics.kpi.unavailable");
  const pipeline = h?.pipeline.status === "armed"
    ? t("diagnostics.kpi.armed")
    : h?.pipeline.status === "degraded"
      ? t("diagnostics.kpi.degraded")
      : loading
        ? "…"
        : t("diagnostics.kpi.down");

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KPIWidget
        title={t("diagnostics.kpi.dbLatency")}
        value={latency}
        subtitle={t("diagnostics.kpi.dbLatencyHint")}
        icon={Database}
        accent={h?.dbStatus === "optimal" ? "green" : h?.dbStatus === "degraded" ? "amber" : "red"}
      />
      <KPIWidget
        title={t("diagnostics.kpi.incidents")}
        value={incidentsValue}
        subtitle={t("diagnostics.kpi.incidentsHint")}
        icon={ShieldAlert}
        accent={h?.incidentStatus === "all_clear" ? "green" : "amber"}
      />
      <KPIWidget
        title={t("diagnostics.kpi.heap")}
        value={heapValue}
        subtitle={t("diagnostics.kpi.heapHint")}
        icon={MemoryStick}
        accent={h?.heap.status === "elevated" ? "amber" : "green"}
      />
      <KPIWidget
        title={t("diagnostics.kpi.pipeline")}
        value={pipeline}
        subtitle={t("diagnostics.kpi.pipelineHint")}
        icon={BellRing}
        accent={h?.pipeline.status === "armed" ? "green" : h?.pipeline.status === "degraded" ? "amber" : "red"}
      />
    </div>
  );
}

function HealCard({
  tag,
  icon: Icon,
  title,
  body,
  action,
  onClick,
  pending,
  disabled,
}: {
  tag: string;
  icon: typeof Wrench;
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <NeumorphicCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="icon-well">
          <Icon className="h-4 w-4 stroke-[1.5]" />
        </span>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
          {tag}
        </Badge>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 min-h-[2.5rem] text-xs text-muted-foreground">{body}</p>
      <Button size="sm" className="mt-3 w-full" disabled={disabled} onClick={onClick}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
        {action}
      </Button>
    </NeumorphicCard>
  );
}

function IncidentQueue({
  incidents,
  loading,
  refreshing,
  onRefresh,
  onResolve,
  resolving,
}: {
  incidents: CrashIncident[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onResolve: (id: string) => void;
  resolving: boolean;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const rows = useMemo(
    () => (filter === "open" ? incidents.filter((i) => i.status === "open") : incidents),
    [filter, incidents],
  );

  return (
    <NeumorphicCard className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("diagnostics.queue.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("diagnostics.queue.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>
            {t("diagnostics.queue.open")}
          </Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
            {t("diagnostics.queue.all")}
          </Button>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {t("diagnostics.queue.refresh")}
          </Button>
        </div>
      </div>
      {loading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("diagnostics.queue.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("diagnostics.queue.when")}</TableHead>
              <TableHead>{t("diagnostics.queue.severity")}</TableHead>
              <TableHead>{t("diagnostics.queue.status")}</TableHead>
              <TableHead>{t("diagnostics.queue.route")}</TableHead>
              <TableHead>{t("diagnostics.queue.message")}</TableHead>
              <TableHead className="text-end">{t("diagnostics.queue.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatWhen(row.created_at)}</TableCell>
                <TableCell>
                  <Badge variant={row.severity === "critical" ? "destructive" : row.severity === "warning" ? "warning" : "info"}>
                    {row.severity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.status === "open" ? "warning" : "success"}>{row.status}</Badge>
                </TableCell>
                <TableCell className="max-w-[10rem] truncate font-mono text-xs">{row.route ?? "—"}</TableCell>
                <TableCell className="max-w-[22rem] truncate text-xs" title={row.stack ?? row.message}>
                  {row.message}
                </TableCell>
                <TableCell className="text-end">
                  {row.status === "open" ? (
                    <Button size="sm" variant="outline" disabled={resolving} onClick={() => onResolve(row.id)}>
                      {t("diagnostics.queue.resolve")}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{formatWhen(row.resolved_at)}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </NeumorphicCard>
  );
}

function SchemaPanel({ hub, loading }: { hub?: DiagnosticsHub; loading: boolean }) {
  const { t } = useTranslation();
  const present = hub?.schema.filter((s) => s.exists).length ?? 0;
  const total = hub?.schema.length ?? 0;
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
      <NeumorphicCard className="p-0">
        <div className="border-b border-border/80 px-4 py-3">
          <h3 className="text-sm font-semibold">{t("diagnostics.schema.title")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("diagnostics.schema.subtitle", { present, total })}
          </p>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <div className="divide-y divide-border/70">
            {(hub?.schema ?? []).map((row) => (
              <div key={row.table} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-mono text-xs">{row.table}</span>
                <Badge variant={row.exists ? "success" : "destructive"}>
                  {row.exists ? t("diagnostics.schema.present") : t("diagnostics.schema.missing")}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </NeumorphicCard>
      <NeumorphicCard className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">{t("diagnostics.runtime.title")}</h3>
        <p className="text-xs text-muted-foreground">{hub?.health.heap.note}</p>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("diagnostics.runtime.heapUsed")}</dt>
            <dd className="tabular-nums">{hub?.health.heap.heapUsedMb ?? "—"} MB</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("diagnostics.runtime.heapTotal")}</dt>
            <dd className="tabular-nums">{hub?.health.heap.heapTotalMb ?? "—"} MB</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("diagnostics.runtime.rss")}</dt>
            <dd className="tabular-nums">{hub?.health.heap.rssMb ?? "—"} MB</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("diagnostics.runtime.scanned")}</dt>
            <dd>{formatWhen(hub?.health.scannedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{t("diagnostics.runtime.recipients")}</dt>
            <dd className="tabular-nums">{hub?.health.pipeline.recipientCount ?? "—"}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">{hub?.health.dbNote}</p>
        <p className="text-xs text-muted-foreground">{hub?.health.pipeline.note}</p>
      </NeumorphicCard>
    </div>
  );
}

function AuditPanel({ hub, loading }: { hub?: DiagnosticsHub; loading: boolean }) {
  const { t } = useTranslation();
  const rows = hub?.audit ?? [];
  return (
    <NeumorphicCard className="p-0">
      <div className="border-b border-border/80 px-4 py-3">
        <h3 className="text-sm font-semibold">{t("diagnostics.audit.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("diagnostics.audit.subtitle")}</p>
      </div>
      {loading ? (
        <p className="p-6 text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("diagnostics.audit.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("diagnostics.queue.when")}</TableHead>
              <TableHead>{t("diagnostics.audit.action")}</TableHead>
              <TableHead>{t("diagnostics.audit.actor")}</TableHead>
              <TableHead>{t("diagnostics.audit.reason")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatWhen(row.created_at)}</TableCell>
                <TableCell className="font-mono text-xs">{row.action}</TableCell>
                <TableCell className="text-xs">{row.actor_email ?? row.actor_id?.slice(0, 8) ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </NeumorphicCard>
  );
}

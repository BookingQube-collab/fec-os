"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileEdit,
  ShoppingCart,
  Target,
  Undo2,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { KPIWidget } from "@/components/dashboard/kpi-widget";
import { NeumorphicCard } from "@/components/dashboard/neumorphic-card";
import { PrRowActions, usePrActions, type PrActionTarget } from "@/components/procurement/pr-row-actions";
import { PrStatusPill } from "@/components/procurement/pr-status-pill";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KPI_ICON_CLASS, KPI_TINT_CLASS, type KpiTint } from "@/lib/ui/command-surface";
import { fmtQar } from "@/lib/currency";
import type { PipelineKey, PrDashboardListRow } from "@/lib/procurement/dashboard";
import { getProcurementDashboard } from "@/lib/procurement.functions";
import { queryKeys } from "@/lib/query-keys";
import { retryImport } from "@/lib/retry-import";
import { STALE } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";

const ProcurementDashboardCharts = dynamic(
  () =>
    retryImport(() =>
      import("@/components/procurement/procurement-dashboard-charts").then(
        (m) => m.ProcurementDashboardCharts,
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

function priorityVariant(priority: string): "muted" | "info" | "warning" | "destructive" {
  if (priority === "emergency") return "destructive";
  if (priority === "high") return "warning";
  if (priority === "low") return "muted";
  return "info";
}

function KpiSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-2xl" />
      ))}
    </div>
  );
}

function Scorecard({
  title,
  value,
  hint,
  badge,
  icon: Icon,
  tint,
}: {
  title: string;
  value: string;
  hint: string;
  badge: string;
  icon: LucideIcon;
  tint: KpiTint;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] ${KPI_TINT_CLASS[tint]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-full ${KPI_ICON_CLASS[tint]}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{hint}</p>
      <span className="mt-3 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
        {badge}
      </span>
    </div>
  );
}

function toActionTarget(row: PrDashboardListRow): PrActionTarget {
  return {
    id: row.id,
    prNumber: row.pr_number ?? "",
    title: row.purpose || row.pr_number || "",
    amount: row.total_amount,
    requester: row.requester_name,
    department: row.department_name,
    canAct: row.canAct,
    canReissue: row.canReissue,
    isOwner: row.isOwner,
  };
}

function PrMiniTable({
  rows,
  empty,
  showVendor = true,
  showOverdue = false,
  pending,
  onApprove,
  onReject,
  onReturn,
  onReissue,
}: {
  rows: PrDashboardListRow[];
  empty: string;
  showVendor?: boolean;
  showOverdue?: boolean;
  pending: boolean;
  onApprove: (row: PrDashboardListRow) => void;
  onReject: (row: PrDashboardListRow) => void;
  onReturn: (row: PrDashboardListRow) => void;
  onReissue: (row: PrDashboardListRow) => void;
}) {
  const { t } = useTranslation();
  const cols = 7 + (showVendor ? 1 : 0) + (showOverdue ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("procurement.list.titleRequester")}</TableHead>
            <TableHead>{t("procurement.list.location")}</TableHead>
            {showVendor ? <TableHead>{t("procurement.dashboard.vendor")}</TableHead> : null}
            <TableHead>{t("procurement.list.amount")}</TableHead>
            <TableHead>{t("procurement.list.status")}</TableHead>
            <TableHead>{t("procurement.form.priority")}</TableHead>
            <TableHead>{t("procurement.list.required")}</TableHead>
            {showOverdue ? <TableHead>{t("procurement.dashboard.daysOverdue")}</TableHead> : null}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={cols} className="py-12 text-center">
                <p className="text-sm font-semibold text-foreground">{empty}</p>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-secondary/50">
                <TableCell>
                  <p className="font-semibold">{row.pr_number ?? t("procurement.status.draft")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.requester_name}
                    {row.department_name ? ` • ${row.department_name}` : ""}
                    {row.purpose ? ` | ${row.purpose}` : ""}
                  </p>
                </TableCell>
                <TableCell>{row.location_name}</TableCell>
                {showVendor ? (
                  <TableCell>{row.vendor_name ?? t("procurement.dashboard.noVendor")}</TableCell>
                ) : null}
                <TableCell className="font-bold tabular-nums">{fmtQar(row.total_amount)}</TableCell>
                <TableCell>
                  <PrStatusPill status={row.status} />
                </TableCell>
                <TableCell>
                  <Badge variant={priorityVariant(row.priority)}>
                    {t(`procurement.form.${row.priority}`)}
                  </Badge>
                </TableCell>
                <TableCell>{row.required_by ?? "—"}</TableCell>
                {showOverdue ? (
                  <TableCell className="tabular-nums text-destructive">{row.days_overdue ?? 0}</TableCell>
                ) : null}
                <TableCell>
                  <PrRowActions
                    href={`/procurement/requisitions/${row.id}`}
                    canAct={row.canAct}
                    canReissue={row.canReissue}
                    pending={pending}
                    compact
                    onApprove={() => onApprove(row)}
                    onReject={() => onReject(row)}
                    onReturn={() => onReturn(row)}
                    onReissue={() => onReissue(row)}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SectionCard({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <NeumorphicCard className="p-5">
      <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-3">
        <h2 className="section-kicker">{title}</h2>
        {href && linkLabel ? (
          <Button variant="outline" asChild>
            <Link href={href}>{linkLabel}</Link>
          </Button>
        ) : null}
      </div>
      {children}
    </NeumorphicCard>
  );
}

export default function ProcurementDashboardPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const actions = usePrActions();

  const dash = useQuery({
    queryKey: queryKeys.procurement.dashboard(locationId),
    queryFn: () => getProcurementDashboard({ locationId }),
    staleTime: STALE.dashboardKpis,
  });
  const d = dash.data;

  const rowActions = {
    pending: actions.pending,
    onApprove: (row: PrDashboardListRow) => actions.open("approve", toActionTarget(row)),
    onReject: (row: PrDashboardListRow) => actions.open("reject", toActionTarget(row)),
    onReturn: (row: PrDashboardListRow) => actions.open("return", toActionTarget(row)),
    onReissue: (row: PrDashboardListRow) => actions.reissue(toActionTarget(row)),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        kicker={t("procurement.kicker")}
        title={t("procurement.title")}
        subtitle={t("procurement.dashboard.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/procurement/requisitions">{t("procurement.dashboard.viewAll")}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/procurement/approvals">{t("procurement.dashboard.viewApprovals")}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/procurement/analytics">{t("nav.procurementAnalytics")}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/procurement/help">{t("nav.procurementHelp")}</Link>
            </Button>
            <CapabilityGate capability="procurement.create">
              <Button asChild>
                <Link href="/procurement/requisitions/new">{t("procurement.newPr")}</Link>
              </Button>
            </CapabilityGate>
          </div>
        }
      />

      {dash.isError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t("procurement.dashboard.loadError")}
          {dash.error instanceof Error && dash.error.message ? ` — ${dash.error.message}` : null}
        </p>
      ) : null}

      {dash.isLoading ? (
        <KpiSkeletonGrid />
      ) : (
        <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Scorecard
            title={t("procurement.dashboard.cycleVelocity")}
            value={String(d?.open ?? 0)}
            hint={t("procurement.dashboard.cycleHint")}
            badge={t("procurement.dashboard.efficiencyBadge", {
              n: (d?.pipeline ?? []).filter((s) => s.count > 0).length,
            })}
            icon={Clock}
            tint="sky"
          />
          <Scorecard
            title={t("procurement.dashboard.signoffRate")}
            value={`${
              (d?.approved ?? 0) + (d?.rejected ?? 0) > 0
                ? Math.round(((d?.approved ?? 0) / ((d?.approved ?? 0) + (d?.rejected ?? 0))) * 100)
                : 0
            }%`}
            hint={t("procurement.dashboard.signoffHint")}
            badge={t("procurement.dashboard.deptBadge", { n: d?.spendByDepartment?.length ?? 0 })}
            icon={Target}
            tint="amber"
          />
          <Scorecard
            title={t("procurement.dashboard.liquidity")}
            value={fmtQar(d?.approvedValue ?? 0)}
            hint={t("procurement.dashboard.liquidityHint")}
            badge={t("procurement.dashboard.thisMonth", { amount: fmtQar(d?.approvedValuePeriod ?? 0) })}
            icon={Zap}
            tint="green"
          />
          <Scorecard
            title={t("procurement.dashboard.pendingLoad")}
            value={String(d?.pending ?? 0)}
            hint={t("procurement.dashboard.pendingLoadHint")}
            badge={t("procurement.dashboard.pendingMineHint")}
            icon={ClipboardList}
            tint="orange"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KPIWidget
            title={t("procurement.dashboard.open")}
            value={d?.open ?? 0}
            subtitle={t("procurement.dashboard.openHint")}
            icon={ClipboardList}
            accent="blue"
            href="/procurement/requisitions"
          />
          <KPIWidget
            title={t("procurement.dashboard.drafts")}
            value={d?.drafts ?? 0}
            subtitle={t("procurement.dashboard.draftsHint")}
            icon={FileEdit}
            accent="purple"
            href="/procurement/requisitions"
          />
          <KPIWidget
            title={t("procurement.dashboard.pendingMine")}
            value={d?.pendingMine ?? 0}
            subtitle={t("procurement.dashboard.pendingMineHint")}
            icon={Clock}
            accent={d?.pendingMine ? "amber" : "green"}
            href="/procurement/approvals"
          />
          <KPIWidget
            title={t("procurement.dashboard.approvedPeriod")}
            value={d?.approvedThisPeriod ?? 0}
            subtitle={t("procurement.dashboard.approvedPeriodHint")}
            icon={CheckCircle2}
            accent="green"
            href="/procurement/requisitions"
          />
          <KPIWidget
            title={t("procurement.dashboard.overdue")}
            value={d?.overdue ?? 0}
            subtitle={t("procurement.dashboard.overdueHint")}
            icon={AlertTriangle}
            accent={d?.overdue ? "red" : "green"}
            href="/procurement/requisitions"
          />
          <KPIWidget
            title={t("procurement.dashboard.requestedValue")}
            value={fmtQar(d?.requestedValue ?? 0)}
            secondary={t("procurement.dashboard.thisMonth", {
              amount: fmtQar(d?.requestedValuePeriod ?? 0),
            })}
            subtitle={t("procurement.dashboard.requestedValueHint")}
            icon={Wallet}
            accent="cyan"
          />
          <KPIWidget
            title={t("procurement.dashboard.approvedValue")}
            value={fmtQar(d?.approvedValue ?? 0)}
            secondary={t("procurement.dashboard.thisMonth", {
              amount: fmtQar(d?.approvedValuePeriod ?? 0),
            })}
            subtitle={t("procurement.dashboard.approvedValueHint")}
            icon={CheckCircle2}
            accent="green"
          />
          <KPIWidget
            title={t("procurement.dashboard.orderedValue")}
            value={fmtQar(d?.orderedValue ?? 0)}
            secondary={t("procurement.dashboard.thisMonth", {
              amount: fmtQar(d?.orderedValuePeriod ?? 0),
            })}
            subtitle={t("procurement.dashboard.orderedValueHint")}
            icon={ShoppingCart}
            accent="blue"
          />
          <KPIWidget
            title={t("procurement.dashboard.rejected")}
            value={d?.rejected ?? 0}
            subtitle={t("procurement.dashboard.rejectedHint")}
            icon={Ban}
            accent={d?.rejected ? "red" : "green"}
            href="/procurement/requisitions"
          />
          <KPIWidget
            title={t("procurement.dashboard.returned")}
            value={d?.returned ?? 0}
            subtitle={t("procurement.dashboard.returnedHint")}
            icon={Undo2}
            accent={d?.returned ? "amber" : "green"}
            href="/procurement/my-requests"
          />
          <KPIWidget
            title={t("procurement.dashboard.urgent")}
            value={d?.urgent ?? 0}
            subtitle={t("procurement.dashboard.urgentHint")}
            icon={AlertOctagon}
            accent={d?.urgent ? "red" : "green"}
            href="/procurement/requisitions"
          />
        </div>
        </div>
      )}

      <NeumorphicCard className="p-5">
        <h2 className="section-kicker mb-4">{t("procurement.dashboard.pipelineTitle")}</h2>
        {dash.isLoading ? (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-28 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {(d?.pipeline ?? []).map((step) => (
              <PipelineStep key={step.key} stepKey={step.key} count={step.count} amount={step.amount} />
            ))}
          </div>
        )}
      </NeumorphicCard>

      {dash.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : (
        <ProcurementDashboardCharts
          pipeline={d?.pipeline ?? []}
          spendByDepartment={d?.spendByDepartment ?? []}
          spendBySite={d?.spendBySite ?? []}
          vendors={d?.vendors ?? []}
        />
      )}

      <SectionCard
        title={t("procurement.dashboard.needsAction")}
        href="/procurement/approvals"
        linkLabel={t("procurement.dashboard.viewApprovals")}
      >
        <PrMiniTable rows={d?.needsAction ?? []} empty={t("procurement.dashboard.needsActionEmpty")} {...rowActions} />
      </SectionCard>

      <SectionCard
        title={t("procurement.dashboard.urgentList")}
        href="/procurement/requisitions"
        linkLabel={t("procurement.dashboard.viewAll")}
      >
        <PrMiniTable rows={d?.urgentList ?? []} empty={t("procurement.dashboard.urgentEmpty")} {...rowActions} />
      </SectionCard>

      <SectionCard
        title={t("procurement.dashboard.aging")}
        href="/procurement/requisitions"
        linkLabel={t("procurement.dashboard.viewAll")}
      >
        <PrMiniTable
          rows={d?.overdueList ?? []}
          empty={t("procurement.dashboard.agingEmpty")}
          showOverdue
          {...rowActions}
        />
      </SectionCard>

      <SectionCard
        title={t("procurement.dashboard.recent")}
        href="/procurement/requisitions"
        linkLabel={t("procurement.dashboard.viewAll")}
      >
        <PrMiniTable rows={d?.recent ?? []} empty={t("procurement.dashboard.recentEmpty")} {...rowActions} />
      </SectionCard>

      <p className="text-xs text-muted-foreground">{t("procurement.dashboard.periodNote")}</p>
      {actions.dialogs}
    </div>
  );
}

function PipelineStep({
  stepKey,
  count,
  amount,
}: {
  stepKey: PipelineKey;
  count: number;
  amount: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-[7.5rem] rounded-2xl border border-border/40 bg-background/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {t(`procurement.dashboard.stages.${stepKey}`)}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{count}</p>
      <p className="text-xs text-muted-foreground">{fmtQar(amount)}</p>
    </div>
  );
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Briefcase, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { useState } from "react";

import { generateDailyBrief, generatePnLCommentary } from "@/lib/ceo.functions";
import { useCeoOverview } from "@/hooks/queries/useCeo";
import { usePermission } from "@/hooks/use-permission";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { fmtQar } from "@/lib/currency";
import { TintedKpiCard, type KpiTint } from "@/components/dashboard/tinted-kpi-card";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

function Page() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pnlNarrative, setPnlNarrative] = useState<string | null>(null);
  const { data, isLoading } = useCeoOverview();

  const canRevenue = usePermission("revenue.view");
  const canBranches = usePermission("branches.view_pnl");
  const canOcc = usePermission("occ.view_estate");
  const canOccBranch = usePermission("occ.view_branch");

  const revenueHref = canRevenue ? "/revenue" : undefined;
  const pnlHref = canRevenue ? "/revenue?tab=pnl" : undefined;
  const branchesHref = canBranches ? "/branches" : canOcc ? "/occ" : undefined;

  const briefMut = useMutation({
    mutationFn: () => generateDailyBrief(),
    onSuccess: () => {
      toast.success(t("ceo.briefGenerated"));
      void qc.invalidateQueries({ queryKey: queryKeys.ceo.overview() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pnlMut = useMutation({
    mutationFn: () => generatePnLCommentary(),
    onSuccess: (row) => {
      const c = row.content as { narrative?: string };
      setPnlNarrative(c?.narrative ?? t("ceo.noNarrative"));
      toast.success(t("ceo.pnlGenerated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Briefcase}
        kicker={t("ceo.kicker")}
        title={t("ceo.title")}
        subtitle={t("ceo.subtitle")}
        actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => pnlMut.mutate()} disabled={pnlMut.isPending}>
            {pnlMut.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Sparkles className="me-2 h-4 w-4" />}
            {t("ceo.pnlCommentary")}
          </Button>
          <Button onClick={() => briefMut.mutate()} disabled={briefMut.isPending}>
            {briefMut.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Sparkles className="me-2 h-4 w-4" />}
            {t("ceo.generateBrief")}
          </Button>
        </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Kpi
          label={t("ceo.kpi.revenue")}
          value={data ? fmtQar(data.estate_revenue_30d) : "—"}
          tint="green"
          href={revenueHref}
          viewLabel={t("ceo.viewReport")}
          ariaLabel={t("ceo.viewRevenue")}
        />
        <Kpi
          label={t("ceo.kpi.ebitda")}
          value={data ? fmtQar(data.estate_ebitda_30d) : "—"}
          tint="sky"
          href={pnlHref}
          viewLabel={t("ceo.viewReport")}
          ariaLabel={t("ceo.viewEbitda")}
        />
        <Kpi
          label={t("ceo.kpi.margin")}
          value={data ? `${data.estate_margin_pct.toFixed(1)}%` : "—"}
          tint={(data?.estate_margin_pct ?? 0) >= 20 ? "green" : (data?.estate_margin_pct ?? 0) >= 10 ? "amber" : "red"}
          href={pnlHref}
          viewLabel={t("ceo.viewReport")}
          ariaLabel={t("ceo.viewMargin")}
        />
        <Kpi
          label={t("ceo.kpi.branches")}
          value={data ? `${data.active_branches} / ${data.total_branches}` : "—"}
          tint="sky"
          href={branchesHref}
          viewLabel={t("ceo.viewReport")}
          ariaLabel={t("ceo.viewBranches")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Kpi
          label={t("ceo.kpi.tickets")}
          value={data ? String(data.open_urgent_tickets) : "—"}
          tint={(data?.open_urgent_tickets ?? 0) > 0 ? "red" : "green"}
          href="/ceo/tickets"
          viewLabel={t("ceo.viewReport")}
          ariaLabel={t("ceo.viewTickets")}
        />
        <Kpi
          label={t("ceo.kpi.incidents")}
          value={data ? String(data.incidents_24h) : "—"}
          tint={(data?.incidents_24h ?? 0) > 0 ? "orange" : "green"}
          href="/ceo/incidents"
          viewLabel={t("ceo.viewReport")}
          ariaLabel={t("ceo.viewIncidents")}
        />
      </div>

      <div className="surface-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">{t("ceo.dailyBrief")}</h2>
          {data?.latest_brief && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(data.latest_brief.created_at), { addSuffix: true })}
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
        ) : data?.latest_brief ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {data.latest_brief.narrative || t("ceo.noNarrative")}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">{t("ceo.noBrief")}</div>
        )}
      </div>

      {data?.top_branch && data?.bottom_branch && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BranchHighlight
            kicker={t("ceo.topBranch")}
            name={data.top_branch.name}
            revenue={fmtQar(data.top_branch.revenue)}
            href={branchHref(data.top_branch.location_id, canOccBranch, canBranches)}
            ariaLabel={t("ceo.viewBranch", { name: data.top_branch.name })}
          />
          <BranchHighlight
            kicker={t("ceo.needsAttention")}
            name={data.bottom_branch.name}
            revenue={fmtQar(data.bottom_branch.revenue)}
            href={branchHref(data.bottom_branch.location_id, canOccBranch, canBranches)}
            ariaLabel={t("ceo.viewBranch", { name: data.bottom_branch.name })}
          />
        </div>
      )}

      {pnlNarrative && (
        <div className="surface-card p-5">
          <h2 className="mb-2 text-sm font-medium text-foreground">{t("ceo.pnlCommentary")}</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{pnlNarrative}</div>
        </div>
      )}
    </div>
  );
}

function branchHref(locationId: string, canOccBranch: boolean, canBranches: boolean) {
  if (canOccBranch) return `/occ/branch/${locationId}`;
  if (canBranches) return "/branches";
  return undefined;
}

function Kpi({
  label,
  value,
  tint,
  href,
  viewLabel,
  ariaLabel,
}: {
  label: string;
  value: string;
  tint: KpiTint;
  href?: string;
  viewLabel?: string;
  ariaLabel?: string;
}) {
  return (
    <TintedKpiCard
      title={label}
      value={value}
      tint={tint}
      href={href}
      viewLabel={viewLabel}
      ariaLabel={ariaLabel}
    />
  );
}

function BranchHighlight({
  kicker,
  name,
  revenue,
  href,
  ariaLabel,
}: {
  kicker: string;
  name: string;
  revenue: string;
  href?: string;
  ariaLabel?: string;
}) {
  const inner = (
    <>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{kicker}</div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-foreground">{name}</div>
          <div className="text-sm text-muted-foreground">{revenue}</div>
        </div>
        {href ? <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden /> : null}
      </div>
    </>
  );

  if (!href) {
    return <div className="surface-card p-4">{inner}</div>;
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        "surface-card block p-4 transition-all hover:-translate-y-0.5 hover:shadow-elevated-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
      )}
    >
      {inner}
    </Link>
  );
}

export default Page;

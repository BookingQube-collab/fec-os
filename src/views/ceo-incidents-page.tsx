"use client";

import Link from "next/link";
import { AlertOctagon, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCeoIncidents24h } from "@/hooks/queries/useCeo";
import { usePermission } from "@/hooks/use-permission";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { incidentTypeLabel } from "@/lib/daily-ops/constants";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";

function severityVariant(severity: string): "destructive" | "secondary" | "outline" {
  if (severity === "critical" || severity === "high") return "destructive";
  return "secondary";
}

function Page() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useCeoIncidents24h();
  const canDailyOps = usePermission("daily_ops.view");
  const canOccBranch = usePermission("occ.view_branch");
  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ms-2">
        <Link href="/ceo">
          <ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" />
          {t("ceo.backToDashboard")}
        </Link>
      </Button>

      <PageHeader
        icon={AlertOctagon}
        kicker={t("ceo.kicker")}
        title={t("ceo.incidentsTitle")}
        subtitle={t("ceo.incidentsSubtitle")}
        actions={
          canDailyOps ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/daily-ops/incidents?hours=24">{t("ceo.openIncidentsLog")}</Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TintedKpiCard
          title={t("ceo.kpi.incidents")}
          value={isLoading ? "—" : String(rows.length)}
          tint={rows.length > 0 ? "orange" : "green"}
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("ceo.incidentsEmpty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">{t("ceo.colWhen")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colBranch")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colType")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colSeverity")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colSummary")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((incident) => (
                <tr key={incident.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {new Date(incident.occurred_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {canOccBranch ? (
                      <Link href={`/occ/branch/${incident.location_id}`} className="hover:underline">
                        {formatLocationLabel(incident.location_code, incident.location_name)}
                      </Link>
                    ) : (
                      <>
                        {formatLocationLabel(incident.location_code, incident.location_name)}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">{incidentTypeLabel(incident.category)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={severityVariant(incident.severity)}>{incident.severity}</Badge>
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate">{incident.summary}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{incident.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Page;

"use client";

import Link from "next/link";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCeoUrgentTickets } from "@/hooks/queries/useCeo";
import { usePermission } from "@/hooks/use-permission";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TintedKpiCard } from "@/components/dashboard/tinted-kpi-card";

function Page() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useCeoUrgentTickets();
  const canIssues = usePermission("issues.view");
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
        icon={AlertTriangle}
        kicker={t("ceo.kicker")}
        title={t("ceo.ticketsTitle")}
        subtitle={t("ceo.ticketsSubtitle")}
        actions={
          canIssues ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/issues?priority=urgent">{t("ceo.openFullTracker")}</Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TintedKpiCard
          title={t("ceo.kpi.tickets")}
          value={isLoading ? "—" : String(rows.length)}
          tint={rows.length > 0 ? "red" : "green"}
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("ceo.ticketsEmpty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">{t("ceo.colTitle")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colBranch")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colPriority")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colStatus")}</th>
                <th className="px-3 py-2 text-start">{t("ceo.colSla")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ticket) => (
                <tr key={ticket.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2">
                    {canIssues ? (
                      <Link href={`/issues/${ticket.id}`} className="font-medium text-foreground hover:underline">
                        {ticket.title}
                      </Link>
                    ) : (
                      <div className="font-medium text-foreground">{ticket.title}</div>
                    )}
                    {ticket.category ? (
                      <div className="text-[11px] text-muted-foreground">{ticket.category}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {ticket.location_name} · {ticket.location_code}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={ticket.priority === "urgent" ? "destructive" : "outline"}>
                      {ticket.priority}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{ticket.status.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString() : "—"}
                  </td>
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

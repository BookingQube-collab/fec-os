"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { MaintenanceRequestForm } from "@/components/maintenance/maintenance-request-form";
import { ManageLocationAreasDialog } from "@/components/maintenance/manage-location-areas-dialog";
import { DailyOpsPageShell } from "@/components/daily-ops/DailyOpsLayout";
import { useDailyOpsMaintenance } from "@/hooks/queries/useDailyOps";
import { useAuth } from "@/hooks/use-auth";
import { useSites } from "@/hooks/queries/useSites";
import { usePermission } from "@/hooks/use-permission";
import { useAppStore } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MaintenanceRow = {
  id: string;
  request_number: string;
  reported_at: string;
  area: string | null;
  category: string;
  description: string;
  priority: string;
  assigned_to: string | null;
  status: string;
  days_open: number;
  work_order_id: string | null;
};

function statusTone(status: string, daysOpen: number) {
  if (["completed", "cancelled"].includes(status)) return "text-emerald-600";
  if (daysOpen > 7 || status === "submitted") return "text-red-600";
  return "text-amber-600";
}

function DailyOpsMaintenancePage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const locationId = useAppStore((s) => s.currentLocationId);
  const canSubmit = usePermission("maintenance.request_submit");
  const canManage = usePermission("maintenance.manage");
  const { data, isLoading } = useDailyOpsMaintenance(locationId);
  const { data: sites } = useSites();
  const searchParams = useSearchParams();
  const priorityFilter = searchParams.get("priority");

  const rows = useMemo(() => {
    const list = (data ?? []) as MaintenanceRow[];
    if (!priorityFilter) return list;
    return list.filter((row) => row.priority === priorityFilter);
  }, [data, priorityFilter]);
  const reporterDefault = profile?.display_name ?? "";

  const formLabels = {
    branch: t("dailyOps.table.venue"),
    area: t("dailyOps.maintenance.area"),
    category: t("dailyOps.maintenance.category"),
    issueType: t("dailyOps.maintenance.issueType"),
    priority: t("dailyOps.maintenance.priority"),
    description: t("dailyOps.maintenance.description"),
    reporterName: t("dailyOps.maintenance.reporter"),
    dateTime: t("dailyOps.maintenance.dateTime"),
    assignTechnician: t("dailyOps.maintenance.assigned"),
    photos: t("dailyOps.maintenance.photos"),
    submit: t("dailyOps.maintenance.submit"),
    none: t("dailyOps.maintenance.none"),
    branchRequired: t("dailyOps.maintenance.branchRequired"),
    promptHint: t("dailyOps.maintenance.promptHint"),
    descriptionPlaceholder: t("dailyOps.maintenance.descriptionPlaceholder"),
    aiAssist: t("dailyOps.maintenance.aiAssist"),
    aiDrafted: t("dailyOps.maintenance.aiDrafted"),
    aiDraftedFallback: t("dailyOps.maintenance.aiDraftedFallback"),
    aiBadge: t("dailyOps.maintenance.aiBadge"),
    aiNeedsNotes: t("dailyOps.maintenance.aiNeedsNotes"),
    aiAssigneeAmbiguous: t("dailyOps.maintenance.aiAssigneeAmbiguous"),
    aiAssigneeRequested: t("dailyOps.maintenance.aiAssigneeRequested"),
    requestedTechnician: t("dailyOps.maintenance.requestedTechnician"),
    aiVenueMatched: t("dailyOps.maintenance.aiVenueMatched"),
    reviewDetails: t("dailyOps.maintenance.reviewDetails"),
    reviewHint: t("dailyOps.maintenance.reviewHint"),
    selectArea: t("dailyOps.maintenance.selectArea"),
    noAreasConfigured: t("dailyOps.maintenance.noAreasConfigured"),
    customCategory: t("dailyOps.maintenance.customCategory"),
    customIssueType: t("dailyOps.maintenance.customIssueType"),
    customArea: t("dailyOps.maintenance.customArea"),
    customCategoryPlaceholder: t("dailyOps.maintenance.customCategoryPlaceholder"),
    customIssueTypePlaceholder: t("dailyOps.maintenance.customIssueTypePlaceholder"),
    customAreaPlaceholder: t("dailyOps.maintenance.customAreaPlaceholder"),
    customCategoryRequired: t("dailyOps.maintenance.customCategoryRequired"),
    customIssueTypeRequired: t("dailyOps.maintenance.customIssueTypeRequired"),
    customAreaRequired: t("dailyOps.maintenance.customAreaRequired"),
    specifyOther: t("dailyOps.maintenance.specifyOther"),
    otherRequired: t("dailyOps.maintenance.otherRequired"),
    sampleIntro: t("dailyOps.maintenance.sampleIntro"),
    checkVenue: t("dailyOps.maintenance.checkVenue"),
    checkIssue: t("dailyOps.maintenance.checkIssue"),
    checkArea: t("dailyOps.maintenance.checkArea"),
    checkTechnician: t("dailyOps.maintenance.checkTechnician"),
    checkWhen: t("dailyOps.maintenance.checkWhen"),
    checkUrgency: t("dailyOps.maintenance.checkUrgency"),
    useSample: t("dailyOps.maintenance.useSample"),
    sampleParagraph: t("dailyOps.maintenance.sampleParagraph"),
  };

  return (
    <DailyOpsPageShell title={t("dailyOps.maintenance.title")} subtitle={t("dailyOps.maintenance.subtitle")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("dailyOps.maintenance.moduleHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <ManageLocationAreasDialog
              sites={sites ?? []}
              defaultLocationId={locationId ?? undefined}
            />
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/maintenance/requests">
              {t("dailyOps.maintenance.openModule")}
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">{t("dailyOps.maintenance.list")}</TabsTrigger>
          {canSubmit && <TabsTrigger value="new">{t("dailyOps.maintenance.new")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {priorityFilter === "urgent" ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="destructive">{t("dailyOps.maintenance.filterUrgent")}</Badge>
              <Link
                href="/daily-ops/maintenance"
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {t("dailyOps.maintenance.clearFilter")}
              </Link>
            </div>
          ) : null}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.loading")}</p>
          ) : !rows.length ? (
            <p className="text-sm text-muted-foreground">{t("dailyOps.maintenance.empty")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dailyOps.maintenance.requestNumber")}</TableHead>
                    <TableHead>{t("dailyOps.maintenance.reported")}</TableHead>
                    <TableHead>{t("dailyOps.maintenance.area")}</TableHead>
                    <TableHead>{t("dailyOps.maintenance.description")}</TableHead>
                    <TableHead>{t("dailyOps.maintenance.priority")}</TableHead>
                    <TableHead>{t("dailyOps.maintenance.assigned")}</TableHead>
                    <TableHead>{t("dailyOps.maintenance.status")}</TableHead>
                    <TableHead>{t("dailyOps.maintenance.daysOpen")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.request_number}</TableCell>
                      <TableCell>{new Date(row.reported_at).toLocaleString()}</TableCell>
                      <TableCell>{row.area ?? row.category}</TableCell>
                      <TableCell className="max-w-xs truncate">{row.description}</TableCell>
                      <TableCell>
                        <Badge variant={row.priority === "urgent" ? "destructive" : "secondary"} className="uppercase">
                          {row.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.assigned_to ?? "—"}</TableCell>
                      <TableCell className={statusTone(row.status, row.days_open)}>{row.status}</TableCell>
                      <TableCell className={row.days_open > 7 ? "text-red-600" : ""}>{row.days_open}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" asChild>
                          <Link href="/maintenance/requests">{t("dailyOps.maintenance.view")}</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {canSubmit && (
          <TabsContent value="new" className="mt-4">
            <MaintenanceRequestForm
              sites={sites ?? []}
              defaultLocationId={locationId ?? ""}
              defaultReporterName={reporterDefault}
              labels={formLabels}
              invalidateDailyOps
            />
          </TabsContent>
        )}
      </Tabs>
    </DailyOpsPageShell>
  );
}

export default DailyOpsMaintenancePage;

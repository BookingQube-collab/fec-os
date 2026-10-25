"use client";

/* Hallmark · redesign: Workbench (app) · preserve FEC-OS shell / HR tokens
 * tone: utilitarian ops inbox · charts via existing recharts + ChartCard
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Lightbulb } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { SuggestionsDashboardCharts } from "@/components/hr/suggestions-dashboard-charts";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { HrPanel } from "@/components/hr/hr-panel";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { FecSearch, FecStatCard } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { useSites } from "@/hooks/queries/useSites";
import { useAuth } from "@/hooks/use-auth";
import { formatWorkDateDdMmYyyy } from "@/lib/attendance-display";
import {
  canReviewStaffSuggestions,
  filterSuggestionInbox,
  SUGGESTION_CATEGORIES,
  suggestionCategoryBreakdown,
  suggestionStatusBreakdown,
  suggestionVolumeSeries,
  summarizeSuggestionStatuses,
  type SuggestionCategory,
  type SuggestionStatus,
} from "@/lib/hr-suggestions";
import { listSuggestionInbox, updateSuggestionStatus } from "@/lib/hr-suggestions.functions";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { AppRole } from "@/lib/rbac";
import { cn } from "@/lib/utils";

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function excerpt(text: string, max = 96): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export default function HrSuggestionsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { roles, profile } = useAuth();
  const roleList = roles.map((role) => role.role as AppRole);
  const canReview = canReviewStaffSuggestions(roleList, {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  });

  const [status, setStatus] = useState<SuggestionStatus | "all">("all");
  const [category, setCategory] = useState<SuggestionCategory | "all">("all");
  const [locationId, setLocationId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const { data: sites } = useSites({ enabled: canReview });

  const list = useQuery({
    queryKey: queryKeys.people.hrSuggestions({ inbox: true }),
    queryFn: () => listSuggestionInbox({}),
    staleTime: STALE.people,
    enabled: canReview,
  });

  const filtered = useMemo(
    () =>
      filterSuggestionInbox(list.data ?? [], {
        status,
        category,
        locationId,
        dateFrom,
        dateTo,
        search,
      }),
    [list.data, status, category, locationId, dateFrom, dateTo, search],
  );

  const counts = useMemo(() => summarizeSuggestionStatuses(filtered), [filtered]);
  const today = qatarToday();
  const volume = useMemo(() => suggestionVolumeSeries(filtered, today, 30), [filtered, today]);
  const byCategory = useMemo(
    () =>
      suggestionCategoryBreakdown(filtered, (key) =>
        key === "uncategorized"
          ? t("hr.suggestions.category.uncategorized")
          : t(`hr.suggestions.category.${key}`),
      ),
    [filtered, t],
  );
  const byStatus = useMemo(
    () =>
      suggestionStatusBreakdown(filtered, (key) => t(`hr.suggestions.status.${key}`)),
    [filtered, t],
  );

  const hasActiveFilters =
    status !== "all" ||
    category !== "all" ||
    locationId !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(search.trim());

  const clearFilters = () => {
    setStatus("all");
    setCategory("all");
    setLocationId("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  const update = useMutation({
    mutationFn: updateSuggestionStatus,
    onSuccess: () => {
      toast.success(t("hr.suggestions.updated"));
      void qc.invalidateQueries({ queryKey: queryKeys.people.hrSuggestions() });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CapabilityGate
      capability="admin.view"
      alsoAllow={canReview}
      fallback={
        <HrShell>
          <HrPanel>
            <HrEmptyState message={t("hr.suggestions.noAccess")} />
          </HrPanel>
        </HrShell>
      }
    >
      <HrShell>
        <HrSection
          icon={Lightbulb}
          kicker={t("hr.suggestions.kicker")}
          title={t("hr.suggestions.title")}
          subtitle={t("hr.suggestions.subtitle")}
        >
          <HrPanel delay={0}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 xl:grid-cols-6">
              <div className="sm:col-span-2 xl:col-span-2">
                <Label htmlFor="suggestion-search">{t("hr.suggestions.filterSearch")}</Label>
                <FecSearch
                  id="suggestion-search"
                  className="mt-1.5"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("hr.suggestions.filterSearchPlaceholder")}
                  aria-label={t("hr.suggestions.filterSearch")}
                />
              </div>
              <div>
                <Label>{t("hr.suggestions.filterStatus")}</Label>
                <SearchableSelect
                  className="mt-1.5"
                  value={status}
                  onValueChange={(value) => setStatus(value as SuggestionStatus | "all")}
                  aria-label={t("hr.suggestions.filterStatus")}
                  options={[
                    { value: "all", label: t("hr.suggestions.filterAll") },
                    { value: "new", label: t("hr.suggestions.status.new") },
                    { value: "seen", label: t("hr.suggestions.status.seen") },
                    { value: "closed", label: t("hr.suggestions.status.closed") },
                  ]}
                />
              </div>
              <div>
                <Label>{t("hr.suggestions.filterCategory")}</Label>
                <SearchableSelect
                  className="mt-1.5"
                  value={category}
                  onValueChange={(value) => setCategory(value as SuggestionCategory | "all")}
                  aria-label={t("hr.suggestions.filterCategory")}
                  options={[
                    { value: "all", label: t("hr.suggestions.filterAll") },
                    ...SUGGESTION_CATEGORIES.map((key) => ({
                      value: key,
                      label: t(`hr.suggestions.category.${key}`),
                    })),
                  ]}
                />
              </div>
              <div>
                <Label>{t("common.site")}</Label>
                <SearchableSelect
                  className="mt-1.5"
                  value={locationId}
                  onValueChange={setLocationId}
                  aria-label={t("common.site")}
                  options={[
                    { value: "all", label: t("common.allBranches") },
                    ...(sites ?? []).map((site) => ({
                      value: site.id,
                      label: formatLocationLabel(site.code, site.name),
                    })),
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2 xl:col-span-1 xl:grid-cols-1 xl:gap-0">
                <div>
                  <Label htmlFor="suggestion-date-from">{t("hr.suggestions.filterDateFrom")}</Label>
                  <Input
                    id="suggestion-date-from"
                    className="mt-1.5"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="xl:mt-2">
                  <Label htmlFor="suggestion-date-to">{t("hr.suggestions.filterDateTo")}</Label>
                  <Input
                    id="suggestion-date-to"
                    className="mt-1.5"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
              {hasActiveFilters ? (
                <div className="flex items-end sm:col-span-2 xl:col-span-6">
                  <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                    {t("hr.suggestions.clearFilters")}
                  </Button>
                </div>
              ) : null}
            </div>
          </HrPanel>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FecStatCard
              title={t("hr.suggestions.kpi.total")}
              value={counts.total}
              tint="slate"
              compact
            />
            <FecStatCard
              title={t("hr.suggestions.status.new")}
              value={counts.new}
              tint={counts.new > 0 ? "amber" : "slate"}
              compact
            />
            <FecStatCard
              title={t("hr.suggestions.status.seen")}
              value={counts.seen}
              tint="sky"
              compact
            />
            <FecStatCard
              title={t("hr.suggestions.status.closed")}
              value={counts.closed}
              tint="green"
              compact
            />
          </div>

          <SuggestionsDashboardCharts volume={volume} byCategory={byCategory} byStatus={byStatus} />

          <HrPanel delay={1}>
            <div className="overflow-x-auto p-2 sm:p-3">
              {(filtered.length === 0 && !list.isLoading) || list.isError ? (
                <div className="p-4 sm:p-5">
                  <HrEmptyState
                    message={
                      list.isError
                        ? t("hr.suggestions.loadError")
                        : hasActiveFilters
                          ? t("hr.suggestions.emptyFiltered")
                          : t("hr.suggestions.empty")
                    }
                    icon={Lightbulb}
                  />
                </div>
              ) : (
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-xs text-muted-foreground">
                      <th className="w-10 px-2 py-2 font-medium" />
                      <th className="px-2 py-2 font-medium">{t("hr.suggestions.col.title")}</th>
                      <th className="px-2 py-2 font-medium">{t("hr.suggestions.col.staff")}</th>
                      <th className="hidden px-2 py-2 font-medium md:table-cell">
                        {t("common.site")}
                      </th>
                      <th className="px-2 py-2 font-medium">{t("hr.suggestions.col.date")}</th>
                      <th className="px-2 py-2 font-medium">{t("hr.suggestions.filterCategory")}</th>
                      <th className="px-2 py-2 font-medium">{t("hr.suggestions.filterStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const expanded = expandedId === row.id;
                      const siteLabel =
                        row.locationCode || row.locationName
                          ? formatLocationLabel(row.locationCode, row.locationName)
                          : "—";
                      return (
                        <Fragment key={row.id}>
                          <tr
                            className={cn(
                              "border-b border-border/70 align-top",
                              expanded && "bg-secondary/25",
                            )}
                          >
                            <td className="px-1 py-2">
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                                aria-expanded={expanded}
                                aria-label={
                                  expanded
                                    ? t("hr.suggestions.hideDetails")
                                    : t("hr.suggestions.showDetails")
                                }
                                onClick={() => setExpandedId(expanded ? null : row.id)}
                              >
                                {expanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                            <td className="px-2 py-2">
                              <p className="font-medium tracking-tight">{row.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {excerpt(row.body)}
                              </p>
                            </td>
                            <td className="px-2 py-2">
                              <p className="font-medium">{row.staffName ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">
                                {[row.employeeCode, row.jobTitle].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </td>
                            <td className="hidden px-2 py-2 text-xs text-muted-foreground md:table-cell">
                              {siteLabel}
                            </td>
                            <td className="px-2 py-2 text-xs tabular-nums text-muted-foreground">
                              {formatWorkDateDdMmYyyy(row.createdAt.slice(0, 10))}
                            </td>
                            <td className="px-2 py-2">
                              {row.category ? (
                                <Badge variant="outline">
                                  {t(`hr.suggestions.category.${row.category}`)}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <Badge variant={row.status === "new" ? "success" : "muted"}>
                                {t(`hr.suggestions.status.${row.status}`)}
                              </Badge>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="border-b border-border bg-secondary/15">
                              <td colSpan={7} className="px-3 py-3 sm:px-4">
                                <div className="space-y-3">
                                  <p className="whitespace-pre-wrap text-sm">{row.body}</p>
                                  <p className="text-xs text-muted-foreground md:hidden">
                                    {t("common.site")}: {siteLabel}
                                  </p>
                                  <div className="space-y-2">
                                    <Label htmlFor={`suggestion-note-${row.id}`}>
                                      {t("hr.suggestions.note")}
                                    </Label>
                                    <Textarea
                                      id={`suggestion-note-${row.id}`}
                                      rows={2}
                                      value={noteDrafts[row.id] ?? row.adminNote ?? ""}
                                      onChange={(e) =>
                                        setNoteDrafts((prev) => ({
                                          ...prev,
                                          [row.id]: e.target.value,
                                        }))
                                      }
                                      placeholder={t("hr.suggestions.notePlaceholder")}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      {row.status === "new" ? (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          disabled={update.isPending}
                                          onClick={() =>
                                            update.mutate({
                                              id: row.id,
                                              status: "seen",
                                              adminNote:
                                                (noteDrafts[row.id] ?? row.adminNote ?? "").trim() ||
                                                null,
                                            })
                                          }
                                        >
                                          {t("hr.suggestions.markSeen")}
                                        </Button>
                                      ) : null}
                                      {row.status !== "closed" ? (
                                        <Button
                                          size="sm"
                                          disabled={update.isPending}
                                          onClick={() =>
                                            update.mutate({
                                              id: row.id,
                                              status: "closed",
                                              adminNote:
                                                (noteDrafts[row.id] ?? row.adminNote ?? "").trim() ||
                                                null,
                                            })
                                          }
                                        >
                                          {t("hr.suggestions.close")}
                                        </Button>
                                      ) : null}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={update.isPending}
                                        onClick={() =>
                                          update.mutate({
                                            id: row.id,
                                            status: row.status,
                                            adminNote: (noteDrafts[row.id] ?? "").trim() || null,
                                          })
                                        }
                                      >
                                        {t("hr.suggestions.saveNote")}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </HrPanel>
        </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

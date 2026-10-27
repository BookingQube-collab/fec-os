"use client";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  approvedHistoryHasActiveFilters,
  EMPTY_APPROVED_HISTORY_FILTERS,
  type ApprovedHistoryFilters,
  type ApprovedHistoryStatusFilter,
} from "@/lib/attendance-hr/missed-punch-approved-history";

const ALL = "__all__";

export function MissedPunchApprovedHistoryFilters({
  filters,
  onChange,
  departments,
  locations,
  resultCount,
}: {
  filters: ApprovedHistoryFilters;
  onChange: (next: ApprovedHistoryFilters) => void;
  departments: string[];
  locations: Array<{ id: string; label: string }>;
  resultCount: number;
}) {
  const { t } = useTranslation();
  const stepLabel = (step: string) => t(`hr.me.step.${step}`);
  const active = approvedHistoryHasActiveFilters(filters);

  function patch(partial: Partial<ApprovedHistoryFilters>) {
    onChange({ ...filters, ...partial });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t("common.filters")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("hr.me.approvedHistory.filterHint", { count: resultCount })}
          </p>
        </div>
        {active ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-9"
            onClick={() => onChange({ ...EMPTY_APPROVED_HISTORY_FILTERS })}
          >
            {t("common.clear")}
          </Button>
        ) : null}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-3 overflow-x-clip sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div className="min-w-0 space-y-1 sm:col-span-2 lg:col-span-1 xl:col-span-2">
          <Label className="text-xs" htmlFor="approved-history-search">
            {t("hr.me.approvedHistory.staffSearch")}
          </Label>
          <Input
            id="approved-history-search"
            value={filters.staffQuery}
            onChange={(event) => patch({ staffQuery: event.target.value })}
            placeholder={t("hr.me.approvedHistory.staffSearchPlaceholder")}
            className="min-h-11"
          />
        </div>

        <div className="min-w-0 space-y-1">
          <Label className="text-xs" htmlFor="approved-history-from">
            {t("hr.me.approvedHistory.dateFrom")}
          </Label>
          <Input
            id="approved-history-from"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => patch({ dateFrom: event.target.value })}
            className="min-h-11"
          />
        </div>

        <div className="min-w-0 space-y-1">
          <Label className="text-xs" htmlFor="approved-history-to">
            {t("hr.me.approvedHistory.dateTo")}
          </Label>
          <Input
            id="approved-history-to"
            type="date"
            value={filters.dateTo}
            onChange={(event) => patch({ dateTo: event.target.value })}
            className="min-h-11"
          />
        </div>

        <div className="min-w-0 space-y-1">
          <Label className="text-xs">{t("common.site")}</Label>
          <Select
            value={filters.locationId || ALL}
            onValueChange={(value) => patch({ locationId: value === ALL ? "" : value })}
          >
            <SelectTrigger aria-label={t("common.site")}>
              <SelectValue placeholder={t("common.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("common.all")}</SelectItem>
              {locations.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t("common.department")}</Label>
          <Select
            value={filters.department || ALL}
            onValueChange={(value) => patch({ department: value === ALL ? "" : value })}
          >
            <SelectTrigger aria-label={t("common.department")}>
              <SelectValue placeholder={t("common.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("common.all")}</SelectItem>
              {departments.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t("common.status")}</Label>
          <Select
            value={filters.status}
            onValueChange={(value) => patch({ status: value as ApprovedHistoryStatusFilter })}
          >
            <SelectTrigger aria-label={t("common.status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="approved">{t("hr.me.punchApproved")}</SelectItem>
              <SelectItem value="in_progress">{t("hr.me.approvedHistory.statusInProgress")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t("hr.me.approvedHistory.approverSeat")}</Label>
          <Select
            value={filters.stepRole || ALL}
            onValueChange={(value) => patch({ stepRole: value === ALL ? "" : value })}
          >
            <SelectTrigger aria-label={t("hr.me.approvedHistory.approverSeat")}>
              <SelectValue placeholder={t("common.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("common.all")}</SelectItem>
              <SelectItem value="manager">{stepLabel("manager")}</SelectItem>
              <SelectItem value="ops">{stepLabel("ops")}</SelectItem>
              <SelectItem value="hr">{stepLabel("hr")}</SelectItem>
              <SelectItem value="gm">{stepLabel("gm")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

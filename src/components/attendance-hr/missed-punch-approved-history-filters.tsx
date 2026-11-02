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

const CORRECTION_STEP_ROLES = ["manager", "ops", "hr", "gm"] as const;
const LEAVE_STEP_ROLES = ["manager", "site", "ops", "hr"] as const;

export function MissedPunchApprovedHistoryFilters({
  filters,
  onChange,
  departments,
  locations,
  resultCount,
  /** Correction (default) vs leave copy + seat options. */
  variant = "correction",
  idPrefix = "approved-history",
}: {
  filters: ApprovedHistoryFilters;
  onChange: (next: ApprovedHistoryFilters) => void;
  departments: string[];
  locations: Array<{ id: string; label: string }>;
  resultCount: number;
  variant?: "correction" | "leave";
  idPrefix?: string;
}) {
  const { t } = useTranslation();
  const copyKey = variant === "leave" ? "hr.me.leaveApprovedHistory" : "hr.me.approvedHistory";
  const stepRoles = variant === "leave" ? LEAVE_STEP_ROLES : CORRECTION_STEP_ROLES;
  const stepLabel = (step: string) =>
    variant === "leave"
      ? t(`hr.leave.steps.${step}`, { defaultValue: t(`hr.me.step.${step}`, { defaultValue: step }) })
      : t(`hr.me.step.${step}`);
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
            {t(`${copyKey}.filterHint`, {
              count: resultCount,
              defaultValue: t("hr.me.approvedHistory.filterHint", { count: resultCount }),
            })}
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
          <Label className="text-xs" htmlFor={`${idPrefix}-search`}>
            {t(`${copyKey}.staffSearch`, { defaultValue: t("hr.me.approvedHistory.staffSearch") })}
          </Label>
          <Input
            id={`${idPrefix}-search`}
            value={filters.staffQuery}
            onChange={(event) => patch({ staffQuery: event.target.value })}
            placeholder={t(`${copyKey}.staffSearchPlaceholder`, {
              defaultValue: t("hr.me.approvedHistory.staffSearchPlaceholder"),
            })}
            className="min-h-11"
          />
        </div>

        <div className="min-w-0 space-y-1">
          <Label className="text-xs" htmlFor={`${idPrefix}-from`}>
            {t(`${copyKey}.dateFrom`, { defaultValue: t("hr.me.approvedHistory.dateFrom") })}
          </Label>
          <Input
            id={`${idPrefix}-from`}
            type="date"
            value={filters.dateFrom}
            onChange={(event) => patch({ dateFrom: event.target.value })}
            className="min-h-11"
          />
        </div>

        <div className="min-w-0 space-y-1">
          <Label className="text-xs" htmlFor={`${idPrefix}-to`}>
            {t(`${copyKey}.dateTo`, { defaultValue: t("hr.me.approvedHistory.dateTo") })}
          </Label>
          <Input
            id={`${idPrefix}-to`}
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
              <SelectItem value="approved">
                {variant === "leave"
                  ? t("hr.leave.status.approved")
                  : t("hr.me.punchApproved")}
              </SelectItem>
              <SelectItem value="in_progress">
                {t(`${copyKey}.statusInProgress`, {
                  defaultValue: t("hr.me.approvedHistory.statusInProgress"),
                })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">
            {t(`${copyKey}.approverSeat`, { defaultValue: t("hr.me.approvedHistory.approverSeat") })}
          </Label>
          <Select
            value={filters.stepRole || ALL}
            onValueChange={(value) => patch({ stepRole: value === ALL ? "" : value })}
          >
            <SelectTrigger
              aria-label={t(`${copyKey}.approverSeat`, {
                defaultValue: t("hr.me.approvedHistory.approverSeat"),
              })}
            >
              <SelectValue placeholder={t("common.all")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("common.all")}</SelectItem>
              {stepRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {stepLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

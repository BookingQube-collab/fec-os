"use client";

import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecPageHeader } from "@/components/fec";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HrEmptyState } from "@/components/hr/hr-empty-state";
import { listMonthlyRosterHistory } from "@/lib/attendance-hr/roster-history.functions";
import { defaultPayrollPeriod, formatPayrollRange, monthBounds } from "@/lib/attendance-hr/roster-period";
import { useSites } from "@/hooks/queries/useSites";
import { formatLocationRecord } from "@/lib/locations/normalize";
import { QUERY_DEFAULTS } from "@/lib/query-client";

function historyKindLabel(
  kind: string,
  t: (key: string) => string,
): string {
  if (kind === "first_plan") return t("people.rosterHistory.kindFirstPlan");
  if (kind === "reupload") return t("people.rosterHistory.kindReupload");
  return t("people.rosterHistory.kindAmendment");
}

function historyKindVariant(kind: string): "default" | "secondary" | "outline" {
  if (kind === "first_plan") return "default";
  if (kind === "reupload") return "outline";
  return "secondary";
}

export default function RosterHistoryPage() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultMonth = defaultPayrollPeriod(today).month;
  const [month, setMonth] = useState(defaultMonth);
  const [locationId, setLocationId] = useState<string>("");
  const [staffSearch, setStaffSearch] = useState("");
  const { data: sites = [] } = useSites();

  const range = useMemo(() => {
    const { dateFrom, dateTo } = monthBounds(month);
    return formatPayrollRange(dateFrom, dateTo, i18n.language);
  }, [month, i18n.language]);

  const historyQuery = useQuery({
    queryKey: ["roster-history", month, locationId || null, staffSearch.trim() || null],
    queryFn: () =>
      listMonthlyRosterHistory({
        month,
        locationId: locationId || null,
        staffSearch: staffSearch.trim() || null,
      }),
    staleTime: QUERY_DEFAULTS.staleTime,
  });

  const locationOptions = useMemo(
    () => [
      { value: "", label: t("people.rosterHistory.allLocations") },
      ...sites.map((s) => ({
        value: s.id,
        label: formatLocationRecord(s).label,
      })),
    ],
    [sites, t],
  );

  const rows = historyQuery.data?.rows ?? [];

  return (
    <CapabilityGate capability="people.roster_history" fallback={<HrEmptyState message={t("people.rosterHistory.noAccess")} />}>
      <div className="space-y-6">
        <FecPageHeader
          kicker={t("people.rosterHistory.kicker")}
          title={t("people.rosterHistory.title")}
          subtitle={t("people.rosterHistory.subtitle")}
          icon={History}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="roster-history-month">{t("people.rosterHistory.month")}</Label>
            <Input
              id="roster-history-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value.slice(0, 7))}
            />
            <p className="text-xs text-muted-foreground">{range}</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("people.rosterHistory.location")}</Label>
            <SearchableSelect
              value={locationId}
              onValueChange={setLocationId}
              options={locationOptions}
              placeholder={t("people.rosterHistory.allLocations")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="roster-history-staff">{t("people.rosterHistory.staffSearch")}</Label>
            <Input
              id="roster-history-staff"
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              placeholder={t("people.rosterHistory.staffSearchPlaceholder")}
            />
          </div>
        </div>

        {historyQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("people.rosterHistory.loading")}</p>
        ) : historyQuery.isError ? (
          <HrEmptyState message={t("people.rosterHistory.loadFailed")} />
        ) : rows.length === 0 ? (
          <HrEmptyState message={t("people.rosterHistory.empty")} icon={History} />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("people.rosterHistory.colWhen")}</TableHead>
                  <TableHead>{t("people.rosterHistory.colKind")}</TableHead>
                  <TableHead>{t("people.rosterHistory.colWho")}</TableHead>
                  <TableHead>{t("people.rosterHistory.colLocation")}</TableHead>
                  <TableHead>{t("people.rosterHistory.colStaff")}</TableHead>
                  <TableHead>{t("people.rosterHistory.colSummary")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(row.createdAt).toLocaleString(i18n.language)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={historyKindVariant(row.changeKind)}>{historyKindLabel(row.changeKind, t)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.actorName ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {row.locationCode ?? row.locationName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.staffName
                        ? `${row.staffName}${row.employeeCode ? ` · ${row.employeeCode}` : ""}`
                        : row.workDate ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.summary}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </CapabilityGate>
  );
}

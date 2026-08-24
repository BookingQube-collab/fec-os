"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, TrendingDown, TrendingUp, Trophy } from "lucide-react";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listStaffScoreboard } from "@/lib/performance.functions";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";

function ratingTone(band: string | null | undefined) {
  if (band === "excellent" || band === "good") return "rag-green";
  if (band === "needs_attention") return "rag-amber";
  return "rag-red";
}

export default function PerformanceScoreboardPage() {
  const { t } = useTranslation();
  const locationId = useAppStore((s) => s.currentLocationId);
  const [q, setQ] = useState("");

  const boardQ = useQuery({
    queryKey: queryKeys.performance.scoreboard(locationId ?? null),
    queryFn: () => listStaffScoreboard({ locationId: locationId ?? null }),
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const list = boardQ.data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((row) =>
      [row.fullName, row.employeeCode, row.department, row.jobTitle, row.locationName, row.locationCode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [boardQ.data?.rows, q]);

  return (
    <CapabilityGate
      capability="performance.view"
      fallback={<p className="text-sm text-muted-foreground">{t("performance.scoreboard.noAccess")}</p>}
    >
      <div className="space-y-6">
        <PageHeader
          icon={Trophy}
          kicker="People & HR"
          title={t("performance.scoreboard.title")}
          subtitle={t("performance.scoreboard.subtitle", {
            cycle: boardQ.data?.cycle?.name ?? "—",
          })}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/people/performance">{t("nav.performance")}</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/leaderboard">{t("nav.leaderboard")}</Link>
              </Button>
            </div>
          }
        />

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("performance.scoreboard.search")}
          className="max-w-sm"
        />

        <div className="overflow-x-auto surface-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("performance.fields.staff")}</TableHead>
                <TableHead>{t("performance.scoreboard.location")}</TableHead>
                <TableHead>{t("performance.scoreboard.department")}</TableHead>
                <TableHead className="text-right">{t("performance.fields.score")}</TableHead>
                <TableHead>{t("performance.fields.rating")}</TableHead>
                <TableHead>{t("performance.scoreboard.trend")}</TableHead>
                <TableHead>{t("performance.fields.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {boardQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {t("common.loading")}
                  </TableCell>
                </TableRow>
              )}
              {boardQ.isError && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <p className="text-sm font-medium text-destructive">
                      {t("performance.scoreboard.loadError")}
                    </p>
                    {boardQ.error instanceof Error && boardQ.error.message ? (
                      <p className="mt-2 text-xs text-muted-foreground">{boardQ.error.message}</p>
                    ) : null}
                  </TableCell>
                </TableRow>
              )}
              {!boardQ.isLoading &&
                !boardQ.isError &&
                rows.map((row) => (
                  <TableRow key={row.staffId}>
                    <TableCell>
                      <div className="font-medium">{row.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.employeeCode}
                        {row.jobTitle ? ` · ${row.jobTitle}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>{row.locationName ?? row.locationCode ?? "—"}</TableCell>
                    <TableCell>{row.department ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.score != null ? row.score.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell>
                      {row.ratingBand ? (
                        <Badge className={ratingTone(row.ratingBand)} variant="outline">
                          {t(`performance.rating.${row.ratingBand}`, { defaultValue: row.ratingBand })}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <TrendCell trend={row.trend} previous={row.previousScore} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.evaluationStatus ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/people/performance/staff/${row.staffId}`}>
                          {t("performance.profile.open")}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              {!boardQ.isLoading && !boardQ.isError && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    {t("performance.scoreboard.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </CapabilityGate>
  );
}

function TrendCell({ trend, previous }: { trend: "up" | "down" | "flat" | "new"; previous: number | null }) {
  const { t } = useTranslation();
  if (trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600">
        <TrendingUp className="h-3.5 w-3.5" />
        {t("performance.scoreboard.trendUp")}
        {previous != null ? <span className="text-xs text-muted-foreground">({previous.toFixed(1)})</span> : null}
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-red-600">
        <TrendingDown className="h-3.5 w-3.5" />
        {t("performance.scoreboard.trendDown")}
        {previous != null ? <span className="text-xs text-muted-foreground">({previous.toFixed(1)})</span> : null}
      </span>
    );
  }
  if (trend === "flat") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3.5 w-3.5" />
        {t("performance.scoreboard.trendFlat")}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{t("performance.scoreboard.trendNew")}</span>;
}

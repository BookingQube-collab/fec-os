"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmployeePerformanceProfile } from "@/lib/performance.functions";
import { queryKeys } from "@/lib/query-keys";

export default function PerformanceStaffProfilePage() {
  const { t } = useTranslation();
  const params = useParams<{ staffId: string }>();
  const staffId = params.staffId;

  const profileQ = useQuery({
    queryKey: queryKeys.performance.profile(staffId),
    queryFn: () => getEmployeePerformanceProfile({ staffId }),
    enabled: !!staffId,
  });

  if (profileQ.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!profileQ.data) {
    return <p className="text-sm text-muted-foreground">{t("performance.profile.notFound")}</p>;
  }

  const { staff, kras, kpis, evaluation, achievements, awards } = profileQ.data;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/people/performance">
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t("performance.back")}
        </Link>
      </Button>

      <header>
        <h1 className="text-xl font-semibold">{staff.full_name}</h1>
        <p className="text-xs text-muted-foreground">
          {staff.employee_code} · {staff.job_title ?? "—"} · {staff.department ?? "—"} · {staff.status}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{t("performance.fields.status")}</div>
          <div className="mt-1 font-semibold">{evaluation?.status ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{t("performance.fields.score")}</div>
          <div className="mt-1 text-2xl font-semibold">
            {evaluation?.total_score != null ? Number(evaluation.total_score).toFixed(1) : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{t("performance.fields.rating")}</div>
          <div className="mt-1 font-semibold">{evaluation?.rating_band ?? "—"}</div>
        </div>
      </div>

      {evaluation?.id && (
        <Button size="sm" asChild>
          <Link href={`/people/performance/evaluations/${evaluation.id}`}>
            {t("performance.evaluations.open")}
          </Link>
        </Button>
      )}

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          {t("performance.profile.assignedKras")}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("performance.fields.title")}</TableHead>
              <TableHead className="text-right">{t("performance.fields.weight")}</TableHead>
              <TableHead>{t("performance.fields.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kras.map((k) => (
              <TableRow key={k.id}>
                <TableCell>{k.title}</TableCell>
                <TableCell className="text-right">{k.weight_pct}%</TableCell>
                <TableCell>{k.status}</TableCell>
              </TableRow>
            ))}
            {!kras.length && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {t("performance.evaluations.noKras")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          {t("performance.profile.assignedKpis")}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("performance.fields.kpi")}</TableHead>
              <TableHead className="text-right">{t("performance.fields.target")}</TableHead>
              <TableHead className="text-right">{t("performance.fields.weight")}</TableHead>
              <TableHead>{t("performance.fields.source")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.map((k) => (
              <TableRow key={k.id}>
                <TableCell>{k.label}</TableCell>
                <TableCell className="text-right">
                  {k.target_value ?? "—"}
                  {k.unit ? ` ${k.unit}` : ""}
                </TableCell>
                <TableCell className="text-right">{k.weight_pct}%</TableCell>
                <TableCell>
                  <Badge variant="outline">{k.data_source}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {!kpis.length && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {t("performance.evaluations.noKpis")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          {t("performance.tabs.achievements")}
        </div>
        <ul className="space-y-2 p-4 text-sm">
          {achievements.map((a) => (
            <li key={a.id} className="rounded-md border border-border px-3 py-2">
              <div className="font-medium">{a.title}</div>
              <div className="text-xs text-muted-foreground">
                {a.achieved_on} · {a.category}
              </div>
            </li>
          ))}
          {!achievements.length && (
            <li className="text-muted-foreground">{t("performance.achievements.empty")}</li>
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-medium">
          {t("performance.profile.awards")}
        </div>
        <ul className="space-y-2 p-4 text-sm">
          {awards.map((a) => (
            <li key={a.id} className="rounded-md border border-border px-3 py-2">
              <div className="font-medium">{a.title}</div>
              <div className="text-xs text-muted-foreground">
                {a.award_month} · {a.award_type}
              </div>
            </li>
          ))}
          {!awards.length && (
            <li className="text-muted-foreground">{t("performance.profile.noAwards")}</li>
          )}
        </ul>
      </section>
    </div>
  );
}

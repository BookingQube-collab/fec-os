"use client";

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FecButton as Button, FecPageHeader } from "@/components/fec";
import { readTrainingDashboard } from "@/lib/training/reports.functions";
import { listSessionFormOptions } from "@/lib/training/sessions.functions";
import { TrainingSectionNav } from "@/views/training-section-nav";

type Stats = {
  activeCourses: number;
  learners: number;
  completionRate: number | null;
  overdue: number;
  certificatesIssued: number;
  certificatesExpiring: number;
  averageScore: number | null;
  failedAssessments: number;
  trainingHours: number;
  upcomingSessions: number;
  complianceGaps: number;
};

const KEYS = [
  "activeCourses",
  "learners",
  "completionRate",
  "overdue",
  "certificatesIssued",
  "certificatesExpiring",
  "averageScore",
  "failedAssessments",
  "trainingHours",
  "upcomingSessions",
  "complianceGaps",
] as const;

export default function TrainingReportsPage() {
  const { t } = useTranslation();
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const options = await listSessionFormOptions({});
      if (options.ok) {
        setLocations(options.data.locations);
        setDepartments(options.data.departments);
      }
    })();
  }, []);

  async function load() {
    const result = await readTrainingDashboard({
      locationId: locationId || null,
      departmentId: departmentId || null,
    });
    if (!result.ok) {
      setError(result.error);
      setStats(null);
      return;
    }
    setError(null);
    setStats(result.data);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <FecPageHeader icon={BarChart3} title={t("trainingReports.title")} subtitle={t("trainingReports.subtitle")} />
      <TrainingSectionNav />
      <form
        className="grid gap-3 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <select className="min-h-12 rounded-md border border-input bg-background px-3" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">{t("trainingReports.site")}</option>
          {locations.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <select className="min-h-12 rounded-md border border-input bg-background px-3" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
          <option value="">{t("trainingReports.department")}</option>
          {departments.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <Button type="submit" className="min-h-12">{t("trainingReports.apply")}</Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KEYS.map((key) => (
            <article key={key} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t(`trainingReports.metrics.${key}`)}</p>
              <p className="mt-2 text-2xl font-medium">{stats[key] == null ? "—" : String(stats[key])}</p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

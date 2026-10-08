"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecEmptyState, FecPageHeader } from "@/components/fec";
import { listMyLearning } from "@/lib/training/learning.functions";
import { enrollmentIsCompleted, groupLearning } from "@/lib/training/engine";
import { TrainingSectionNav } from "@/views/training-section-nav";

type CourseRow = {
  id: string;
  title: string;
  code: string;
  status: string;
  dueOn: string | null;
  completedAt: string | null;
  startedAt: string | null;
  required: boolean;
  pathId: string | null;
  progressPercent: number;
};

type CertificateRow = {
  id: string;
  courseTitle: string;
  status: string;
  issuedAt: string;
  validUntil: string | null;
};

type PathRow = { id: string; title: string; status: string };

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function CourseCard({ course }: { course: CourseRow }) {
  const { t } = useTranslation();
  const done = enrollmentIsCompleted({ status: course.status, completedAt: course.completedAt });
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-medium">{course.title}</h3>
      <p className="text-sm text-muted-foreground">{course.code}</p>
      <p className="mt-2 text-sm">
        {course.required ? t("trainingLearning.mandatory") : t("trainingLearning.optional")}
        {" · "}
        {t("trainingLearning.progress", { percent: course.progressPercent })}
        {" · "}
        {course.dueOn ? t("trainingLearning.due", { date: course.dueOn }) : t("trainingLearning.noDue")}
      </p>
      <Link className="mt-3 inline-block text-sm underline-offset-4 hover:underline" href={`/training/learning/${course.id}`}>
        {done ? t("trainingLearning.view") : t("trainingLearning.continue")}
      </Link>
    </article>
  );
}

export default function TrainingLearningPage() {
  const { t } = useTranslation();
  const [staffId, setStaffId] = useState<string | null | undefined>(undefined);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [paths, setPaths] = useState<PathRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await listMyLearning({});
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStaffId(result.data.staffId);
      setCourses(result.data.courses);
      setCertificates(result.data.certificates);
      setPaths(result.data.paths);
    })();
  }, []);

  const groups = groupLearning(
    courses.map((course) => ({
      ...course,
      completedAt: course.completedAt,
      dueOn: course.dueOn,
      required: course.required,
    })),
    localToday(),
  );
  const sections = [
    ["mandatory", groups.mandatory],
    ["dueSoon", groups.dueSoon],
    ["overdue", groups.overdue],
    ["inProgress", groups.inProgress],
    ["completed", groups.completed],
  ] as const;

  return (
    <CapabilityGate capability="training.learn" fallback={<p className="text-sm text-muted-foreground">{t("trainingLearning.noAccess")}</p>}>
      <div className="space-y-8">
        <FecPageHeader
          icon={GraduationCap}
          kicker={t("nav.departments.training")}
          title={t("trainingLearning.title")}
          subtitle={t("trainingLearning.subtitle")}
        />
        <TrainingSectionNav />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {staffId === null ? <FecEmptyState message={t("trainingLearning.noStaff")} hint={t("trainingLearning.noStaffHint")} /> : null}
        {staffId ? (
          <>
            {courses.length === 0 ? <FecEmptyState message={t("trainingLearning.empty")} /> : null}
            {sections.map(([key, rows]) =>
              rows.length ? (
                <section key={key} className="space-y-3">
                  <h2 className="text-lg font-medium">{t(`trainingLearning.groups.${key}`)}</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {rows.map((course) => (
                      <CourseCard key={`${key}-${course.id}`} course={course} />
                    ))}
                  </div>
                </section>
              ) : null,
            )}
            <section className="space-y-3">
              <h2 className="text-lg font-medium">{t("trainingLearning.certificates")}</h2>
              {certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("trainingLearning.certificatesEmpty")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {certificates.map((certificate) => (
                    <li key={certificate.id}>
                      {certificate.courseTitle} · {certificate.status}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-medium">{t("trainingLearning.paths")}</h2>
              {paths.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("trainingLearning.pathsEmpty")}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {paths.map((path) => (
                    <li key={path.id}>
                      {path.title} · {path.status}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-medium">{t("trainingLearning.recommended")}</h2>
              <p className="text-sm text-muted-foreground">{t("trainingLearning.recommendedEmpty")}</p>
            </section>
          </>
        ) : null}
      </div>
    </CapabilityGate>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Route } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FecButton as Button, FecEmptyState, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import { listSessionFormOptions } from "@/lib/training/sessions.functions";
import { issuePathCertificate, listTrainingPaths, publishTrainingPath, saveTrainingPath } from "@/lib/training/paths.functions";
import { TrainingSectionNav } from "@/views/training-section-nav";

type PathRow = {
  id: string;
  code: string;
  title: string;
  summary: string | null;
  status: string;
  certificate_enabled: boolean;
};

export default function TrainingPathsPage() {
  const { t } = useTranslation();
  const canEdit = usePermission("training.edit") || usePermission("training.create");
  const canPublish = usePermission("training.publish");
  const canIssue = usePermission("training.certificate.issue");
  const [rows, setRows] = useState<PathRow[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string; code: string }[]>([]);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [certificateEnabled, setCertificateEnabled] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [pathId, setPathId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const result = await listTrainingPaths({});
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows(result.data);
    setError(null);
    const options = await listSessionFormOptions({});
    if (options.ok) setCourses(options.data.courses);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <FecPageHeader icon={Route} title={t("trainingPaths.title")} subtitle={t("trainingPaths.subtitle")} />
      <TrainingSectionNav />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm">{notice}</p> : null}
      {canEdit ? (
        <form
          className="grid gap-3 rounded-2xl border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              const result = await saveTrainingPath({
                pathId: null,
                code,
                title,
                summary: null,
                certificateEnabled,
                courseIds: selected,
              });
              setNotice(result.ok ? t("trainingPaths.saved") : result.error);
              if (result.ok) await load();
            })();
          }}
        >
          <Input value={title} placeholder={t("trainingPaths.pathTitle")} onChange={(event) => setTitle(event.target.value)} required />
          <Input value={code} placeholder={t("trainingPaths.pathCode")} onChange={(event) => setCode(event.target.value)} required />
          <label className="flex min-h-12 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={certificateEnabled} onChange={(event) => setCertificateEnabled(event.target.checked)} />
            {t("trainingPaths.certificate")}
          </label>
          <div className="grid gap-2">
            {courses.map((course) => (
              <label key={course.id} className="flex min-h-12 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={selected.includes(course.id)}
                  onChange={(event) => {
                    setSelected(event.target.checked ? [...selected, course.id] : selected.filter((id) => id !== course.id));
                  }}
                />
                {course.title} ({course.code})
              </label>
            ))}
          </div>
          <Button type="submit" className="min-h-12">{t("trainingPaths.save")}</Button>
        </form>
      ) : null}
      {rows.length === 0 ? (
        <FecEmptyState message={t("trainingPaths.empty")} />
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-medium">{row.title}</h2>
              <p className="text-sm text-muted-foreground">
                {row.code} · {row.status}
                {row.certificate_enabled ? ` · ${t("trainingPaths.certificate")}` : ""}
              </p>
              {canPublish && row.status !== "PUBLISHED" ? (
                <Button
                  type="button"
                  className="mt-3 min-h-12"
                  onClick={() => {
                    void (async () => {
                      const result = await publishTrainingPath({ pathId: row.id });
                      setNotice(result.ok ? t("trainingPaths.published") : result.error);
                      if (result.ok) await load();
                    })();
                  }}
                >
                  {t("trainingPaths.publish")}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {canIssue ? (
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              const result = await issuePathCertificate({ pathId, staffId });
              setNotice(result.ok ? t("trainingPaths.certificateIssued") : result.error);
            })();
          }}
        >
          <select className="min-h-12 rounded-md border border-input bg-background px-3" value={pathId} onChange={(event) => setPathId(event.target.value)} required>
            <option value="">{t("trainingPaths.pickPath")}</option>
            {rows.filter((row) => row.certificate_enabled).map((row) => (
              <option key={row.id} value={row.id}>{row.title}</option>
            ))}
          </select>
          <Input value={staffId} placeholder={t("trainingPaths.staffId")} onChange={(event) => setStaffId(event.target.value)} required />
          <Button type="submit" className="min-h-12">{t("trainingPaths.issue")}</Button>
        </form>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FecButton as Button, FecEmptyState, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { listSessionFormOptions } from "@/lib/training/sessions.functions";
import { listTrainingMatrix } from "@/lib/training/reports.functions";
import { MATRIX_CELL_STATUSES } from "@/lib/training/engine";
import { TrainingSectionNav } from "@/views/training-section-nav";

type Options = {
  locations: { id: string; name: string; code: string }[];
  departments: { id: string; name: string }[];
  courses: { id: string; code: string; title: string }[];
};

type Matrix = Awaited<ReturnType<typeof listTrainingMatrix>>;

export default function TrainingMatrixPage() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Options | null>(null);
  const [locationId, setLocationId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Extract<Matrix, { ok: true }>["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await listSessionFormOptions({});
      if (result.ok) setOptions(result.data);
    })();
  }, []);

  async function load(nextPage: number) {
    const result = await listTrainingMatrix({
      locationId: locationId || null,
      departmentId: departmentId || null,
      courseId: courseId || null,
      roleCode: roleCode.trim() || null,
      status: (status || null) as (typeof MATRIX_CELL_STATUSES)[number] | null,
      page: nextPage,
    });
    if (!result.ok) {
      setError(result.error);
      setData(null);
      return;
    }
    setError(null);
    setData(result.data);
    setPage(nextPage);
  }

  useEffect(() => {
    void load(1);
  }, []);

  return (
    <div className="space-y-6">
      <FecPageHeader icon={LayoutGrid} title={t("trainingMatrix.title")} subtitle={t("trainingMatrix.subtitle")} />
      <TrainingSectionNav />
      <form
        className="grid gap-3 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load(1);
        }}
      >
        <select className="min-h-12 rounded-md border border-input bg-background px-3" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">{t("trainingMatrix.site")}</option>
          {(options?.locations ?? []).map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <select className="min-h-12 rounded-md border border-input bg-background px-3" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
          <option value="">{t("trainingMatrix.department")}</option>
          {(options?.departments ?? []).map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <select className="min-h-12 rounded-md border border-input bg-background px-3" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          <option value="">{t("trainingMatrix.course")}</option>
          {(options?.courses ?? []).map((row) => (
            <option key={row.id} value={row.id}>{row.title}</option>
          ))}
        </select>
        <Input value={roleCode} placeholder={t("trainingMatrix.role")} onChange={(event) => setRoleCode(event.target.value)} />
        <select className="min-h-12 rounded-md border border-input bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t("trainingMatrix.anyStatus")}</option>
          {MATRIX_CELL_STATUSES.map((value) => (
            <option key={value} value={value}>{t(`trainingMatrix.statuses.${value}`)}</option>
          ))}
        </select>
        <Button type="submit" className="min-h-12">{t("trainingMatrix.apply")}</Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!data || data.rows.length === 0 ? (
        <FecEmptyState message={t("trainingMatrix.empty")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr>
                <th className="p-2 text-start">{t("trainingMatrix.employee")}</th>
                {data.courses.map((course) => (
                  <th key={course.id} className="p-2 text-start">{course.code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.staffId} className="border-t border-border">
                  <td className="p-2">
                    <div className="font-medium">{row.fullName}</div>
                    <div className="text-muted-foreground">{row.employeeCode}</div>
                  </td>
                  {data.courses.map((course) => {
                    const cell = row.cells.find((item) => item.courseId === course.id);
                    const cellStatus = cell?.status ?? "NOT_TRAINED";
                    return (
                      <td key={course.id} className="p-2">
                        {t(`trainingMatrix.statuses.${cellStatus}`, cellStatus)}
                        {cell?.competency ? ` · ${t(`trainingMatrix.levels.${cell.competency}`, cell.competency)}` : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-2">
            <Button type="button" className="min-h-12" disabled={page <= 1} onClick={() => void load(page - 1)}>
              {t("trainingMatrix.previous")}
            </Button>
            <Button type="button" className="min-h-12" disabled={page * data.pageSize >= data.total} onClick={() => void load(page + 1)}>
              {t("trainingMatrix.next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

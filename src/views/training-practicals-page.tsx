"use client";

import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecButton as Button, FecEmptyState, FecPageHeader } from "@/components/fec";
import { Textarea } from "@/components/ui/textarea";
import {
  getPracticalAssessment,
  gradePracticalAssessment,
  listPracticalQueue,
} from "@/lib/training/practical.functions";

type Row = {
  enrollmentId: string;
  lessonId: string;
  staffName: string;
  employeeCode: string;
  courseTitle: string;
  lessonTitle: string;
  dueOn: string | null;
};

type Detail = {
  lessonTitle: string;
  checklist: { id: string; label: string; required: boolean }[];
  attempts: { id: string; passed: boolean | null; notes: string | null; assessedAt: string | null; confirmationName: string | null }[];
};

export default function TrainingPracticalsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [met, setMet] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<"PASS" | "FAIL">("FAIL");
  const [notes, setNotes] = useState("");
  const [confirmationName, setConfirmationName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(nextPage: number) {
    const response = await listPracticalQueue({ page: nextPage });
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setRows(response.data.rows);
    setTotal(response.data.total);
    setPage(response.data.page);
  }

  useEffect(() => {
    void load(1);
  }, []);

  async function open(row: Row) {
    setSelected(row);
    setNotice(null);
    const response = await getPracticalAssessment({ enrollmentId: row.enrollmentId, lessonId: row.lessonId });
    if (!response.ok) {
      setError(response.error);
      setDetail(null);
      return;
    }
    setError(null);
    setDetail(response.data);
    const next: Record<string, boolean> = {};
    for (const item of response.data.checklist) next[item.id] = false;
    setMet(next);
  }

  return (
    <CapabilityGate capability="training.assessment.grade" fallback={<p className="text-sm text-muted-foreground">{t("trainingPracticals.noAccess")}</p>}>
      <div className="space-y-6">
        <FecPageHeader icon={GraduationCap} title={t("trainingPracticals.title")} subtitle={t("trainingPracticals.subtitle")} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        {rows.length === 0 ? <FecEmptyState message={t("trainingPracticals.empty")} /> : (
          <ul className="grid gap-2">
            {rows.map((row) => (
              <li key={`${row.enrollmentId}-${row.lessonId}`}>
                <button type="button" className="min-h-12 w-full rounded-xl border border-border bg-card px-3 text-left" onClick={() => void open(row)}>
                  <span className="block font-medium">{row.staffName} · {row.employeeCode}</span>
                  <span className="text-sm text-muted-foreground">{row.courseTitle} · {row.lessonTitle}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-h-12" disabled={page <= 1} onClick={() => void load(page - 1)}>{t("trainingPracticals.previous")}</Button>
          <Button type="button" variant="outline" className="min-h-12" disabled={page * 20 >= total} onClick={() => void load(page + 1)}>{t("trainingPracticals.next")}</Button>
        </div>
        {selected && detail ? (
          <form
            className="grid gap-3 rounded-2xl border border-border bg-card p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                const response = await gradePracticalAssessment({
                  enrollmentId: selected.enrollmentId,
                  lessonId: selected.lessonId,
                  items: detail.checklist.map((item) => ({ id: item.id, met: met[item.id] === true })),
                  result,
                  notes: notes.trim() || null,
                  confirmationName: confirmationName.trim() || null,
                  confirmed,
                });
                if (!response.ok) {
                  setError(response.error);
                  return;
                }
                setError(null);
                setNotice(response.data.passed ? t("trainingPracticals.passed") : t("trainingPracticals.failed"));
                setNotes("");
                setConfirmed(false);
                await open(selected);
                await load(page);
              })();
            }}
          >
            <h2 className="text-lg font-medium">{detail.lessonTitle}</h2>
            <ul className="grid gap-2">
              {detail.checklist.map((item) => (
                <li key={item.id}>
                  <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3">
                    <input type="checkbox" className="h-5 w-5" checked={met[item.id] === true} onChange={(event) => setMet({ ...met, [item.id]: event.target.checked })} />
                    <span>{item.label}{item.required ? ` · ${t("trainingPracticals.required")}` : ""}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={result === "PASS" ? "default" : "outline"} className="min-h-12" onClick={() => setResult("PASS")}>{t("trainingPracticals.pass")}</Button>
              <Button type="button" variant={result === "FAIL" ? "default" : "outline"} className="min-h-12" onClick={() => setResult("FAIL")}>{t("trainingPracticals.fail")}</Button>
            </div>
            <Textarea aria-label={t("trainingPracticals.comments")} placeholder={t("trainingPracticals.comments")} value={notes} onChange={(event) => setNotes(event.target.value)} />
            <input className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingPracticals.confirmName")} placeholder={t("trainingPracticals.confirmName")} value={confirmationName} onChange={(event) => setConfirmationName(event.target.value)} />
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              {t("trainingPracticals.confirm")}
            </label>
            <Button type="submit" className="min-h-12">{t("trainingPracticals.save")}</Button>
            {detail.attempts.length > 0 ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium">{t("trainingPracticals.history")}</p>
                {detail.attempts.map((attempt) => (
                  <p key={attempt.id}>{attempt.passed ? t("trainingPracticals.pass") : t("trainingPracticals.fail")} · {attempt.confirmationName ?? ""} · {attempt.notes ?? ""}</p>
                ))}
              </div>
            ) : null}
          </form>
        ) : null}
      </div>
    </CapabilityGate>
  );
}

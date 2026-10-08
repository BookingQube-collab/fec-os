"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecButton as Button } from "@/components/fec";
import { HrSection } from "@/components/hr/hr-section";
import { HrShell } from "@/components/hr/hr-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import {
  addTrainingLesson,
  addTrainingSection,
  createTrainingDraftVersion,
  deleteTrainingLesson,
  deleteTrainingSection,
  getTrainingCourse,
  listTrainingCourseLookups,
  moveTrainingLesson,
  moveTrainingSection,
  setTrainingCourseStatus,
  updateTrainingCourse,
  updateTrainingLesson,
  updateTrainingSection,
  uploadTrainingMaterial,
  assignPublishedRetraining,
} from "@/lib/training/courses.functions";
import { courseCoverSrc, TRAINING_COVERS } from "@/lib/training/desk";
import { DIFFICULTY_LEVELS, LESSON_KINDS, TRAINING_TYPES } from "@/lib/training/engine";
import { QuizLessonSettings } from "@/views/training-quiz-settings";
import { PracticalChecklistEditor } from "@/views/training-practical-checklist";

type Lookups = {
  locations: Array<{ id: string; name: string; code: string }>;
  departments: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; full_name: string; employee_code: string }>;
  courses: Array<{ id: string; code: string; title: string }>;
};

type Lesson = {
  id: string;
  section_id: string;
  title: string;
  kind: string;
  body: string | null;
  storage_path: string | null;
  external_url: string | null;
  sort_order: number;
  required: boolean;
};

type BuilderData = {
  course: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    category: string | null;
    training_type: string | null;
    difficulty: string | null;
    estimated_minutes: number | null;
    thumbnail_path: string | null;
    instructor_staff_id: string | null;
    department_id: string | null;
    location_id: string | null;
    business_unit: string | null;
    validity_days: number | null;
    passing_score: number | null;
    max_attempts: number | null;
    certificate_enabled: boolean;
    certificate_validity_days: number | null;
    refresher_course_id: string | null;
    retraining_lead_days: number;
    competency_code: string | null;
    competency_name: string | null;
    retrain_on_publish: boolean;
    required: boolean;
    requires_session_attendance: boolean;
    tags: string[] | null;
    status: string;
  };
  version: { id: string; version_no: number; status: string; title: string } | null;
  sections: Array<{ id: string; title: string; sort_order: number }>;
  lessons: Lesson[];
  prerequisiteIds: string[];
};

type Draft = {
  title: string;
  code: string;
  description: string;
  category: string;
  trainingType: string;
  difficulty: string;
  estimatedMinutes: string;
  instructorStaffId: string;
  departmentId: string;
  locationId: string;
  businessUnit: string;
  validityDays: string;
  passingScore: string;
  maxAttempts: string;
  certificateEnabled: boolean;
  certificateValidityDays: string;
  refresherCourseId: string;
  retrainingLeadDays: string;
  competencyCode: string;
  competencyName: string;
  retrainOnPublish: boolean;
  required: boolean;
  requiresSessionAttendance: boolean;
  tags: string;
  prerequisiteIds: string[];
};

const FILE_KINDS = new Set(["IMAGE", "PDF", "VIDEO", "DOCUMENT", "PRESENTATION", "AUDIO"]);

function numOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function draftFrom(data: BuilderData): Draft {
  const course = data.course;
  return {
    title: course.title,
    code: course.code,
    description: course.description ?? "",
    category: course.category ?? "",
    trainingType: course.training_type ?? "",
    difficulty: course.difficulty ?? "",
    estimatedMinutes: course.estimated_minutes?.toString() ?? "",
    instructorStaffId: course.instructor_staff_id ?? "",
    departmentId: course.department_id ?? "",
    locationId: course.location_id ?? "",
    businessUnit: course.business_unit ?? "",
    validityDays: course.validity_days?.toString() ?? "",
    passingScore: course.passing_score?.toString() ?? "",
    maxAttempts: course.max_attempts?.toString() ?? "",
    certificateEnabled: course.certificate_enabled,
    certificateValidityDays: course.certificate_validity_days?.toString() ?? "",
    refresherCourseId: course.refresher_course_id ?? "",
    retrainingLeadDays: course.retraining_lead_days?.toString() ?? "30",
    competencyCode: course.competency_code ?? "",
    competencyName: course.competency_name ?? "",
    retrainOnPublish: course.retrain_on_publish,
    required: course.required,
    requiresSessionAttendance: course.requires_session_attendance,
    tags: (course.tags ?? []).join(", "),
    prerequisiteIds: data.prerequisiteIds,
  };
}

function payloadFrom(draft: Draft) {
  return {
    title: draft.title,
    code: draft.code,
    description: draft.description.trim() || null,
    category: draft.category.trim() || null,
    trainingType: (draft.trainingType || null) as (typeof TRAINING_TYPES)[number] | null,
    difficulty: (draft.difficulty || null) as (typeof DIFFICULTY_LEVELS)[number] | null,
    estimatedMinutes: numOrNull(draft.estimatedMinutes),
    instructorStaffId: draft.instructorStaffId || null,
    departmentId: draft.departmentId || null,
    locationId: draft.locationId || null,
    businessUnit: draft.businessUnit.trim() || null,
    validityDays: numOrNull(draft.validityDays),
    passingScore: numOrNull(draft.passingScore),
    maxAttempts: numOrNull(draft.maxAttempts),
    certificateEnabled: draft.certificateEnabled,
    certificateValidityDays: numOrNull(draft.certificateValidityDays),
    refresherCourseId: draft.refresherCourseId || null,
    retrainingLeadDays: numOrNull(draft.retrainingLeadDays) ?? 30,
    competencyCode: draft.competencyCode.trim() || null,
    competencyName: draft.competencyName.trim() || null,
    retrainOnPublish: draft.retrainOnPublish,
    required: draft.required,
    requiresSessionAttendance: draft.requiresSessionAttendance,
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    prerequisiteIds: draft.prerequisiteIds,
  };
}

export default function TrainingCourseBuilderPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const canEdit = usePermission("training.edit");
  const canAssess = usePermission("training.assessment.manage");
  const canPublish = usePermission("training.publish");
  const canAssign = usePermission("training.assign");
  const canArchive = usePermission("training.archive");
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [data, setData] = useState<BuilderData | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<"details" | "lessons" | "questions" | "rules" | "resources" | "history">("details");
  const [coverId, setCoverId] = useState<string | null>(null);

  async function reload() {
    const [course, options] = await Promise.all([
      getTrainingCourse({ courseId }),
      listTrainingCourseLookups({}),
    ]);
    if (!course.ok) {
      setError(course.error);
      return;
    }
    if (!options.ok) {
      setError(options.error);
      return;
    }
    setData(course.data);
    setDraft(draftFrom(course.data));
    setLookups(options.data);
    setError(null);
  }

  useEffect(() => {
    void reload();
  }, [courseId]);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setNotice(null);
    const result = await action();
    if (!result.ok) {
      setError(result.error ?? t("trainingCourses.saveFailed"));
      return;
    }
    setNotice(t("trainingCourses.saved"));
    await reload();
  }

  if (!draft || !data) {
    return (
      <CapabilityGate capability="training.view" fallback={<p className="text-sm text-muted-foreground">{t("trainingCourses.noAccess")}</p>}>
        <p className="text-sm text-muted-foreground">{error ?? t("trainingCourses.loading")}</p>
      </CapabilityGate>
    );
  }

  const version = data.version;
  const contentLocked = !version || version.status === "PUBLISHED" || version.status === "ARCHIVED";
  const canChangeContent = canEdit && !contentLocked;

  const questionCount = data.lessons.filter((lesson) => lesson.kind === "QUIZ").length;
  const starterCopy = data.lessons.some((lesson) => /authoring instructions/i.test(`${lesson.title}\n${lesson.body ?? ""}`));
  const editorTabs = [
    ["details", t("learningDesk.editorTabs.details")],
    ["lessons", t("learningDesk.editorTabs.lessons", { count: data.lessons.length })],
    ["questions", t("learningDesk.editorTabs.questions", { count: questionCount })],
    ["rules", t("learningDesk.editorTabs.rules")],
    ["resources", t("learningDesk.editorTabs.resources")],
    ["history", t("learningDesk.editorTabs.history")],
  ] as const;

  return (
    <CapabilityGate capability="training.view" fallback={<p className="text-sm text-muted-foreground">{t("trainingCourses.noAccess")}</p>}>
      <HrShell className="min-w-0 overflow-x-clip">
      <HrSection
          icon={GraduationCap}
          kicker={t("nav.peopleSectionDevelopment")}
          title={draft.title || t("trainingCourses.builder")}
          subtitle={version ? t("trainingCourses.versionLabel", { version: version.version_no, status: version.status }) : t("trainingCourses.noVersion")}
          actions={<Link className="text-sm underline-offset-4 hover:underline" href="/people/training">{t("trainingCourses.back")}</Link>}
        >
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        {contentLocked ? <p className="text-sm text-muted-foreground">{t("trainingCourses.locked")}</p> : null}
        {starterCopy && data.course.status === "DRAFT" ? <p className="text-sm text-muted-foreground">{t("learningDesk.starterNote")}</p> : null}
        <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label={t("trainingCourses.builder")}>
          {editorTabs.map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={editorTab === id ? "default" : "outline"}
              aria-pressed={editorTab === id}
              className={`h-auto max-w-full whitespace-normal rounded-full ${editorTab === id ? "border-transparent bg-[#6d4aff] text-white shadow-none hover:bg-[#5b3de6]" : "border-[#e4dff5] bg-white"}`}
              onClick={() => setEditorTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        <form
          className={`grid gap-4 rounded-2xl border border-border bg-card p-4 md:grid-cols-2 ${editorTab === "lessons" || editorTab === "questions" ? "hidden" : ""}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!version) return;
            void run(() => updateTrainingCourse({ ...payloadFrom(draft), courseId, versionId: version.id }));
          }}
        >
          <div className={editorTab === "details" ? "contents" : "hidden"}>
          <Field label={t("trainingCourses.courseTitle")}>
            <Input value={draft.title} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required={editorTab === "details"} />
          </Field>
          <Field label={t("trainingCourses.courseCode")}>
            <Input value={draft.code} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, code: event.target.value })} required={editorTab === "details"} />
          </Field>
          <Field label={t("trainingCourses.description")} className="md:col-span-2">
            <Textarea value={draft.description} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
          <Field label={t("trainingCourses.category")}>
            <Input value={draft.category} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          </Field>
          <Field label={t("trainingCourses.trainingType")}>
            <Select value={draft.trainingType} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, trainingType: value })} options={TRAINING_TYPES.map((value) => ({ value, label: t(`trainingCourses.types.${value}`) }))} />
          </Field>
          <Field label={t("trainingCourses.difficulty")}>
            <Select value={draft.difficulty} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, difficulty: value })} options={DIFFICULTY_LEVELS.map((value) => ({ value, label: t(`trainingCourses.difficulties.${value}`) }))} />
          </Field>
          <Field label={t("trainingCourses.duration")}>
            <Input type="number" min={0} value={draft.estimatedMinutes} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, estimatedMinutes: event.target.value })} />
          </Field>
          <Field label={t("trainingCourses.instructor")}>
            <Select value={draft.instructorStaffId} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, instructorStaffId: value })} options={(lookups?.staff ?? []).map((person) => ({ value: person.id, label: `${person.full_name} (${person.employee_code})` }))} />
          </Field>
          <Field label={t("trainingCourses.department")}>
            <Select value={draft.departmentId} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, departmentId: value })} options={(lookups?.departments ?? []).map((row) => ({ value: row.id, label: row.name }))} />
          </Field>
          <Field label={t("trainingCourses.site")}>
            <Select value={draft.locationId} disabled={!canEdit} onChange={(value) => setDraft({ ...draft, locationId: value })} options={(lookups?.locations ?? []).map((row) => ({ value: row.id, label: `${row.name} (${row.code})` }))} />
          </Field>
          <Field label={t("trainingCourses.businessUnit")}>
            <Input value={draft.businessUnit} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, businessUnit: event.target.value })} />
          </Field>
          </div>
          <Field label={t("trainingCourses.tags")} className={`md:col-span-2 ${editorTab === "details" ? "" : "hidden"}`}>
            <Input value={draft.tags} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder={t("trainingCourses.tagsHint")} />
          </Field>
          <div className={`md:col-span-2 ${editorTab === "details" ? "" : "hidden"}`}>
            <p className="text-sm font-medium">{t("learningDesk.cover")}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TRAINING_COVERS.map((cover) => {
                const storedCover = coverId
                  ? TRAINING_COVERS.find((item) => item.id === coverId)?.src
                  : courseCoverSrc({ title: draft.title, thumbnailPath: data.course.thumbnail_path });
                const active = storedCover === cover.src;
                return (
                  <button
                    key={cover.id}
                    type="button"
                    className={`overflow-hidden rounded-2xl border text-start ${active ? "border-[#6d4aff] ring-2 ring-[#6d4aff]" : "border-[#ece8f5]"}`}
                    onClick={() => setCoverId(cover.id)}
                  >
                    <img src={cover.src} alt="" className="aspect-[16/10] w-full object-cover" />
                    <span className="block px-3 py-2 text-xs text-[#6b657f]">{t(`learningDesk.covers.${cover.id}`)}</span>
                  </button>
                );
              })}
            </div>
            <p className="mb-2 mt-3 text-xs text-muted-foreground">{t("learningDesk.coverHint")}</p>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!canEdit}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void run(async () => {
                  const dataBase64 = await fileToBase64(file);
                  return uploadTrainingMaterial({
                    courseId,
                    versionId: version?.id ?? null,
                    lessonId: null,
                    purpose: "thumbnail",
                    filename: file.name,
                    contentType: file.type,
                    dataBase64,
                  });
                });
              }}
            />
            {data.course.thumbnail_path ? <p className="mt-2 text-xs text-muted-foreground">{data.course.thumbnail_path}</p> : null}
          </div>
          <div className={editorTab === "rules" ? "contents" : "hidden"}>
          <Field label={t("trainingCourses.validity")}>
            <Input type="number" min={1} value={draft.validityDays} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, validityDays: event.target.value })} />
          </Field>
          <Field label={t("trainingCourses.passingScore")}>
            <Input type="number" min={0} max={100} value={draft.passingScore} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, passingScore: event.target.value })} />
          </Field>
          <Field label={t("trainingCourses.maxAttempts")}>
            <Input type="number" min={1} value={draft.maxAttempts} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, maxAttempts: event.target.value })} />
          </Field>
          <Field label={t("trainingCourses.certificateValidity")}>
            <Input type="number" min={1} value={draft.certificateValidityDays} disabled={!canEdit || !draft.certificateEnabled} onChange={(event) => setDraft({ ...draft, certificateValidityDays: event.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.certificateEnabled} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, certificateEnabled: event.target.checked })} />
            {t("trainingCourses.certificateEnabled")}
          </label>
          <Field label={t("trainingCourses.refresher")}>
            <Select
              value={draft.refresherCourseId}
              disabled={!canEdit}
              onChange={(value) => setDraft({ ...draft, refresherCourseId: value === courseId ? "" : value })}
              options={(lookups?.courses ?? []).filter((course) => course.id !== courseId).map((course) => ({ value: course.id, label: `${course.title} (${course.code})` }))}
            />
          </Field>
          <Field label={t("trainingCourses.retrainingLead")}>
            <Input type="number" min={1} max={365} value={draft.retrainingLeadDays} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, retrainingLeadDays: event.target.value })} />
          </Field>
          <Field label={t("trainingCourses.competencyCode")}>
            <Input value={draft.competencyCode} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, competencyCode: event.target.value })} />
          </Field>
          <Field label={t("trainingCourses.competencyName")}>
            <Input value={draft.competencyName} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, competencyName: event.target.value })} />
          </Field>
          <label className="flex min-h-12 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={draft.retrainOnPublish} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, retrainOnPublish: event.target.checked })} />
            {t("trainingCourses.retrainOnPublish")}
          </label>
          <label className="flex min-h-12 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={draft.required} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} />
            {t("trainingCourses.mandatory")}
          </label>
          <label className="flex min-h-12 items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" className="h-5 w-5" checked={draft.requiresSessionAttendance} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, requiresSessionAttendance: event.target.checked })} />
            {t("trainingCourses.requiresSessionAttendance")}
          </label>
          <Field label={t("trainingCourses.prerequisites")} className="md:col-span-2">
            <select
              multiple
              className="min-h-28 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
              disabled={!canEdit}
              value={draft.prerequisiteIds}
              onChange={(event) => setDraft({ ...draft, prerequisiteIds: [...event.target.selectedOptions].map((option) => option.value) })}
            >
              {(lookups?.courses ?? []).filter((course) => course.id !== courseId).map((course) => (
                <option key={course.id} value={course.id}>{course.code} — {course.title}</option>
              ))}
            </select>
          </Field>
          </div>
          <Field label={t("trainingCourses.thumbnail")} className={editorTab === "resources" ? "md:col-span-2" : "hidden"}>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!canEdit}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void run(async () => {
                  const dataBase64 = await fileToBase64(file);
                  return uploadTrainingMaterial({
                    courseId,
                    versionId: version?.id ?? null,
                    lessonId: null,
                    purpose: "thumbnail",
                    filename: file.name,
                    contentType: file.type,
                    dataBase64,
                  });
                });
              }}
            />
            {data.course.thumbnail_path ? <p className="text-xs text-muted-foreground">{data.course.thumbnail_path}</p> : null}
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            {canEdit ? <Button type="submit">{t("trainingCourses.save")}</Button> : null}
            {version && canEdit && contentLocked ? (
              <Button type="button" variant="outline" onClick={() => void run(() => createTrainingDraftVersion({ courseId, sourceVersionId: version.id }))}>
                {t("trainingCourses.newVersion")}
              </Button>
            ) : null}
            {version && canPublish && data.course.status !== "PUBLISHED" ? (
              <Button type="button" variant="outline" onClick={() => void run(() => setTrainingCourseStatus({ courseId, versionId: version.id, status: "PUBLISHED" }))}>
                {t("trainingCourses.publish")}
              </Button>
            ) : null}
            {canAssign && data.course.status === "PUBLISHED" && draft.retrainOnPublish ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void (async () => {
                    const result = await assignPublishedRetraining({ courseId });
                    setNotice(result.ok ? t("trainingCourses.retrainingAssigned", { count: result.data.enrolled }) : result.error);
                  })();
                }}
              >
                {t("trainingCourses.assignRetraining")}
              </Button>
            ) : null}
            {version && canEdit && data.course.status === "DRAFT" ? (
              <Button type="button" variant="outline" onClick={() => void run(() => setTrainingCourseStatus({ courseId, versionId: version.id, status: "UNDER_REVIEW" }))}>
                {t("trainingCourses.markReview")}
              </Button>
            ) : null}
            {version && canArchive && data.course.status !== "ARCHIVED" ? (
              <Button type="button" variant="outline" onClick={() => void run(() => setTrainingCourseStatus({ courseId, versionId: version.id, status: "ARCHIVED" }))}>
                {t("trainingCourses.archive")}
              </Button>
            ) : null}
          </div>
          <p className={`text-xs text-muted-foreground md:col-span-2 ${editorTab === "history" ? "" : "hidden"}`}>
            {t("learningDesk.historyHint")}
            {" · "}
            {t("trainingCourses.status")}: {t(`trainingCourses.statuses.${data.course.status}`)}
            {" · "}
            {version ? t("trainingCourses.versionLabel", { version: version.version_no, status: version.status }) : t("trainingCourses.noVersion")}
          </p>
        </form>

        <section className={`space-y-4 ${editorTab === "lessons" ? "" : "hidden"}`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("trainingCourses.builder")}</h2>
            {canChangeContent && version ? (
              <Button type="button" onClick={() => void run(() => addTrainingSection({ versionId: version.id, title: t("trainingCourses.newSection") }))}>
                {t("trainingCourses.addSection")}
              </Button>
            ) : null}
          </div>
          {data.sections.map((section, sectionIndex) => {
            const lessons = data.lessons.filter((lesson) => lesson.section_id === section.id);
            return (
              <article key={section.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    defaultValue={section.title}
                    disabled={!canChangeContent}
                    onBlur={(event) => {
                      if (!version || event.target.value === section.title) return;
                      void run(() => updateTrainingSection({ versionId: version.id, sectionId: section.id, title: event.target.value }));
                    }}
                  />
                  {canChangeContent && version ? (
                    <>
                      <Button type="button" variant="outline" disabled={sectionIndex === 0} onClick={() => void run(() => moveTrainingSection({ versionId: version.id, sectionId: section.id, direction: "up" }))}>{t("trainingCourses.up")}</Button>
                      <Button type="button" variant="outline" disabled={sectionIndex === data.sections.length - 1} onClick={() => void run(() => moveTrainingSection({ versionId: version.id, sectionId: section.id, direction: "down" }))}>{t("trainingCourses.down")}</Button>
                      <Button type="button" variant="outline" onClick={() => void run(() => deleteTrainingSection({ versionId: version.id, sectionId: section.id }))}>{t("trainingCourses.remove")}</Button>
                    </>
                  ) : null}
                </div>
                {lessons.map((lesson, lessonIndex) => (
                  <div key={lesson.id} className="grid gap-2 rounded-xl border border-border p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_14rem_auto]">
                      <Input
                        defaultValue={lesson.title}
                        disabled={!canChangeContent}
                        onBlur={(event) => {
                          if (!version || event.target.value === lesson.title) return;
                          void run(() => updateTrainingLesson({
                            versionId: version.id,
                            lessonId: lesson.id,
                            title: event.target.value,
                            kind: lesson.kind as (typeof LESSON_KINDS)[number],
                            body: lesson.body,
                            externalUrl: lesson.external_url,
                            required: lesson.required,
                          }));
                        }}
                      />
                      <Select
                        value={lesson.kind}
                        allowEmpty={false}
                        disabled={!canChangeContent}
                        onChange={(value) => {
                          if (!version) return;
                          void run(() => updateTrainingLesson({
                            versionId: version.id,
                            lessonId: lesson.id,
                            title: lesson.title,
                            kind: value as (typeof LESSON_KINDS)[number],
                            body: lesson.body,
                            externalUrl: lesson.external_url,
                            required: lesson.required,
                          }));
                        }}
                        options={LESSON_KINDS.map((kind) => ({ value: kind, label: t(`trainingCourses.kinds.${kind}`) }))}
                      />
                      {canChangeContent && version ? (
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" disabled={lessonIndex === 0} onClick={() => void run(() => moveTrainingLesson({ versionId: version.id, sectionId: section.id, lessonId: lesson.id, direction: "up" }))}>{t("trainingCourses.up")}</Button>
                          <Button type="button" variant="outline" disabled={lessonIndex === lessons.length - 1} onClick={() => void run(() => moveTrainingLesson({ versionId: version.id, sectionId: section.id, lessonId: lesson.id, direction: "down" }))}>{t("trainingCourses.down")}</Button>
                          <Button type="button" variant="outline" onClick={() => void run(() => deleteTrainingLesson({ versionId: version.id, lessonId: lesson.id }))}>{t("trainingCourses.remove")}</Button>
                        </div>
                      ) : null}
                    </div>
                    {lesson.kind === "PRACTICAL_ASSESSMENT" && version ? (
                      <PracticalChecklistEditor
                        body={lesson.body}
                        disabled={!canChangeContent}
                        onSave={(body) => {
                          void run(() => updateTrainingLesson({
                            versionId: version.id,
                            lessonId: lesson.id,
                            title: lesson.title,
                            kind: "PRACTICAL_ASSESSMENT",
                            body,
                            externalUrl: lesson.external_url,
                            required: lesson.required,
                          }));
                        }}
                      />
                    ) : lesson.kind === "EXTERNAL_LINK" ? (
                      <Input
                        defaultValue={lesson.external_url ?? ""}
                        placeholder="https://"
                        disabled={!canChangeContent}
                        onBlur={(event) => {
                          if (!version) return;
                          void run(() => updateTrainingLesson({
                            versionId: version.id,
                            lessonId: lesson.id,
                            title: lesson.title,
                            kind: "EXTERNAL_LINK",
                            body: lesson.body,
                            externalUrl: event.target.value,
                            required: lesson.required,
                          }));
                        }}
                      />
                    ) : lesson.kind === "QUIZ" ? (
                      <p className="text-xs text-muted-foreground">{t("trainingCourses.quizBank")}</p>
                    ) : (
                      <Textarea
                        defaultValue={lesson.body ?? ""}
                        disabled={!canChangeContent}
                        onBlur={(event) => {
                          if (!version || event.target.value === (lesson.body ?? "")) return;
                          void run(() => updateTrainingLesson({
                            versionId: version.id,
                            lessonId: lesson.id,
                            title: lesson.title,
                            kind: lesson.kind as (typeof LESSON_KINDS)[number],
                            body: event.target.value,
                            externalUrl: lesson.external_url,
                            required: lesson.required,
                          }));
                        }}
                      />
                    )}
                    {FILE_KINDS.has(lesson.kind) && canChangeContent && version ? (
                      <Input
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          void run(async () => {
                            const dataBase64 = await fileToBase64(file);
                            return uploadTrainingMaterial({
                              courseId,
                              versionId: version.id,
                              lessonId: lesson.id,
                              purpose: lesson.kind as "IMAGE" | "PDF" | "VIDEO" | "DOCUMENT" | "PRESENTATION" | "AUDIO",
                              filename: file.name,
                              contentType: file.type,
                              dataBase64,
                            });
                          });
                        }}
                      />
                    ) : null}
                    {lesson.storage_path ? <p className="text-xs text-muted-foreground">{lesson.storage_path}</p> : null}
                  </div>
                ))}
                {canChangeContent && version ? (
                  <Button type="button" variant="outline" onClick={() => void run(() => addTrainingLesson({ versionId: version.id, sectionId: section.id, title: t("trainingCourses.newLesson"), kind: "TEXT" }))}>
                    {t("trainingCourses.addLesson")}
                  </Button>
                ) : null}
              </article>
            );
          })}
        </section>

        <section className={`space-y-4 ${editorTab === "questions" ? "" : "hidden"}`}>
          {questionCount === 0 ? <p className="text-sm text-muted-foreground">{t("learningDesk.noQuestions")}</p> : null}
          {data.lessons.filter((lesson) => lesson.kind === "QUIZ").map((lesson) => (
            <article key={lesson.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">{lesson.title}</h2>
              {canAssess ? (
                <QuizLessonSettings lessonId={lesson.id} passingScore={Number(draft.passingScore) || 70} />
              ) : (
                <p className="text-xs text-muted-foreground">{t("trainingCourses.quizLocked")}</p>
              )}
            </article>
          ))}
        </section>

        {data.lessons.some((lesson) => lesson.storage_path) && editorTab === "resources" ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {data.lessons.filter((lesson) => lesson.storage_path).map((lesson) => (
              <li key={lesson.id} className="break-all">{lesson.title}: {lesson.storage_path}</li>
            ))}
          </ul>
        ) : null}
      </HrSection>
      </HrShell>
    </CapabilityGate>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`grid gap-1.5 text-sm ${className ?? ""}`}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  options,
  disabled,
  allowEmpty = true,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {allowEmpty ? <option value="">—</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

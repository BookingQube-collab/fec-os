"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { HrShell } from "@/components/hr/hr-shell";
import { CreateCourseEditor } from "@/components/training/create-course-editor";
import {
  AcademyNav,
  AreaSwitch,
  CatalogueBoard,
  ExploreBoard,
  ExternalNav,
  InductionHero,
  LearningBoard,
  RecordsBoard,
} from "@/components/training/learning-studio";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/use-permission";
import { listTraining } from "@/lib/people.functions";
import { STALE } from "@/lib/query-client";
import { listTrainingCourses } from "@/lib/training/courses.functions";
import {
  courseMatchesDeskFilter,
  csvCell,
  pageSlice,
  recordMatchesQuery,
  recordMatchesStatus,
  teamTotals,
  type CourseDeskFilter,
  type RecordStatusFilter,
} from "@/lib/training/desk";
import { listTrainingDeskRecords } from "@/lib/training/desk.functions";
import { groupLearning } from "@/lib/training/engine";
import { listMyLearning } from "@/lib/training/learning.functions";
import { listTrainingCalendar } from "@/lib/training/sessions.functions";

const PAGE_SIZE = 20;

type Area = "academy" | "external";
type AcademyTab = "explore" | "learning" | "progress";
type ExternalTab = "catalogue" | "enrollments";

type CatalogCourse = {
  id: string;
  code: string;
  title: string;
  status: string;
  category: string | null;
  training_type: string | null;
  required: boolean;
  estimated_minutes: number | null;
  summary: string | null;
  description: string | null;
  requires_session_attendance: boolean;
  thumbnail_path: string | null;
  lesson_count: number;
};

type LegacyStaff = { full_name?: string | null; employee_code?: string | null };
type LegacyEnrollment = {
  id: string;
  course_name: string;
  required: boolean;
  status: string;
  due_on: string | null;
  completed_on: string | null;
  score: number | null;
  staff?: LegacyStaff | LegacyStaff[] | null;
};

type DeskRow = {
  key: string;
  id: string;
  staffName: string;
  employeeCode: string;
  courseTitle: string;
  courseCode: string;
  status: string;
  dueOn: string | null;
  completedAt: string | null;
  score: number | null;
  progressPercent: number | null;
  lessonCount: number | null;
  attemptCount: number;
  failedAttempt: boolean;
  required: boolean;
  versionNo: number | null;
  requiresSession: boolean;
  demo: boolean | null;
  href: string | null;
};

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function staffOf(value: LegacyEnrollment["staff"]): LegacyStaff | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function HrLearningPage() {
  const { t } = useTranslation();
  const canView = usePermission("training.view");
  const canLearn = usePermission("training.learn");
  const canCreate = usePermission("training.create");
  const canEdit = usePermission("training.edit");
  const canRoster = usePermission("people.view_roster");
  const today = localToday();

  const [area, setArea] = useState<Area>("academy");
  const [academyTab, setAcademyTab] = useState<AcademyTab>("explore");
  const [externalTab, setExternalTab] = useState<ExternalTab>("catalogue");
  const [courseFilter, setCourseFilter] = useState<CourseDeskFilter>("all");
  const [courseQuery, setCourseQuery] = useState("");
  const [recordFilter, setRecordFilter] = useState<RecordStatusFilter>("all");
  const [recordQuery, setRecordQuery] = useState("");
  const [courseTitleQuery, setCourseTitleQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const courses = useQuery({
    queryKey: ["training-desk", "courses"],
    queryFn: () => listTrainingCourses({}),
    staleTime: STALE.people,
    enabled: canView,
  });
  const learning = useQuery({
    queryKey: ["training-desk", "learning"],
    queryFn: () => listMyLearning({}),
    staleTime: STALE.people,
    enabled: canLearn,
  });
  const records = useQuery({
    queryKey: ["training-desk", "records"],
    queryFn: () => listTrainingDeskRecords({}),
    staleTime: STALE.people,
    enabled: canView,
  });
  const legacy = useQuery({
    queryKey: ["training-desk", "legacy"],
    queryFn: () => listTraining({}),
    staleTime: STALE.people,
    enabled: canRoster,
  });
  const calendar = useQuery({
    queryKey: ["training-desk", "calendar"],
    queryFn: () => {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      const to = new Date();
      to.setDate(to.getDate() + 50);
      return listTrainingCalendar({
        from: from.toISOString(),
        to: to.toISOString(),
        locationId: null,
        trainerStaffId: null,
        courseId: null,
        departmentId: null,
      });
    },
    staleTime: STALE.people,
    enabled: canView && area === "external",
  });

  const catalog: CatalogCourse[] = courses.data?.ok ? courses.data.data : [];
  const visibleCourses = useMemo(() => {
    const needle = courseQuery.trim().toLowerCase();
    return catalog.filter((course) => {
      if (!courseMatchesDeskFilter(
        { status: course.status, trainingType: course.training_type, required: course.required },
        courseFilter,
      )) return false;
      if (!needle) return true;
      return `${course.title} ${course.code} ${course.summary ?? ""} ${course.description ?? ""}`.toLowerCase().includes(needle);
    });
  }, [catalog, courseFilter, courseQuery]);

  const myCourses = learning.data?.ok ? learning.data.data.courses : [];
  const myCounts = useMemo(() => {
    const groups = groupLearning(
      myCourses.map((course) => ({
        status: course.status,
        completedAt: course.completedAt,
        dueOn: course.dueOn,
        required: course.required,
      })),
      today,
    );
    return {
      assigned: myCourses.length,
      inProgress: groups.inProgress.length,
      completed: groups.completed.length,
    };
  }, [myCourses, today]);

  const engineRows: DeskRow[] = useMemo(() => {
    if (!records.data?.ok) return [];
    return records.data.data.rows.map((row) => ({
      key: `engine:${row.id}`,
      id: row.id,
      staffName: row.staffName,
      employeeCode: row.employeeCode,
      courseTitle: row.courseTitle,
      courseCode: row.courseCode,
      status: row.status,
      dueOn: row.dueOn,
      completedAt: row.completedAt,
      score: row.score,
      progressPercent: row.progressPercent,
      lessonCount: row.lessonCount,
      attemptCount: row.attemptCount,
      failedAttempt: row.failedAttempt,
      required: row.required,
      versionNo: row.versionNo,
      requiresSession: row.requiresSession,
      demo: row.demo,
      href: `/training/${row.courseId}`,
    }));
  }, [records.data]);

  const legacyRows: DeskRow[] = useMemo(() => {
    const source = (legacy.data ?? []) as LegacyEnrollment[];
    return source.map((row) => {
      const person = staffOf(row.staff);
      return {
        key: `legacy:${row.id}`,
        id: row.id,
        staffName: person?.full_name ?? "",
        employeeCode: person?.employee_code ?? "",
        courseTitle: row.course_name,
        courseCode: "",
        status: row.status,
        dueOn: row.due_on,
        completedAt: row.completed_on,
        score: row.score,
        progressPercent: null,
        lessonCount: null,
        attemptCount: 0,
        failedAttempt: false,
        required: row.required,
        versionNo: null,
        requiresSession: false,
        demo: null,
        href: null,
      };
    });
  }, [legacy.data]);

  const progressRows = useMemo(() => [...engineRows, ...legacyRows], [engineRows, legacyRows]);
  const enrollmentRows = useMemo(
    () => [...legacyRows, ...engineRows.filter((row) => row.requiresSession)],
    [legacyRows, engineRows],
  );

  const activeRows = area === "external" && externalTab === "enrollments" ? enrollmentRows : progressRows;
  const filteredRows = useMemo(() => {
    const title = courseTitleQuery.trim().toLowerCase();
    return activeRows.filter((row) => {
      if (!recordMatchesQuery(row, recordQuery)) return false;
      if (title && !row.courseTitle.toLowerCase().includes(title)) return false;
      return recordMatchesStatus(row, recordFilter, today);
    });
  }, [activeRows, recordQuery, courseTitleQuery, recordFilter, today]);
  const totals = teamTotals(filteredRows, today);
  const recordPage = pageSlice(filteredRows, page, PAGE_SIZE);

  function exportPage() {
    const header = [
      t("learningDesk.employee"),
      t("learningDesk.code"),
      t("learningDesk.course"),
      t("learningDesk.progress"),
      t("learningDesk.score"),
      t("learningDesk.status"),
      t("learningDesk.due"),
    ];
    const lines = recordPage.rows.map((row) =>
      [
        row.staffName,
        row.employeeCode,
        row.courseTitle,
        row.progressPercent == null ? "" : String(row.progressPercent),
        row.score == null ? "" : String(row.score),
        row.status,
        row.dueOn ?? "",
      ]
        .map((cell) => csvCell(cell))
        .join(","),
    );
    const blob = new Blob([[header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "training-records.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <HrShell className="min-w-0 overflow-x-clip">
      <div className="min-w-0 space-y-5">
        <p className="text-sm text-[#6b657f]">
          {t("nav.peopleSectionDevelopment")}
          <span aria-hidden> / </span>
          <span className="text-[#1c1730]">{t("nav.learningTraining")}</span>
        </p>
        <AreaSwitch
          area={area}
          onAcademy={() => { setArea("academy"); setPage(1); }}
          onExternal={() => { setArea("external"); setPage(1); }}
        />
        {editorOpen ? (
          <CreateCourseEditor onClose={() => setEditorOpen(false)} />
        ) : area === "academy" ? (
          <>
            <InductionHero
              onExplore={() => setAcademyTab("explore")}
              onLearning={() => setAcademyTab("learning")}
            />
            <AcademyNav
              tab={academyTab}
              showManage={canEdit || canCreate}
              managePressed={academyTab === "explore" && courseFilter === "drafts"}
              onTab={setAcademyTab}
              onManage={() => {
                setAcademyTab("explore");
                setCourseFilter("drafts");
              }}
            />
            {academyTab === "explore" ? (
              <ExploreBoard
                loading={courses.isLoading}
                error={courses.data && !courses.data.ok ? courses.data.error : courses.isError ? t("hrWorkspace.loadFailed") : null}
                courses={visibleCourses}
                query={courseQuery}
                filter={courseFilter}
                onQuery={setCourseQuery}
                onFilter={setCourseFilter}
                canCreate={canCreate}
                onCreate={() => setEditorOpen(true)}
              />
            ) : null}
            {academyTab === "learning" ? (
              <LearningBoard
                loading={learning.isLoading}
                error={learning.data && !learning.data.ok ? learning.data.error : null}
                denied={!canLearn}
                staffId={learning.data?.ok ? learning.data.data.staffId : undefined}
                courses={myCourses}
                counts={myCounts}
                today={today}
                onExplore={() => setAcademyTab("explore")}
              />
            ) : null}
            {academyTab === "progress" ? (
              <RecordsBoard
                mode="progress"
                loading={records.isLoading || legacy.isLoading}
                error={records.data && !records.data.ok ? records.data.error : null}
                truncated={records.data?.ok ? records.data.data.truncated : false}
                totals={totals}
                rows={recordPage.rows}
                total={recordPage.total}
                page={recordPage.page}
                pages={recordPage.pages}
                query={recordQuery}
                titleQuery={courseTitleQuery}
                filter={recordFilter}
                selectedKey={selectedKey}
                today={today}
                onQuery={(value) => { setRecordQuery(value); setPage(1); }}
                onTitle={(value) => { setCourseTitleQuery(value); setPage(1); }}
                onFilter={(value) => { setRecordFilter(value); setPage(1); }}
                onSelect={setSelectedKey}
                onPage={setPage}
                onExport={exportPage}
              />
            ) : null}
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight text-[#1c1730]">{t("learningDesk.externalTitle")}</h1>
                <p className="mt-1 text-sm text-[#6b657f]">{t("learningDesk.externalSubtitle")}</p>
              </div>
              {canCreate ? (
                <Button type="button" className="border-transparent bg-[#6d4aff] text-white shadow-none hover:bg-[#5b3de6]" onClick={() => setEditorOpen(true)}>
                  + {t("learningDesk.createCourse")}
                </Button>
              ) : null}
            </div>
            <ExternalNav tab={externalTab} onTab={(id) => { setExternalTab(id); setPage(1); }} />
            {externalTab === "catalogue" ? (
              <CatalogueBoard
                loading={courses.isLoading || calendar.isLoading}
                courses={catalog}
                sessions={calendar.data?.ok ? calendar.data.data.sessions : []}
                canEdit={canEdit}
              />
            ) : (
              <RecordsBoard
                mode="enrollments"
                loading={records.isLoading || legacy.isLoading}
                error={records.data && !records.data.ok ? records.data.error : null}
                truncated={false}
                totals={totals}
                rows={recordPage.rows}
                total={recordPage.total}
                page={recordPage.page}
                pages={recordPage.pages}
                query={recordQuery}
                titleQuery={courseTitleQuery}
                filter={recordFilter}
                selectedKey={selectedKey}
                today={today}
                onQuery={(value) => { setRecordQuery(value); setPage(1); }}
                onTitle={(value) => { setCourseTitleQuery(value); setPage(1); }}
                onFilter={(value) => { setRecordFilter(value); setPage(1); }}
                onSelect={setSelectedKey}
                onPage={setPage}
                onExport={exportPage}
              />
            )}
          </>
        )}
      </div>
    </HrShell>
  );
}


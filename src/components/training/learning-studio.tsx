"use client";

import {
  ArrowRight,
  BookOpen,
  Clock,
  Download,
  Eye,
  LayoutGrid,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { FecLoader } from "@/components/fec";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  courseCoverSrc,
  deskRowIsDemo,
  recordIsCompleted,
  recordIsInProgress,
  recordIsOverdue,
  TRAINING_HERO,
  type CourseDeskFilter,
  type RecordStatusFilter,
  type TeamTotals,
} from "@/lib/training/desk";
import { enrollmentIsCompleted } from "@/lib/training/engine";
import { cn } from "@/lib/utils";

const purpleBtn =
  "border-transparent bg-[#6d4aff] text-white shadow-none hover:bg-[#5b3de6] focus-visible:ring-[#6d4aff]/40";
const softBtn =
  "border-[#e4dff5] bg-white text-[#2c2742] shadow-none hover:bg-[#f6f3ff]";

export type StudioCourse = {
  id: string;
  code: string;
  title: string;
  summary: string | null;
  description: string | null;
  requires_session_attendance: boolean;
  thumbnail_path: string | null;
  estimated_minutes: number | null;
  lesson_count: number;
};

export type StudioSession = {
  id: string;
  courseTitle: string;
  courseCode: string;
  startsAt: string;
  locationName: string;
  room: string | null;
  trainerName: string;
  participantCount: number;
  capacity: number;
};

export type StudioLearning = {
  id: string;
  title: string;
  code: string;
  status: string;
  dueOn: string | null;
  completedAt: string | null;
  required: boolean;
  progressPercent: number;
};

export type StudioRow = {
  key: string;
  staffName: string;
  employeeCode: string;
  courseTitle: string;
  status: string;
  dueOn: string | null;
  completedAt: string | null;
  score: number | null;
  progressPercent: number | null;
  attemptCount: number;
  failedAttempt: boolean;
  required: boolean;
  versionNo: number | null;
  demo: boolean | null;
  href: string | null;
};

function blurb(course: Pick<StudioCourse, "summary" | "description">) {
  const text = course.summary || course.description || "";
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

export function AreaSwitch({
  area,
  onAcademy,
  onExternal,
}: {
  area: "academy" | "external";
  onAcademy: () => void;
  onExternal: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-full border border-[#e7e2f4] bg-white p-1" role="group" aria-label={t("learningDesk.areaLabel")}>
      <Button type="button" size="sm" className={cn("rounded-full", area === "academy" ? purpleBtn : "bg-transparent text-[#3a3550] shadow-none hover:bg-[#f6f3ff]")} aria-pressed={area === "academy"} onClick={onAcademy}>
        {t("learningDesk.academy")}
      </Button>
      <Button type="button" size="sm" className={cn("rounded-full", area === "external" ? purpleBtn : "bg-transparent text-[#3a3550] shadow-none hover:bg-[#f6f3ff]")} aria-pressed={area === "external"} onClick={onExternal}>
        {t("learningDesk.external")}
      </Button>
    </div>
  );
}

export function InductionHero({
  onExplore,
  onLearning,
}: {
  onExplore: () => void;
  onLearning: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="overflow-hidden rounded-[28px] bg-[#f3eefe]">
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(240px,0.95fr)]">
        <div className="min-w-0 px-5 py-6 sm:px-8 sm:py-8">
          <p className="flex items-center gap-2 text-xs font-medium text-[#6a6288]">
            <Sparkles className="size-3.5 text-[#6d4aff]" aria-hidden />
            {t("learningDesk.heroEyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#1c1730] sm:text-4xl">{t("learningDesk.heroTitle")}</h2>
          <p className="mt-2 max-w-xl text-sm text-[#5c5674]">{t("learningDesk.heroSubtitle")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" className={purpleBtn} onClick={onExplore}>
              {t("learningDesk.exploreCourses")}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="outline" className={softBtn} onClick={onLearning}>
              <Play className="size-4" aria-hidden />
              {t("learningDesk.tabs.learning")}
            </Button>
          </div>
        </div>
        <div className="relative min-h-[200px] lg:min-h-full">
          <img src={TRAINING_HERO} alt="" className="h-full min-h-[200px] w-full object-cover" />
        </div>
      </div>
    </section>
  );
}

export function AcademyNav({
  tab,
  showManage,
  managePressed,
  onTab,
  onManage,
}: {
  tab: "explore" | "learning" | "progress";
  showManage: boolean;
  managePressed: boolean;
  onTab: (tab: "explore" | "learning" | "progress") => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const tabs = [
    ["explore", LayoutGrid],
    ["learning", Play],
    ["progress", Users],
  ] as const;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label={t("learningDesk.academyTabs")}>
        {tabs.map(([id, Icon]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            className={cn("rounded-full", tab === id ? purpleBtn : softBtn)}
            aria-pressed={tab === id}
            onClick={() => onTab(id)}
          >
            <Icon className="size-4" aria-hidden />
            {t(`learningDesk.tabs.${id}`)}
          </Button>
        ))}
      </div>
      {showManage ? (
        <Button type="button" size="sm" variant="outline" className={cn("ms-auto rounded-full", managePressed ? purpleBtn : softBtn)} aria-pressed={managePressed} onClick={onManage}>
          <SlidersHorizontal className="size-4" aria-hidden />
          {t("learningDesk.manage")}
        </Button>
      ) : null}
    </div>
  );
}

export function ExternalNav({
  tab,
  onTab,
}: {
  tab: "catalogue" | "enrollments";
  onTab: (tab: "catalogue" | "enrollments") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label={t("learningDesk.externalTabs")}>
      {(["catalogue", "enrollments"] as const).map((id) => (
        <Button key={id} type="button" size="sm" className={cn("rounded-full", tab === id ? purpleBtn : softBtn)} aria-pressed={tab === id} onClick={() => onTab(id)}>
          {t(`learningDesk.tabs.${id}`)}
        </Button>
      ))}
    </div>
  );
}

function CourseArtCard({
  title,
  code,
  text,
  cover,
  badge,
  minutes,
  lessons,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  code: string;
  text: string;
  cover: string;
  badge: string;
  minutes: string | null;
  lessons: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#ece8f5] bg-white">
      <div className="relative aspect-[16/10] bg-[#f4f0ff]">
        <img src={cover} alt="" className="h-full w-full object-cover" />
        <span className="absolute start-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-[#3c3558] shadow-sm">{badge}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="truncate text-xs text-[#7a748f]">{code}</p>
        <h3 className="mt-1 text-[15px] font-semibold leading-snug text-[#1c1730]">{title}</h3>
        {text ? <p className="mt-1 line-clamp-2 text-sm text-[#6b657f]">{text}</p> : null}
        <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#6b657f]">
          {minutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {minutes}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-3.5" aria-hidden />
            {lessons}
          </span>
        </p>
        <div className="mt-4 flex gap-2">
          <Button type="button" className={cn("min-w-0 flex-1", purpleBtn)} asChild>
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
          {secondaryHref && secondaryLabel ? (
            <Button type="button" variant="outline" className={softBtn} asChild>
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ExploreBoard({
  loading,
  error,
  courses,
  query,
  filter,
  onQuery,
  onFilter,
  canCreate,
  onCreate,
}: {
  loading: boolean;
  error: string | null;
  courses: StudioCourse[];
  query: string;
  filter: CourseDeskFilter;
  onQuery: (value: string) => void;
  onFilter: (value: CourseDeskFilter) => void;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#1c1730]">{t("learningDesk.findNext")}</h2>
          <p className="text-sm text-[#6b657f]">{t("learningDesk.findNextHint")}</p>
        </div>
        {canCreate ? (
          <Button type="button" variant="outline" className={softBtn} onClick={onCreate}>
            + {t("learningDesk.createCourse")}
          </Button>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor="learning-course-search" className="sr-only">{t("learningDesk.searchPrompt")}</Label>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[#8a849c]" aria-hidden />
          <Input id="learning-course-search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t("learningDesk.searchPrompt")} className="h-11 rounded-full border-[#e7e2f4] bg-white ps-10" />
        </div>
        <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label={t("learningDesk.filtersLabel")}>
          {(["all", "induction", "self", "drafts"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={cn("rounded-full px-3 py-1.5 text-sm", filter === id ? "font-semibold text-[#6d4aff]" : "text-[#6b657f] hover:text-[#1c1730]")}
              aria-pressed={filter === id}
              onClick={() => onFilter(id)}
            >
              {t(`learningDesk.filters.${id}`)}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <FecLoader label={t("common.loading")} /> : null}
      {!loading && !error && courses.length === 0 ? <p className="text-sm text-[#6b657f]">{t("learningDesk.noCourses")}</p> : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {courses.map((course, index) => (
          <CourseArtCard
            key={course.id}
            title={course.title}
            code={course.code}
            text={blurb(course)}
            cover={courseCoverSrc({ title: course.title, thumbnailPath: course.thumbnail_path, index })}
            badge={course.requires_session_attendance ? t("learningDesk.inPerson") : t("learningDesk.selfPaced")}
            minutes={course.estimated_minutes ? t("learningDesk.minutes", { count: course.estimated_minutes }) : null}
            lessons={t("learningDesk.lessons", { count: course.lesson_count })}
            primaryHref={`/training/${course.id}`}
            primaryLabel={t("learningDesk.viewCourse")}
          />
        ))}
      </div>
    </div>
  );
}

export function LearningBoard({
  loading,
  error,
  denied,
  staffId,
  courses,
  counts,
  today,
  onExplore,
}: {
  loading: boolean;
  error: string | null;
  denied: boolean;
  staffId: string | null | undefined;
  courses: StudioLearning[];
  counts: { assigned: number; inProgress: number; completed: number };
  today: string;
  onExplore: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<"all" | "progress" | "done">("all");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses.filter((course) => {
      const done = enrollmentIsCompleted({ status: course.status, completedAt: course.completedAt });
      if (bucket === "done" && !done) return false;
      if (bucket === "progress" && done) return false;
      if (!needle) return true;
      return `${course.title} ${course.code}`.toLowerCase().includes(needle);
    });
  }, [courses, query, bucket]);

  if (denied) return <p className="text-sm text-[#6b657f]">{t("trainingLearning.noAccess")}</p>;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#1c1730]">{t("learningDesk.myLearningTitle")}</h2>
          <p className="text-sm text-[#6b657f]">{t("learningDesk.myLearningHint")}</p>
        </div>
        <Button type="button" variant="outline" className={softBtn} onClick={onExplore}>
          {t("learningDesk.exploreCourses")}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {[
          [t("learningDesk.assigned"), counts.assigned],
          [t("learningDesk.statuses.inProgress"), counts.inProgress],
          [t("learningDesk.statuses.completed"), counts.completed],
        ].map(([label, value]) => (
          <span key={String(label)} className="inline-flex items-center gap-2 rounded-full border border-[#e7e2f4] bg-white px-3 py-1.5 text-sm text-[#3a3550]">
            <span className="font-semibold">{value}</span>
            {label}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor="my-learning-search" className="sr-only">{t("learningDesk.searchCourses")}</Label>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[#8a849c]" aria-hidden />
          <Input id="my-learning-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("learningDesk.searchCourses")} className="h-11 rounded-full border-[#e7e2f4] bg-white ps-10" />
        </div>
        <Label htmlFor="my-learning-bucket" className="sr-only">{t("learningDesk.allLearning")}</Label>
        <select
          id="my-learning-bucket"
          className="h-11 rounded-full border border-[#e7e2f4] bg-white px-3 text-sm"
          value={bucket}
          onChange={(event) => setBucket(event.target.value as "all" | "progress" | "done")}
        >
          <option value="all">{t("learningDesk.allLearning")}</option>
          <option value="progress">{t("learningDesk.statuses.inProgress")}</option>
          <option value="done">{t("learningDesk.statuses.completed")}</option>
        </select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <FecLoader label={t("common.loading")} /> : null}
      {staffId === null ? <p className="text-sm text-[#6b657f]">{t("trainingLearning.noStaff")}</p> : null}
      {!loading && !error && staffId !== null && visible.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-[28px] border border-[#ece8f5] bg-white px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#f3eefe] text-[#6d4aff]">
            <BookOpen className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-base font-semibold text-[#1c1730]">{t("learningDesk.skillStarts")}</p>
          <p className="mt-1 max-w-md text-sm text-[#6b657f]">{t("learningDesk.skillStartsHint")}</p>
          <Button type="button" className={cn("mt-5", purpleBtn)} onClick={onExplore}>
            {t("learningDesk.exploreCourses")}
          </Button>
        </div>
      ) : null}
      {visible.length > 0 ? (
        <ul className="min-w-0 space-y-2">
          {visible.map((course) => {
            const done = enrollmentIsCompleted({ status: course.status, completedAt: course.completedAt });
            const overdue = recordIsOverdue(course, today);
            return (
              <li key={course.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-[#ece8f5] bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[#1c1730]">{course.title}</p>
                  <p className="truncate text-xs text-[#6b657f]">{course.code} · {course.progressPercent}%</p>
                </div>
                {overdue ? <span className="text-sm font-medium text-red-600">{t("learningDesk.statuses.overdue")}</span> : null}
                <span className={cn("text-sm font-medium", done ? "text-emerald-600" : "text-[#6d4aff]")}>
                  {done ? t("learningDesk.statuses.completed") : t("learningDesk.statuses.inProgress")}
                </span>
                <Button type="button" size="sm" className={purpleBtn} asChild>
                  <Link href={`/training/learning/${course.id}`}>{done ? t("trainingLearning.view") : t("trainingLearning.continue")}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function CatalogueBoard({
  loading,
  courses,
  sessions,
  canEdit,
}: {
  loading: boolean;
  courses: StudioCourse[];
  sessions: StudioSession[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shownSessions = sessions.filter((session) => !needle || `${session.courseTitle} ${session.courseCode}`.toLowerCase().includes(needle));
  const shownCourses = courses.filter((course) => !needle || `${course.title} ${course.code}`.toLowerCase().includes(needle));
  if (loading) return <FecLoader label={t("common.loading")} />;
  return (
    <div className="min-w-0 space-y-4 rounded-[28px] border border-[#ece8f5] bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[#1c1730]">{t("learningDesk.catalogueHeading")}</h2>
      <div className="relative min-w-0">
        <Label htmlFor="external-course-search" className="sr-only">{t("learningDesk.searchCourses")}</Label>
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[#8a849c]" aria-hidden />
        <Input id="external-course-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("learningDesk.searchCourses")} className="h-11 rounded-full border-[#e7e2f4] ps-10" />
      </div>
      {shownSessions.length === 0 && shownCourses.length === 0 ? <p className="text-sm text-[#6b657f]">{t("learningDesk.noExternal")}</p> : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {shownSessions.map((session, index) => (
          <CourseArtCard
            key={session.id}
            title={session.courseTitle}
            code={session.courseCode}
            text={[session.locationName, session.room, session.trainerName, session.startsAt.slice(0, 10)].filter(Boolean).join(" · ")}
            cover={courseCoverSrc({ title: session.courseTitle, index })}
            badge={t("learningDesk.inPerson")}
            minutes={null}
            lessons={t("learningDesk.seats", { count: session.participantCount, capacity: session.capacity })}
            primaryHref="/training/assignments"
            primaryLabel={t("learningDesk.requestEnrollment")}
            secondaryHref={`/training/sessions/${session.id}`}
            secondaryLabel={t("learningDesk.open")}
          />
        ))}
        {shownCourses.map((course, index) => (
          <CourseArtCard
            key={course.id}
            title={course.title}
            code={course.code}
            text={blurb(course)}
            cover={courseCoverSrc({ title: course.title, thumbnailPath: course.thumbnail_path, index: index + shownSessions.length })}
            badge={course.requires_session_attendance ? t("learningDesk.inPerson") : t("learningDesk.selfPaced")}
            minutes={course.estimated_minutes ? t("learningDesk.minutes", { count: course.estimated_minutes }) : null}
            lessons={t("learningDesk.lessons", { count: course.lesson_count })}
            primaryHref={course.requires_session_attendance ? "/training/assignments" : `/training/${course.id}`}
            primaryLabel={course.requires_session_attendance ? t("learningDesk.requestEnrollment") : t("learningDesk.openAcademy")}
            secondaryHref={canEdit ? `/training/${course.id}` : undefined}
            secondaryLabel={canEdit ? t("learningDesk.editCourse") : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#ece8f5] bg-white px-4 py-4">
      <p className="text-sm text-[#6b657f]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#1c1730]">{value}</p>
    </div>
  );
}

export function RecordsBoard({
  mode,
  loading,
  error,
  truncated,
  totals,
  rows,
  total,
  page,
  pages,
  query,
  titleQuery,
  filter,
  selectedKey,
  today,
  onQuery,
  onTitle,
  onFilter,
  onSelect,
  onPage,
  onExport,
}: {
  mode: "progress" | "enrollments";
  loading: boolean;
  error: string | null;
  truncated: boolean;
  totals: TeamTotals;
  rows: StudioRow[];
  total: number;
  page: number;
  pages: number;
  query: string;
  titleQuery: string;
  filter: RecordStatusFilter;
  selectedKey: string | null;
  today: string;
  onQuery: (value: string) => void;
  onTitle: (value: string) => void;
  onFilter: (value: RecordStatusFilter) => void;
  onSelect: (key: string) => void;
  onPage: (page: number) => void;
  onExport: () => void;
}) {
  const { t } = useTranslation();
  const selected = rows.find((row) => row.key === selectedKey) ?? null;
  const progressMode = mode === "progress";
  return (
    <div className="min-w-0 space-y-4">
      {progressMode ? (
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile label={t("learningDesk.assigned")} value={String(totals.assigned)} />
          <StatTile label={t("learningDesk.statuses.completed")} value={String(totals.completed)} />
          <StatTile label={t("learningDesk.statuses.inProgress")} value={String(totals.inProgress)} />
          <StatTile label={t("learningDesk.statuses.failed")} value={String(totals.failed)} />
          <StatTile label={t("learningDesk.statuses.overdue")} value={String(totals.overdue)} />
          <StatTile label={t("learningDesk.average")} value={totals.averageScore == null ? t("learningDesk.noScore") : String(totals.averageScore)} />
        </div>
      ) : null}
      <section className="min-w-0 rounded-[28px] border border-[#ece8f5] bg-white p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#1c1730]">{progressMode ? t("learningDesk.recordsTitle") : t("learningDesk.enrollmentsTitle")}</h2>
            {progressMode ? <p className="mt-1 max-w-3xl text-sm text-[#6b657f]">{t("learningDesk.recordsBody")}</p> : null}
          </div>
          {progressMode ? (
            <Button type="button" size="sm" variant="outline" className={softBtn} onClick={onExport} disabled={rows.length === 0}>
              <Download className="size-4" aria-hidden />
              {t("learningDesk.exportPage")}
            </Button>
          ) : null}
        </div>
        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(9rem,0.6fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <Label htmlFor="learning-record-search" className="mb-1 block text-xs text-[#6b657f]">{t("learningDesk.searchPeople")}</Label>
            <Input id="learning-record-search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t("learningDesk.searchPeople")} className="min-w-0 rounded-xl border-[#e7e2f4]" />
          </div>
          <div className="min-w-0">
            <Label htmlFor="learning-status-filter" className="mb-1 block text-xs text-[#6b657f]">{t("learningDesk.statusLabel")}</Label>
            <select
              id="learning-status-filter"
              className="h-11 w-full rounded-xl border border-[#e7e2f4] bg-white px-3 text-sm"
              value={filter}
              onChange={(event) => onFilter(event.target.value as RecordStatusFilter)}
            >
              {(["all", "inProgress", "overdue", "completed", "failed"] as const).map((id) => (
                <option key={id} value={id}>{t(`learningDesk.statuses.${id}`)}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="learning-course-filter" className="mb-1 block text-xs text-[#6b657f]">{t("learningDesk.searchCourse")}</Label>
            <Input id="learning-course-filter" value={titleQuery} onChange={(event) => onTitle(event.target.value)} placeholder={t("learningDesk.searchCourse")} className="min-w-0 rounded-xl border-[#e7e2f4]" />
          </div>
        </div>
        <p className="mt-3 text-sm text-[#6b657f]">{t("learningDesk.accessible", { count: total })}</p>
        {truncated ? <p className="mt-1 text-sm text-[#6b657f]">{t("learningDesk.truncated")}</p> : null}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        {loading ? <FecLoader label={t("common.loading")} /> : null}
        {!loading && !error && total === 0 ? <p className="mt-4 text-sm text-[#6b657f]">{t("learningDesk.noRecords")}</p> : null}
        {total > 0 ? (
          <div className="mt-3 min-w-0 max-w-full overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-start text-xs font-medium text-[#7a748f]">
                  <th className="px-3 py-2 text-start font-medium">{t("learningDesk.employee")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("learningDesk.course")}</th>
                  <th className="px-3 py-2 text-start font-medium">{progressMode ? t("learningDesk.progressScore") : t("learningDesk.progress")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("learningDesk.status")}</th>
                  <th className="px-3 py-2 text-start font-medium">{progressMode ? t("learningDesk.dates") : t("learningDesk.dateExpiry")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const overdue = recordIsOverdue(row, today);
                  const inProgress = recordIsInProgress(row);
                  const completed = recordIsCompleted(row);
                  const percent = row.progressPercent;
                  return (
                    <tr key={row.key} className={cn("border-t border-[#f0edf6]", deskRowIsDemo(row.demo) && "opacity-70")}>
                      <td className="px-3 py-3 align-top">
                        <p className="font-medium text-[#1c1730]">{row.staffName || "—"}</p>
                        <p className="text-xs text-[#7a748f]">{row.employeeCode}</p>
                      </td>
                      <td className="max-w-[16rem] px-3 py-3 align-top">
                        <p className="font-medium text-[#1c1730]">{row.courseTitle}</p>
                        <p className="text-xs text-[#7a748f]">
                          {[
                            row.versionNo ? t("learningDesk.release", { version: row.versionNo }) : null,
                            row.required ? t("trainingLearning.mandatory") : t("trainingLearning.optional"),
                          ].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-xs text-[#6b657f]">{percent == null ? "—" : t("learningDesk.lessonProgress", { percent })}</p>
                        {percent != null ? (
                          <div className="mt-1 h-1.5 w-28 max-w-full overflow-hidden rounded-full bg-[#eceaf3]">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
                          </div>
                        ) : null}
                        <p className="mt-1 text-xs text-[#7a748f]">
                          {row.score == null ? t("learningDesk.noQuiz") : t("learningDesk.quizScore", { score: row.score })}
                          {row.attemptCount > 0 ? ` · ${t("learningDesk.attempts", { count: row.attemptCount })}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-0.5">
                          {completed ? <span className="text-sm font-medium text-emerald-600">{t("learningDesk.statuses.completed")}</span> : null}
                          {inProgress ? <span className="text-sm font-medium text-emerald-600">{t("learningDesk.statuses.inProgress")}</span> : null}
                          {overdue ? <span className="text-sm font-medium text-red-600">{t("learningDesk.statuses.overdue")}</span> : null}
                          {row.failedAttempt && !completed ? <span className="text-sm font-medium text-red-600">{t("learningDesk.statuses.failed")}</span> : null}
                          {!completed && !inProgress && !overdue ? (
                            <span className="text-sm text-[#3a3550]">{t(`learningDesk.rawStatus.${row.status}`, { defaultValue: row.status })}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-[#3a3550]">{row.dueOn ? `${t("learningDesk.due")}: ${row.dueOn}` : "—"}</td>
                      <td className="px-3 py-3 text-end align-top">
                        <Button type="button" size="sm" variant="outline" className={cn(softBtn, selected?.key === row.key && purpleBtn)} onClick={() => onSelect(row.key)}>
                          <Eye className="size-4" aria-hidden />
                          {progressMode ? t("learningDesk.viewRecord") : t("learningDesk.open")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {total > 0 ? (
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" className={softBtn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
              {t("learningDesk.previous")}
            </Button>
            <span className="text-sm text-[#6b657f]">{t("learningDesk.page", { page, pages, total })}</span>
            <Button type="button" size="sm" variant="outline" className={softBtn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
              {t("learningDesk.next")}
            </Button>
          </div>
        ) : null}
        {selected ? (
          <div className="mt-4 rounded-2xl border border-[#ece8f5] bg-[#faf9fd] p-4">
            <h3 className="text-sm font-semibold text-[#1c1730]">{t("learningDesk.recordTitle")}</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                [t("learningDesk.employee"), selected.staffName || "—"],
                [t("learningDesk.code"), selected.employeeCode || "—"],
                [t("learningDesk.course"), selected.courseTitle],
                [t("learningDesk.progress"), selected.progressPercent == null ? "—" : `${selected.progressPercent}%`],
                [t("learningDesk.score"), selected.score == null ? t("learningDesk.noQuiz") : String(selected.score)],
                [t("learningDesk.due"), selected.dueOn ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-[#7a748f]">{label}</dt>
                  <dd className="break-words text-sm text-[#1c1730]">{value}</dd>
                </div>
              ))}
            </dl>
            {selected.href ? (
              <Button type="button" size="sm" className={cn("mt-4", purpleBtn)} asChild>
                <Link href={selected.href}>{t("learningDesk.viewCourse")}</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

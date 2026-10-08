"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CapabilityGate } from "@/components/auth/capability-gate";
import { FecButton as Button, FecEmptyState, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import {
  createTrainingAssignment,
  listAssignableCourses,
  listTrainingAssignments,
  saveTrainingRule,
  searchTrainingStaff,
} from "@/lib/training/assignments.functions";
import {
  ASSIGNMENT_PRIORITIES,
  ASSIGNMENT_REMINDER_DAYS,
  ASSIGNMENT_TARGETS,
  SAVED_RULE_TRIGGERS,
  STORED_ONLY_ASSIGNMENT_TARGETS,
  type AssignmentTarget,
} from "@/lib/training/engine";

const ROLE_CODES = [
  "venue_supervisor",
  "shift_lead",
  "crew",
  "technician",
  "cashier",
  "cleaner",
  "security",
  "other",
  "ceo",
  "coo",
  "cfo",
  "regional_ops",
  "branch_gm",
  "duty_manager",
  "tech_supervisor",
  "cashier_host",
  "hr",
  "auditor",
  "customer_service",
];

type CourseOption = { id: string; code: string; title: string; published_version_id: string | null };
type StaffHit = { id: string; full_name: string; employee_code: string };
type AssignmentRow = {
  id: string;
  course_id: string | null;
  start_on: string | null;
  due_on: string | null;
  required: boolean;
  priority: string;
  reason: string | null;
  reminder_offsets_days: number[];
  created_at: string;
};
type RuleRow = { assignment_id: string; target: string };
type SavedRule = { id: string; trigger_kind: string; target: string; created_at: string };

const emptyForm = {
  courseId: "",
  target: "EMPLOYEE" as AssignmentTarget,
  staffIds: [] as string[],
  departmentId: "",
  locationId: "",
  roleCode: "",
  businessUnit: "",
  teamLabel: "",
  employmentType: "",
  customLabel: "",
  startOn: "",
  dueOn: "",
  required: true,
  priority: "NORMAL",
  reason: "",
  reminderOffsetsDays: [] as number[],
  confirmCompany: false,
};

export default function TrainingAssignmentsPage() {
  const { t } = useTranslation();
  const canAssign = usePermission("training.assign");
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [savedRules, setSavedRules] = useState<SavedRule[]>([]);
  const [courseTitles, setCourseTitles] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hits, setHits] = useState<StaffHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggerKind, setTriggerKind] = useState<(typeof SAVED_RULE_TRIGGERS)[number]>("JOIN_COMPANY");

  async function reload() {
    const [listed, options] = await Promise.all([listTrainingAssignments({}), listAssignableCourses({})]);
    if (!listed.ok) {
      setError(listed.error);
    } else {
      setAssignments(listed.data.assignments);
      setRules(listed.data.rules);
      setSavedRules(listed.data.savedRules);
      setCourseTitles(Object.fromEntries(listed.data.courses.map((course) => [course.id, `${course.code} — ${course.title}`])));
      setError(null);
    }
    if (options.ok) {
      setCourses(options.data.courses);
      setDepartments(options.data.departments);
      setLocations(options.data.locations);
    } else {
      setError(options.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function search(nextPage = 0) {
    const result = await searchTrainingStaff({ query, page: nextPage });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setHits(result.data.staff);
    setPage(nextPage);
  }

  function payload(course: CourseOption) {
    return {
      courseId: course.id,
      versionId: course.published_version_id ?? "",
      startOn: form.startOn || null,
      dueOn: form.dueOn || null,
      required: form.required,
      priority: form.priority as (typeof ASSIGNMENT_PRIORITIES)[number],
      reason: form.reason.trim() || null,
      reminderOffsetsDays: form.reminderOffsetsDays,
      target: form.target,
      staffIds: form.staffIds,
      departmentId: form.departmentId || null,
      locationId: form.locationId || null,
      roleCode: form.roleCode || null,
      businessUnit: form.businessUnit.trim() || null,
      teamLabel: form.teamLabel.trim() || null,
      employmentType: form.employmentType.trim() || null,
      customLabel: form.customLabel.trim() || null,
      confirmCompany: form.confirmCompany,
    };
  }

  const selectedCourse = courses.find((course) => course.id === form.courseId) ?? null;
  const storedOnly = (STORED_ONLY_ASSIGNMENT_TARGETS as readonly string[]).includes(form.target);

  return (
    <CapabilityGate capability="training.view" fallback={<p className="text-sm text-muted-foreground">{t("trainingAssignments.noAccess")}</p>}>
      <div className="space-y-6">
        <FecPageHeader
          icon={GraduationCap}
          kicker={t("nav.departments.training")}
          title={t("trainingAssignments.title")}
          subtitle={t("trainingAssignments.subtitle")}
          actions={<Link className="text-sm underline-offset-4 hover:underline" href="/training">{t("trainingCourses.back")}</Link>}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        {canAssign ? (
          <form
            className="grid gap-4 rounded-2xl border border-border bg-card p-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedCourse?.published_version_id) return;
              void (async () => {
                const result = await createTrainingAssignment(payload(selectedCourse));
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setNotice(t("trainingAssignments.saved", { count: result.data.enrolled }));
                setForm(emptyForm);
                setHits([]);
                await reload();
              })();
            }}
          >
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("trainingAssignments.course")}</span>
              <select className="min-h-11 rounded-lg border border-input bg-card px-3 text-sm" value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })} required>
                <option value="">—</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.code} — {course.title}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("trainingAssignments.target")}</span>
              <select className="min-h-11 rounded-lg border border-input bg-card px-3 text-sm" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value as AssignmentTarget, staffIds: [], confirmCompany: false })}>
                {ASSIGNMENT_TARGETS.map((target) => (
                  <option key={target} value={target}>{t(`trainingAssignments.targets.${target}`)}</option>
                ))}
              </select>
            </label>
            {form.target === "EMPLOYEE" ? (
              <div className="grid gap-2 md:col-span-2">
                <span className="text-sm font-medium">{t("trainingAssignments.employees")}</span>
                <p className="text-xs text-muted-foreground">{t("trainingAssignments.searchHint")}</p>
                <div className="flex gap-2">
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("trainingAssignments.search")} />
                  <Button type="button" variant="outline" onClick={() => void search(0)}>{t("trainingAssignments.search")}</Button>
                </div>
                <div className="grid gap-1">
                  {hits.map((person) => (
                    <label key={person.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.staffIds.includes(person.id)}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...form.staffIds, person.id].slice(0, 25)
                            : form.staffIds.filter((id) => id !== person.id);
                          setForm({ ...form, staffIds: next });
                        }}
                      />
                      {person.full_name} ({person.employee_code})
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={page === 0} onClick={() => void search(page - 1)}>{t("trainingCourses.up")}</Button>
                  <Button type="button" variant="outline" disabled={hits.length < 20} onClick={() => void search(page + 1)}>{t("trainingCourses.down")}</Button>
                </div>
              </div>
            ) : null}
            {form.target === "DEPARTMENT" ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("trainingAssignments.department")}</span>
                <select className="min-h-11 rounded-lg border border-input bg-card px-3 text-sm" value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>
                  <option value="">—</option>
                  {departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </label>
            ) : null}
            {form.target === "SITE" ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("trainingAssignments.site")}</span>
                <select className="min-h-11 rounded-lg border border-input bg-card px-3 text-sm" value={form.locationId} onChange={(event) => setForm({ ...form, locationId: event.target.value })}>
                  <option value="">—</option>
                  {locations.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}
                </select>
              </label>
            ) : null}
            {form.target === "ROLE" ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("trainingAssignments.role")}</span>
                <select className="min-h-11 rounded-lg border border-input bg-card px-3 text-sm" value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value })}>
                  <option value="">—</option>
                  {ROLE_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
            ) : null}
            {form.target === "BUSINESS_UNIT" ? <Input value={form.businessUnit} onChange={(event) => setForm({ ...form, businessUnit: event.target.value })} placeholder={t("trainingAssignments.businessUnit")} /> : null}
            {form.target === "TEAM" ? <Input value={form.teamLabel} onChange={(event) => setForm({ ...form, teamLabel: event.target.value })} placeholder={t("trainingAssignments.team")} /> : null}
            {form.target === "EMPLOYEE_TYPE" ? <Input value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value })} placeholder={t("trainingAssignments.employeeType")} /> : null}
            {form.target === "CUSTOM" ? <Input value={form.customLabel} onChange={(event) => setForm({ ...form, customLabel: event.target.value })} placeholder={t("trainingAssignments.customLabel")} /> : null}
            {storedOnly ? <p className="text-sm text-muted-foreground md:col-span-2">{t("trainingAssignments.storedOnly")}</p> : null}
            {form.target === "COMPANY" ? (
              <label className="flex items-start gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={form.confirmCompany} onChange={(event) => setForm({ ...form, confirmCompany: event.target.checked })} />
                <span>{t("trainingAssignments.companyWarning")} {t("trainingAssignments.confirmCompany")}</span>
              </label>
            ) : null}
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("trainingAssignments.start")}</span>
              <Input type="date" value={form.startOn} onChange={(event) => setForm({ ...form, startOn: event.target.value })} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("trainingAssignments.due")}</span>
              <Input type="date" value={form.dueOn} onChange={(event) => setForm({ ...form, dueOn: event.target.value })} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("trainingAssignments.priority")}</span>
              <select className="min-h-11 rounded-lg border border-input bg-card px-3 text-sm" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                {ASSIGNMENT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{t(`trainingAssignments.priorities.${priority}`)}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t("trainingAssignments.reason")}</span>
              <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </label>
            <fieldset className="grid gap-2 text-sm md:col-span-2">
              <legend className="font-medium">{t("trainingAssignments.reminders")}</legend>
              <div className="flex flex-wrap gap-3">
                {ASSIGNMENT_REMINDER_DAYS.map((day) => (
                  <label key={day} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={form.reminderOffsetsDays.includes(day)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...form.reminderOffsetsDays, day]
                          : form.reminderOffsetsDays.filter((value) => value !== day);
                        setForm({ ...form, reminderOffsetsDays: next });
                      }}
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.required} onChange={(event) => setForm({ ...form, required: event.target.checked })} />
              {t("trainingAssignments.mandatory")}
            </label>
            <div>
              <Button type="submit">{t("trainingAssignments.save")}</Button>
            </div>
          </form>
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">{t("trainingAssignments.loading")}</p> : assignments.length === 0 ? (
          <FecEmptyState message={t("trainingAssignments.empty")} />
        ) : (
          <ul className="grid gap-3">
            {assignments.map((row) => {
              const target = rules.find((rule) => rule.assignment_id === row.id)?.target ?? "EMPLOYEE";
              return (
                <li key={row.id} className="rounded-2xl border border-border bg-card p-4 text-sm">
                  <p className="font-medium">{row.course_id ? courseTitles[row.course_id] ?? row.course_id : "—"}</p>
                  <p className="text-muted-foreground">
                    {t(`trainingAssignments.targets.${target}`, target)}
                    {" · "}
                    {t(`trainingAssignments.priorities.${row.priority}`, row.priority)}
                    {row.due_on ? ` · ${row.due_on}` : ""}
                    {row.required ? ` · ${t("trainingAssignments.mandatory")}` : ""}
                  </p>
                  {row.reason ? <p>{row.reason}</p> : null}
                  {row.reminder_offsets_days.length > 0 ? <p className="text-muted-foreground">{t("trainingAssignments.reminders")}: {row.reminder_offsets_days.join(", ")}</p> : null}
                </li>
              );
            })}
          </ul>
        )}

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{t("trainingAssignments.rulesTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("trainingAssignments.rulesNote")}</p>
          {canAssign ? (
            <form
              className="grid gap-3 md:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!selectedCourse?.published_version_id) return;
                void (async () => {
                  const result = await saveTrainingRule({
                    courseId: selectedCourse.id,
                    versionId: selectedCourse.published_version_id,
                    triggerKind,
                    target: form.target,
                    staffId: form.staffIds[0] ?? null,
                    departmentId: form.departmentId || null,
                    locationId: form.locationId || null,
                    roleCode: form.roleCode || null,
                    businessUnit: form.businessUnit.trim() || null,
                    teamLabel: form.teamLabel.trim() || null,
                    employmentType: form.employmentType.trim() || null,
                    customLabel: form.customLabel.trim() || null,
                    required: form.required,
                    priority: form.priority as (typeof ASSIGNMENT_PRIORITIES)[number],
                    dueOffsetDays: null,
                    reminderOffsetsDays: form.reminderOffsetsDays,
                    reason: form.reason.trim() || null,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setNotice(t("trainingAssignments.ruleSaved"));
                  await reload();
                })();
              }}
            >
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t("trainingAssignments.trigger")}</span>
                <select className="min-h-11 rounded-lg border border-input bg-card px-3 text-sm" value={triggerKind} onChange={(event) => setTriggerKind(event.target.value as (typeof SAVED_RULE_TRIGGERS)[number])}>
                  {SAVED_RULE_TRIGGERS.map((kind) => <option key={kind} value={kind}>{t(`trainingAssignments.triggers.${kind}`)}</option>)}
                </select>
              </label>
              <div className="md:col-span-2 flex items-end">
                <Button type="submit" variant="outline">{t("trainingAssignments.saveRule")}</Button>
              </div>
            </form>
          ) : null}
          <ul className="grid gap-2 text-sm">
            {savedRules.map((rule) => (
              <li key={rule.id}>{t(`trainingAssignments.triggers.${rule.trigger_kind}`, rule.trigger_kind)} · {t(`trainingAssignments.targets.${rule.target}`, rule.target)}</li>
            ))}
          </ul>
        </section>
      </div>
    </CapabilityGate>
  );
}

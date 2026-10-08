"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, CalendarRange, List } from "lucide-react";
import { useTranslation } from "react-i18next";

import { FecButton as Button, FecEmptyState, FecPageHeader } from "@/components/fec";
import { Input } from "@/components/ui/input";
import { usePermission } from "@/hooks/use-permission";
import {
  createTrainingSession,
  listSessionFormOptions,
  listTrainingCalendar,
  searchSessionStaff,
} from "@/lib/training/sessions.functions";
import { sessionCapacityAllows } from "@/lib/training/engine";

type Options = {
  locations: { id: string; name: string; code: string }[];
  departments: { id: string; name: string }[];
  courses: { id: string; code: string; title: string; versionId: string }[];
};

type SessionRow = {
  id: string;
  courseTitle: string;
  courseCode: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  locationName: string;
  trainerName: string;
  capacity: number;
  participantCount: number;
};

type DueRow = { enrollmentId: string; courseTitle: string; dueOn: string };
type Person = { id: string; fullName: string; employeeCode: string };
type View = "month" | "week" | "agenda";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function rangeFor(view: View, anchor: Date): { from: Date; to: Date } {
  if (view === "week") {
    const day = anchor.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const from = startOfDay(addDays(anchor, mondayOffset));
    return { from, to: addDays(from, 7) };
  }
  if (view === "agenda") {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 21) };
  }
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  return { from, to };
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TrainingCalendarPage() {
  const { t } = useTranslation();
  const canCreate = usePermission("training.session.create");
  const canViewTraining = usePermission("training.view");
  const canFilterTrainer = canCreate || canViewTraining;
  const [view, setView] = useState<View>("agenda");
  const [anchor, setAnchor] = useState(() => new Date());
  const [options, setOptions] = useState<Options | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [dueDates, setDueDates] = useState<DueRow[]>([]);
  const [locationId, setLocationId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [trainer, setTrainer] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load(nextView: View, nextAnchor: Date, filters = { locationId, courseId, departmentId, trainer }) {
    const { from, to } = rangeFor(nextView, nextAnchor);
    const response = await listTrainingCalendar({
      from: from.toISOString(),
      to: to.toISOString(),
      locationId: filters.locationId || null,
      courseId: filters.courseId || null,
      departmentId: filters.departmentId || null,
      trainerStaffId: filters.trainer?.id ?? null,
    });
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setError(null);
    setSessions(response.data.sessions);
    setDueDates(response.data.dueDates);
  }

  useEffect(() => {
    void listSessionFormOptions({}).then((response) => {
      if (response.ok) setOptions(response.data);
    });
    void load("agenda", new Date());
  }, []);

  const { from, to } = rangeFor(view, anchor);
  const days: Date[] = [];
  if (view === "month") {
    const gridStart = addDays(from, from.getDay() === 0 ? -6 : 1 - from.getDay());
    for (let index = 0; index < 42; index += 1) days.push(addDays(gridStart, index));
  } else if (view === "week") {
    for (let index = 0; index < 7; index += 1) days.push(addDays(from, index));
  }

  return (
    <div className="space-y-6">
      <FecPageHeader icon={CalendarDays} title={t("trainingCalendar.title")} subtitle={t("trainingCalendar.subtitle")} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        <div className="fec-inner-tabs w-auto">
          {(["agenda", "week", "month"] as const).map((item) => {
            const Icon = item === "agenda" ? List : item === "week" ? CalendarDays : CalendarRange;
            return (
            <button
              key={item}
              type="button"
              className={view === item ? "fec-inner-tab is-active" : "fec-inner-tab"}
              onClick={() => { setView(item); void load(item, anchor); }}
            >
              <Icon aria-hidden />
              {t(`trainingCalendar.views.${item}`)}
            </button>
            );
          })}
        </div>
        <Button type="button" variant="outline" className="min-h-12" onClick={() => {
          const next = view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1) : addDays(anchor, view === "week" ? -7 : -21);
          setAnchor(next);
          void load(view, next);
        }}>{t("trainingCalendar.previous")}</Button>
        <Button type="button" variant="outline" className="min-h-12" onClick={() => {
          const next = view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) : addDays(anchor, view === "week" ? 7 : 21);
          setAnchor(next);
          void load(view, next);
        }}>{t("trainingCalendar.next")}</Button>
        {canCreate ? (
          <Button type="button" className="min-h-12" onClick={() => setShowForm((open) => !open)}>{t("trainingCalendar.newSession")}</Button>
        ) : null}
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <select className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingCalendar.site")} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">{t("trainingCalendar.allSites")}</option>
          {(options?.locations ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
        <select className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingCalendar.course")} value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          <option value="">{t("trainingCalendar.allCourses")}</option>
          {(options?.courses ?? []).map((row) => <option key={row.id} value={row.id}>{row.code} — {row.title}</option>)}
        </select>
        <select className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingCalendar.department")} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
          <option value="">{t("trainingCalendar.allDepartments")}</option>
          {(options?.departments ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
        <Button type="button" variant="outline" className="min-h-12" onClick={() => void load(view, anchor)}>{t("trainingCalendar.applyFilters")}</Button>
      </div>
      {canFilterTrainer ? (
        <StaffSearch
          label={t("trainingCalendar.trainer")}
          selected={trainer}
          onSelect={setTrainer}
          onClear={() => setTrainer(null)}
        />
      ) : null}
      {showForm && canCreate && options ? (
        <SessionForm
          options={options}
          onCreated={async (title) => {
            setNotice(t("trainingCalendar.saved", { title }));
            setShowForm(false);
            await load(view, anchor);
          }}
          onError={setError}
        />
      ) : null}
      {view === "agenda" || sessions.length === 0 ? (
        sessions.length === 0 && dueDates.length === 0 ? <FecEmptyState message={t("trainingCalendar.empty")} /> : (
          <ul className="grid gap-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link className="block min-h-12 rounded-xl border border-border bg-card px-3 py-3" href={`/training/sessions/${session.id}`}>
                  <span className="block font-medium">{session.courseTitle}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatWhen(session.startsAt)} · {session.locationName}{session.room ? ` · ${session.room}` : ""} · {session.trainerName}
                  </span>
                </Link>
              </li>
            ))}
            {dueDates.map((due) => (
              <li key={due.enrollmentId} className="min-h-12 rounded-xl border border-dashed border-border px-3 py-3 text-sm">
                {t("trainingCalendar.due", { course: due.courseTitle, date: due.dueOn })}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className={`grid gap-2 ${view === "week" ? "md:grid-cols-7" : "md:grid-cols-7"}`}>
          {days.filter((day) => view === "week" || (day >= addDays(from, -7) && day < addDays(to, 7))).slice(0, view === "week" ? 7 : 42).map((day) => {
            const onDay = sessions.filter((session) => sameDay(new Date(session.startsAt), day));
            const due = dueDates.filter((item) => item.dueOn === day.toISOString().slice(0, 10));
            return (
              <div key={day.toISOString()} className="min-h-24 rounded-xl border border-border p-2">
                <p className="text-xs text-muted-foreground">{day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</p>
                {onDay.map((session) => (
                  <Link key={session.id} className="mt-1 block min-h-12 rounded-lg bg-muted px-2 py-2 text-sm" href={`/training/sessions/${session.id}`}>
                    {session.courseCode}
                    <span className="block text-xs text-muted-foreground">{session.room || session.locationName}</span>
                  </Link>
                ))}
                {due.map((item) => (
                  <p key={item.enrollmentId} className="mt-1 text-xs">{t("trainingCalendar.dueShort", { course: item.courseTitle })}</p>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("trainingCalendar.range", { from: from.toLocaleDateString(), to: to.toLocaleDateString() })}</p>
    </div>
  );
}

function StaffSearch({
  label,
  selected,
  onSelect,
  onClear,
}: {
  label: string;
  selected: Person | null;
  onSelect: (person: Person) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Person[]>([]);

  async function search(nextPage: number) {
    const response = await searchSessionStaff({ query, page: nextPage });
    if (!response.ok) return;
    setRows(response.data.rows);
    setTotal(response.data.total);
    setPage(response.data.page);
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{label}{selected ? `: ${selected.fullName}` : ""}</p>
      {selected ? <Button type="button" variant="outline" className="min-h-12 w-fit" onClick={onClear}>{t("trainingCalendar.clearTrainer")}</Button> : null}
      <div className="flex flex-col gap-2 md:flex-row">
        <Input className="min-h-12" value={query} aria-label={label} placeholder={t("trainingCalendar.searchStaff")} onChange={(event) => setQuery(event.target.value)} />
        <Button type="button" variant="outline" className="min-h-12" disabled={query.trim().length < 1} onClick={() => void search(1)}>{t("trainingCalendar.search")}</Button>
      </div>
      <ul className="grid gap-2">
        {rows.map((person) => (
          <li key={person.id}>
            <button type="button" className="min-h-12 w-full rounded-lg border border-border px-3 text-left" onClick={() => onSelect(person)}>
              {person.fullName} · {person.employeeCode}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="min-h-12" disabled={page <= 1} onClick={() => void search(page - 1)}>{t("trainingCalendar.previous")}</Button>
        <Button type="button" variant="outline" className="min-h-12" disabled={page * 20 >= total} onClick={() => void search(page + 1)}>{t("trainingCalendar.next")}</Button>
      </div>
    </div>
  );
}

function SessionForm({
  options,
  onCreated,
  onError,
}: {
  options: Options;
  onCreated: (title: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [versionId, setVersionId] = useState(options.courses[0]?.versionId ?? "");
  const [locationId, setLocationId] = useState(options.locations[0]?.id ?? "");
  const [trainer, setTrainer] = useState<Person | null>(null);
  const [room, setRoom] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("12");
  const [participants, setParticipants] = useState<Person[]>([]);
  const [saving, setSaving] = useState(false);

  const course = options.courses.find((item) => item.versionId === versionId);

  return (
    <form
      className="grid gap-3 rounded-2xl border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trainer || !course) return;
        const start = new Date(startsAt);
        const end = new Date(endsAt);
        const cap = Number(capacity);
        if (!sessionCapacityAllows(cap, 0, participants.length)) {
          onError(t("trainingCalendar.capacityExceeded"));
          return;
        }
        setSaving(true);
        void createTrainingSession({
          versionId,
          trainerStaffId: trainer.id,
          locationId,
          room: room.trim() || null,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          capacity: cap,
          participants: participants.map((person) => person.id),
        }).then(async (response) => {
          setSaving(false);
          if (!response.ok) {
            onError(response.error);
            return;
          }
          await onCreated(course.title);
        });
      }}
    >
      <h2 className="text-lg font-medium">{t("trainingCalendar.newSession")}</h2>
      <select className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingCalendar.course")} value={versionId} onChange={(event) => setVersionId(event.target.value)} required>
        {options.courses.map((item) => <option key={item.versionId} value={item.versionId}>{item.code} — {item.title}</option>)}
      </select>
      <select className="min-h-12 rounded-lg border border-input bg-card px-3" aria-label={t("trainingCalendar.site")} value={locationId} onChange={(event) => setLocationId(event.target.value)} required>
        {options.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <StaffSearch label={t("trainingCalendar.trainer")} selected={trainer} onSelect={setTrainer} onClear={() => setTrainer(null)} />
      <Input className="min-h-12" type="datetime-local" aria-label={t("trainingCalendar.starts")} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
      <Input className="min-h-12" type="datetime-local" aria-label={t("trainingCalendar.ends")} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
      <Input className="min-h-12" aria-label={t("trainingCalendar.room")} placeholder={t("trainingCalendar.room")} value={room} onChange={(event) => setRoom(event.target.value)} />
      <Input className="min-h-12" type="number" min={1} aria-label={t("trainingCalendar.capacity")} value={capacity} onChange={(event) => setCapacity(event.target.value)} required />
      <StaffSearch
        label={t("trainingCalendar.participants", { count: participants.length, capacity: Number(capacity) || 0 })}
        selected={null}
        onSelect={(person) => {
          if (participants.some((item) => item.id === person.id)) return;
          if (!sessionCapacityAllows(Number(capacity) || 0, participants.length, 1)) {
            onError(t("trainingCalendar.capacityExceeded"));
            return;
          }
          setParticipants([...participants, person]);
        }}
        onClear={() => undefined}
      />
      <ul className="grid gap-2">
        {participants.map((person) => (
          <li key={person.id} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-border px-3">
            <span>{person.fullName} · {person.employeeCode}</span>
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setParticipants(participants.filter((item) => item.id !== person.id))}>{t("trainingCalendar.remove")}</Button>
          </li>
        ))}
      </ul>
      <Button type="submit" className="min-h-12" disabled={saving || !trainer}>{t("trainingCalendar.saveSession")}</Button>
    </form>
  );
}

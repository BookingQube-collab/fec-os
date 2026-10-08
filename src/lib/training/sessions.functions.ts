"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import { ATTENDANCE_STATUSES } from "./engine";

const uuid = z.string().uuid();
const optionalUuid = uuid.nullable();
const pageSize = 20;

const calendarCaps = ["training.view", "training.session.create", "training.learn"] as const;

const createInput = z
  .object({
    versionId: uuid,
    trainerStaffId: uuid,
    locationId: uuid,
    room: z.string().trim().max(80).nullable(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    capacity: z.number().int().min(1).max(500),
    participants: z.array(uuid).max(500),
  })
  .strict();

const calendarInput = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    locationId: optionalUuid,
    trainerStaffId: optionalUuid,
    courseId: optionalUuid,
    departmentId: optionalUuid,
  })
  .strict();

const staffInput = z
  .object({
    query: z.string().trim().max(80),
    page: z.number().int().min(1).max(10000),
  })
  .strict();

const detailInput = z.object({ sessionId: uuid }).strict();

const markInput = z
  .object({
    sessionId: uuid,
    staffId: uuid,
    status: z.enum(ATTENDANCE_STATUSES),
  })
  .strict();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export const listSessionFormOptions = createSafeAuthenticatedAction(
  z.object({}).strict(),
  async (_data, context) => {
    const [locations, departments, courses] = await Promise.all([
      context.supabase.from("locations").select("id, name, code").order("name"),
      context.supabase.from("master_departments").select("id, name").eq("active", true).order("sort_order"),
      context.supabase
        .from("training_courses")
        .select("id, code, title, published_version_id")
        .eq("status", "PUBLISHED")
        .not("published_version_id", "is", null)
        .order("title"),
    ]);
    throwIf(locations.error);
    throwIf(departments.error);
    throwIf(courses.error);
    return {
      locations: locations.data ?? [],
      departments: departments.data ?? [],
      courses: (courses.data ?? []).flatMap((course) =>
        course.published_version_id
          ? [{ id: course.id, code: course.code, title: course.title, versionId: course.published_version_id }]
          : [],
      ),
    };
  },
  { defaultInput: {}, auth: { anyCapability: [...calendarCaps] } },
);

export const searchSessionStaff = createSafeAuthenticatedAction(
  staffInput,
  async (data, context) => {
    const { data: payload, error } = await context.supabase.rpc("training_session_staff_page", {
      _query: data.query,
      _limit: pageSize,
      _offset: (data.page - 1) * pageSize,
    });
    throwIf(error);
    const record = asRecord(payload);
    const rows = Array.isArray(record.rows) ? record.rows : [];
    return {
      page: data.page,
      pageSize,
      total: Number(record.total ?? 0),
      rows: rows.flatMap((row) => {
        const item = asRecord(row);
        if (!item.id) return [];
        return [{ id: String(item.id), fullName: String(item.fullName ?? ""), employeeCode: String(item.employeeCode ?? "") }];
      }),
    };
  },
  { auth: { anyCapability: ["training.session.create", "training.view"] } },
);

export const createTrainingSession = createSafeAuthenticatedAction(
  createInput,
  async (data, context) => {
    const { data: sessionId, error } = await context.supabase.rpc("training_session_create", {
      _version_id: data.versionId,
      _trainer_staff_id: data.trainerStaffId,
      _location_id: data.locationId,
      _room: data.room,
      _starts_at: data.startsAt,
      _ends_at: data.endsAt,
      _capacity: data.capacity,
      _participants: data.participants,
    });
    throwIf(error);
    if (!sessionId) throw new Error("Could not create the session");
    return { id: sessionId };
  },
  { auth: { capability: "training.session.create" } },
);

export const listTrainingCalendar = createSafeAuthenticatedAction(
  calendarInput,
  async (data, context) => {
    const { data: payload, error } = await context.supabase.rpc("training_session_calendar", {
      _from: data.from,
      _to: data.to,
      _location_id: data.locationId,
      _trainer_staff_id: data.trainerStaffId,
      _course_id: data.courseId,
      _department_id: data.departmentId,
    });
    throwIf(error);
    const record = asRecord(payload);
    const sessions = Array.isArray(record.sessions) ? record.sessions : [];
    const dueDates = Array.isArray(record.dueDates) ? record.dueDates : [];
    return {
      sessions: sessions.map((row) => {
        const item = asRecord(row);
        return {
          id: String(item.id ?? ""),
          courseTitle: String(item.courseTitle ?? ""),
          courseCode: String(item.courseCode ?? ""),
          courseId: String(item.courseId ?? ""),
          startsAt: String(item.startsAt ?? ""),
          endsAt: String(item.endsAt ?? ""),
          room: item.room == null ? null : String(item.room),
          locationId: String(item.locationId ?? ""),
          locationName: String(item.locationName ?? ""),
          trainerStaffId: item.trainerStaffId == null ? null : String(item.trainerStaffId),
          trainerName: String(item.trainerName ?? ""),
          capacity: Number(item.capacity ?? 0),
          participantCount: Number(item.participantCount ?? 0),
        };
      }),
      dueDates: dueDates.map((row) => {
        const item = asRecord(row);
        return {
          enrollmentId: String(item.enrollmentId ?? ""),
          courseTitle: String(item.courseTitle ?? ""),
          dueOn: String(item.dueOn ?? ""),
        };
      }),
    };
  },
  { auth: { anyCapability: [...calendarCaps] } },
);

export const getTrainingSession = createSafeAuthenticatedAction(
  detailInput,
  async (data, context) => {
    const { data: payload, error } = await context.supabase.rpc("training_session_detail", {
      _session_id: data.sessionId,
    });
    throwIf(error);
    const record = asRecord(payload);
    const participants = Array.isArray(record.participants) ? record.participants : [];
    return {
      id: String(record.id ?? ""),
      courseTitle: String(record.courseTitle ?? ""),
      courseCode: String(record.courseCode ?? ""),
      startsAt: String(record.startsAt ?? ""),
      endsAt: String(record.endsAt ?? ""),
      room: record.room == null ? null : String(record.room),
      capacity: Number(record.capacity ?? 0),
      status: String(record.status ?? ""),
      locationName: String(record.locationName ?? ""),
      trainerName: String(record.trainerName ?? ""),
      participants: participants.map((row) => {
        const item = asRecord(row);
        const attendance = item.attendance == null ? null : String(item.attendance);
        return {
          staffId: String(item.staffId ?? ""),
          staffName: String(item.staffName ?? ""),
          employeeCode: String(item.employeeCode ?? ""),
          attendance: ATTENDANCE_STATUSES.find((status) => status === attendance) ?? null,
          markedAt: item.markedAt == null ? null : String(item.markedAt),
          markedByName: item.markedByName == null ? null : String(item.markedByName),
          canMark: item.canMark === true,
        };
      }),
    };
  },
  { auth: { anyCapability: [...calendarCaps] } },
);

export const markSessionAttendance = createSafeAuthenticatedAction(
  markInput,
  async (data, context) => {
    const { data: payload, error } = await context.supabase.rpc("training_session_mark_attendance", {
      _session_id: data.sessionId,
      _staff_id: data.staffId,
      _status: data.status,
    });
    throwIf(error);
    const record = asRecord(payload);
    return {
      status: String(record.status ?? data.status),
      markedAt: record.markedAt == null ? null : String(record.markedAt),
      courseCompleted: record.courseCompleted === true,
    };
  },
  { auth: { capability: "training.attendance.manage" } },
);

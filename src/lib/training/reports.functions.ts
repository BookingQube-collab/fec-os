"use server";

import { z } from "zod";

import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import { MATRIX_CELL_STATUSES } from "./engine";

const uuid = z.string().uuid();
const optionalUuid = uuid.nullable();

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const filters = z
  .object({
    locationId: optionalUuid,
    departmentId: optionalUuid,
    roleCode: z.string().trim().max(80).nullable(),
    courseId: optionalUuid,
    status: z.enum(MATRIX_CELL_STATUSES).nullable(),
    page: z.number().int().min(1).max(10000),
  })
  .strict();

export const listTrainingMatrix = createSafeAuthenticatedAction(
  filters,
  async (data, context) => {
    const pageSize = 25;
    const { data: payload, error } = await context.supabase.rpc("training_matrix", {
      _location_id: data.locationId,
      _department_id: data.departmentId,
      _role_code: data.roleCode,
      _course_id: data.courseId,
      _status: data.status,
      _limit: pageSize,
      _offset: (data.page - 1) * pageSize,
    });
    throwIf(error);
    const record = asRecord(payload);
    const courses = Array.isArray(record.courses) ? record.courses : [];
    const rows = Array.isArray(record.rows) ? record.rows : [];
    return {
      page: data.page,
      pageSize,
      total: Number(record.total ?? 0),
      courses: courses.map((row) => {
        const item = asRecord(row);
        return { id: String(item.id ?? ""), code: String(item.code ?? ""), title: String(item.title ?? "") };
      }),
      rows: rows.map((row) => {
        const item = asRecord(row);
        const cells = Array.isArray(item.cells) ? item.cells : [];
        return {
          staffId: String(item.staffId ?? ""),
          fullName: String(item.fullName ?? ""),
          employeeCode: String(item.employeeCode ?? ""),
          cells: cells.map((cell) => {
            const value = asRecord(cell);
            return {
              courseId: String(value.courseId ?? ""),
              courseCode: String(value.courseCode ?? ""),
              status: String(value.status ?? "NOT_TRAINED"),
              competency: value.competency == null ? null : String(value.competency),
            };
          }),
        };
      }),
    };
  },
  { auth: { anyCapability: ["training.view", "training.analytics.view", "training.learn"] } },
);

export const readTrainingDashboard = createSafeAuthenticatedAction(
  z.object({ locationId: optionalUuid, departmentId: optionalUuid }).strict(),
  async (data, context) => {
    const { data: payload, error } = await context.supabase.rpc("training_dashboard", {
      _location_id: data.locationId,
      _department_id: data.departmentId,
    });
    throwIf(error);
    const record = asRecord(payload);
    const rate = record.completionRate;
    const average = record.averageScore;
    return {
      activeCourses: Number(record.activeCourses ?? 0),
      learners: Number(record.learners ?? 0),
      completionRate: rate == null ? null : Number(rate),
      overdue: Number(record.overdue ?? 0),
      certificatesIssued: Number(record.certificatesIssued ?? 0),
      certificatesExpiring: Number(record.certificatesExpiring ?? 0),
      averageScore: average == null ? null : Number(average),
      failedAssessments: Number(record.failedAssessments ?? 0),
      trainingHours: Number(record.trainingHours ?? 0),
      upcomingSessions: Number(record.upcomingSessions ?? 0),
      complianceGaps: Number(record.complianceGaps ?? 0),
    };
  },
  { auth: { capability: "training.analytics.view" } },
);

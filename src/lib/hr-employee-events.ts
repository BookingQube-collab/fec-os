/**
 * Append-only employee timeline events (Phase 3).
 * Writers from status/salary history, leave final approve, document verify/replace.
 */

import type { Json } from "@/integrations/supabase/types";
import type { AuthContext } from "@/lib/server/create-action";

function qatarToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

export type EmployeeEventType =
  | "joining"
  | "status_change"
  | "salary_change"
  | "leave_approved"
  | "leave_rejected"
  | "ot_approved"
  | "ot_rejected"
  | "document_verified"
  | "document_replaced"
  | "document_uploaded"
  | string;

export function filterEmployeeTimeline<T extends { eventType: string }>(
  events: T[],
  eventType?: string | null,
): T[] {
  if (!eventType) return events;
  return events.filter((e) => e.eventType === eventType);
}

export async function appendEmployeeEvent(
  context: AuthContext,
  input: {
    staffId: string;
    eventType: EmployeeEventType;
    effectiveOn?: string;
    payload?: Record<string, unknown>;
    documentId?: string | null;
    sourceTable?: string | null;
    sourceId?: string | null;
  },
): Promise<{ id: string | null; skipped: boolean }> {
  const effectiveOn = input.effectiveOn ?? qatarToday();
  const { data, error } = await context.supabase
    .from("hr_employee_events")
    .insert({
      staff_id: input.staffId,
      event_type: input.eventType,
      effective_on: effectiveOn,
      payload: (input.payload ?? {}) as Json,
      actor_id: context.userId,
      document_id: input.documentId ?? null,
      source_table: input.sourceTable ?? null,
      source_id: input.sourceId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if (tableMissing(error.message)) return { id: null, skipped: true };
    throw error;
  }
  return { id: data.id as string, skipped: false };
}

/**
 * Phase 9 — documented capability expectations for Event PM authZ.
 * Mirrors CAPABILITIES in `src/lib/rbac.ts` and server action gates in `events.functions.ts`.
 * Used by regression/smoke tests; keep in sync when adding critical actions.
 */

import type { Capability } from "@/lib/rbac";

/** Capability required for each critical Event PM surface / action family. */
export const EVENT_CRITICAL_ACTIONS = [
  { id: "list_events", label: "List / calendar / dashboard / my tasks", capability: "events.view" as Capability },
  { id: "event_detail", label: "Open event workspace & reports", capability: "events.view" as Capability },
  { id: "create_event", label: "Create event / guided builder", capability: "events.create" as Capability },
  { id: "edit_plan", label: "Edit tasks, WBS, Kanban, resources, collaboration", capability: "events.edit" as Capability },
  { id: "launch_event", label: "Launch draft → active", capability: "events.edit" as Capability },
  { id: "health_override", label: "Override health RAG", capability: "events.approve" as Capability },
  { id: "go_live", label: "Approve go-live", capability: "events.approve" as Capability },
  { id: "budget_read", label: "Load budget / finance strip / finance reports", capability: "events.finance" as Capability },
  { id: "budget_edit", label: "Edit budget lines (draft/rejected)", capability: "events.finance" as Capability },
  { id: "budget_transition", label: "Submit/approve/reject/lock/reopen budget", capability: "events.finance" as Capability },
  { id: "templates_manage", label: "Manage plan templates", capability: "events.manage" as Capability },
  { id: "side_stage", label: "Move to Cancelled / On Hold", capability: "events.manage" as Capability },
] as const;

/** Roles that must never receive events.finance by default (view-only or floor). */
export const EVENTS_NO_FINANCE_BY_DEFAULT = [
  "duty_manager",
  "tech_supervisor",
  "auditor",
  "branch_gm",
  "technician",
  "cashier_host",
  "hr",
] as const;

/** Roles with events.finance by default. */
export const EVENTS_FINANCE_ROLES = ["ceo", "coo", "cfo", "regional_ops"] as const;

/** Roles with events.approve / events.manage by default. */
export const EVENTS_APPROVE_ROLES = ["ceo", "coo", "regional_ops", "branch_gm"] as const;

import { describe, expect, it } from "vitest";

import type { BoardTask } from "./task-board";
import {
  applyTaskSignoff,
  applyTaskStatus,
  boardPriorityFromWork,
  calendarDays,
  dependencyIssue,
  kanbanColumns,
  sourceHref,
  taskDraftFromSource,
  tasksForViewer,
  workloadSummary,
} from "./task-board";

function task(partial: Partial<BoardTask> & Pick<BoardTask, "id">): BoardTask {
  return {
    technicianStaffId: "tech-1",
    title: partial.id,
    kind: "REPAIR",
    span: "DAY",
    dueOn: "2026-10-14",
    priority: "normal",
    estimatedMinutes: 30,
    actualMinutes: null,
    status: "TODO",
    dependsOnId: null,
    sourceType: "fault",
    sourceId: `fault-${partial.id}`,
    evidence: null,
    verification: "NONE",
    ...partial,
  };
}

describe("technician task board", () => {
  it("points a repair card at the fault instead of copying the repair", () => {
    const draft = taskDraftFromSource({
      sourceType: "fault",
      sourceId: "fault-9",
      title: "ARC-14 · Belt slip",
      dueOn: "2026-10-14",
      technicianStaffId: "tech-1",
      priority: boardPriorityFromWork("critical_down"),
    });
    expect(draft).toEqual({
      title: "ARC-14 · Belt slip",
      kind: "REPAIR",
      span: "DAY",
      dueOn: "2026-10-14",
      priority: "critical",
      technicianStaffId: "tech-1",
      dependsOnId: null,
      sourceType: "fault",
      sourceId: "fault-9",
    });
    expect(sourceHref("fault", "fault-9")).toBe("/arcade/faults/fault-9");
    expect(sourceHref("pm_schedule", "sched-1", "game-1")).toBe("/arcade/pm?machineId=game-1");
    expect(sourceHref("observation", "obs-1")).toBe("/arcade/observation");
  });

  it("blocks a move until the earlier task is done, and rejects a cycle", () => {
    const first = task({ id: "a", status: "STARTED" });
    const second = task({ id: "b", dependsOnId: "a" });
    const byId = new Map([first, second].map((row) => [row.id, row]));
    expect(dependencyIssue("b", "a", byId, { requireDone: true })).toBe("blocked");
    expect(applyTaskStatus(second, "STARTED", byId, null)).toEqual({ ok: false, code: "blocked" });

    first.status = "DONE";
    expect(applyTaskStatus(second, "STARTED", byId, null).ok).toBe(true);

    const loop = task({ id: "c", dependsOnId: "b" });
    second.dependsOnId = "c";
    const cycled = new Map([first, second, loop].map((row) => [row.id, row]));
    expect(dependencyIssue("c", "b", cycled)).toBe("cycle");
    expect(dependencyIssue("b", "missing", cycled)).toBe("missing");
  });

  it("asks for evidence before done, then waits for someone else to sign off", () => {
    const row = task({ id: "a", status: "STARTED" });
    const byId = new Map([[row.id, row]]);
    expect(applyTaskStatus(row, "DONE", byId, "ok").ok).toBe(false);
    const done = applyTaskStatus(row, "DONE", byId, "Replaced the belt and tested a cycle.");
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.task.verification).toBe("PENDING");
    expect(done.task.evidence).toBe("Replaced the belt and tested a cycle.");

    expect(applyTaskSignoff(done.task, "APPROVED", { staffId: "tech-1", canVerify: true })).toEqual({
      ok: false,
      code: "own_task",
    });
    expect(applyTaskSignoff(done.task, "APPROVED", { staffId: "lead-1", canVerify: false })).toEqual({
      ok: false,
      code: "not_supervisor",
    });
    const signed = applyTaskSignoff(done.task, "APPROVED", { staffId: "lead-1", canVerify: true });
    expect(signed.ok && signed.task.verification).toBe("APPROVED");
    if (!signed.ok) return;
    expect(applyTaskStatus(signed.task, "STARTED", byId, null)).toEqual({ ok: false, code: "approved" });

    const returned = applyTaskSignoff(done.task, "RETURNED", { staffId: "lead-1", canVerify: true });
    expect(returned.ok && returned.task.status).toBe("STARTED");
    expect(returned.ok && returned.task.verification).toBe("RETURNED");
  });

  it("splits my work from the team, lays out the week, and totals workload", () => {
    const mine = task({ id: "mine", technicianStaffId: "tech-1", status: "TODO", estimatedMinutes: 45, priority: "high" });
    const weekly = task({
      id: "week",
      technicianStaffId: "tech-2",
      span: "WEEK",
      dueOn: "2026-10-14",
      kind: "PM",
      sourceType: "pm_schedule",
      status: "DONE",
      verification: "PENDING",
      actualMinutes: 20,
      estimatedMinutes: null,
    });
    const rows = [mine, weekly];
    expect(tasksForViewer(rows, "tech-1", "mine").map((row) => row.id)).toEqual(["mine"]);
    expect(tasksForViewer(rows, "tech-1", "team")).toHaveLength(2);

    const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
    const calendar = calendarDays(rows, days);
    expect(calendar["2026-10-14"]?.map((row) => row.id)).toEqual(["mine", "week"]);
    expect(calendar["2026-10-12"]?.map((row) => row.id)).toEqual(["week"]);
    expect(calendar["2026-10-13"]?.map((row) => row.id)).toEqual(["week"]);

    expect(kanbanColumns(rows).TODO.map((row) => row.id)).toEqual(["mine"]);
    expect(kanbanColumns(rows).DONE.map((row) => row.id)).toEqual(["week"]);
    expect(workloadSummary(rows)).toEqual([
      { staffId: "tech-1", open: 1, done: 0, pendingSignoff: 0, estimatedMinutes: 45, actualMinutes: 0 },
      { staffId: "tech-2", open: 0, done: 1, pendingSignoff: 1, estimatedMinutes: 0, actualMinutes: 20 },
    ]);
  });
});

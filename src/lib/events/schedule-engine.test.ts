import { describe, expect, it } from "vitest";

import { dependencyViolations } from "@/lib/events/health";
import {
  backwardSchedule,
  computeCriticalPath,
  criticalFlagUpdates,
  forwardSchedule,
} from "@/lib/events/schedule-engine";

describe("event pm phase 3 schedule engine", () => {
  it("marks the zero-float chain as critical (FS chain)", () => {
    const tasks = [
      { id: "a", start_date: "2026-11-01", due_date: "2026-11-03", duration_days: 2 },
      { id: "b", start_date: "2026-11-03", due_date: "2026-11-05", duration_days: 2 },
      { id: "c", start_date: "2026-11-05", due_date: "2026-11-07", duration_days: 2 },
      { id: "d", start_date: "2026-11-01", due_date: "2026-11-02", duration_days: 1 }, // parallel slack
    ];
    const deps = [
      { predecessor_id: "a", successor_id: "b", dep_type: "FS" as const, lag_days: 0 },
      { predecessor_id: "b", successor_id: "c", dep_type: "FS" as const, lag_days: 0 },
    ];
    const cpm = computeCriticalPath(tasks, deps);
    expect(cpm.hasCycle).toBe(false);
    expect(cpm.nodes.a.computedCritical).toBe(true);
    expect(cpm.nodes.b.computedCritical).toBe(true);
    expect(cpm.nodes.c.computedCritical).toBe(true);
    expect(cpm.nodes.d.computedCritical).toBe(false);
    expect((cpm.nodes.d.totalFloat ?? 0) > 0).toBe(true);
  });

  it("honors lag and FS push on forward schedule", () => {
    const tasks = [
      { id: "a", start_date: "2026-11-01", due_date: "2026-11-03", duration_days: 2 },
      { id: "b", start_date: "2026-11-02", due_date: "2026-11-04", duration_days: 2 }, // violates FS+1
    ];
    const deps = [
      { predecessor_id: "a", successor_id: "b", dep_type: "FS" as const, lag_days: 1 },
    ];
    const before = dependencyViolations(tasks, deps);
    expect(before.length).toBe(1);

    const result = forwardSchedule(tasks, deps);
    const b = result.tasks.find((t) => t.id === "b")!;
    expect(b.changed).toBe(true);
    expect(b.start_date).toBe("2026-11-04"); // pred finish 11-03 + lag 1
    expect(b.due_date).toBe("2026-11-06");
    expect(result.remainingViolations).toHaveLength(0);
  });

  it("backward schedule pulls predecessor earlier for FS", () => {
    const tasks = [
      { id: "a", start_date: "2026-11-05", due_date: "2026-11-07", duration_days: 2 },
      { id: "b", start_date: "2026-11-06", due_date: "2026-11-08", duration_days: 2 },
    ];
    const deps = [
      { predecessor_id: "a", successor_id: "b", dep_type: "FS" as const, lag_days: 0 },
    ];
    const result = backwardSchedule(tasks, deps);
    const a = result.tasks.find((t) => t.id === "a")!;
    expect(a.due_date! <= "2026-11-06").toBe(true);
    expect(result.remainingViolations).toHaveLength(0);
  });

  it("respects SS / FF / SF constraint kinds on forward schedule", () => {
    const ss = forwardSchedule(
      [
        { id: "p", start_date: "2026-11-10", due_date: "2026-11-12", duration_days: 2 },
        { id: "s", start_date: "2026-11-09", due_date: "2026-11-11", duration_days: 2 },
      ],
      [{ predecessor_id: "p", successor_id: "s", dep_type: "SS", lag_days: 0 }],
    );
    expect(ss.tasks.find((t) => t.id === "s")!.start_date).toBe("2026-11-10");

    const ff = forwardSchedule(
      [
        { id: "p", start_date: "2026-11-01", due_date: "2026-11-05", duration_days: 4 },
        { id: "s", start_date: "2026-11-01", due_date: "2026-11-03", duration_days: 2 },
      ],
      [{ predecessor_id: "p", successor_id: "s", dep_type: "FF", lag_days: 0 }],
    );
    expect(ff.tasks.find((t) => t.id === "s")!.due_date).toBe("2026-11-05");

    const sf = forwardSchedule(
      [
        { id: "p", start_date: "2026-11-10", due_date: "2026-11-12", duration_days: 2 },
        { id: "s", start_date: "2026-11-01", due_date: "2026-11-05", duration_days: 4 },
      ],
      [{ predecessor_id: "p", successor_id: "s", dep_type: "SF", lag_days: 0 }],
    );
    expect(sf.tasks.find((t) => t.id === "s")!.due_date).toBe("2026-11-10");
  });

  it("merges manual is_critical into critical flags", () => {
    const tasks = [
      { id: "a", start_date: "2026-11-01", due_date: "2026-11-02", duration_days: 1, is_critical: true },
      { id: "b", start_date: "2026-11-01", due_date: "2026-11-05", duration_days: 4 },
    ];
    const updates = criticalFlagUpdates(tasks, []);
    expect(updates.find((u) => u.id === "a")!.is_critical).toBe(true);
  });

  it("detects dependency cycles without crashing", () => {
    const tasks = [
      { id: "a", start_date: "2026-11-01", due_date: "2026-11-02", duration_days: 1 },
      { id: "b", start_date: "2026-11-02", due_date: "2026-11-03", duration_days: 1 },
    ];
    const deps = [
      { predecessor_id: "a", successor_id: "b", dep_type: "FS" as const, lag_days: 0 },
      { predecessor_id: "b", successor_id: "a", dep_type: "FS" as const, lag_days: 0 },
    ];
    const cpm = computeCriticalPath(tasks, deps);
    expect(cpm.hasCycle).toBe(true);
    const fwd = forwardSchedule(tasks, deps);
    expect(fwd.warnings).toContain("dependency_cycle");
  });
});

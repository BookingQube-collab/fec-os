import { describe, expect, it } from "vitest";

import {
  averageVelocity,
  backlogTasks,
  buildBurndownSeries,
  computeVelocity,
  groupTasksByStatus,
  pickActiveSprint,
  sumStoryPoints,
  tasksForSprintBoard,
} from "@/lib/events/agile";

describe("event pm phase 4 agile", () => {
  it("groups tasks into status columns", () => {
    const cols = groupTasksByStatus([
      { id: "1", status: "not_started" },
      { id: "2", status: "in_progress" },
      { id: "3", status: "completed" },
      { id: "4", status: "weird" },
    ]);
    expect(cols.not_started.map((t) => t.id)).toEqual(["1", "4"]);
    expect(cols.in_progress.map((t) => t.id)).toEqual(["2"]);
    expect(cols.completed.map((t) => t.id)).toEqual(["3"]);
  });

  it("picks the active sprint", () => {
    expect(
      pickActiveSprint([
        { id: "a", status: "planned" },
        { id: "b", status: "active" },
        { id: "c", status: "completed" },
      ])?.id,
    ).toBe("b");
    expect(pickActiveSprint([{ id: "a", status: "planned" }])).toBeNull();
  });

  it("treats unassigned open tasks as backlog when sprints exist", () => {
    const tasks = [
      { id: "1", status: "not_started", sprint_id: null },
      { id: "2", status: "in_progress", sprint_id: "s1" },
      { id: "3", status: "completed", sprint_id: null },
      { id: "4", status: "blocked", sprint_id: null },
    ];
    expect(backlogTasks(tasks).map((t) => t.id).sort()).toEqual(["1", "4"]);
  });

  it("falls back to not_started grouping when no sprints", () => {
    const tasks = [
      { id: "1", status: "not_started", sprint_id: null },
      { id: "2", status: "in_progress", sprint_id: null },
    ];
    expect(backlogTasks(tasks, { hasSprints: false }).map((t) => t.id)).toEqual(["1"]);
  });

  it("filters board by sprint / backlog / all", () => {
    const tasks = [
      { id: "1", status: "not_started", sprint_id: null },
      { id: "2", status: "in_progress", sprint_id: "s1" },
      { id: "3", status: "planned", sprint_id: "s2" },
    ];
    expect(tasksForSprintBoard(tasks, "s1").map((t) => t.id)).toEqual(["2"]);
    expect(tasksForSprintBoard(tasks, "backlog").map((t) => t.id)).toEqual(["1"]);
    expect(tasksForSprintBoard(tasks, "all")).toHaveLength(3);
  });

  it("sums story points", () => {
    expect(sumStoryPoints([{ id: "1", status: "x", story_points: 3 }, { id: "2", status: "x", story_points: 5 }])).toBe(8);
    expect(sumStoryPoints([{ id: "1", status: "x", story_points: null }])).toBe(0);
  });

  it("builds burndown remaining vs ideal", () => {
    const series = buildBurndownSeries(
      [
        { id: "a", status: "completed", story_points: 5, completed_at: "2026-11-02T10:00:00Z", sprint_id: "s" },
        { id: "b", status: "in_progress", story_points: 5, sprint_id: "s" },
      ],
      { start_date: "2026-11-01", end_date: "2026-11-05" },
      "2026-11-03",
    );
    expect(series[0]?.remaining).toBe(10);
    expect(series[0]?.ideal).toBe(10);
    const day2 = series.find((p) => p.date === "2026-11-02");
    expect(day2?.completed).toBe(5);
    expect(day2?.remaining).toBe(5);
    expect(series.at(-1)?.date).toBe("2026-11-05");
    expect(series.at(-1)?.ideal).toBe(0);
  });

  it("computes velocity and average", () => {
    const velocity = computeVelocity(
      [
        { id: "s1", name: "S1", status: "completed", start_date: null, end_date: null },
        { id: "s2", name: "S2", status: "active", start_date: null, end_date: null },
        { id: "s3", name: "S3", status: "planned", start_date: null, end_date: null },
      ],
      [
        { id: "1", status: "completed", sprint_id: "s1", story_points: 8 },
        { id: "2", status: "in_progress", sprint_id: "s1", story_points: 2 },
        { id: "3", status: "completed", sprint_id: "s2", story_points: 3 },
      ],
    );
    expect(velocity).toHaveLength(2);
    expect(velocity.find((v) => v.sprintId === "s1")).toEqual({
      sprintId: "s1",
      sprintName: "S1",
      committed: 10,
      completed: 8,
    });
    expect(averageVelocity(velocity)).toBe(5.5);
  });
});

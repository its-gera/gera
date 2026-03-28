import { describe, it, expect } from "vitest";
import { cleanTaskDisplay, getTaskTags } from "./taskFormatting";
import type { TaskEntity } from "../api";

function makeTask(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    text: "A task",
    completed: false,
    raw_line: "- [ ] A task",
    source_file: "tasks.md",
    line_number: 1,
    deadline: null,
    event_ids: [],
    project_ids: [],
    time_references: [],
    resolved_event_names: {},
    resolved_project_names: {},
    ...overrides,
  };
}

// ─── cleanTaskDisplay ────────────────────────────────────────────────────────

describe("cleanTaskDisplay", () => {
  it("returns text unchanged when there are no tokens", () => {
    const task = makeTask({ text: "Plain task" });
    expect(cleanTaskDisplay(task)).toBe("Plain task");
  });

  it("strips a single @event-id token", () => {
    const task = makeTask({
      text: "Review slides @evt-1",
      event_ids: ["evt-1"],
      resolved_event_names: { "evt-1": "Standup" },
    });
    expect(cleanTaskDisplay(task)).toBe("Review slides");
  });

  it("strips multiple event tokens", () => {
    const task = makeTask({
      text: "Task @evt-1 @evt-2",
      event_ids: ["evt-1", "evt-2"],
      resolved_event_names: { "evt-1": "Standup", "evt-2": "Retro" },
    });
    expect(cleanTaskDisplay(task)).toBe("Task");
  });

  it("strips a #project-id token", () => {
    const task = makeTask({
      text: "Do something #proj-1",
      project_ids: ["proj-1"],
      resolved_project_names: { "proj-1": "Alpha" },
    });
    expect(cleanTaskDisplay(task)).toBe("Do something");
  });

  it("strips an ISO datetime @deadline token", () => {
    const task = makeTask({ text: "Finish report @2026-03-01T09:00" });
    expect(cleanTaskDisplay(task)).toBe("Finish report");
  });

  it("strips mixed tokens in one pass", () => {
    const task = makeTask({
      text: "Task @evt-1 #proj-2 @2026-03-01T00:00",
      event_ids: ["evt-1"],
      project_ids: ["proj-2"],
      resolved_event_names: { "evt-1": "Standup" },
      resolved_project_names: { "proj-2": "Beta" },
    });
    expect(cleanTaskDisplay(task)).toBe("Task");
  });

  it("strips a time_reference token", () => {
    const task = makeTask({
      text: "Prep @before[30m]:evt-1",
      time_references: [{ modifier: "before", amount: 30, unit: "m", target_id: "evt-1" }],
    });
    expect(cleanTaskDisplay(task)).toBe("Prep");
  });

  it("strips event token even when event_id has no resolved name", () => {
    const task = makeTask({
      text: "Task @evt-unknown",
      event_ids: ["evt-unknown"],
      resolved_event_names: {},
    });
    expect(cleanTaskDisplay(task)).toBe("Task");
  });
});

// ─── getTaskTags ─────────────────────────────────────────────────────────────

describe("getTaskTags", () => {
  it("returns empty arrays and no deadline for a plain task", () => {
    const tags = getTaskTags(makeTask());
    expect(tags.eventTags).toEqual([]);
    expect(tags.projectTags).toEqual([]);
    expect(tags.hasDeadline).toBe(false);
  });

  it("returns an event tag with correct id and name", () => {
    const task = makeTask({
      event_ids: ["e1"],
      resolved_event_names: { e1: "Standup" },
    });
    const { eventTags } = getTaskTags(task);
    expect(eventTags).toHaveLength(1);
    expect(eventTags[0]).toEqual({ id: "e1", name: "Standup" });
  });

  it("returns multiple event tags", () => {
    const task = makeTask({
      event_ids: ["e1", "e2"],
      resolved_event_names: { e1: "Standup", e2: "Retro" },
    });
    expect(getTaskTags(task).eventTags).toHaveLength(2);
  });

  it("returns a project tag with correct id and name", () => {
    const task = makeTask({
      project_ids: ["p1"],
      resolved_project_names: { p1: "Alpha" },
    });
    const { projectTags } = getTaskTags(task);
    expect(projectTags).toHaveLength(1);
    expect(projectTags[0]).toEqual({ id: "p1", name: "Alpha" });
  });

  it("returns hasDeadline true when deadline is set", () => {
    const task = makeTask({ deadline: "2026-03-01T09:00:00" });
    expect(getTaskTags(task).hasDeadline).toBe(true);
  });

  it("returns hasDeadline false when deadline is null", () => {
    expect(getTaskTags(makeTask({ deadline: null })).hasDeadline).toBe(false);
  });
});

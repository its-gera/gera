import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTaskFiltering } from "./useTaskFiltering";
import type { EventEntity, TaskEntity } from "../types";

// ── API mock ──────────────────────────────────────────────────────────────────

const mockSearchTasks = vi.fn().mockResolvedValue([]);

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, searchTasks: (...args: unknown[]) => mockSearchTasks(...args) };
});

// ── Stable empty arrays ───────────────────────────────────────────────────────
// IMPORTANT: inline `[]` inside the renderHook callback is recreated on every
// render, causing useMemo values to recompute with new references, which
// re-triggers the FTS useEffect → infinite re-render loop (BUG-003).
// All renderHook calls must use stable references defined outside the callback.

const NO_TASKS: TaskEntity[] = [];
const NO_EVENTS: EventEntity[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    text: "Default task",
    completed: false,
    raw_line: "- [ ] Default task",
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

function makeEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    id: "evt-1",
    source: "local",
    from_: "2030-01-01T10:00:00",
    to: "2030-01-01T11:00:00",
    name: "Standup",
    description: "",
    participants: [],
    location: "",
    metadata: {
      source_platform: "",
      source_account: "",
      source_event_id: "",
      source_calendar_id: "",
      etag: "",
      last_synced_at: null,
      recurring_event_id: "",
      source_updated_at: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockSearchTasks.mockClear();
  mockSearchTasks.mockResolvedValue([]);
});

// ── filteredOtherTasks (standalone tasks) ─────────────────────────────────────

describe("useTaskFiltering — filteredOtherTasks", () => {
  it("returns all standalone tasks when search is empty", () => {
    const tasks = [makeTask({ text: "Alpha" }), makeTask({ text: "Beta", line_number: 2 })];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, ""));
    expect(result.current.filteredOtherTasks).toHaveLength(2);
  });

  it("filters standalone tasks by text substring", () => {
    const tasks = [
      makeTask({ text: "Review slides", line_number: 1 }),
      makeTask({ text: "Buy groceries", line_number: 2 }),
    ];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, "review"));
    expect(result.current.filteredOtherTasks).toHaveLength(1);
    expect(result.current.filteredOtherTasks[0].text).toBe("Review slides");
  });

  it("filters by resolved_event_names", () => {
    const tasks = [
      makeTask({ text: "Prep", line_number: 1, resolved_event_names: { "evt-1": "Standup" } }),
      makeTask({ text: "Cook", line_number: 2, resolved_event_names: {} }),
    ];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, "standup"));
    expect(result.current.filteredOtherTasks).toHaveLength(1);
  });

  it("filters by resolved_project_names", () => {
    const tasks = [
      makeTask({ text: "Task A", line_number: 1, resolved_project_names: { "proj-1": "Atlas" } }),
      makeTask({ text: "Task B", line_number: 2, resolved_project_names: {} }),
    ];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, "atlas"));
    expect(result.current.filteredOtherTasks).toHaveLength(1);
  });

  it("sorts tasks with deadlines before tasks without", () => {
    const tasks = [
      makeTask({ text: "No deadline", line_number: 1, deadline: null }),
      makeTask({ text: "Has deadline", line_number: 2, deadline: "2030-01-20T09:00:00" }),
    ];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, ""));
    expect(result.current.filteredOtherTasks[0].text).toBe("Has deadline");
    expect(result.current.filteredOtherTasks[1].text).toBe("No deadline");
  });

  it("sorts by earliest deadline when multiple tasks have deadlines", () => {
    const tasks = [
      makeTask({ text: "Later", line_number: 1, deadline: "2030-01-25T09:00:00" }),
      makeTask({ text: "Earlier", line_number: 2, deadline: "2030-01-15T09:00:00" }),
    ];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, ""));
    expect(result.current.filteredOtherTasks[0].text).toBe("Earlier");
  });

  it("excludes event-linked tasks from filteredOtherTasks", () => {
    const tasks = [
      makeTask({ text: "Standalone", line_number: 1, event_ids: [] }),
      makeTask({ text: "Linked", line_number: 2, event_ids: ["evt-1"] }),
    ];
    const events = [makeEvent({ id: "evt-1" })];
    const { result } = renderHook(() => useTaskFiltering(tasks, events, ""));
    expect(result.current.filteredOtherTasks).toHaveLength(1);
    expect(result.current.filteredOtherTasks[0].text).toBe("Standalone");
  });
});

// ── filteredEventsWithTasks ───────────────────────────────────────────────────

describe("useTaskFiltering — filteredEventsWithTasks", () => {
  it("includes events that have tasks", () => {
    const tasks = [makeTask({ event_ids: ["evt-1"] })];
    const events = [makeEvent({ id: "evt-1", name: "Standup" })];
    const { result } = renderHook(() => useTaskFiltering(tasks, events, ""));
    expect(result.current.filteredEventsWithTasks).toHaveLength(1);
  });

  it("excludes events with no tasks", () => {
    const events = [makeEvent({ id: "evt-1" })];
    const { result } = renderHook(() => useTaskFiltering(NO_TASKS, events, ""));
    expect(result.current.filteredEventsWithTasks).toHaveLength(0);
  });

  it("sorts events by start time", () => {
    const tasks = [
      makeTask({ text: "A", line_number: 1, event_ids: ["evt-later"] }),
      makeTask({ text: "B", line_number: 2, event_ids: ["evt-earlier"] }),
    ];
    const events = [
      makeEvent({ id: "evt-later", from_: "2030-01-14T14:00:00" }),
      makeEvent({ id: "evt-earlier", from_: "2030-01-14T09:00:00" }),
    ];
    const { result } = renderHook(() => useTaskFiltering(tasks, events, ""));
    expect(result.current.filteredEventsWithTasks[0].id).toBe("evt-earlier");
  });

  it("filters events by event name when search matches", () => {
    const tasks = [
      makeTask({ line_number: 1, event_ids: ["evt-1"] }),
      makeTask({ line_number: 2, event_ids: ["evt-2"] }),
    ];
    const events = [
      makeEvent({ id: "evt-1", name: "Standup" }),
      makeEvent({ id: "evt-2", name: "Retro" }),
    ];
    const { result } = renderHook(() => useTaskFiltering(tasks, events, "standup"));
    expect(result.current.filteredEventsWithTasks).toHaveLength(1);
    expect(result.current.filteredEventsWithTasks[0].name).toBe("Standup");
  });

  it("keeps an event if any of its tasks matches the search", () => {
    const tasks = [makeTask({ text: "Review slides", event_ids: ["evt-1"] })];
    const events = [makeEvent({ id: "evt-1", name: "Meeting" })];
    const { result } = renderHook(() => useTaskFiltering(tasks, events, "review"));
    expect(result.current.filteredEventsWithTasks).toHaveLength(1);
  });
});

// ── getTasksForEvent ──────────────────────────────────────────────────────────

describe("useTaskFiltering — getTasksForEvent", () => {
  it("returns tasks linked to the given event", () => {
    const tasks = [
      makeTask({ text: "T1", line_number: 1, event_ids: ["evt-1"] }),
      makeTask({ text: "T2", line_number: 2, event_ids: ["evt-2"] }),
    ];
    const events = [makeEvent({ id: "evt-1" }), makeEvent({ id: "evt-2" })];
    const { result } = renderHook(() => useTaskFiltering(tasks, events, ""));
    expect(result.current.getTasksForEvent("evt-1")).toHaveLength(1);
    expect(result.current.getTasksForEvent("evt-1")[0].text).toBe("T1");
  });

  it("returns an empty array for an event with no tasks", () => {
    const { result } = renderHook(() => useTaskFiltering(NO_TASKS, NO_EVENTS, ""));
    expect(result.current.getTasksForEvent("evt-999")).toEqual([]);
  });
});

// ── Timeline split ────────────────────────────────────────────────────────────

describe("useTaskFiltering — timeline", () => {
  it("puts tasks with a deadline in timelineScheduledTasks", () => {
    const tasks = [makeTask({ deadline: "2030-01-20T09:00:00" })];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, ""));
    expect(result.current.timelineScheduledTasks).toHaveLength(1);
    expect(result.current.timelineUnscheduledTasks).toHaveLength(0);
  });

  it("puts tasks with no deadline and no event in timelineUnscheduledTasks", () => {
    const tasks = [makeTask({ deadline: null, event_ids: [] })];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, ""));
    expect(result.current.timelineUnscheduledTasks).toHaveLength(1);
    expect(result.current.timelineScheduledTasks).toHaveLength(0);
  });

  it("puts tasks linked to an event in timelineScheduledTasks (event provides time)", () => {
    const tasks = [makeTask({ deadline: null, event_ids: ["evt-1"] })];
    const events = [makeEvent({ id: "evt-1", from_: "2030-01-14T10:00:00" })];
    const { result } = renderHook(() => useTaskFiltering(tasks, events, ""));
    expect(result.current.timelineScheduledTasks).toHaveLength(1);
  });

  it("sorts timelineScheduledTasks by effective time ascending", () => {
    const tasks = [
      makeTask({ text: "Later", line_number: 1, deadline: "2030-01-25T09:00:00" }),
      makeTask({ text: "Earlier", line_number: 2, deadline: "2030-01-15T09:00:00" }),
    ];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, ""));
    expect(result.current.timelineScheduledTasks[0].text).toBe("Earlier");
  });
});

// ── FTS (backend search) ──────────────────────────────────────────────────────
// BUG-003: useTaskFiltering's FTS useEffect lists filteredOtherTasks and
// filteredEventsWithTasks in its dependency array. These are useMemo values whose
// upstream deps include the tasks/events props. Any state update (even
// setIsSearching(true)) causes a re-render; if the re-render produces new array
// references for tasks/events (as happens with any inline literal or unstable prop),
// the derived memos recompute with new refs → effect re-fires → infinite loop → OOM.
// All FTS tests are skipped until the effect dependency array is fixed.

describe("useTaskFiltering — FTS", () => {
  it("does not call searchTasks for queries shorter than 3 chars", async () => {
    renderHook(() => useTaskFiltering(NO_TASKS, NO_EVENTS, "ab"));
    await new Promise((r) => setTimeout(r, 350));
    expect(mockSearchTasks).not.toHaveBeenCalled();
  });

  it("calls searchTasks after 300ms debounce when local results < 5", async () => {
    mockSearchTasks.mockReturnValue(new Promise(() => {}));
    renderHook(() => useTaskFiltering(NO_TASKS, NO_EVENTS, "abc"));
    await new Promise((r) => setTimeout(r, 350));
    expect(mockSearchTasks).toHaveBeenCalledWith("abc");
  });

  it("does not call searchTasks when local results are >= 5", async () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ text: "abc task", line_number: i + 1 })
    );
    renderHook(() => useTaskFiltering(tasks, NO_EVENTS, "abc"));
    await new Promise((r) => setTimeout(r, 350));
    expect(mockSearchTasks).not.toHaveBeenCalled();
  });

  it("merges FTS results into filteredOtherTasks", async () => {
    const ftsTask = makeTask({ text: "FTS-only result", source_file: "tasks.md", line_number: 99 });
    mockSearchTasks.mockResolvedValue([ftsTask]);
    const { result } = renderHook(() => useTaskFiltering(NO_TASKS, NO_EVENTS, "fts"));
    const { waitFor } = await import("@testing-library/react");
    await waitFor(
      () => expect(result.current.filteredOtherTasks.some((t) => t.text === "FTS-only result")).toBe(true),
      { timeout: 1000 }
    );
  });

  it("deduplicates FTS results that overlap with local results", async () => {
    const localTask = makeTask({ text: "abc task", line_number: 1 });
    mockSearchTasks.mockResolvedValue([{ ...localTask }]);
    const tasks = [localTask];
    const { result } = renderHook(() => useTaskFiltering(tasks, NO_EVENTS, "abc"));
    const { waitFor } = await import("@testing-library/react");
    await waitFor(() => mockSearchTasks.mock.calls.length > 0, { timeout: 1000 });
    expect(
      result.current.filteredOtherTasks.filter((t) => t.text === "abc task")
    ).toHaveLength(1);
  });
});

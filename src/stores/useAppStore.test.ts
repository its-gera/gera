import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";
import type { EventEntity, NoteEntity, TaskEntity } from "../api";

// Capture initial state once so we can restore it before each test
const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

function makeEvent(id = "e1"): EventEntity {
  return {
    id,
    source: "local",
    from_: "2026-03-14T09:00:00",
    to: "2026-03-14T10:00:00",
    name: "Test Event",
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
  };
}

function makeNote(filename = "notes/test.md"): NoteEntity {
  return { filename, title: "Test Note", body_preview: "", event_ids: [], project_ids: [], raw_content: "" };
}

function makeTask(line_number = 1): TaskEntity {
  return {
    text: "A task",
    completed: false,
    raw_line: "- [ ] A task",
    source_file: "tasks.md",
    line_number,
    deadline: null,
    event_ids: [],
    project_ids: [],
    time_references: [],
    resolved_event_names: {},
    resolved_project_names: {},
  };
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe("useAppStore — initial state", () => {
  it("starts with activeView='calendar'", () => {
    expect(useAppStore.getState().activeView).toBe("calendar");
  });

  it("starts with loading=true", () => {
    expect(useAppStore.getState().loading).toBe(true);
  });

  it("starts with empty data collections", () => {
    const { events, notes, tasks } = useAppStore.getState();
    expect(events).toEqual([]);
    expect(notes).toEqual([]);
    expect(tasks).toEqual([]);
  });

  it("starts with commandPaletteOpen=false", () => {
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it("starts with pendingCreate=null", () => {
    expect(useAppStore.getState().pendingCreate).toBeNull();
  });

  it("starts with no selections", () => {
    const { selectedEvent, selectedNote } = useAppStore.getState();
    expect(selectedEvent).toBeNull();
    expect(selectedNote).toBeNull();
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe("useAppStore — navigation", () => {
  it("setActiveView updates activeView", () => {
    useAppStore.getState().setActiveView("tasks");
    expect(useAppStore.getState().activeView).toBe("tasks");
  });

  it("setActiveView can cycle through all views", () => {
    const { setActiveView } = useAppStore.getState();
    setActiveView("notes");
    expect(useAppStore.getState().activeView).toBe("notes");
    setActiveView("calendar");
    expect(useAppStore.getState().activeView).toBe("calendar");
  });
});

// ─── Command palette ──────────────────────────────────────────────────────────

describe("useAppStore — command palette", () => {
  it("setCommandPaletteOpen(true) opens the palette", () => {
    useAppStore.getState().setCommandPaletteOpen(true);
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
  });

  it("setCommandPaletteOpen(false) closes the palette", () => {
    useAppStore.getState().setCommandPaletteOpen(true);
    useAppStore.getState().setCommandPaletteOpen(false);
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });
});

// ─── Data setters ─────────────────────────────────────────────────────────────

describe("useAppStore — data setters", () => {
  it("setEvents replaces the events array", () => {
    const events = [makeEvent("e1"), makeEvent("e2")];
    useAppStore.getState().setEvents(events);
    expect(useAppStore.getState().events).toEqual(events);
  });

  it("setNotes replaces the notes array", () => {
    const notes = [makeNote()];
    useAppStore.getState().setNotes(notes);
    expect(useAppStore.getState().notes).toEqual(notes);
  });

  it("setTasks replaces the tasks array", () => {
    const tasks = [makeTask(1), makeTask(2)];
    useAppStore.getState().setTasks(tasks);
    expect(useAppStore.getState().tasks).toEqual(tasks);
  });

  it("setLoading(false) clears loading flag", () => {
    useAppStore.getState().setLoading(false);
    expect(useAppStore.getState().loading).toBe(false);
  });
});

// ─── Selections ───────────────────────────────────────────────────────────────

describe("useAppStore — selections", () => {
  it("setSelectedEvent updates selectedEvent", () => {
    const ev = makeEvent();
    useAppStore.getState().setSelectedEvent(ev);
    expect(useAppStore.getState().selectedEvent).toEqual(ev);
  });

  it("setSelectedEvent(null) clears the selection", () => {
    useAppStore.getState().setSelectedEvent(makeEvent());
    useAppStore.getState().setSelectedEvent(null);
    expect(useAppStore.getState().selectedEvent).toBeNull();
  });

  it("setSelectedNote updates selectedNote", () => {
    const note = makeNote();
    useAppStore.getState().setSelectedNote(note);
    expect(useAppStore.getState().selectedNote).toEqual(note);
  });
});

// ─── Pending create ───────────────────────────────────────────────────────────

describe("useAppStore — pendingCreate", () => {
  it("setPendingCreate stores the pending type", () => {
    useAppStore.getState().setPendingCreate("task");
    expect(useAppStore.getState().pendingCreate).toBe("task");
  });

  it("setPendingCreate(null) clears it", () => {
    useAppStore.getState().setPendingCreate("note");
    useAppStore.getState().setPendingCreate(null);
    expect(useAppStore.getState().pendingCreate).toBeNull();
  });
});

// ─── Search ───────────────────────────────────────────────────────────────────

describe("useAppStore — search", () => {
  it("setTasksSearch updates tasksSearch", () => {
    useAppStore.getState().setTasksSearch("standup");
    expect(useAppStore.getState().tasksSearch).toBe("standup");
  });

  it("setNotesSearch updates notesSearch", () => {
    useAppStore.getState().setNotesSearch("meeting");
    expect(useAppStore.getState().notesSearch).toBe("meeting");
  });
});

// ─── searchFocusTrigger ───────────────────────────────────────────────────────

describe("useAppStore — searchFocusTrigger", () => {
  it("triggerSearchFocus increments searchFocusTrigger", () => {
    const before = useAppStore.getState().searchFocusTrigger;
    useAppStore.getState().triggerSearchFocus();
    expect(useAppStore.getState().searchFocusTrigger).toBe(before + 1);
  });

  it("increments on each call", () => {
    useAppStore.getState().triggerSearchFocus();
    useAppStore.getState().triggerSearchFocus();
    expect(useAppStore.getState().searchFocusTrigger).toBe(initialState.searchFocusTrigger + 2);
  });
});

// ─── State isolation ──────────────────────────────────────────────────────────

describe("useAppStore — state isolation between tests", () => {
  it("mutations from previous tests do not bleed in", () => {
    // If isolation works, loading should be back to true (initial value)
    expect(useAppStore.getState().loading).toBe(true);
    expect(useAppStore.getState().events).toEqual([]);
  });
});

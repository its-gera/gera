import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CommandPalette } from "./CommandPalette";
import { useAppStore } from "../../stores/useAppStore";
import { useCalendarStore } from "../../stores/useCalendarStore";
import type { EventEntity, NoteEntity, TaskEntity } from "../../types";

// ── Router / nav mock ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockSearchNotes = vi.fn().mockResolvedValue([]);
const mockSearchTasks = vi.fn().mockResolvedValue([]);

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    searchNotes: (...args: unknown[]) => mockSearchNotes(...args),
    searchTasks: (...args: unknown[]) => mockSearchTasks(...args),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    text: "Review slides",
    completed: false,
    raw_line: "- [ ] Review slides",
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

function makeNote(overrides: Partial<NoteEntity> = {}): NoteEntity {
  return {
    filename: "meeting.md",
    title: "Meeting Notes",
    body_preview: "Q1 planning",
    event_ids: [],
    project_ids: [],
    raw_content: "",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    id: "evt-1",
    source: "local",
    from_: "2026-03-14T10:00:00",
    to: "2026-03-14T11:00:00",
    name: "Team Standup",
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

function renderPalette() {
  return render(
    <MemoryRouter>
      <CommandPalette />
    </MemoryRouter>
  );
}

const initialAppState = useAppStore.getState();
const initialCalState = useCalendarStore.getState();

beforeEach(() => {
  useAppStore.setState(initialAppState, true);
  useCalendarStore.setState(initialCalState, true);
  mockNavigate.mockClear();
  mockSearchNotes.mockResolvedValue([]);
  mockSearchTasks.mockResolvedValue([]);
});

// ── Visibility ────────────────────────────────────────────────────────────────

describe("CommandPalette — visibility", () => {
  it("renders nothing when commandPaletteOpen is false", () => {
    useAppStore.setState({ commandPaletteOpen: false });
    renderPalette();
    expect(screen.queryByPlaceholderText("Search or run a command…")).not.toBeInTheDocument();
  });

  it("renders the palette when commandPaletteOpen is true", () => {
    useAppStore.setState({ commandPaletteOpen: true });
    renderPalette();
    expect(screen.getByPlaceholderText("Search or run a command…")).toBeInTheDocument();
  });

  it("shows the Esc hint", () => {
    useAppStore.setState({ commandPaletteOpen: true });
    renderPalette();
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });
});

// ── Static items (empty query) ────────────────────────────────────────────────

describe("CommandPalette — static items", () => {
  beforeEach(() => useAppStore.setState({ commandPaletteOpen: true }));

  it("shows all navigation items", () => {
    renderPalette();
    expect(screen.getByText("Go to Tasks")).toBeInTheDocument();
    expect(screen.getByText("Go to Notes")).toBeInTheDocument();
    expect(screen.getByText("Go to Calendar")).toBeInTheDocument();
  });

  it("shows all create items", () => {
    renderPalette();
    expect(screen.getByText("New Task")).toBeInTheDocument();
    expect(screen.getByText("New Note")).toBeInTheDocument();
    expect(screen.getByText("New Event")).toBeInTheDocument();
  });

  it("shows the Settings item", () => {
    renderPalette();
    expect(screen.getByText("Open Settings")).toBeInTheDocument();
  });

  it("groups items under section labels", () => {
    renderPalette();
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("shows keyboard shortcuts for nav items", () => {
    renderPalette();
    expect(screen.getByText("⌘1")).toBeInTheDocument();
    expect(screen.getByText("⌘2")).toBeInTheDocument();
    expect(screen.getByText("⌘3")).toBeInTheDocument();
  });

  it("shows ⌘, shortcut for Settings", () => {
    renderPalette();
    expect(screen.getByText("⌘,")).toBeInTheDocument();
  });
});

// ── Filtering static items ────────────────────────────────────────────────────

describe("CommandPalette — static item filtering", () => {
  beforeEach(() => useAppStore.setState({ commandPaletteOpen: true }));

  it("filters static items by label", async () => {
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "task");
    expect(screen.getByText("Go to Tasks")).toBeInTheDocument();
    expect(screen.getByText("New Task")).toBeInTheDocument();
    expect(screen.queryByText("Go to Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("New Event")).not.toBeInTheDocument();
  });

  it("filters by section name", async () => {
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "navigate");
    expect(screen.getByText("Go to Tasks")).toBeInTheDocument();
    expect(screen.getByText("Go to Notes")).toBeInTheDocument();
    expect(screen.getByText("Go to Calendar")).toBeInTheDocument();
    expect(screen.queryByText("New Task")).not.toBeInTheDocument();
  });

  it("shows empty state when nothing matches", async () => {
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "xyzzy");
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe("CommandPalette — closing", () => {
  beforeEach(() => useAppStore.setState({ commandPaletteOpen: true }));

  it("closes on Escape", async () => {
    renderPalette();
    await userEvent.click(screen.getByPlaceholderText("Search or run a command…"));
    await userEvent.keyboard("{Escape}");
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it("closes when the backdrop is clicked", async () => {
    renderPalette();
    await userEvent.click(document.querySelector(".cp-backdrop")!);
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it("does not close when the panel is clicked", async () => {
    renderPalette();
    await userEvent.click(document.querySelector(".cp-panel")!);
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
  });

  it("clears the query when closed via Escape", async () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Search or run a command…");
    await userEvent.type(input, "test");
    expect(input).toHaveValue("test");
    await userEvent.keyboard("{Escape}");
    // close() calls setQuery('') — verify the internal state was cleared
    // by re-opening and confirming the input resets (via the open useEffect)
    await userEvent.click(document.body); // unfocus
    act(() => { useAppStore.setState({ commandPaletteOpen: true }); });
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search or run a command…")).toHaveValue("")
    );
  });
});

// ── Actions ───────────────────────────────────────────────────────────────────

describe("CommandPalette — actions", () => {
  beforeEach(() => useAppStore.setState({ commandPaletteOpen: true }));

  it("'Go to Tasks' navigates to /tasks and closes", async () => {
    renderPalette();
    await userEvent.click(screen.getByText("Go to Tasks"));
    expect(mockNavigate).toHaveBeenCalledWith("/tasks");
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it("'Go to Notes' navigates to /notes and closes", async () => {
    renderPalette();
    await userEvent.click(screen.getByText("Go to Notes"));
    expect(mockNavigate).toHaveBeenCalledWith("/notes");
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it("'Go to Calendar' navigates to /calendar and closes", async () => {
    renderPalette();
    await userEvent.click(screen.getByText("Go to Calendar"));
    expect(mockNavigate).toHaveBeenCalledWith("/calendar");
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it("'New Task' sets pendingCreate='task' and navigates to /tasks", async () => {
    renderPalette();
    await userEvent.click(screen.getByText("New Task"));
    expect(useAppStore.getState().pendingCreate).toBe("task");
    expect(mockNavigate).toHaveBeenCalledWith("/tasks");
  });

  it("'New Note' sets pendingCreate='note' and navigates to /notes", async () => {
    renderPalette();
    await userEvent.click(screen.getByText("New Note"));
    expect(useAppStore.getState().pendingCreate).toBe("note");
    expect(mockNavigate).toHaveBeenCalledWith("/notes");
  });

  it("'New Event' sets pendingCreate='event' and navigates to /calendar", async () => {
    renderPalette();
    await userEvent.click(screen.getByText("New Event"));
    expect(useAppStore.getState().pendingCreate).toBe("event");
    expect(mockNavigate).toHaveBeenCalledWith("/calendar");
  });

  it("'Open Settings' opens settings and closes palette", async () => {
    renderPalette();
    await userEvent.click(screen.getByText("Open Settings"));
    expect(useAppStore.getState().settingsOpen).toBe(true);
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });
});

// ── Entity search from store ──────────────────────────────────────────────────

describe("CommandPalette — entity search (store)", () => {
  beforeEach(() => useAppStore.setState({ commandPaletteOpen: true }));

  it("shows matching tasks in 'Tasks' section", async () => {
    useAppStore.setState({ tasks: [makeTask({ text: "Review slides" })] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "review");
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Review slides")).toBeInTheDocument();
  });

  it("shows task source file as meta", async () => {
    useAppStore.setState({ tasks: [makeTask({ source_file: "tasks.md" })] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "review");
    expect(screen.getByText("Standalone")).toBeInTheDocument();
  });

  it("shows note source file stripped from notes/ prefix as meta for note tasks", async () => {
    useAppStore.setState({
      tasks: [makeTask({ source_file: "notes/sprint.md", text: "Review slides" })],
    });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "review");
    expect(screen.getByText("sprint")).toBeInTheDocument();
  });

  it("shows matching notes in 'Notes' section", async () => {
    useAppStore.setState({ notes: [makeNote({ title: "Sprint Retro" })] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "sprint");
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Sprint Retro")).toBeInTheDocument();
  });

  it("shows note body_preview as meta", async () => {
    useAppStore.setState({ notes: [makeNote({ title: "Sprint Retro", body_preview: "Team feedback" })] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "sprint");
    expect(screen.getByText("Team feedback")).toBeInTheDocument();
  });

  it("shows matching events in 'Events' section", async () => {
    useAppStore.setState({ events: [makeEvent({ name: "Team Standup" })] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "standup");
    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText("Team Standup")).toBeInTheDocument();
  });

  it("shows event date as meta", async () => {
    useAppStore.setState({ events: [makeEvent({ from_: "2026-03-14T10:00:00" })] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "standup");
    expect(screen.getByText("Mar 14")).toBeInTheDocument();
  });

  it("clicking a note result selects it and navigates to /notes", async () => {
    const note = makeNote({ title: "Sprint Retro" });
    useAppStore.setState({ notes: [note] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "sprint");
    await userEvent.click(screen.getByText("Sprint Retro"));
    expect(useAppStore.getState().selectedNote).toEqual(note);
    expect(mockNavigate).toHaveBeenCalledWith("/notes");
  });

  it("clicking an event result navigates to /calendar and selects it", async () => {
    const event = makeEvent({ name: "Team Standup" });
    useAppStore.setState({ events: [event] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "standup");
    await userEvent.click(screen.getByText("Team Standup"));
    expect(mockNavigate).toHaveBeenCalledWith("/calendar");
    expect(useAppStore.getState().selectedEvent).toEqual(event);
    expect(useCalendarStore.getState().calendarView).toBe("day");
  });

  it("clicking a task result navigates to /tasks and sets pendingFocusTask", async () => {
    const task = makeTask({ source_file: "tasks.md", line_number: 7, text: "Review slides" });
    useAppStore.setState({ tasks: [task] });
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "review");
    await userEvent.click(screen.getByText("Review slides"));
    expect(mockNavigate).toHaveBeenCalledWith("/tasks");
    expect(useAppStore.getState().pendingFocusTask).toEqual({ source_file: "tasks.md", line_number: 7 });
  });
});

// ── FTS (debounced backend search) ────────────────────────────────────────────
// These tests use real timers and let the 300ms debounce elapse naturally.

describe("CommandPalette — FTS", () => {
  beforeEach(() => useAppStore.setState({ commandPaletteOpen: true }));

  it("does not call searchNotes/searchTasks for queries shorter than 3 chars", async () => {
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "ab");
    // Wait well past the 300ms debounce window
    await new Promise((r) => setTimeout(r, 350));
    expect(mockSearchNotes).not.toHaveBeenCalled();
    expect(mockSearchTasks).not.toHaveBeenCalled();
  });

  it("calls searchNotes and searchTasks after the debounce for query >= 3 chars", async () => {
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "abc");
    await waitFor(
      () => {
        expect(mockSearchNotes).toHaveBeenCalledWith("abc");
        expect(mockSearchTasks).toHaveBeenCalledWith("abc");
      },
      { timeout: 1000 }
    );
  });

  it("uses FTS note results when available", async () => {
    const ftsNote = makeNote({ title: "FTS Result Note", filename: "fts.md" });
    mockSearchNotes.mockResolvedValue([ftsNote]);
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "fts");
    await waitFor(() => expect(screen.getByText("FTS Result Note")).toBeInTheDocument(), {
      timeout: 1000,
    });
  });

  it("uses FTS task results when available", async () => {
    const ftsTask = makeTask({ text: "FTS Task Result", source_file: "tasks.md", line_number: 42 });
    mockSearchTasks.mockResolvedValue([ftsTask]);
    renderPalette();
    await userEvent.type(screen.getByPlaceholderText("Search or run a command…"), "fts");
    await waitFor(() => expect(screen.getByText("FTS Task Result")).toBeInTheDocument(), {
      timeout: 1000,
    });
  });
});

// ── Keyboard navigation ───────────────────────────────────────────────────────

describe("CommandPalette — keyboard navigation", () => {
  beforeEach(() => useAppStore.setState({ commandPaletteOpen: true }));

  it("first item is active by default", () => {
    renderPalette();
    const items = document.querySelectorAll(".cp-item");
    expect(items[0]).toHaveClass("cp-item--active");
  });

  it("ArrowDown moves active index to the next item", async () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Search or run a command…");
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowDown}");
    const items = document.querySelectorAll(".cp-item");
    expect(items[0]).not.toHaveClass("cp-item--active");
    expect(items[1]).toHaveClass("cp-item--active");
  });

  it("ArrowUp does not go below index 0", async () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Search or run a command…");
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowUp}");
    const items = document.querySelectorAll(".cp-item");
    expect(items[0]).toHaveClass("cp-item--active");
  });

  it("ArrowDown then ArrowUp returns to first item", async () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Search or run a command…");
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowUp}");
    expect(document.querySelectorAll(".cp-item")[0]).toHaveClass("cp-item--active");
  });

  it("Enter executes the active item's action", async () => {
    renderPalette();
    const input = screen.getByPlaceholderText("Search or run a command…");
    await userEvent.click(input);
    // First item is "Go to Tasks"
    await userEvent.keyboard("{Enter}");
    expect(mockNavigate).toHaveBeenCalledWith("/tasks");
  });

  it("hovering an item sets it as active", async () => {
    renderPalette();
    const items = document.querySelectorAll(".cp-item");
    await userEvent.hover(items[2] as HTMLElement);
    expect(items[2]).toHaveClass("cp-item--active");
  });
});

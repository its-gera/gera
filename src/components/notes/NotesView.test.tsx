import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NotesView } from "./NotesView";
import { useAppStore } from "../../stores/useAppStore";
import type { EventEntity, NoteEntity } from "../../types";

// jsdom 28 ships without a working localStorage — provide a simple in-memory stub
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

vi.mock("../../types/keybindings", () => ({
  matchesKeys: vi.fn(() => false),
  getActiveKeys: vi.fn((action: string) => action),
  formatKeysForDisplay: (keys: string) => keys,
}));

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockGetNoteContent = vi.fn();
const mockCreateNote = vi.fn();
const mockUpdateNoteContent = vi.fn().mockResolvedValue(undefined);
const mockSearchNotes = vi.fn().mockResolvedValue([]);

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    getNoteContent: (...args: unknown[]) => mockGetNoteContent(...args),
    createNote: (...args: unknown[]) => mockCreateNote(...args),
    updateNoteContent: (...args: unknown[]) => mockUpdateNoteContent(...args),
    searchNotes: (...args: unknown[]) => mockSearchNotes(...args),
  };
});

// Stub NoteEditor — it's a heavy rich-text editor, not the focus of these tests
vi.mock("../../editor/NoteEditor", () => ({
  NoteEditor: ({ filename }: { filename: string }) => (
    <div data-testid="note-editor" data-filename={filename}>Editor</div>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<NoteEntity> = {}): NoteEntity {
  return {
    filename: "meeting.md",
    title: "Meeting Notes",
    body_preview: "Discussed Q1 roadmap",
    event_ids: [],
    project_ids: [],
    raw_content: "",
    ...overrides,
  };
}

function makeEvent(id = "evt-1", name = "Standup"): EventEntity {
  return {
    id,
    source: "local",
    from_: "2026-03-14T10:00:00",
    to: "2026-03-14T11:00:00",
    name,
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

function renderView() {
  return render(
    <MemoryRouter>
      <NotesView />
    </MemoryRouter>
  );
}

const initialState = useAppStore.getState();

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(initialState, true);
  mockGetNoteContent.mockReset();
  mockCreateNote.mockReset();
  mockUpdateNoteContent.mockClear();
  mockSearchNotes.mockResolvedValue([]);

  // Default: getNoteContent returns empty content
  mockGetNoteContent.mockResolvedValue({ raw_content: "" });
  mockCreateNote.mockResolvedValue(makeNote());
});

// ── Grid view ─────────────────────────────────────────────────────────────────

describe("NotesView — grid", () => {
  it("shows the NOTES section label", () => {
    renderView();
    expect(screen.getByText("NOTES")).toBeInTheDocument();
  });

  it("shows the search input", () => {
    renderView();
    expect(screen.getByPlaceholderText("Search by event or project")).toBeInTheDocument();
  });

  it("shows the New note button", () => {
    renderView();
    expect(screen.getByRole("button", { name: "New note" })).toBeInTheDocument();
  });

  it("renders EmptyState when there are no notes", () => {
    renderView();
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
  });

  it("renders a tile for each note in the store", () => {
    useAppStore.setState({
      notes: [makeNote({ filename: "a.md", title: "Alpha" }), makeNote({ filename: "b.md", title: "Beta" })],
    });
    renderView();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("filters notes by the search input", async () => {
    useAppStore.setState({
      notes: [
        makeNote({ filename: "a.md", title: "Alpha Note" }),
        makeNote({ filename: "b.md", title: "Beta Note" }),
      ],
    });
    renderView();
    await userEvent.type(screen.getByPlaceholderText("Search by event or project"), "Alpha");
    expect(screen.getByText("Alpha Note")).toBeInTheDocument();
    expect(screen.queryByText("Beta Note")).not.toBeInTheDocument();
  });
});

// ── Create note ───────────────────────────────────────────────────────────────

describe("NotesView — create note", () => {
  it("calls createNote when the New note button is clicked", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "New note" }));
    await waitFor(() => expect(mockCreateNote).toHaveBeenCalledOnce());
  });

  it("opens the editor after creating a note", async () => {
    const newNote = makeNote({ filename: "note-new.md", title: "Untitled" });
    mockCreateNote.mockResolvedValue(newNote);
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "New note" }));
    await waitFor(() => expect(screen.getByTestId("note-editor")).toBeInTheDocument());
  });

  it("calls createNote when pendingCreate is 'note'", async () => {
    useAppStore.setState({ pendingCreate: "note" });
    renderView();
    await waitFor(() => expect(mockCreateNote).toHaveBeenCalledOnce());
  });

  it("clears pendingCreate after handling it", async () => {
    useAppStore.setState({ pendingCreate: "note" });
    renderView();
    await waitFor(() => expect(useAppStore.getState().pendingCreate).toBeNull());
  });
});

// ── Editor view ───────────────────────────────────────────────────────────────

describe("NotesView — editor view", () => {
  it("shows the NoteEditor when a note is selected", async () => {
    const note = makeNote();
    useAppStore.setState({ selectedNote: note });
    renderView();
    await waitFor(() => expect(screen.getByTestId("note-editor")).toBeInTheDocument());
  });

  it("shows 'Loading...' while note content is loading", async () => {
    // getNoteContent never resolves during this test
    mockGetNoteContent.mockReturnValue(new Promise(() => {}));
    useAppStore.setState({ selectedNote: makeNote() });
    renderView();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows error message when note content fails to load", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetNoteContent.mockRejectedValue(new Error("Network error"));
    useAppStore.setState({ selectedNote: makeNote() });
    renderView();
    await waitFor(() => expect(screen.getByText("Failed to load note")).toBeInTheDocument());
    consoleSpy.mockRestore();
  });

  it("shows the NOTE section label in editor mode", async () => {
    useAppStore.setState({ selectedNote: makeNote() });
    renderView();
    await waitFor(() => expect(screen.getByText("NOTE")).toBeInTheDocument());
  });

  it("shows the Close note button", async () => {
    useAppStore.setState({ selectedNote: makeNote() });
    renderView();
    await waitFor(() => expect(screen.getByRole("button", { name: "Close note" })).toBeInTheDocument());
  });

  it("returns to grid when Close note is clicked", async () => {
    useAppStore.setState({ selectedNote: makeNote() });
    renderView();
    await waitFor(() => screen.getByRole("button", { name: "Close note" }));
    await userEvent.click(screen.getByRole("button", { name: "Close note" }));
    expect(screen.getByText("NOTES")).toBeInTheDocument();
    expect(screen.queryByTestId("note-editor")).not.toBeInTheDocument();
  });

  it("returns to grid when Escape is pressed in editor mode", async () => {
    useAppStore.setState({ selectedNote: makeNote() });
    renderView();
    await waitFor(() => screen.getByTestId("note-editor"));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("NOTES")).toBeInTheDocument();
  });

  it("passes the correct filename to NoteEditor", async () => {
    useAppStore.setState({ selectedNote: makeNote({ filename: "sprint.md" }) });
    renderView();
    await waitFor(() => {
      expect(screen.getByTestId("note-editor")).toHaveAttribute("data-filename", "sprint.md");
    });
  });
});

// ── Event chips in editor ─────────────────────────────────────────────────────

describe("NotesView — event chips", () => {
  it("shows event chips from the note's frontmatter", async () => {
    useAppStore.setState({
      selectedNote: makeNote(),
      events: [makeEvent("evt-1", "Standup")],
    });
    mockGetNoteContent.mockResolvedValue({
      raw_content: "---\nevent_ids:\n  - evt-1\n---\n\nBody text",
    });
    renderView();
    await waitFor(() => expect(screen.getByText("@Standup")).toBeInTheDocument());
  });

  it("shows project chips from frontmatter", async () => {
    useAppStore.setState({ selectedNote: makeNote() });
    mockGetNoteContent.mockResolvedValue({
      raw_content: "---\nproject_ids:\n  - my-project\n---\n\nBody text",
    });
    renderView();
    await waitFor(() => expect(screen.getByText("#my-project")).toBeInTheDocument());
  });

  it("removes an event chip when × is clicked", async () => {
    useAppStore.setState({
      selectedNote: makeNote(),
      events: [makeEvent("evt-1", "Standup")],
    });
    mockGetNoteContent.mockResolvedValue({
      raw_content: "---\nevent_ids:\n  - evt-1\n---\n\nBody text",
    });
    renderView();
    await waitFor(() => screen.getByText("@Standup"));
    await userEvent.click(screen.getByRole("button", { name: "Remove event evt-1" }));
    expect(screen.queryByText("@Standup")).not.toBeInTheDocument();
  });
});

// ── Event picker ──────────────────────────────────────────────────────────────

describe("NotesView — event picker", () => {
  beforeEach(() => {
    useAppStore.setState({
      selectedNote: makeNote(),
      events: [makeEvent("evt-1", "Standup"), makeEvent("evt-2", "Retro")],
    });
    mockGetNoteContent.mockResolvedValue({ raw_content: "" });
  });

  it("shows '+ Event' button in editor mode", async () => {
    renderView();
    await waitFor(() => screen.getByTestId("note-editor"));
    expect(screen.getByRole("button", { name: "+ Event" })).toBeInTheDocument();
  });

  it("opens the event picker when '+ Event' is clicked", async () => {
    renderView();
    await waitFor(() => screen.getByTestId("note-editor"));
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    expect(screen.getByPlaceholderText("Search events…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retro" })).toBeInTheDocument();
  });

  it("adds an event chip when an event is selected from the picker", async () => {
    renderView();
    await waitFor(() => screen.getByTestId("note-editor"));
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    await userEvent.click(screen.getByRole("button", { name: "Standup" }));
    expect(screen.getByText("@Standup")).toBeInTheDocument();
  });

  it("closes the picker after selecting an event", async () => {
    renderView();
    await waitFor(() => screen.getByTestId("note-editor"));
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    await userEvent.click(screen.getByRole("button", { name: "Standup" }));
    expect(screen.queryByPlaceholderText("Search events…")).not.toBeInTheDocument();
  });

  it("filters events in the picker by search text", async () => {
    renderView();
    await waitFor(() => screen.getByTestId("note-editor"));
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    await userEvent.type(screen.getByPlaceholderText("Search events…"), "stand");
    expect(screen.getByRole("button", { name: "Standup" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retro" })).not.toBeInTheDocument();
  });

  it("shows 'No events found' when filter matches nothing", async () => {
    renderView();
    await waitFor(() => screen.getByTestId("note-editor"));
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    await userEvent.type(screen.getByPlaceholderText("Search events…"), "zzzz");
    expect(screen.getByText("No events found")).toBeInTheDocument();
  });

  it("closes the picker with Escape", async () => {
    renderView();
    await waitFor(() => screen.getByTestId("note-editor"));
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    expect(screen.getByPlaceholderText("Search events…")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("Search events…")).not.toBeInTheDocument();
  });

  it("already-linked events do not appear in the picker", async () => {
    useAppStore.setState({
      selectedNote: makeNote(),
      events: [makeEvent("evt-1", "Standup"), makeEvent("evt-2", "Retro")],
    });
    mockGetNoteContent.mockResolvedValue({
      raw_content: "---\nevent_ids:\n  - evt-1\n---\n\nBody",
    });
    renderView();
    await waitFor(() => screen.getByText("@Standup"));
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    expect(screen.queryByRole("button", { name: "Standup" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retro" })).toBeInTheDocument();
  });
});

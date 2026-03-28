import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Inspector } from "./Inspector";
import { useAppStore } from "../../stores/useAppStore";
import type { EventEntity, NoteEntity, TaskEntity } from "../../types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToggleTask = vi.fn().mockResolvedValue(undefined);

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return { ...actual, toggleTask: (...args: unknown[]) => mockToggleTask(...args) };
});

vi.mock("../calendar/EventEditModal", () => ({
  EventEditModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="event-edit-modal">
      <button onClick={onClose}>Close modal</button>
    </div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      source_platform: "local",
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

function makeNote(overrides: Partial<NoteEntity> = {}): NoteEntity {
  return {
    filename: "meeting.md",
    title: "Meeting Notes",
    body_preview: "Q1 recap",
    event_ids: ["evt-1"],
    project_ids: [],
    raw_content: "",
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    text: "Review slides",
    completed: false,
    raw_line: "- [ ] Review slides",
    source_file: "tasks.md",
    line_number: 3,
    deadline: null,
    event_ids: ["evt-1"],
    project_ids: [],
    time_references: [],
    resolved_event_names: {},
    resolved_project_names: {},
    ...overrides,
  };
}

function renderInspector(props: Partial<React.ComponentProps<typeof Inspector>> = {}) {
  return render(
    <MemoryRouter>
      <Inspector isVisible={true} {...props} />
    </MemoryRouter>
  );
}

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  mockToggleTask.mockClear();
  mockNavigate.mockClear();
});

// ── Visibility ────────────────────────────────────────────────────────────────

describe("Inspector — visibility", () => {
  it("renders nothing when isVisible is false", () => {
    render(
      <MemoryRouter>
        <Inspector isVisible={false} />
      </MemoryRouter>
    );
    expect(screen.queryByText("CONTEXT INSPECTOR")).not.toBeInTheDocument();
  });

  it("renders the panel when isVisible is true", () => {
    renderInspector();
    expect(screen.getByText("CONTEXT INSPECTOR")).toBeInTheDocument();
  });

  it("shows the empty-state prompt when no event is selected", () => {
    renderInspector();
    expect(screen.getByText("Select an event to inspect")).toBeInTheDocument();
  });
});

// ── Event details ─────────────────────────────────────────────────────────────

describe("Inspector — event details", () => {
  it("shows the selected event name", () => {
    useAppStore.setState({ selectedEvent: makeEvent({ name: "Sprint Planning" }) });
    renderInspector();
    expect(screen.getByText("Sprint Planning")).toBeInTheDocument();
  });

  it("shows the formatted event date and time range", () => {
    useAppStore.setState({
      selectedEvent: makeEvent({ from_: "2026-03-14T10:00:00", to: "2026-03-14T11:00:00" }),
    });
    renderInspector();
    expect(screen.getByText(/Mar 14/)).toBeInTheDocument();
    expect(screen.getByText(/10:00 AM/)).toBeInTheDocument();
    expect(screen.getByText(/11:00 AM/)).toBeInTheDocument();
  });

  it("shows participants when present", () => {
    useAppStore.setState({
      selectedEvent: makeEvent({ participants: ["alice@example.com", "bob@example.com"] }),
    });
    renderInspector();
    expect(screen.getByText("alice@example.com, bob@example.com")).toBeInTheDocument();
  });

  it("hides the participants row when there are no participants", () => {
    useAppStore.setState({ selectedEvent: makeEvent({ participants: [] }) });
    renderInspector();
    expect(screen.queryByText(/alice/)).not.toBeInTheDocument();
  });

  it("shows the description when present", () => {
    useAppStore.setState({ selectedEvent: makeEvent({ description: "Discuss Q1 OKRs" }) });
    renderInspector();
    expect(screen.getByText("Discuss Q1 OKRs")).toBeInTheDocument();
  });

  it("hides the description row when empty", () => {
    useAppStore.setState({ selectedEvent: makeEvent({ description: "" }) });
    renderInspector();
    expect(screen.queryByText("Discuss Q1 OKRs")).not.toBeInTheDocument();
  });

  it("shows Google Calendar badge when source_platform is google_calendar", () => {
    useAppStore.setState({
      selectedEvent: makeEvent({
        metadata: { ...makeEvent().metadata, source_platform: "google_calendar", source_account: "user@gmail.com" },
      }),
    });
    renderInspector();
    expect(screen.getByText(/Google Calendar/)).toBeInTheDocument();
    expect(screen.getByText("user@gmail.com")).toBeInTheDocument();
  });

  it("does not show Google Calendar badge for local events", () => {
    useAppStore.setState({ selectedEvent: makeEvent() });
    renderInspector();
    expect(screen.queryByText(/Google Calendar/)).not.toBeInTheDocument();
  });
});

// ── Edit event ────────────────────────────────────────────────────────────────

describe("Inspector — edit event", () => {
  it("opens EventEditModal when the edit button is clicked", async () => {
    useAppStore.setState({ selectedEvent: makeEvent() });
    renderInspector();
    await userEvent.click(screen.getByTitle("Edit event"));
    // Sidebar mode renders EventEditModal in two places (InspectorContent + outer Inspector)
    expect(screen.getAllByTestId("event-edit-modal").length).toBeGreaterThan(0);
  });

  it("closes EventEditModal when its onClose is called", async () => {
    useAppStore.setState({ selectedEvent: makeEvent() });
    renderInspector();
    await userEvent.click(screen.getByTitle("Edit event"));
    await userEvent.click(screen.getAllByRole("button", { name: "Close modal" })[0]);
    expect(screen.queryByTestId("event-edit-modal")).not.toBeInTheDocument();
  });
});

// ── Linked notes ──────────────────────────────────────────────────────────────

describe("Inspector — linked notes", () => {
  it("shows the linked notes section even when there are no linked notes", () => {
    useAppStore.setState({ selectedEvent: makeEvent(), notes: [] });
    renderInspector();
    expect(screen.getByText("LINKED NOTES")).toBeInTheDocument();
    expect(screen.getByText("No linked notes yet")).toBeInTheDocument();
  });

  it("shows LINKED NOTES section when notes link to the selected event", () => {
    useAppStore.setState({
      selectedEvent: makeEvent(),
      notes: [makeNote({ event_ids: ["evt-1"] })],
    });
    renderInspector();
    expect(screen.getByText("LINKED NOTES")).toBeInTheDocument();
    expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
  });

  it("does not show notes that are not linked to the selected event", () => {
    useAppStore.setState({
      selectedEvent: makeEvent({ id: "evt-1" }),
      notes: [makeNote({ filename: "other.md", title: "Other Note", event_ids: ["evt-99"] })],
    });
    renderInspector();
    expect(screen.getByText("LINKED NOTES")).toBeInTheDocument();
    expect(screen.queryByText("Other Note")).not.toBeInTheDocument();
  });

  it("clicking a linked note navigates to /notes with returnView=/calendar", async () => {
    useAppStore.setState({
      selectedEvent: makeEvent(),
      notes: [makeNote()],
    });
    renderInspector();
    await userEvent.click(document.querySelector(".note-tile")!);
    expect(mockNavigate).toHaveBeenCalledWith("/notes");
    expect(useAppStore.getState().returnView).toBe("/calendar");
  });
});

// ── Linked tasks ──────────────────────────────────────────────────────────────

describe("Inspector — linked tasks", () => {
  it("shows the linked tasks section even when there are no linked tasks", () => {
    useAppStore.setState({ selectedEvent: makeEvent(), tasks: [] });
    renderInspector();
    expect(screen.getByText("LINKED TASKS")).toBeInTheDocument();
    expect(screen.getByText("No linked tasks yet")).toBeInTheDocument();
  });

  it("shows LINKED TASKS section when tasks link to the selected event", () => {
    useAppStore.setState({
      selectedEvent: makeEvent(),
      tasks: [makeTask({ event_ids: ["evt-1"], text: "Review slides" })],
    });
    renderInspector();
    expect(screen.getByText("LINKED TASKS")).toBeInTheDocument();
    expect(screen.getByText("Review slides")).toBeInTheDocument();
  });

  it("does not show tasks linked to other events", () => {
    useAppStore.setState({
      selectedEvent: makeEvent({ id: "evt-1" }),
      tasks: [makeTask({ event_ids: ["evt-99"], text: "Other task" })],
    });
    renderInspector();
    expect(screen.getByText("LINKED TASKS")).toBeInTheDocument();
    expect(screen.queryByText("Other task")).not.toBeInTheDocument();
  });

  it("calls toggleTask when the task checkbox is clicked", async () => {
    useAppStore.setState({
      selectedEvent: makeEvent(),
      tasks: [makeTask({ source_file: "tasks.md", line_number: 3 })],
    });
    renderInspector();
    await userEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => {
      expect(mockToggleTask).toHaveBeenCalledWith("tasks.md", 3);
    });
  });

  it("applies 'completed' class to completed task text", () => {
    useAppStore.setState({
      selectedEvent: makeEvent(),
      tasks: [makeTask({ completed: true, text: "Done task" })],
    });
    renderInspector();
    expect(screen.getByText("Done task")).toHaveClass("completed");
  });
});


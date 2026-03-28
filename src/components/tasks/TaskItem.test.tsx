import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TaskItem } from "./TaskItem";
import { useAppStore } from "../../stores/useAppStore";
import type { TaskEntity, EventEntity, NoteEntity } from "../../types";

// ── API mock ──────────────────────────────────────────────────────────────────

const mockToggleTask = vi.fn().mockResolvedValue(undefined);
const mockUpdateTask = vi.fn().mockResolvedValue(undefined);
const mockDeleteTask = vi.fn().mockResolvedValue(undefined);

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    toggleTask: (...args: unknown[]) => mockToggleTask(...args),
    updateTask: (...args: unknown[]) => mockUpdateTask(...args),
    deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    text: "Review slides",
    completed: false,
    raw_line: "- [ ] Review slides",
    source_file: "tasks.md",
    line_number: 3,
    deadline: null,
    event_ids: [],
    project_ids: [],
    time_references: [],
    resolved_event_names: {},
    resolved_project_names: {},
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

function makeNote(filename = "meeting.md"): NoteEntity {
  return {
    filename,
    title: "Meeting Notes",
    body_preview: "",
    event_ids: [],
    project_ids: [],
    raw_content: "",
  };
}

function renderItem(task: TaskEntity) {
  return render(
    <MemoryRouter>
      <TaskItem task={task} />
    </MemoryRouter>
  );
}

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  mockToggleTask.mockClear();
  mockUpdateTask.mockClear();
  mockDeleteTask.mockClear();
});

// ── Display ───────────────────────────────────────────────────────────────────

describe("TaskItem — display", () => {
  it("renders the cleaned task text", () => {
    const task = makeTask({
      text: "Review slides @evt-1",
      event_ids: ["evt-1"],
      resolved_event_names: { "evt-1": "Standup" },
    });
    renderItem(task);
    expect(screen.getByText("Review slides")).toBeInTheDocument();
    expect(screen.queryByText(/@evt-1/)).not.toBeInTheDocument();
  });

  it("renders an event chip for each resolved event", () => {
    const task = makeTask({
      text: "Task @evt-1",
      event_ids: ["evt-1"],
      resolved_event_names: { "evt-1": "Standup" },
    });
    renderItem(task);
    expect(screen.getByText("@Standup")).toBeInTheDocument();
  });

  it("renders a deadline chip when a deadline is set", () => {
    const task = makeTask({ deadline: "2026-03-15T09:00:00" });
    renderItem(task);
    expect(screen.getByText(/Mar 15/)).toBeInTheDocument();
  });

  it("applies the 'completed' class to the text when the task is done", () => {
    renderItem(makeTask({ completed: true }));
    expect(document.querySelector(".task-text")).toHaveClass("completed");
  });

  it("does not apply the 'completed' class for an incomplete task", () => {
    renderItem(makeTask({ completed: false }));
    expect(document.querySelector(".task-text")).not.toHaveClass("completed");
  });

  it("shows a static 'Standalone' label for tasks.md tasks", () => {
    renderItem(makeTask({ source_file: "tasks.md" }));
    expect(screen.getByText("Standalone")).toBeInTheDocument();
  });

  it("shows a linked source button for note tasks", () => {
    useAppStore.setState({ notes: [makeNote("meeting.md")] });
    const task = makeTask({ source_file: "notes/meeting.md", line_number: 5 });
    renderItem(task);
    expect(screen.getByRole("button", { name: /meeting notes/i })).toBeInTheDocument();
  });

  it("does not show a link button for tasks.md tasks", () => {
    renderItem(makeTask({ source_file: "tasks.md" }));
    expect(screen.queryByRole("button", { name: /go to/i })).not.toBeInTheDocument();
  });
});

// ── Toggle ────────────────────────────────────────────────────────────────────

describe("TaskItem — toggle", () => {
  it("calls toggleTask with the correct source_file and line_number when checkbox is clicked", async () => {
    const task = makeTask({ source_file: "tasks.md", line_number: 7 });
    renderItem(task);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(mockToggleTask).toHaveBeenCalledWith("tasks.md", 7);
  });

  it("calls toggleTask when Space is pressed on the task item", async () => {
    const task = makeTask({ source_file: "tasks.md", line_number: 3 });
    renderItem(task);
    (screen.getByText("Review slides").closest(".task-item")! as HTMLElement).focus();
    await userEvent.keyboard(" ");
    expect(mockToggleTask).toHaveBeenCalledOnce();
  });
});

// ── Edit modal ────────────────────────────────────────────────────────────────

describe("TaskItem — edit modal", () => {
  it("opens the edit modal when the item is clicked", async () => {
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    expect(screen.getByText("Edit Task")).toBeInTheDocument();
  });

  it("pre-fills the edit input with the cleaned task text", async () => {
    const task = makeTask({ text: "Review slides @evt-1", event_ids: ["evt-1"], resolved_event_names: { "evt-1": "Standup" } });
    renderItem(task);
    await userEvent.click(document.querySelector(".task-item")!);
    expect(screen.getByRole("textbox")).toHaveValue("Review slides");
  });

  it("closes the edit modal when Escape is pressed", async () => {
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    expect(screen.getByText("Edit Task")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Edit Task")).not.toBeInTheDocument();
  });

  it("closes the edit modal when Cancel is clicked", async () => {
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Edit Task")).not.toBeInTheDocument();
  });

  it("calls updateTask with new text when Save is clicked", async () => {
    const task = makeTask({ source_file: "tasks.md", line_number: 3 });
    renderItem(task);
    await userEvent.click(document.querySelector(".task-item")!);

    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Updated task text");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith("tasks.md", 3, "Updated task text");
    });
  });

  it("calls updateTask with deadline token when a task already has a deadline and is saved unchanged", async () => {
    const task = makeTask({
      source_file: "tasks.md",
      line_number: 3,
      deadline: "2026-03-20T14:00:00",
    });
    renderItem(task);
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith(
        "tasks.md",
        3,
        expect.stringContaining("@2026-03-20T14:00")
      );
    });
  });

  it("Save button is disabled when the text input is empty", async () => {
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.clear(screen.getByRole("textbox"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

// ── Event picker in edit modal ────────────────────────────────────────────────

describe("TaskItem — event picker", () => {
  it("shows '+ Event' button in the edit modal", async () => {
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    expect(screen.getByRole("button", { name: "+ Event" })).toBeInTheDocument();
  });

  it("opens the event picker when '+ Event' is clicked", async () => {
    useAppStore.setState({ events: [makeEvent("e1", "Standup")] });
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    expect(screen.getByPlaceholderText("Search events…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Standup" })).toBeInTheDocument();
  });

  it("adds an event chip when an event is selected from the picker", async () => {
    useAppStore.setState({ events: [makeEvent("e1", "Standup")] });
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    await userEvent.click(screen.getByRole("button", { name: "Standup" }));
    expect(screen.getByText("@Standup")).toBeInTheDocument();
  });

  it("includes the event token in the updateTask call after save", async () => {
    useAppStore.setState({ events: [makeEvent("e1", "Standup")] });
    const task = makeTask({ source_file: "tasks.md", line_number: 3 });
    renderItem(task);
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.click(screen.getByRole("button", { name: "+ Event" }));
    await userEvent.click(screen.getByRole("button", { name: "Standup" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith("tasks.md", 3, expect.stringContaining("@e1"));
    });
  });

  it("removes an event chip when the × button is clicked", async () => {
    const task = makeTask({
      text: "Task @e1",
      event_ids: ["e1"],
      resolved_event_names: { e1: "Standup" },
    });
    renderItem(task);
    await userEvent.click(document.querySelector(".task-item")!);
    // The remove button only exists while the chip is present in the modal
    expect(document.querySelector(".metadata-chip-remove")).toBeInTheDocument();
    await userEvent.click(document.querySelector(".metadata-chip-remove")!);
    expect(document.querySelector(".metadata-chip-remove")).not.toBeInTheDocument();
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe("TaskItem — delete", () => {
  it("shows the ConfirmDialog when the trash button is clicked", async () => {
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.click(screen.getByTitle("Delete task"));
    expect(screen.getByText("Delete task")).toBeInTheDocument();
  });

  it("calls deleteTask when deletion is confirmed", async () => {
    const task = makeTask({ source_file: "tasks.md", line_number: 3 });
    renderItem(task);
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.click(screen.getByTitle("Delete task"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteTask).toHaveBeenCalledWith("tasks.md", 3);
    });
  });

  it("does not call deleteTask when deletion is cancelled", async () => {
    renderItem(makeTask());
    await userEvent.click(document.querySelector(".task-item")!);
    await userEvent.click(screen.getByTitle("Delete task"));
    // Both the edit modal and the ConfirmDialog have a "Cancel" button.
    // Click the one inside the ConfirmDialog (.modal-btn--cancel inside modal-backdrop > modal-panel that has "Delete task" title).
    const cancelBtns = screen.getAllByRole("button", { name: "Cancel" });
    // The ConfirmDialog Cancel is the last one rendered (appended to body last)
    await userEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(mockDeleteTask).not.toHaveBeenCalled();
  });
});

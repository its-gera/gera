import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskList } from "./TaskList";
import type { EventEntity, TaskEntity } from "../../types";

vi.mock("./TaskItem", () => ({
  TaskItem: ({ task }: { task: TaskEntity }) => (
    <div data-testid="task-item">{task.text}</div>
  ),
}));

function makeTask(text: string, overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    text,
    completed: false,
    raw_line: `- [ ] ${text}`,
    source_file: "tasks.md",
    line_number: 1,
    deadline: "2026-03-15T09:00:00",
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

const emptyProps = {
  filteredEventsWithTasks: [],
  filteredOtherTasks: [],
  timelineOverdueTasks: [],
  timelineScheduledTasks: [],
  timelineUnscheduledTasks: [],
  getTasksForEvent: (_id: string) => [],
  viewMode: "timeline" as const,
};

// ─── Timeline mode ────────────────────────────────────────────────────────────

describe("TaskList — timeline mode", () => {
  it("shows EmptyState when there are no scheduled or unscheduled tasks", () => {
    render(<TaskList {...emptyProps} />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
  });

  it("renders scheduled tasks in the scheduled pane", () => {
    render(
      <TaskList
        {...emptyProps}
        timelineOverdueTasks={[]}
        timelineScheduledTasks={[makeTask("Buy milk"), makeTask("Send email")]}
      />
    );
    expect(screen.getAllByTestId("task-item")).toHaveLength(2);
  });

  it("shows 'No scheduled tasks' message when only unscheduled tasks exist", () => {
    render(
      <TaskList
        {...emptyProps}
        timelineUnscheduledTasks={[makeTask("Unscheduled", { deadline: null })]}
      />
    );
    expect(screen.getByText("No scheduled tasks")).toBeInTheDocument();
  });

  it("renders the unscheduled block when unscheduled tasks exist", () => {
    render(
      <TaskList
        {...emptyProps}
        timelineUnscheduledTasks={[makeTask("Floating task", { deadline: null })]}
      />
    );
    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
    expect(screen.getByTestId("task-item")).toBeInTheDocument();
  });

  it("shows task count in the unscheduled block header", () => {
    render(
      <TaskList
        {...emptyProps}
        timelineUnscheduledTasks={[
          makeTask("A", { deadline: null }),
          makeTask("B", { deadline: null }),
        ]}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("filters unscheduled tasks by the search input", async () => {
    render(
      <TaskList
        {...emptyProps}
        timelineUnscheduledTasks={[
          makeTask("Buy milk", { deadline: null }),
          makeTask("Send email", { deadline: null }),
        ]}
      />
    );
    await userEvent.type(screen.getByPlaceholderText("Search unscheduled…"), "milk");
    expect(screen.getAllByTestId("task-item")).toHaveLength(1);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  it("shows 'No matching tasks' when search yields no results", async () => {
    render(
      <TaskList
        {...emptyProps}
        timelineUnscheduledTasks={[makeTask("Buy milk", { deadline: null })]}
      />
    );
    await userEvent.type(screen.getByPlaceholderText("Search unscheduled…"), "xyz");
    expect(screen.getByText("No matching tasks")).toBeInTheDocument();
  });
});

// ─── Grouped mode ─────────────────────────────────────────────────────────────

describe("TaskList — grouped mode", () => {
  const groupedBase = { ...emptyProps, viewMode: "grouped" as const };

  it("shows EmptyState when there are no events or other tasks", () => {
    render(<TaskList {...groupedBase} />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
  });

  it("renders an EventTaskGroup for each event that has tasks", () => {
    const events = [makeEvent("e1", "Standup"), makeEvent("e2", "Retro")];
    render(
      <TaskList
        {...groupedBase}
        filteredEventsWithTasks={events}
        getTasksForEvent={(id) =>
          id === "e1" ? [makeTask("Prep slides")] : [makeTask("Write retro doc")]
        }
      />
    );
    expect(screen.getByText("Standup")).toBeInTheDocument();
    expect(screen.getByText("Retro")).toBeInTheDocument();
  });

  it("does not render an EventTaskGroup for events with no tasks", () => {
    const events = [makeEvent("e1", "Standup"), makeEvent("e2", "Empty Event")];
    render(
      <TaskList
        {...groupedBase}
        filteredEventsWithTasks={events}
        getTasksForEvent={(id) => (id === "e1" ? [makeTask("Prep slides")] : [])}
      />
    );
    expect(screen.getByText("Standup")).toBeInTheDocument();
    expect(screen.queryByText("Empty Event")).not.toBeInTheDocument();
  });

  it("renders the 'Other Tasks' group when filteredOtherTasks is non-empty", () => {
    render(
      <TaskList
        {...groupedBase}
        filteredOtherTasks={[makeTask("Standalone task")]}
      />
    );
    expect(screen.getByText("Other Tasks")).toBeInTheDocument();
    expect(screen.getByText("Standalone task")).toBeInTheDocument();
  });

  it("does not render 'Other Tasks' when filteredOtherTasks is empty", () => {
    const events = [makeEvent("e1")];
    render(
      <TaskList
        {...groupedBase}
        filteredEventsWithTasks={events}
        getTasksForEvent={() => [makeTask("A task")]}
        filteredOtherTasks={[]}
      />
    );
    expect(screen.queryByText("Other Tasks")).not.toBeInTheDocument();
  });
});

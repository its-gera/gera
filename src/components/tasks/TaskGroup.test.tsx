import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskGroup, EventTaskGroup } from "./TaskGroup";
import type { EventEntity, TaskEntity } from "../../types";

// Stub TaskItem so these tests focus purely on group structure
vi.mock("./TaskItem", () => ({
  TaskItem: ({ task }: { task: TaskEntity }) => (
    <div data-testid="task-item">{task.text}</div>
  ),
}));

function makeTask(text: string, line_number = 1): TaskEntity {
  return {
    text,
    completed: false,
    raw_line: `- [ ] ${text}`,
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

// ─── TaskGroup ────────────────────────────────────────────────────────────────

describe("TaskGroup", () => {
  it("renders the title", () => {
    render(<TaskGroup title="Other Tasks" tasks={[]} />);
    expect(screen.getByText("Other Tasks")).toBeInTheDocument();
  });

  it("renders the subtitle when provided", () => {
    render(<TaskGroup title="Sprint" subtitle="Week 12" tasks={[]} />);
    expect(screen.getByText("Week 12")).toBeInTheDocument();
  });

  it("does not render a subtitle element when omitted", () => {
    render(<TaskGroup title="Sprint" tasks={[]} />);
    expect(screen.queryByText("Week 12")).not.toBeInTheDocument();
  });

  it("renders a TaskItem for each task", () => {
    const tasks = [makeTask("Task A", 1), makeTask("Task B", 2), makeTask("Task C", 3)];
    render(<TaskGroup title="Work" tasks={tasks} />);
    expect(screen.getAllByTestId("task-item")).toHaveLength(3);
  });

  it("renders task text via TaskItem", () => {
    render(<TaskGroup title="Work" tasks={[makeTask("Buy milk")]} />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  it("renders no task items when tasks array is empty", () => {
    render(<TaskGroup title="Empty" tasks={[]} />);
    expect(screen.queryByTestId("task-item")).not.toBeInTheDocument();
  });
});

// ─── EventTaskGroup ───────────────────────────────────────────────────────────

describe("EventTaskGroup", () => {
  it("renders the event name", () => {
    render(<EventTaskGroup event={makeEvent()} tasks={[makeTask("Prep slides")]} />);
    expect(screen.getByText("Team Standup")).toBeInTheDocument();
  });

  it("renders the event date and time as a subtitle", () => {
    render(<EventTaskGroup event={makeEvent()} tasks={[makeTask("Prep slides")]} />);
    // formatEventDate("2026-03-14T10:00:00") → "Mar 14"
    // formatEventTime("2026-03-14T10:00:00") → "10:00 AM"
    expect(screen.getByText(/Mar 14/)).toBeInTheDocument();
    expect(screen.getByText(/10:00 AM/)).toBeInTheDocument();
  });

  it("renders the task count in the header", () => {
    const tasks = [makeTask("A"), makeTask("B")];
    render(<EventTaskGroup event={makeEvent()} tasks={tasks} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders all tasks when expanded (default)", () => {
    const tasks = [makeTask("Alpha", 1), makeTask("Beta", 2)];
    render(<EventTaskGroup event={makeEvent()} tasks={tasks} />);
    expect(screen.getAllByTestId("task-item")).toHaveLength(2);
  });

  it("has aria-expanded=true when expanded", () => {
    render(<EventTaskGroup event={makeEvent()} tasks={[makeTask("A")]} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses tasks when the header is clicked", async () => {
    const tasks = [makeTask("Alpha", 1), makeTask("Beta", 2)];
    render(<EventTaskGroup event={makeEvent()} tasks={tasks} />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.queryByTestId("task-item")).not.toBeInTheDocument();
  });

  it("sets aria-expanded=false when collapsed", async () => {
    render(<EventTaskGroup event={makeEvent()} tasks={[makeTask("A")]} />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("re-expands when the header is clicked again", async () => {
    render(<EventTaskGroup event={makeEvent()} tasks={[makeTask("A")]} />);
    await userEvent.click(screen.getByRole("button")); // collapse
    await userEvent.click(screen.getByRole("button")); // expand
    expect(screen.getByTestId("task-item")).toBeInTheDocument();
  });
});

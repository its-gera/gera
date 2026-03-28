import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventBlock } from "./EventBlock";
import { useAppStore } from "../../stores/useAppStore";
import type { EventEntity, NoteEntity } from "../../types";

// Stub EventEditModal so double-click tests don't need the full modal stack
vi.mock("./EventEditModal", () => ({
  EventEditModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="event-edit-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

// Stub calculateEventStyle so we can control block height precisely
vi.mock("../../utils/eventPositioning", () => ({
  calculateEventStyle: vi.fn(),
}));

import { calculateEventStyle } from "../../utils/eventPositioning";
const mockCalcStyle = calculateEventStyle as ReturnType<typeof vi.fn>;

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

function makeNote(filename = "meeting.md", eventIds: string[] = ["evt-1"]): NoteEntity {
  return {
    filename,
    title: "Meeting Notes",
    body_preview: "",
    event_ids: eventIds,
    project_ids: [],
    raw_content: "",
  };
}

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  // Default: tall block so time is shown
  mockCalcStyle.mockReturnValue({ height: "56px", top: "10%" });
});

describe("EventBlock — display", () => {
  it("renders the event name", () => {
    render(<EventBlock event={makeEvent()} notes={[]} />);
    expect(screen.getByText("Team Standup")).toBeInTheDocument();
  });

  it("shows formatted time when the block is tall (>= 44px)", () => {
    mockCalcStyle.mockReturnValue({ height: "56px", top: "0" });
    render(<EventBlock event={makeEvent()} notes={[]} />);
    expect(screen.getByText(/10:00 AM/)).toBeInTheDocument();
  });

  it("hides the time when the block is short (< 44px)", () => {
    mockCalcStyle.mockReturnValue({ height: "28px", top: "0" });
    render(<EventBlock event={makeEvent()} notes={[]} />);
    expect(screen.queryByText(/10:00 AM/)).not.toBeInTheDocument();
  });

  it("shows the Google Calendar badge for google_calendar events", () => {
    const event = makeEvent({ metadata: { ...makeEvent().metadata, source_platform: "google_calendar" } });
    render(<EventBlock event={event} notes={[]} />);
    expect(screen.getByTitle("From Google Calendar")).toBeInTheDocument();
  });

  it("does not show the Google Calendar badge for local events", () => {
    render(<EventBlock event={makeEvent()} notes={[]} />);
    expect(screen.queryByTitle("From Google Calendar")).not.toBeInTheDocument();
  });
});

describe("EventBlock — interactions", () => {
  it("sets selectedEvent in the store when clicked", async () => {
    const event = makeEvent();
    render(<EventBlock event={event} notes={[]} />);
    await userEvent.click(document.querySelector(".event-block")!);
    expect(useAppStore.getState().selectedEvent).toEqual(event);
  });

  it("sets the linked note as selectedNote when clicked", async () => {
    const event = makeEvent();
    const note = makeNote("meeting.md", ["evt-1"]);
    render(<EventBlock event={event} notes={[note]} />);
    await userEvent.click(document.querySelector(".event-block")!);
    expect(useAppStore.getState().selectedNote).toEqual(note);
  });

  it("sets selectedNote to null when no linked note exists", async () => {
    const event = makeEvent();
    render(<EventBlock event={event} notes={[makeNote("other.md", ["evt-999"])]} />);
    await userEvent.click(document.querySelector(".event-block")!);
    expect(useAppStore.getState().selectedNote).toBeNull();
  });

  it("opens the EventEditModal on double-click", async () => {
    render(<EventBlock event={makeEvent()} notes={[]} />);
    await userEvent.dblClick(document.querySelector(".event-block")!);
    expect(screen.getByTestId("event-edit-modal")).toBeInTheDocument();
  });

  it("closes the EventEditModal when onClose is called", async () => {
    render(<EventBlock event={makeEvent()} notes={[]} />);
    await userEvent.dblClick(document.querySelector(".event-block")!);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("event-edit-modal")).not.toBeInTheDocument();
  });
});

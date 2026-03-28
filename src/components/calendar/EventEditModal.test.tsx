import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventEditModal } from "./EventEditModal";
import type { EventEntity } from "../../types";

// ── API mock ──────────────────────────────────────────────────────────────────

const mockUpdateEvent = vi.fn().mockResolvedValue(undefined);
const mockDeleteEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
    deleteEvent: (...args: unknown[]) => mockDeleteEvent(...args),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    id: "evt-1",
    source: "local",
    from_: "2026-03-14T10:00:00",
    to: "2026-03-14T11:00:00",
    name: "Team Standup",
    description: "Daily sync",
    participants: ["alice@example.com"],
    location: "Room 1",
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

beforeEach(() => {
  mockUpdateEvent.mockClear();
  mockDeleteEvent.mockClear();
});

// ── Display ───────────────────────────────────────────────────────────────────

describe("EventEditModal — display", () => {
  it("renders the 'Edit Event' title", () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    expect(screen.getByText("Edit Event")).toBeInTheDocument();
  });

  it("pre-fills the name input with the event name", () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue("Team Standup")).toBeInTheDocument();
  });

  it("pre-fills the description textarea", () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue("Daily sync")).toBeInTheDocument();
  });

  it("pre-fills the location input", () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue("Room 1")).toBeInTheDocument();
  });

  it("shows existing participants as chips", () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe("EventEditModal — closing", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(<EventEditModal event={makeEvent()} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<EventEditModal event={makeEvent()} onClose={onClose} />);
    await userEvent.click(document.querySelector(".modal-backdrop")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when the panel itself is clicked", async () => {
    const onClose = vi.fn();
    render(<EventEditModal event={makeEvent()} onClose={onClose} />);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<EventEditModal event={makeEvent()} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── Save ─────────────────────────────────────────────────────────────────────

describe("EventEditModal — save", () => {
  it("Save button is disabled when the name is cleared", async () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    await userEvent.clear(screen.getByDisplayValue("Team Standup"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls updateEvent with updated name when Save is clicked", async () => {
    const onClose = vi.fn();
    render(<EventEditModal event={makeEvent()} onClose={onClose} />);
    const nameInput = screen.getByDisplayValue("Team Standup");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "All Hands");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "evt-1", name: "All Hands" })
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls updateEvent preserving unchanged fields", async () => {
    const onClose = vi.fn();
    render(<EventEditModal event={makeEvent()} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "evt-1",
          name: "Team Standup",
          description: "Daily sync",
          location: "Room 1",
        })
      );
    });
  });
});

// ── Participants ──────────────────────────────────────────────────────────────

describe("EventEditModal — participants", () => {
  it("adds a participant when Enter is pressed in the input", async () => {
    render(<EventEditModal event={makeEvent({ participants: [] })} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("Add participant…");
    await userEvent.type(input, "bob@example.com{Enter}");
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("removes a participant when the × button is clicked", async () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByTitle("Remove alice@example.com"));
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe("EventEditModal — delete", () => {
  it("shows the ConfirmDialog when the trash button is clicked", async () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByTitle("Delete event"));
    expect(screen.getByText(/Delete "Team Standup"/)).toBeInTheDocument();
  });

  it("calls deleteEvent and onClose when deletion is confirmed", async () => {
    const onClose = vi.fn();
    render(<EventEditModal event={makeEvent()} onClose={onClose} />);
    await userEvent.click(screen.getByTitle("Delete event"));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(mockDeleteEvent).toHaveBeenCalledWith("evt-1");
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call deleteEvent when deletion is cancelled", async () => {
    render(<EventEditModal event={makeEvent()} onClose={vi.fn()} />);
    await userEvent.click(screen.getByTitle("Delete event"));
    // ConfirmDialog Cancel is the last Cancel button rendered
    const cancelBtns = screen.getAllByRole("button", { name: "Cancel" });
    await userEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(mockDeleteEvent).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventCreateModal } from "./EventCreateModal";
import { useAppStore } from "../../stores/useAppStore";

// ── API mock ──────────────────────────────────────────────────────────────────

const mockCreateEvent = vi.fn().mockResolvedValue(undefined);
const mockListEvents = vi.fn().mockResolvedValue([]);

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    createEvent: (...args: unknown[]) => mockCreateEvent(...args),
    listEvents: () => mockListEvents(),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultProps = {
  fromIso: "2026-03-14T10:00:00",
  toIso: "2026-03-14T11:00:00",
  onClose: vi.fn(),
};

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  mockCreateEvent.mockClear();
  mockListEvents.mockClear();
  mockListEvents.mockResolvedValue([]);
  defaultProps.onClose = vi.fn();
});

// ── Display ───────────────────────────────────────────────────────────────────

describe("EventCreateModal — display", () => {
  it("renders the 'New Event' title", () => {
    render(<EventCreateModal {...defaultProps} />);
    expect(screen.getByText("New Event")).toBeInTheDocument();
  });

  it("renders the Name, Start, End, Location, Participants, Description fields", () => {
    render(<EventCreateModal {...defaultProps} />);
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add location")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add participant…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add description")).toBeInTheDocument();
  });

  it("Create button is disabled when the name is empty", () => {
    render(<EventCreateModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("Create button is enabled once a name is typed", async () => {
    render(<EventCreateModal {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText("Event name"), "My Event");
    expect(screen.getByRole("button", { name: "Create" })).not.toBeDisabled();
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe("EventCreateModal — closing", () => {
  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(<EventCreateModal {...defaultProps} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<EventCreateModal {...defaultProps} onClose={onClose} />);
    await userEvent.click(document.querySelector(".modal-backdrop")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when the modal panel is clicked", async () => {
    const onClose = vi.fn();
    render(<EventCreateModal {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<EventCreateModal {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── Create ────────────────────────────────────────────────────────────────────

describe("EventCreateModal — create", () => {
  it("calls createEvent with the typed name and closes on success", async () => {
    const onClose = vi.fn();
    render(<EventCreateModal {...defaultProps} onClose={onClose} />);
    await userEvent.type(screen.getByPlaceholderText("Event name"), "Planning Session");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Planning Session" })
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("includes location and description in the createEvent call", async () => {
    render(<EventCreateModal {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText("Event name"), "Demo");
    await userEvent.type(screen.getByPlaceholderText("Add location"), "Conf Room A");
    await userEvent.type(screen.getByPlaceholderText("Add description"), "Quarterly demo");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Demo",
          location: "Conf Room A",
          description: "Quarterly demo",
        })
      );
    });
  });

  it("refreshes the events store after creating", async () => {
    const fakeEvent = { id: "new", name: "Planning Session" } as any;
    mockListEvents.mockResolvedValue([fakeEvent]);
    render(<EventCreateModal {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText("Event name"), "Planning Session");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(useAppStore.getState().events).toEqual([fakeEvent]);
    });
  });
});

// ── Participants ──────────────────────────────────────────────────────────────

describe("EventCreateModal — participants", () => {
  it("adds a participant when Enter is pressed", async () => {
    render(<EventCreateModal {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText("Add participant…"), "carol@example.com{Enter}");
    expect(screen.getByText("carol@example.com")).toBeInTheDocument();
  });

  it("removes a participant when the × button is clicked", async () => {
    render(<EventCreateModal {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText("Add participant…"), "dave@example.com{Enter}");
    await userEvent.click(screen.getByTitle("Remove dave@example.com"));
    expect(screen.queryByText("dave@example.com")).not.toBeInTheDocument();
  });

  it("includes participants in the createEvent call", async () => {
    render(<EventCreateModal {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText("Event name"), "Team Sync");
    await userEvent.type(screen.getByPlaceholderText("Add participant…"), "eve@example.com{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ participants: ["eve@example.com"] })
      );
    });
  });
});

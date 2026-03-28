import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteTile } from "./NoteTile";
import { useAppStore } from "../../stores/useAppStore";
import type { NoteEntity } from "../../types";

// ── API mock ──────────────────────────────────────────────────────────────────

const mockDeleteNote = vi.fn().mockResolvedValue(undefined);

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return { ...actual, deleteNote: (...args: unknown[]) => mockDeleteNote(...args) };
});

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

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
  mockDeleteNote.mockClear();
});

// ── Display ───────────────────────────────────────────────────────────────────

describe("NoteTile — display", () => {
  it("renders the note title", () => {
    render(<NoteTile note={makeNote()} />);
    expect(screen.getByText("Meeting Notes")).toBeInTheDocument();
  });

  it("renders the body preview", () => {
    render(<NoteTile note={makeNote()} />);
    expect(screen.getByText("Discussed Q1 roadmap")).toBeInTheDocument();
  });

  it("renders a delete button", () => {
    render(<NoteTile note={makeNote()} />);
    expect(screen.getByRole("button", { name: "Delete note" })).toBeInTheDocument();
  });
});

// ── Click behaviour ───────────────────────────────────────────────────────────

describe("NoteTile — click", () => {
  it("calls onOpen when clicked and onOpen is provided", async () => {
    const onOpen = vi.fn();
    render(<NoteTile note={makeNote()} onOpen={onOpen} />);
    await userEvent.click(document.querySelector(".note-tile")!);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("sets selectedNote in the store when clicked with no onOpen", async () => {
    const note = makeNote();
    render(<NoteTile note={note} />);
    await userEvent.click(document.querySelector(".note-tile")!);
    expect(useAppStore.getState().selectedNote).toEqual(note);
  });

  it("does not set selectedNote when onOpen is provided", async () => {
    render(<NoteTile note={makeNote()} onOpen={vi.fn()} />);
    await userEvent.click(document.querySelector(".note-tile")!);
    expect(useAppStore.getState().selectedNote).toBeNull();
  });

  it("triggers click on Enter keypress", async () => {
    const onOpen = vi.fn();
    render(<NoteTile note={makeNote()} onOpen={onOpen} />);
    document.querySelector<HTMLElement>(".note-tile")!.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("opens ConfirmDialog on Delete keypress", async () => {
    render(<NoteTile note={makeNote()} />);
    document.querySelector<HTMLElement>(".note-tile")!.focus();
    await userEvent.keyboard("{Delete}");
    expect(screen.getByText(/permanently deleted/)).toBeInTheDocument();
  });

  it("opens ConfirmDialog on Backspace keypress", async () => {
    render(<NoteTile note={makeNote()} />);
    document.querySelector<HTMLElement>(".note-tile")!.focus();
    await userEvent.keyboard("{Backspace}");
    expect(screen.getByText(/permanently deleted/)).toBeInTheDocument();
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe("NoteTile — delete", () => {
  it("shows ConfirmDialog when the trash button is clicked", async () => {
    render(<NoteTile note={makeNote()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(screen.getByText("Delete note")).toBeInTheDocument();
    expect(screen.getByText(/"Meeting Notes" will be permanently deleted\./)).toBeInTheDocument();
  });

  it("calls deleteNote with the filename when confirmed", async () => {
    render(<NoteTile note={makeNote({ filename: "meeting.md" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(mockDeleteNote).toHaveBeenCalledWith("meeting.md");
    });
  });

  it("does not call deleteNote when cancelled", async () => {
    render(<NoteTile note={makeNote()} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });

  it("clicking the delete button does not trigger tile click", async () => {
    const onOpen = vi.fn();
    render(<NoteTile note={makeNote()} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

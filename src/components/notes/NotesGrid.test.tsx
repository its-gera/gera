import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotesGrid } from "./NotesGrid";
import type { NoteEntity } from "../../types";

// Stub NoteTile so these tests focus on grid structure only
vi.mock("./NoteTile", () => ({
  NoteTile: ({ note }: { note: NoteEntity }) => (
    <div data-testid="note-tile">{note.title}</div>
  ),
}));

function makeNote(title: string, filename = `${title}.md`): NoteEntity {
  return {
    filename,
    title,
    body_preview: "",
    event_ids: [],
    project_ids: [],
    raw_content: "",
  };
}

describe("NotesGrid", () => {
  it("shows EmptyState when notes array is empty", () => {
    render(<NotesGrid notes={[]} />);
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
  });

  it("renders a NoteTile for each note", () => {
    render(
      <NotesGrid notes={[makeNote("Alpha"), makeNote("Beta"), makeNote("Gamma")]} />
    );
    expect(screen.getAllByTestId("note-tile")).toHaveLength(3);
  });

  it("renders the note title via NoteTile", () => {
    render(<NotesGrid notes={[makeNote("Sprint Retro")]} />);
    expect(screen.getByText("Sprint Retro")).toBeInTheDocument();
  });

  it("does not render EmptyState when notes are present", () => {
    render(<NotesGrid notes={[makeNote("Some Note")]} />);
    expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
  });
});

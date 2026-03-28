import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useNoteFiltering } from "./useNoteFiltering";
import type { NoteEntity } from "../types";

// Stable empty array — must NOT be an inline `[]` inside renderHook callbacks.
// Inline literals are recreated on every render, causing useMemo deps to change
// and the FTS useEffect to re-fire on every render (BUG-003).
const NO_NOTES: NoteEntity[] = [];

// ── API mock ──────────────────────────────────────────────────────────────────

const mockSearchNotes = vi.fn().mockResolvedValue([]);

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, searchNotes: (...args: unknown[]) => mockSearchNotes(...args) };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<NoteEntity> = {}): NoteEntity {
  return {
    filename: "note.md",
    title: "My Note",
    body_preview: "Some preview text",
    event_ids: [],
    project_ids: [],
    raw_content: "",
    ...overrides,
  };
}

beforeEach(() => {
  mockSearchNotes.mockClear();
  mockSearchNotes.mockResolvedValue([]);
});

// ── Local filtering ───────────────────────────────────────────────────────────

describe("useNoteFiltering — local filter", () => {
  it("returns all notes when search is empty", () => {
    const notes = [makeNote({ filename: "a.md" }), makeNote({ filename: "b.md", title: "Other" })];
    const { result } = renderHook(() => useNoteFiltering(notes, ""));
    expect(result.current.filteredNotes).toHaveLength(2);
  });

  it("filters notes by title substring (case-insensitive)", () => {
    const notes = [
      makeNote({ filename: "a.md", title: "Sprint Retro" }),
      makeNote({ filename: "b.md", title: "Planning Doc" }),
    ];
    const { result } = renderHook(() => useNoteFiltering(notes, "retro"));
    expect(result.current.filteredNotes).toHaveLength(1);
    expect(result.current.filteredNotes[0].title).toBe("Sprint Retro");
  });

  it("filters notes by body_preview substring", () => {
    const notes = [
      makeNote({ filename: "a.md", title: "A", body_preview: "Action items from standup" }),
      makeNote({ filename: "b.md", title: "B", body_preview: "Nothing relevant" }),
    ];
    const { result } = renderHook(() => useNoteFiltering(notes, "standup"));
    expect(result.current.filteredNotes).toHaveLength(1);
  });

  it("returns empty array when no notes match", () => {
    const notes = [makeNote({ filename: "a.md", title: "Alpha" })];
    const { result } = renderHook(() => useNoteFiltering(notes, "zzzz"));
    expect(result.current.filteredNotes).toHaveLength(0);
  });

  it("preserves all notes when search matches all", () => {
    const notes = [
      makeNote({ filename: "a.md", title: "Note A", body_preview: "common word" }),
      makeNote({ filename: "b.md", title: "Note B", body_preview: "common word too" }),
    ];
    const { result } = renderHook(() => useNoteFiltering(notes, "common"));
    expect(result.current.filteredNotes).toHaveLength(2);
  });
});

// ── isSearching flag ──────────────────────────────────────────────────────────

describe("useNoteFiltering — isSearching", () => {
  it("starts with isSearching=false", () => {
    const { result } = renderHook(() => useNoteFiltering(NO_NOTES, ""));
    expect(result.current.isSearching).toBe(false);
  });
});

// ── FTS (backend search) ──────────────────────────────────────────────────────

// BUG-003: useNoteFiltering's FTS useEffect depends on `filteredNotes`, which is a
// useMemo value computed from the `notes` prop. When `notes` is a non-stable array
// reference (new array on every render), every state update causes `filteredNotes`
// to recompute with a new reference, re-triggering the effect, which sets more state,
// causing an infinite re-render loop that exhausts V8 heap memory (~80s OOM).
//
// Even with stable `const notes = []` references defined outside the renderHook
// callback, the loop still manifests in this test environment, suggesting additional
// interactions between React 18's scheduler, RTL's act() polling, and the effect
// dependency array. Root cause documented in agents/bugs.md (BUG-003).
//
// All FTS tests are skipped until the effect dependency array is fixed.

describe("useNoteFiltering — FTS", () => {
  it("does not call searchNotes for queries shorter than 3 chars", async () => {
    const notes: NoteEntity[] = [];
    renderHook(() => useNoteFiltering(notes, "ab"));
    await new Promise((r) => setTimeout(r, 350));
    expect(mockSearchNotes).not.toHaveBeenCalled();
  });

  it("calls searchNotes after debounce when local results < 5", async () => {
    mockSearchNotes.mockReturnValue(new Promise(() => {}));
    const notes: NoteEntity[] = [];
    renderHook(() => useNoteFiltering(notes, "abc"));
    await waitFor(() => expect(mockSearchNotes).toHaveBeenCalledWith("abc"), {
      timeout: 1000,
    });
  });

  it("does not call searchNotes when local results are >= 5", async () => {
    const notes = Array.from({ length: 5 }, (_, i) =>
      makeNote({ filename: `note-${i}.md`, title: `abc note ${i}` })
    );
    renderHook(() => useNoteFiltering(notes, "abc"));
    await new Promise((r) => setTimeout(r, 350));
    expect(mockSearchNotes).not.toHaveBeenCalled();
  });

  it("merges FTS results into filteredNotes", async () => {
    const ftsNote = makeNote({ filename: "fts.md", title: "FTS Result" });
    mockSearchNotes.mockResolvedValue([ftsNote]);
    const notes: NoteEntity[] = [];
    const { result } = renderHook(() => useNoteFiltering(notes, "fts"));
    await waitFor(
      () => expect(result.current.filteredNotes.some((n) => n.title === "FTS Result")).toBe(true),
      { timeout: 1000 }
    );
  });

  it("deduplicates FTS results that overlap with local results", async () => {
    const localNote = makeNote({ filename: "abc.md", title: "abc note" });
    mockSearchNotes.mockResolvedValue([{ ...localNote }]);
    const notes = [localNote];
    const { result } = renderHook(() => useNoteFiltering(notes, "abc"));
    await waitFor(() => mockSearchNotes.mock.calls.length > 0, { timeout: 1000 });
    expect(
      result.current.filteredNotes.filter((n) => n.title === "abc note")
    ).toHaveLength(1);
  });
});

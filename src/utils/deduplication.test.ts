import { describe, it, expect } from "vitest";
import {
  hashText,
  generateDedupeKey,
  getTaskDedupeKey,
  getNoteDedupeKey,
  deduplicate,
} from "./deduplication";

// ─── hashText ─────────────────────────────────────────────────────────────────

describe("hashText", () => {
  it("returns a non-empty string", () => {
    expect(hashText("hello")).toBeTruthy();
  });

  it("returns the same hash for identical input", () => {
    expect(hashText("same")).toBe(hashText("same"));
  });

  it("returns different hashes for different inputs", () => {
    expect(hashText("foo")).not.toBe(hashText("bar"));
  });

  it("handles an empty string without throwing", () => {
    expect(() => hashText("")).not.toThrow();
  });
});

// ─── generateDedupeKey ───────────────────────────────────────────────────────

describe("generateDedupeKey", () => {
  it("includes source_file, line_number, and text hash", () => {
    const key = generateDedupeKey("tasks.md", 5, "Do a thing");
    expect(key).toMatch(/^tasks\.md:5:/);
  });

  it("produces different keys for different line numbers", () => {
    const k1 = generateDedupeKey("tasks.md", 1, "Do a thing");
    const k2 = generateDedupeKey("tasks.md", 2, "Do a thing");
    expect(k1).not.toBe(k2);
  });

  it("produces different keys for different source files", () => {
    const k1 = generateDedupeKey("tasks.md", 1, "Do a thing");
    const k2 = generateDedupeKey("notes/meeting.md", 1, "Do a thing");
    expect(k1).not.toBe(k2);
  });
});

// ─── getTaskDedupeKey ────────────────────────────────────────────────────────

describe("getTaskDedupeKey", () => {
  it("uses source_file and line_number from the task", () => {
    const task = { source_file: "tasks.md", line_number: 3, text: "Buy milk" };
    const key = getTaskDedupeKey(task);
    expect(key).toMatch(/^tasks\.md:3:/);
  });
});

// ─── getNoteDedupeKey ────────────────────────────────────────────────────────

describe("getNoteDedupeKey", () => {
  it("returns the note filename as the key", () => {
    const note = { filename: "notes/standup.md", title: "Standup" };
    expect(getNoteDedupeKey(note)).toBe("notes/standup.md");
  });
});

// ─── deduplicate ─────────────────────────────────────────────────────────────

describe("deduplicate", () => {
  it("removes exact duplicates", () => {
    const items = [{ id: "a" }, { id: "a" }, { id: "b" }];
    const result = deduplicate(items, (i) => i.id);
    expect(result).toHaveLength(2);
  });

  it("preserves order of first occurrence", () => {
    const items = [{ id: "b" }, { id: "a" }, { id: "b" }];
    const result = deduplicate(items, (i) => i.id);
    expect(result.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("returns all items when there are no duplicates", () => {
    const items = [{ id: "x" }, { id: "y" }, { id: "z" }];
    expect(deduplicate(items, (i) => i.id)).toHaveLength(3);
  });

  it("returns an empty array for empty input", () => {
    expect(deduplicate([], (i: { id: string }) => i.id)).toHaveLength(0);
  });

  it("deduplicates tasks by source_file:line_number key correctly", () => {
    const t1 = { source_file: "tasks.md", line_number: 1, text: "Task A" };
    const t2 = { source_file: "tasks.md", line_number: 1, text: "Task A" }; // duplicate
    const t3 = { source_file: "tasks.md", line_number: 2, text: "Task B" };
    const result = deduplicate([t1, t2, t3], getTaskDedupeKey);
    expect(result).toHaveLength(2);
  });

  it("keeps tasks with the same text but different source files", () => {
    const t1 = { source_file: "tasks.md", line_number: 1, text: "Same text" };
    const t2 = { source_file: "notes/mtg.md", line_number: 1, text: "Same text" };
    expect(deduplicate([t1, t2], getTaskDedupeKey)).toHaveLength(2);
  });
});

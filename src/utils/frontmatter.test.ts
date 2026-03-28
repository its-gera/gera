import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./frontmatter";

// ─── parseFrontmatter ────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  it("returns empty metadata and full content when there is no frontmatter", () => {
    const result = parseFrontmatter("# Just a heading\n\nSome body.");
    expect(result.metadata).toEqual({});
    expect(result.body).toBe("# Just a heading\n\nSome body.");
  });

  it("parses a simple key: value pair", () => {
    const content = "---\ntitle: My Note\n---\n# Body";
    const { metadata } = parseFrontmatter(content);
    expect(metadata.title).toBe("My Note");
  });

  it("parses event_ids as an array", () => {
    const content = "---\nevent_ids:\n  - e1\n  - e2\n---\nBody";
    const { metadata } = parseFrontmatter(content);
    expect(metadata.event_ids).toEqual(["e1", "e2"]);
  });

  it("parses project_ids as an array", () => {
    const content = "---\nproject_ids:\n  - p1\n---\nBody";
    const { metadata } = parseFrontmatter(content);
    expect(metadata.project_ids).toEqual(["p1"]);
  });

  it("separates the body from the frontmatter block", () => {
    const content = "---\ntitle: X\n---\n# Real Body";
    const { body } = parseFrontmatter(content);
    expect(body).toBe("# Real Body");
  });

  it("returns empty arrays for keys with no list items", () => {
    const content = "---\nevent_ids:\n---\nBody";
    const { metadata } = parseFrontmatter(content);
    expect(metadata.event_ids).toEqual([]);
  });

  it("ignores comment lines inside frontmatter", () => {
    const content = "---\n# a comment\ntitle: Hello\n---\nBody";
    const { metadata } = parseFrontmatter(content);
    expect(metadata.title).toBe("Hello");
  });

  it("handles content with no trailing newline after closing ---", () => {
    const content = "---\ntitle: X\n---";
    expect(() => parseFrontmatter(content)).not.toThrow();
  });

  it("parses multiple keys correctly", () => {
    const content = "---\ntitle: Meeting Notes\nevent_ids:\n  - e1\nproject_ids:\n  - p1\n---\nBody";
    const { metadata } = parseFrontmatter(content);
    expect(metadata.title).toBe("Meeting Notes");
    expect(metadata.event_ids).toEqual(["e1"]);
    expect(metadata.project_ids).toEqual(["p1"]);
  });
});

/**
 * Tests for NoteEditor — covers BUG-007 (chip add/remove scrolls editor to top).
 *
 * MDXEditor relies on Lexical which has complex DOM requirements (ResizeObserver,
 * contentEditable range APIs, etc.) that do not work fully in jsdom.  The tests
 * below therefore target the scroll-preservation MECHANISM directly, separate
 * from Lexical internals, and include a clearly documented skip test that
 * specifies what an end-to-end test would need to verify.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

// ── API / Tauri mocks ─────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../api", () => ({
  getNoteContent: vi.fn().mockResolvedValue({ raw_content: "" }),
  updateNoteContent: vi.fn().mockResolvedValue(undefined),
}));

// MDXEditor imports CSS files and uses browser-only APIs; stub the whole
// package so we can test the surrounding NoteEditor logic in jsdom.
vi.mock("@mdxeditor/editor", async () => {
  const React = await import("react");
  const MDXEditor = React.forwardRef(
    (
      props: { markdown: string; onChange?: (v: string) => void },
      ref: React.Ref<{ focus(): void; getMarkdown(): string; setMarkdown(v: string): void }>
    ) => {
      React.useImperativeHandle(ref, () => ({
        focus: vi.fn(),
        getMarkdown: () => props.markdown,
        setMarkdown: vi.fn(),
      }));
      return React.createElement(
        "div",
        { "data-testid": "mdx-editor" },
        React.createElement("div", { className: "mdxeditor-root-contenteditable" }, props.markdown)
      );
    }
  );
  // Return stubs for every named export the module uses
  const noop = () => null;
  return {
    MDXEditor,
    headingsPlugin: noop,
    listsPlugin: noop,
    linkPlugin: noop,
    quotePlugin: noop,
    thematicBreakPlugin: noop,
    markdownShortcutPlugin: noop,
    codeBlockPlugin: noop,
    codeMirrorPlugin: noop,
    tablePlugin: noop,
    toolbarPlugin: () => null,
    UndoRedo: noop,
    BoldItalicUnderlineToggles: noop,
    BlockTypeSelect: noop,
    CodeToggle: noop,
    CreateLink: noop,
    InsertCodeBlock: noop,
    InsertThematicBreak: noop,
    InsertTable: noop,
    ListsToggle: noop,
    Separator: noop,
  };
});

vi.mock("./geraRefsPlugin", () => ({ geraRefsPlugin: () => null }));
vi.mock("./NoteEditor.css", () => ({}));

// CodeMirror uses ResizeObserver / DOM APIs not available in jsdom; stub the
// PlainTextEditor so plain-mode tests cover NoteEditor logic, not CM internals.
vi.mock("./PlainTextEditor", async () => {
  const React = await import("react");
  const PlainTextEditor = React.forwardRef(
    (
      props: { value: string; onChange?: (v: string) => void },
      ref: React.Ref<{ focus(): void }>
    ) => {
      React.useImperativeHandle(ref, () => ({ focus: vi.fn() }));
      return React.createElement("textarea", {
        "data-testid": "plain-editor",
        value: props.value,
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
          props.onChange?.(e.target.value),
      });
    }
  );
  PlainTextEditor.displayName = "PlainTextEditor";
  return { PlainTextEditor };
});

import { NoteEditor } from "./NoteEditor";

// ── localStorage stub ─────────────────────────────────────────────────────────
// jsdom's localStorage is incomplete in this vitest setup; provide our own.
const localStorageStore: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, val: string) => { localStorageStore[key] = val; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
});

beforeEach(() => {
  delete localStorageStore["noteEditorMode"];
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderEditor(content = "# Hello\n\nsome content\n") {
  return render(
    <NoteEditor filename="test.md" content={content} autoSave={false} />
  );
}

// ── Smoke tests ───────────────────────────────────────────────────────────────

describe("NoteEditor — smoke", () => {
  it("mounts in rich mode by default", () => {
    renderEditor();
    expect(screen.getByTestId("mdx-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("plain-editor")).not.toBeInTheDocument();
  });

  it("mounts in plain mode when localStorage preference is set", () => {
    localStorage.setItem("noteEditorMode", "plain");
    renderEditor();
    expect(screen.getByTestId("plain-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("mdx-editor")).not.toBeInTheDocument();
  });
});


// ── BUG-007: chip mutations scroll editor to top ──────────────────────────────
//
// NoteEditor preserves scroll position during checkbox (task-list) toggles via
// a mousedown listener + requestAnimationFrame that saves and restores
// `.mdxeditor-root-contenteditable`'s scrollTop.
//
// The same protection is ABSENT for chip insertions and removals.  When Lexical
// processes the `editor.update()` call inside `replaceMentionWithChip`, it
// moves the selection to the newly inserted chip node which can cause the
// contentEditable to scroll back to the beginning.
//
// Fix needed in GeraRefTypeahead.replaceMentionWithChip (or in a Lexical
// ON_TRANSFORM/UPDATE listener in NoteEditor): save scrollTop before the
// update, restore it in the next animation frame, mirroring the existing
// checkbox preservation logic.

describe("BUG-007 — scroll position preservation", () => {
  it("preserves scrollTop when a checkbox mousedown fires (existing behaviour)", async () => {
    renderEditor();
    const scrollable = document.querySelector(
      ".mdxeditor-root-contenteditable"
    ) as HTMLElement;
    expect(scrollable).not.toBeNull();

    // Simulate a scroll to y=200
    Object.defineProperty(scrollable, "scrollTop", {
      writable: true,
      configurable: true,
      value: 200,
    });
    expect(scrollable.scrollTop).toBe(200);

    // Simulate mousedown on a checkbox list item — the handler should save scrollTop
    // and schedule a restore via requestAnimationFrame
    const fakeCheckbox = document.createElement("li");
    fakeCheckbox.setAttribute("role", "checkbox");
    scrollable.appendChild(fakeCheckbox);

    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        // Execute the rAF callback synchronously so we can inspect scrollTop
        cb(0);
        return 0;
      });

    // Fire mousedown on the checkbox — it bubbles up to container where the
    // NoteEditor listener is attached
    fireEvent.mouseDown(fakeCheckbox);

    // rAF should have been called to restore the position
    expect(rafSpy).toHaveBeenCalled();
    // After restore, scrollTop should still be 200
    expect(scrollable.scrollTop).toBe(200);

    rafSpy.mockRestore();
  });

  it.skip(
    "BUG-007: scroll position is preserved after a @chip is inserted via replaceMentionWithChip",
    () => {
      // How to reproduce the bug manually:
      //   1. Open a note with enough content to be scrollable.
      //   2. Scroll to the bottom.
      //   3. In a task line, type "@" to open GeraRefTypeahead.
      //   4. Select an event from the list (or pick an absolute date).
      //   5. The editor scrolls back to the top.
      //
      // Root cause:
      //   GeraRefTypeahead.replaceMentionWithChip calls editor.update() which
      //   moves the Lexical selection to the trailing text node after the chip.
      //   Lexical's selection reconciler calls scrollIntoView() (or equivalent),
      //   which resets the viewport to the top when the trailing node is at
      //   offset 0.
      //
      // Fix:
      //   Before editor.update() in replaceMentionWithChip, read
      //   document.querySelector('.mdxeditor-root-contenteditable')?.scrollTop
      //   and restore it in a requestAnimationFrame after the update — identical
      //   to the checkbox preservation pattern in NoteEditor.tsx.
      //
      // Why this test is skipped:
      //   A full end-to-end test requires a functioning Lexical instance with
      //   real DOM selection APIs (not available in jsdom).  Write this test
      //   in Playwright or once jsdom gains better contentEditable support.
    }
  );

  it.skip(
    "BUG-007: scroll position is preserved after a @chip is removed via backspace",
    () => {
      // Same as above, but triggered via the KEY_BACKSPACE_COMMAND handler in
      // geraRefsPlugin.ts which calls node.remove() on the GeraRefNode.
      // The same fix (save + requestAnimationFrame restore in geraRefsPlugin's
      // backspace handler) would address this variant.
    }
  );
});

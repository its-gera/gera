import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { useKeyboard } from "./useKeyboard";
import { useAppStore } from "../stores/useAppStore";
import { useCalendarStore } from "../stores/useCalendarStore";
import { setStorageAdapter } from "../types/keybindings";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── In-memory storage adapter (replaces broken Tauri jsdom localStorage) ──────

const memStore: Record<string, string> = {};
setStorageAdapter({
  getItem: (k) => memStore[k] ?? null,
  setItem: (k, v) => { memStore[k] = v; },
  removeItem: (k) => { delete memStore[k]; },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fire(key: string, opts: KeyboardEventInit = {}) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
  });
}

function renderKB(initialPath = "/tasks") {
  return renderHook(() => useKeyboard(), {
    wrapper: ({ children }) =>
      React.createElement(MemoryRouter, { initialEntries: [initialPath] }, children),
  });
}

const initialAppState = useAppStore.getState();
const initialCalendarState = useCalendarStore.getState();

beforeEach(() => {
  useAppStore.setState(initialAppState, true);
  useCalendarStore.setState(initialCalendarState, true);
  mockNavigate.mockClear();
  // Clear all persisted keybinding overrides between tests
  delete memStore["keybinding-overrides"];
});

// ── Command palette ────────────────────────────────────────────────────────────

describe("useKeyboard — command palette", () => {
  it("⌘K opens the command palette", () => {
    renderKB();
    fire("k", { metaKey: true });
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
  });

  it("⌘K fires even when focus is inside a text input", () => {
    renderKB();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    });
    expect(useAppStore.getState().commandPaletteOpen).toBe(true);
    document.body.removeChild(input);
  });

  it("Escape closes the command palette when it is open", () => {
    useAppStore.setState({ commandPaletteOpen: true });
    renderKB();
    fire("Escape");
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it("Escape does nothing to commandPaletteOpen when palette is already closed", () => {
    useAppStore.setState({ commandPaletteOpen: false });
    renderKB();
    fire("Escape");
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });
});

// ── Navigation shortcuts ───────────────────────────────────────────────────────

describe("useKeyboard — navigation", () => {
  it("⌘1 navigates to /tasks", () => {
    renderKB();
    fire("1", { metaKey: true });
    expect(mockNavigate).toHaveBeenCalledWith("/tasks");
  });

  it("⌘2 navigates to /notes", () => {
    renderKB();
    fire("2", { metaKey: true });
    expect(mockNavigate).toHaveBeenCalledWith("/notes");
  });

  it("⌘3 navigates to /calendar", () => {
    renderKB();
    fire("3", { metaKey: true });
    expect(mockNavigate).toHaveBeenCalledWith("/calendar");
  });

  it("⌘, opens settings", () => {
    renderKB();
    fire(",", { metaKey: true });
    expect(useAppStore.getState().settingsOpen).toBe(true);
  });

  it("⌘F triggers search focus", () => {
    const spy = vi.spyOn(useAppStore.getState(), "triggerSearchFocus");
    renderKB();
    fire("f", { metaKey: true });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("/ triggers search focus", () => {
    const spy = vi.spyOn(useAppStore.getState(), "triggerSearchFocus");
    renderKB();
    fire("/");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Context-sensitive create (n key) ─────────────────────────────────────────

describe("useKeyboard — n key creates in context", () => {
  it("n on /tasks sets pendingCreate to 'task'", () => {
    renderKB("/tasks");
    fire("n");
    expect(useAppStore.getState().pendingCreate).toBe("task");
  });

  it("n on /notes sets pendingCreate to 'note'", () => {
    renderKB("/notes");
    fire("n");
    expect(useAppStore.getState().pendingCreate).toBe("note");
  });

  it("n on /calendar sets pendingCreate to 'event'", () => {
    renderKB("/calendar");
    fire("n");
    expect(useAppStore.getState().pendingCreate).toBe("event");
  });
});

// ── Input suppression ─────────────────────────────────────────────────────────

describe("useKeyboard — input suppression", () => {
  it("n does not fire setPendingCreate when focus is in an <input>", () => {
    renderKB("/tasks");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }));
    expect(useAppStore.getState().pendingCreate).toBeNull();
    document.body.removeChild(input);
  });

  it("n does not fire when focus is in a <textarea>", () => {
    renderKB("/tasks");
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }));
    expect(useAppStore.getState().pendingCreate).toBeNull();
    document.body.removeChild(ta);
  });

  it("navigation shortcuts are suppressed when a modal-backdrop is present", () => {
    renderKB();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    document.body.appendChild(backdrop);
    fire("1", { metaKey: true });
    expect(mockNavigate).not.toHaveBeenCalled();
    document.body.removeChild(backdrop);
  });
});

// ── Custom keybinding override ────────────────────────────────────────────────

describe("useKeyboard — custom keybinding override", () => {
  it("uses overridden key when storage has a saved override", () => {
    // Persist an override for goToTasks before the hook mounts
    memStore["keybinding-overrides"] = JSON.stringify({ goToTasks: "⌘9" });
    renderKB();
    // Default ⌘1 should NOT navigate (overridden away)
    fire("1", { metaKey: true });
    expect(mockNavigate).not.toHaveBeenCalledWith("/tasks");
    // Custom ⌘9 SHOULD navigate
    fire("9", { metaKey: true });
    expect(mockNavigate).toHaveBeenCalledWith("/tasks");
  });
});

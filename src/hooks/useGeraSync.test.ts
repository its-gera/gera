import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGeraSync } from "./useGeraSync";
import { useAppStore } from "../stores/useAppStore";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockListEvents = vi.fn();
const mockListNotes = vi.fn();
const mockListFloatingTasks = vi.fn();

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    listEvents: (...args: unknown[]) => mockListEvents(...args),
    listNotes: (...args: unknown[]) => mockListNotes(...args),
    listFloatingTasks: (...args: unknown[]) => mockListFloatingTasks(...args),
  };
});

// listen mock: captures handlers by event name so tests can trigger specific events
const capturedHandlers: Record<string, () => void> = {};
const mockUnlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: () => void) => {
    capturedHandlers[event] = handler;
    return Promise.resolve(mockUnlisten);
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const initialAppState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialAppState, true);
  Object.keys(capturedHandlers).forEach((k) => delete capturedHandlers[k]);
  mockUnlisten.mockReset();
  mockListEvents.mockResolvedValue([]);
  mockListNotes.mockResolvedValue([]);
  mockListFloatingTasks.mockResolvedValue([]);
});

// ── Initial load ──────────────────────────────────────────────────────────────

describe("useGeraSync — initial load", () => {
  it("calls listEvents, listNotes, and listFloatingTasks on mount", async () => {
    renderHook(() => useGeraSync());
    await waitFor(() => expect(mockListEvents).toHaveBeenCalledTimes(1));
    expect(mockListNotes).toHaveBeenCalledTimes(1);
    expect(mockListFloatingTasks).toHaveBeenCalledTimes(1);
  });

  it("populates store with loaded data", async () => {
    const events = [{ id: "evt-1" }];
    const notes = [{ filename: "note.md" }];
    const tasks = [{ text: "Task 1" }];
    mockListEvents.mockResolvedValue(events);
    mockListNotes.mockResolvedValue(notes);
    mockListFloatingTasks.mockResolvedValue(tasks);

    renderHook(() => useGeraSync());

    await waitFor(() => expect(useAppStore.getState().events).toEqual(events));
    expect(useAppStore.getState().notes).toEqual(notes);
    expect(useAppStore.getState().tasks).toEqual(tasks);
  });

  it("sets loading to false after data loads", async () => {
    // Start with loading=true
    useAppStore.setState({ loading: true });
    renderHook(() => useGeraSync());
    await waitFor(() => expect(useAppStore.getState().loading).toBe(false));
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("useGeraSync — error handling", () => {
  it("does not throw when an API call rejects; store remains unchanged", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListEvents.mockRejectedValue(new Error("network error"));

    // Should not throw
    expect(() => renderHook(() => useGeraSync())).not.toThrow();

    // Give async effects time to settle; store should not have been updated with
    // partial data (the Promise.all rejects before any setX is called)
    await new Promise((r) => setTimeout(r, 50));
    expect(useAppStore.getState().events).toEqual(initialAppState.events);
    consoleSpy.mockRestore();
  });
});

// ── data-changed listener ─────────────────────────────────────────────────────

describe("useGeraSync — data-changed event", () => {
  it("registers a listener for gera://data-changed on mount", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    renderHook(() => useGeraSync());
    await waitFor(() => expect(capturedHandlers["gera://data-changed"]).toBeDefined());
    expect(listen).toHaveBeenCalledWith("gera://data-changed", expect.any(Function));
  });

  it("reloads data when the data-changed event fires", async () => {
    renderHook(() => useGeraSync());
    await waitFor(() => expect(capturedHandlers["gera://data-changed"]).toBeDefined());

    // First load already happened — reset call counts
    mockListEvents.mockClear();
    mockListNotes.mockClear();
    mockListFloatingTasks.mockClear();

    // Simulate a gera://data-changed event
    capturedHandlers["gera://data-changed"]!();

    await waitFor(() => expect(mockListEvents).toHaveBeenCalledTimes(1));
    expect(mockListNotes).toHaveBeenCalledTimes(1);
    expect(mockListFloatingTasks).toHaveBeenCalledTimes(1);
  });

  it("calls unlisten when the component unmounts", async () => {
    const { unmount } = renderHook(() => useGeraSync());
    await waitFor(() => expect(capturedHandlers["gera://data-changed"]).toBeDefined());

    unmount();

    // Two listeners registered (data-changed + vault-changed) → two unlistens on unmount
    await waitFor(() => expect(mockUnlisten).toHaveBeenCalledTimes(2));
  });
});

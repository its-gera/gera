import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeybindingsSettings } from "./KeybindingsSettings";

// ── Mock keybindings module ───────────────────────────────────────────────────
// vi.mock factories are hoisted, so shared data/mocks must use vi.hoisted().

const { DEFAULT_BINDINGS, mockGetMergedBindings, mockGetActiveKeys,
        mockSaveOverride, mockResetAllOverrides, mockFormatKeyEvent } = vi.hoisted(() => {
  const DEFAULT_BINDINGS = [
    { action: "openCommandPalette", label: "Open command palette", keys: "⌘K", scope: "global" as const, configurable: true },
    { action: "goToTasks",          label: "Go to Tasks",          keys: "⌘1", scope: "global" as const, configurable: true },
    { action: "goToNotes",          label: "Go to Notes",          keys: "⌘2", scope: "global" as const, configurable: true },
  ];
  return {
    DEFAULT_BINDINGS,
    mockGetMergedBindings: vi.fn(() => DEFAULT_BINDINGS.map((b) => ({ ...b }))),
    mockGetActiveKeys: vi.fn((action: string) => DEFAULT_BINDINGS.find((b) => b.action === action)?.keys ?? ""),
    mockSaveOverride: vi.fn(),
    mockResetAllOverrides: vi.fn(),
    mockFormatKeyEvent: vi.fn((e: KeyboardEvent) => e.key),
  };
});

vi.mock("../../types/keybindings", () => ({
  ALL_BINDINGS: DEFAULT_BINDINGS,
  getMergedBindings: () => mockGetMergedBindings(),
  getActiveKeys: (action: string) => mockGetActiveKeys(action),
  saveOverride: (...args: unknown[]) => mockSaveOverride(...args),
  resetAllOverrides: () => mockResetAllOverrides(),
  formatKeyEvent: (e: KeyboardEvent) => mockFormatKeyEvent(e),
  formatKeysForDisplay: (keys: string) => keys,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderKB() {
  return render(<KeybindingsSettings />);
}

beforeEach(() => {
  mockGetMergedBindings.mockReturnValue(DEFAULT_BINDINGS.map((b) => ({ ...b })));
  mockGetActiveKeys.mockImplementation(
    (action: string) => DEFAULT_BINDINGS.find((b) => b.action === action)?.keys ?? ""
  );
  mockSaveOverride.mockClear();
  mockResetAllOverrides.mockClear();
  mockFormatKeyEvent.mockImplementation((e: KeyboardEvent) => e.key);
});

// ── Display ───────────────────────────────────────────────────────────────────

describe("KeybindingsSettings — display", () => {
  it("renders a row for each configurable binding", () => {
    renderKB();
    expect(screen.getByText("Open command palette")).toBeInTheDocument();
    expect(screen.getByText("Go to Tasks")).toBeInTheDocument();
    expect(screen.getByText("Go to Notes")).toBeInTheDocument();
  });

  it("shows the current key for each binding", () => {
    renderKB();
    expect(screen.getByText("⌘K")).toBeInTheDocument();
    expect(screen.getByText("⌘1")).toBeInTheDocument();
    expect(screen.getByText("⌘2")).toBeInTheDocument();
  });

  it("shows a 'Record new shortcut' (✎) edit button for each binding", () => {
    renderKB();
    expect(screen.getAllByTitle("Record new shortcut")).toHaveLength(DEFAULT_BINDINGS.length);
  });

  it("shows 'Reset all to defaults' button", () => {
    renderKB();
    expect(screen.getByRole("button", { name: "Reset all to defaults" })).toBeInTheDocument();
  });
});

// ── Recording mode ────────────────────────────────────────────────────────────

describe("KeybindingsSettings — recording", () => {
  it("enters recording mode when the edit button is clicked", async () => {
    renderKB();
    const editBtns = screen.getAllByTitle("Record new shortcut");
    await userEvent.click(editBtns[0]);
    expect(screen.getByText("Press a key…")).toBeInTheDocument();
  });

  it("shows Confirm (✓) and Cancel (✕) buttons while recording", async () => {
    renderKB();
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    expect(screen.getByTitle("Confirm")).toBeInTheDocument();
    expect(screen.getByTitle("Cancel")).toBeInTheDocument();
  });

  it("shows the pressed key in the badge while recording", async () => {
    mockFormatKeyEvent.mockReturnValue("⌘P");
    renderKB();
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    // Fire a keydown to simulate the user pressing a key
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true })); });
    await screen.findByText("⌘P");
  });

  it("cancels recording when Escape is pressed", async () => {
    renderKB();
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await screen.findByText("Press a key…").then(() => {}).catch(() => {}); // wait for re-render
    // After Escape, recording mode is off — no Confirm button
    expect(screen.queryByTitle("Confirm")).not.toBeInTheDocument();
  });

  it("cancels recording when the ✕ button is clicked", async () => {
    renderKB();
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    await userEvent.click(screen.getByTitle("Cancel"));
    expect(screen.queryByTitle("Confirm")).not.toBeInTheDocument();
  });

  it("Confirm button is disabled until a key is pressed", async () => {
    renderKB();
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    expect(screen.getByTitle("Confirm")).toBeDisabled();
  });
});

// ── Committing a new binding ──────────────────────────────────────────────────

describe("KeybindingsSettings — commit", () => {
  it("calls saveOverride with the action and new key when Confirm is clicked", async () => {
    mockFormatKeyEvent.mockReturnValue("⌘P");
    renderKB();
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true })); });
    await screen.findByText("⌘P");
    await userEvent.click(screen.getByTitle("Confirm"));
    expect(mockSaveOverride).toHaveBeenCalledWith("openCommandPalette", "⌘P");
  });

  it("exits recording mode after committing", async () => {
    mockFormatKeyEvent.mockReturnValue("⌘P");
    renderKB();
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", metaKey: true, bubbles: true })); });
    await screen.findByText("⌘P");
    await userEvent.click(screen.getByTitle("Confirm"));
    expect(screen.queryByTitle("Confirm")).not.toBeInTheDocument();
  });
});

// ── Conflict detection ────────────────────────────────────────────────────────

describe("KeybindingsSettings — conflict detection", () => {
  it("shows conflict hint when the pressed key conflicts with another binding", async () => {
    // Simulate pressing ⌘1 (which is already bound to "goToTasks") while recording openCommandPalette
    mockFormatKeyEvent.mockReturnValue("⌘1");
    mockGetActiveKeys.mockImplementation((action: string) => {
      if (action === "goToTasks") return "⌘1";
      return DEFAULT_BINDINGS.find((b) => b.action === action)?.keys ?? "";
    });
    renderKB();
    // Start recording for "Open command palette"
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", metaKey: true, bubbles: true })); });
    await screen.findByText(/Conflicts with "Go to Tasks"/i);
  });

  it("disables Confirm when there is a conflict", async () => {
    mockFormatKeyEvent.mockReturnValue("⌘1");
    mockGetActiveKeys.mockImplementation((action: string) => {
      if (action === "goToTasks") return "⌘1";
      return DEFAULT_BINDINGS.find((b) => b.action === action)?.keys ?? "";
    });
    renderKB();
    await userEvent.click(screen.getAllByTitle("Record new shortcut")[0]);
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", metaKey: true, bubbles: true })); });
    await screen.findByText(/Conflicts with/);
    expect(screen.getByTitle("Confirm")).toBeDisabled();
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

describe("KeybindingsSettings — reset", () => {
  it("calls resetAllOverrides when 'Reset all to defaults' is clicked", async () => {
    renderKB();
    await userEvent.click(screen.getByRole("button", { name: "Reset all to defaults" }));
    expect(mockResetAllOverrides).toHaveBeenCalledOnce();
  });

  it("shows ↺ (reset individual) button when a binding is modified", () => {
    // Simulate a modified binding (keys differ from default)
    mockGetMergedBindings.mockReturnValue([
      { ...DEFAULT_BINDINGS[0], keys: "⌘P" }, // modified
      ...DEFAULT_BINDINGS.slice(1),
    ]);
    renderKB();
    expect(screen.getByTitle("Reset to default")).toBeInTheDocument();
  });

  it("does not show ↺ button when no binding is modified", () => {
    renderKB();
    expect(screen.queryByTitle("Reset to default")).not.toBeInTheDocument();
  });

  it("calls saveOverride with the default key when ↺ is clicked", async () => {
    mockGetMergedBindings.mockReturnValue([
      { ...DEFAULT_BINDINGS[0], keys: "⌘P" },
      ...DEFAULT_BINDINGS.slice(1),
    ]);
    renderKB();
    await userEvent.click(screen.getByTitle("Reset to default"));
    expect(mockSaveOverride).toHaveBeenCalledWith("openCommandPalette", "⌘K");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsModal } from "./SettingsModal";
import type { TokenData, SyncResult } from "../../api";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockListGoogleAccounts = vi.fn();
const mockAuthenticateGoogle = vi.fn();
const mockRemoveGoogleAccount = vi.fn();
const mockSyncGoogleCalendar = vi.fn();

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    listGoogleAccounts: () => mockListGoogleAccounts(),
    authenticateGoogle: () => mockAuthenticateGoogle(),
    removeGoogleAccount: (...args: unknown[]) => mockRemoveGoogleAccount(...args),
    syncGoogleCalendar: (...args: unknown[]) => mockSyncGoogleCalendar(...args),
  };
});

const mockStartTour = vi.fn();
const mockResetTour = vi.fn();

vi.mock("../../hooks/useTour", () => ({
  useTour: () => ({ startTour: mockStartTour }),
  resetTour: () => mockResetTour(),
}));

// Stub heavy sub-components so these tests focus on SettingsModal logic
vi.mock("../shared/ThemeToggle", () => ({
  default: () => <button data-testid="theme-toggle">Theme</button>,
}));

vi.mock("./KeybindingsSettings", () => ({
  KeybindingsSettings: () => <div data-testid="keybindings-settings">Keybindings</div>,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAccount(email: string): TokenData {
  return { account_email: email } as TokenData;
}

function makeSyncResult(created = 2, updated = 1): SyncResult {
  return { created, updated } as SyncResult;
}

async function renderModal(isOpen = true, onClose = vi.fn()) {
  const result = render(
    <MemoryRouter>
      <SettingsModal isOpen={isOpen} onClose={onClose} />
    </MemoryRouter>
  );
  // Flush the async loadAccounts() effect so its setAccounts() state update
  // is captured inside act() and doesn't leak as an unhandled warning.
  await act(async () => {});
  return result;
}

beforeEach(() => {
  mockListGoogleAccounts.mockResolvedValue([]);
  mockAuthenticateGoogle.mockResolvedValue(makeAccount("new@gmail.com"));
  mockRemoveGoogleAccount.mockResolvedValue(undefined);
  mockSyncGoogleCalendar.mockResolvedValue(makeSyncResult());
  mockStartTour.mockClear();
  mockResetTour.mockClear();
});

// ── Visibility ────────────────────────────────────────────────────────────────

describe("SettingsModal — visibility", () => {
  it("renders nothing when isOpen is false", async () => {
    await renderModal(false);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("renders the modal when isOpen is true", async () => {
    await renderModal();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });
});

// ── Close behaviour ───────────────────────────────────────────────────────────

describe("SettingsModal — closing", () => {
  it("calls onClose when the × button is clicked", async () => {
    const onClose = vi.fn();
    await renderModal(true, onClose);
    await userEvent.click(screen.getByRole("button", { name: "×" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    await renderModal(true, onClose);
    await userEvent.click(document.querySelector(".modal-backdrop")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when the panel is clicked", async () => {
    const onClose = vi.fn();
    await renderModal(true, onClose);
    await userEvent.click(document.querySelector(".modal-panel")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    await renderModal(true, onClose);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

describe("SettingsModal — tabs", () => {
  it("shows General tab content by default", async () => {
    await renderModal();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("switches to Calendars tab when clicked", async () => {
    await renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Calendars" }));
    expect(screen.getByText("Google Calendar Accounts")).toBeInTheDocument();
  });

  it("switches to Keybindings tab when clicked", async () => {
    await renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Keybindings" }));
    expect(screen.getByTestId("keybindings-settings")).toBeInTheDocument();
  });

  it("marks the active tab with settings-tab--active class", async () => {
    await renderModal();
    const generalTab = screen.getByRole("button", { name: "General" });
    expect(generalTab).toHaveClass("settings-tab--active");
    await userEvent.click(screen.getByRole("button", { name: "Calendars" }));
    expect(generalTab).not.toHaveClass("settings-tab--active");
    expect(screen.getByRole("button", { name: "Calendars" })).toHaveClass("settings-tab--active");
  });
});

// ── General tab ───────────────────────────────────────────────────────────────

describe("SettingsModal — general tab", () => {
  it("shows the ThemeToggle", async () => {
    await renderModal();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("shows the 'Restart tour' button", async () => {
    await renderModal();
    expect(screen.getByRole("button", { name: "Restart tour" })).toBeInTheDocument();
  });

  it("'Restart tour' calls resetTour, onClose, and startTour", async () => {
    const onClose = vi.fn();
    await renderModal(true, onClose);
    await userEvent.click(screen.getByRole("button", { name: "Restart tour" }));
    expect(mockResetTour).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockStartTour).toHaveBeenCalledOnce();
  });
});

// ── Calendars tab — accounts ──────────────────────────────────────────────────

describe("SettingsModal — calendars tab", () => {
  async function openCalendarsTab() {
    await renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Calendars" }));
  }

  it("loads Google accounts on open", async () => {
    mockListGoogleAccounts.mockResolvedValue([makeAccount("alice@gmail.com")]);
    await openCalendarsTab();
    await waitFor(() => expect(screen.getByText("alice@gmail.com")).toBeInTheDocument());
  });

  it("shows 'Add Google Account' button", async () => {
    await openCalendarsTab();
    expect(screen.getByText("Add Google Account")).toBeInTheDocument();
  });

  it("calls authenticateGoogle and shows the new account when 'Add' is clicked", async () => {
    mockAuthenticateGoogle.mockResolvedValue(makeAccount("new@gmail.com"));
    await openCalendarsTab();
    await userEvent.click(screen.getByText("Add Google Account"));
    await waitFor(() => expect(screen.getByText("new@gmail.com")).toBeInTheDocument());
    expect(mockAuthenticateGoogle).toHaveBeenCalledOnce();
  });

  it("shows 'Authenticating…' while authenticating", async () => {
    mockAuthenticateGoogle.mockReturnValue(new Promise(() => {})); // never resolves
    await openCalendarsTab();
    await userEvent.click(screen.getByText("Add Google Account"));
    expect(screen.getByText("Authenticating…")).toBeInTheDocument();
  });

  it("shows an error banner when authentication fails", async () => {
    mockAuthenticateGoogle.mockRejectedValue(new Error("OAuth failed"));
    await openCalendarsTab();
    await userEvent.click(screen.getByText("Add Google Account"));
    await waitFor(() => expect(screen.getByText("OAuth failed")).toBeInTheDocument());
  });

  it("calls syncGoogleCalendar when 'Sync Now' is clicked", async () => {
    mockListGoogleAccounts.mockResolvedValue([makeAccount("alice@gmail.com")]);
    await openCalendarsTab();
    await waitFor(() => screen.getByText("Sync Now"));
    await userEvent.click(screen.getByText("Sync Now"));
    await waitFor(() =>
      expect(mockSyncGoogleCalendar).toHaveBeenCalledWith("alice@gmail.com", "primary")
    );
  });

  it("shows 'Syncing...' while sync is in progress", async () => {
    mockListGoogleAccounts.mockResolvedValue([makeAccount("alice@gmail.com")]);
    mockSyncGoogleCalendar.mockReturnValue(new Promise(() => {}));
    await openCalendarsTab();
    await waitFor(() => screen.getByText("Sync Now"));
    await userEvent.click(screen.getByText("Sync Now"));
    expect(screen.getByText("Syncing...")).toBeInTheDocument();
  });

  it("shows sync result after successful sync", async () => {
    mockListGoogleAccounts.mockResolvedValue([makeAccount("alice@gmail.com")]);
    mockSyncGoogleCalendar.mockResolvedValue(makeSyncResult(3, 5));
    await openCalendarsTab();
    await waitFor(() => screen.getByText("Sync Now"));
    await userEvent.click(screen.getByText("Sync Now"));
    await waitFor(() => expect(screen.getByText(/3 created/)).toBeInTheDocument());
    expect(screen.getByText(/5 updated/)).toBeInTheDocument();
  });

  it("calls removeGoogleAccount when 'Remove' is clicked", async () => {
    mockListGoogleAccounts.mockResolvedValue([makeAccount("alice@gmail.com")]);
    await openCalendarsTab();
    await waitFor(() => screen.getByText("Remove"));
    await userEvent.click(screen.getByText("Remove"));
    await waitFor(() =>
      expect(mockRemoveGoogleAccount).toHaveBeenCalledWith("alice@gmail.com")
    );
  });

  it("removes the account from the list after removal", async () => {
    mockListGoogleAccounts.mockResolvedValue([makeAccount("alice@gmail.com")]);
    await openCalendarsTab();
    await waitFor(() => screen.getByText("alice@gmail.com"));
    await userEvent.click(screen.getByText("Remove"));
    await waitFor(() =>
      expect(screen.queryByText("alice@gmail.com")).not.toBeInTheDocument()
    );
  });

  it("shows an error banner when sync fails", async () => {
    mockListGoogleAccounts.mockResolvedValue([makeAccount("alice@gmail.com")]);
    mockSyncGoogleCalendar.mockRejectedValue(new Error("Sync failed"));
    await openCalendarsTab();
    await waitFor(() => screen.getByText("Sync Now"));
    await userEvent.click(screen.getByText("Sync Now"));
    await waitFor(() => expect(screen.getByText("Sync failed")).toBeInTheDocument());
  });
});

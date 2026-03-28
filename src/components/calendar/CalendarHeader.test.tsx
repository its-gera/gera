import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarHeader } from "./CalendarHeader";

// listGoogleAccounts is the only API call this component makes
const mockListGoogleAccounts = vi.fn();

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api")>();
  return {
    ...actual,
    listGoogleAccounts: () => mockListGoogleAccounts(),
  };
});

const baseProps = {
  monthYear: "March 2026",
  calendarView: "week" as const,
  onViewChange: vi.fn(),
  onPrevious: vi.fn(),
  onNext: vi.fn(),
  onToday: vi.fn(),
  onRefresh: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no Google accounts
  mockListGoogleAccounts.mockResolvedValue([]);
});

describe("CalendarHeader", () => {
  it("shows the current month/year", async () => {
    render(<CalendarHeader {...baseProps} />);
    expect(screen.getByText("March 2026")).toBeInTheDocument();
  });

  it("calls onPrevious when the previous button is clicked", async () => {
    render(<CalendarHeader {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(baseProps.onPrevious).toHaveBeenCalledOnce();
  });

  it("calls onNext when the next button is clicked", async () => {
    render(<CalendarHeader {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(baseProps.onNext).toHaveBeenCalledOnce();
  });

  it("calls onToday when Today is clicked", async () => {
    render(<CalendarHeader {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(baseProps.onToday).toHaveBeenCalledOnce();
  });

  it("shows the current view label on the dropdown trigger", async () => {
    render(<CalendarHeader {...baseProps} calendarView="3day" />);
    expect(screen.getByText(/3 Days/)).toBeInTheDocument();
  });

  it("opens the view dropdown when the view button is clicked", async () => {
    render(<CalendarHeader {...baseProps} />);
    await userEvent.click(screen.getByText("Week"));
    expect(screen.getByRole("button", { name: "3 Days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Day" })).toBeInTheDocument();
  });

  it("calls onViewChange with the selected view and closes the dropdown", async () => {
    const onViewChange = vi.fn();
    render(<CalendarHeader {...baseProps} onViewChange={onViewChange} />);
    await userEvent.click(screen.getByText("Week"));
    await userEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(onViewChange).toHaveBeenCalledWith("day");
    expect(screen.queryByRole("button", { name: "3 Days" })).not.toBeInTheDocument();
  });

  it("closes the dropdown when clicking outside", async () => {
    render(<CalendarHeader {...baseProps} />);
    await userEvent.click(screen.getByText("Week"));
    expect(screen.getByRole("button", { name: "Day" })).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole("button", { name: "Day" })).not.toBeInTheDocument();
  });

  it("hides the Refresh button when there are no Google accounts", async () => {
    mockListGoogleAccounts.mockResolvedValue([]);
    render(<CalendarHeader {...baseProps} />);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    });
  });

  it("shows the Refresh button when a Google account exists", async () => {
    mockListGoogleAccounts.mockResolvedValue([{ account_email: "user@gmail.com" }]);
    render(<CalendarHeader {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    });
  });

  it("calls onRefresh when the Refresh button is clicked", async () => {
    const onRefresh = vi.fn();
    mockListGoogleAccounts.mockResolvedValue([{ account_email: "user@gmail.com" }]);
    render(<CalendarHeader {...baseProps} onRefresh={onRefresh} />);
    await waitFor(() => screen.getByRole("button", { name: /refresh/i }));
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

});

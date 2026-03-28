import { describe, it, expect, beforeEach } from "vitest";
import { useCalendarStore } from "./useCalendarStore";

const initialState = useCalendarStore.getState();

beforeEach(() => {
  useCalendarStore.setState(initialState, true);
});

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe("useCalendarStore — initial state", () => {
  it("starts in week view", () => {
    expect(useCalendarStore.getState().calendarView).toBe("week");
  });

  it("starts with currentPeriodStart on a Monday", () => {
    const start = useCalendarStore.getState().currentPeriodStart;
    expect(start.getDay()).toBe(1); // Monday = 1
  });
});

// ─── setCalendarView ──────────────────────────────────────────────────────────

describe("useCalendarStore — setCalendarView", () => {
  it("switches to day view", () => {
    useCalendarStore.getState().setCalendarView("day");
    expect(useCalendarStore.getState().calendarView).toBe("day");
  });

  it("switches to 3day view", () => {
    useCalendarStore.getState().setCalendarView("3day");
    expect(useCalendarStore.getState().calendarView).toBe("3day");
  });

  it("snaps currentPeriodStart to Monday when switching to week view", () => {
    // Move to a Wednesday first
    useCalendarStore.setState({ calendarView: "day", currentPeriodStart: new Date("2026-03-18") }); // Wednesday
    useCalendarStore.getState().setCalendarView("week");
    expect(useCalendarStore.getState().currentPeriodStart.getDay()).toBe(1);
  });
});

// ─── goToNext ────────────────────────────────────────────────────────────────

describe("useCalendarStore — goToNext", () => {
  it("advances by 7 days in week view", () => {
    const before = useCalendarStore.getState().currentPeriodStart;
    useCalendarStore.getState().goToNext();
    const after = useCalendarStore.getState().currentPeriodStart;
    const diff = (after.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(7);
  });

  it("advances by 3 days in 3day view", () => {
    useCalendarStore.setState({ calendarView: "3day" });
    const before = useCalendarStore.getState().currentPeriodStart;
    useCalendarStore.getState().goToNext();
    const after = useCalendarStore.getState().currentPeriodStart;
    const diff = (after.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(3);
  });

  it("advances by 1 day in day view", () => {
    useCalendarStore.setState({ calendarView: "day" });
    const before = useCalendarStore.getState().currentPeriodStart;
    useCalendarStore.getState().goToNext();
    const after = useCalendarStore.getState().currentPeriodStart;
    const diff = (after.getTime() - before.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(1);
  });
});

// ─── goToPrevious ────────────────────────────────────────────────────────────

describe("useCalendarStore — goToPrevious", () => {
  it("goes back 7 days in week view", () => {
    const before = useCalendarStore.getState().currentPeriodStart;
    useCalendarStore.getState().goToPrevious();
    const after = useCalendarStore.getState().currentPeriodStart;
    const diff = (before.getTime() - after.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(7);
  });

  it("goes back 3 days in 3day view", () => {
    useCalendarStore.setState({ calendarView: "3day" });
    const before = useCalendarStore.getState().currentPeriodStart;
    useCalendarStore.getState().goToPrevious();
    const after = useCalendarStore.getState().currentPeriodStart;
    const diff = (before.getTime() - after.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(3);
  });

  it("goToNext then goToPrevious returns to the starting date", () => {
    const start = useCalendarStore.getState().currentPeriodStart.getTime();
    useCalendarStore.getState().goToNext();
    useCalendarStore.getState().goToPrevious();
    expect(useCalendarStore.getState().currentPeriodStart.getTime()).toBe(start);
  });
});

// ─── goToToday ───────────────────────────────────────────────────────────────

describe("useCalendarStore — goToToday", () => {
  it("resets currentPeriodStart to today's Monday in week view", () => {
    // Navigate away first
    useCalendarStore.getState().goToNext();
    useCalendarStore.getState().goToNext();

    useCalendarStore.getState().goToToday();

    const todayMonday = getMondayOf(new Date());
    const storeStart = useCalendarStore.getState().currentPeriodStart;

    expect(storeStart.getFullYear()).toBe(todayMonday.getFullYear());
    expect(storeStart.getMonth()).toBe(todayMonday.getMonth());
    expect(storeStart.getDate()).toBe(todayMonday.getDate());
  });

  it("in day view, resets to today's date", () => {
    useCalendarStore.setState({ calendarView: "day" });
    useCalendarStore.getState().goToNext();
    useCalendarStore.getState().goToToday();

    const today = new Date();
    const storeStart = useCalendarStore.getState().currentPeriodStart;

    expect(storeStart.getFullYear()).toBe(today.getFullYear());
    expect(storeStart.getMonth()).toBe(today.getMonth());
    expect(storeStart.getDate()).toBe(today.getDate());
  });
});

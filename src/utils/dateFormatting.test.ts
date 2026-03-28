import { describe, it, expect } from "vitest";
import {
  formatEventTime,
  formatEventDate,
  formatEventDateTime,
  formatMonthYear,
} from "./dateFormatting";

// All tests use a fixed date: Saturday 2026-03-14 at 09:30
const ISO = "2026-03-14T09:30:00";
const DATE = new Date(ISO);

// ─── formatEventTime ─────────────────────────────────────────────────────────

describe("formatEventTime", () => {
  it("formats an AM time correctly", () => {
    expect(formatEventTime(DATE)).toBe("9:30 AM");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatEventTime(ISO)).toBe("9:30 AM");
  });

  it("formats a PM time correctly", () => {
    expect(formatEventTime(new Date("2026-03-14T14:00:00"))).toBe("2:00 PM");
  });

  it("formats midnight as 12:00 AM", () => {
    expect(formatEventTime(new Date("2026-03-14T00:00:00"))).toBe("12:00 AM");
  });

  it("formats noon as 12:00 PM", () => {
    expect(formatEventTime(new Date("2026-03-14T12:00:00"))).toBe("12:00 PM");
  });
});

// ─── formatEventDate ─────────────────────────────────────────────────────────

describe("formatEventDate", () => {
  it("formats a date to short month and day", () => {
    expect(formatEventDate(DATE)).toBe("Mar 14");
  });

  it("accepts an ISO string", () => {
    expect(formatEventDate(ISO)).toBe("Mar 14");
  });

  it("formats the first day of a month without leading zero", () => {
    expect(formatEventDate(new Date("2026-01-01T00:00:00"))).toBe("Jan 1");
  });
});

// ─── formatEventDateTime ─────────────────────────────────────────────────────

describe("formatEventDateTime", () => {
  it("includes both date and time", () => {
    const result = formatEventDateTime(DATE);
    expect(result).toContain("Mar 14");
    expect(result).toContain("9:30 AM");
  });

  it("accepts an ISO string", () => {
    const result = formatEventDateTime(ISO);
    expect(result).toContain("Mar");
  });
});

// ─── formatMonthYear ─────────────────────────────────────────────────────────

describe("formatMonthYear", () => {
  it("formats to full month name and year", () => {
    expect(formatMonthYear(DATE)).toBe("March 2026");
  });

  it("accepts an ISO string", () => {
    expect(formatMonthYear("2026-01-15T00:00:00")).toBe("January 2026");
  });

  it("handles December correctly", () => {
    expect(formatMonthYear(new Date("2026-12-01T00:00:00"))).toBe("December 2026");
  });
});

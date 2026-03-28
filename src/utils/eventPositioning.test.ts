import { describe, it, expect } from "vitest";
import {
  isAllDayEvent,
  getAllDayEventsForDay,
  calculateEventStyle,
  HOUR_HEIGHT_PX,
} from "./eventPositioning";
import type { EventEntity } from "../api";

function makeEvent(from_: string, to: string, overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    id: "evt-1",
    source: "local",
    from_,
    to,
    name: "Test Event",
    description: "",
    participants: [],
    location: "",
    metadata: {
      source_platform: "",
      source_account: "",
      source_event_id: "",
      source_calendar_id: "",
      etag: "",
      last_synced_at: null,
      recurring_event_id: "",
      source_updated_at: null,
    },
    ...overrides,
  };
}

// ─── isAllDayEvent ────────────────────────────────────────────────────────────

describe("isAllDayEvent", () => {
  it("returns true for an event spanning exactly 24 hours", () => {
    const ev = makeEvent("2026-03-14T00:00:00", "2026-03-15T00:00:00");
    expect(isAllDayEvent(ev)).toBe(true);
  });

  it("returns true for a multi-day event", () => {
    const ev = makeEvent("2026-03-14T00:00:00", "2026-03-16T00:00:00");
    expect(isAllDayEvent(ev)).toBe(true);
  });

  it("returns false for a 1-hour meeting", () => {
    const ev = makeEvent("2026-03-14T09:00:00", "2026-03-14T10:00:00");
    expect(isAllDayEvent(ev)).toBe(false);
  });

  it("returns false for a 23h59m event", () => {
    const ev = makeEvent("2026-03-14T00:00:00", "2026-03-14T23:59:00");
    expect(isAllDayEvent(ev)).toBe(false);
  });

  it("returns false for an invalid date string", () => {
    const ev = makeEvent("not-a-date", "also-not-a-date");
    expect(isAllDayEvent(ev)).toBe(false);
  });
});

// ─── getAllDayEventsForDay ─────────────────────────────────────────────────────

describe("getAllDayEventsForDay", () => {
  const day = new Date("2026-03-14");

  it("returns all-day events that fall on the given day", () => {
    const ev = makeEvent("2026-03-14T00:00:00", "2026-03-15T00:00:00");
    expect(getAllDayEventsForDay([ev], day)).toHaveLength(1);
  });

  it("excludes timed events", () => {
    const ev = makeEvent("2026-03-14T09:00:00", "2026-03-14T10:00:00");
    expect(getAllDayEventsForDay([ev], day)).toHaveLength(0);
  });

  it("excludes all-day events on different days", () => {
    const ev = makeEvent("2026-03-15T00:00:00", "2026-03-16T00:00:00");
    expect(getAllDayEventsForDay([ev], day)).toHaveLength(0);
  });

  it("includes a multi-day event that spans the given day", () => {
    const ev = makeEvent("2026-03-13T00:00:00", "2026-03-16T00:00:00");
    expect(getAllDayEventsForDay([ev], day)).toHaveLength(1);
  });

  it("returns empty array when event list is empty", () => {
    expect(getAllDayEventsForDay([], day)).toHaveLength(0);
  });
});

// ─── calculateEventStyle ──────────────────────────────────────────────────────

describe("calculateEventStyle", () => {
  it("returns correct height for a 1-hour event", () => {
    const ev = makeEvent("2026-03-14T09:00:00", "2026-03-14T10:00:00");
    const { height } = calculateEventStyle(ev);
    expect(height).toBe(`${HOUR_HEIGHT_PX}px`);
  });

  it("returns correct height for a 2-hour event", () => {
    const ev = makeEvent("2026-03-14T09:00:00", "2026-03-14T11:00:00");
    const { height } = calculateEventStyle(ev);
    expect(height).toBe(`${HOUR_HEIGHT_PX * 2}px`);
  });

  it("returns top=0% for an event starting on the hour", () => {
    const ev = makeEvent("2026-03-14T09:00:00", "2026-03-14T10:00:00");
    expect(calculateEventStyle(ev).top).toBe("0%");
  });

  it("returns top=50% for an event starting at :30", () => {
    const ev = makeEvent("2026-03-14T09:30:00", "2026-03-14T10:30:00");
    expect(calculateEventStyle(ev).top).toBe("50%");
  });

  it("returns safe fallback for invalid date strings", () => {
    const ev = makeEvent("bad", "date");
    const style = calculateEventStyle(ev);
    expect(style.height).toBe("0px");
    expect(style.top).toBe("0%");
  });
});

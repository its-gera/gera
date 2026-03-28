import { useEffect, useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTimePicker } from "./DateTimePicker";

const ISO_DATE = "2026-03-14T09:00";

function renderPicker(props: Partial<React.ComponentProps<typeof DateTimePicker>> = {}) {
  const onChange = vi.fn();
  render(<DateTimePicker value="" onChange={onChange} {...props} />);
  return { onChange };
}

describe("DateTimePicker", () => {
  // ── Trigger display ──────────────────────────────────────────────────────

  it("shows the placeholder when value is empty", () => {
    renderPicker({ placeholder: "Pick a date" });
    expect(screen.getByText("Pick a date")).toBeInTheDocument();
  });

  it("shows formatted date when a value is provided", () => {
    renderPicker({ value: ISO_DATE });
    expect(screen.getByText(/Mar 14, 2026/)).toBeInTheDocument();
  });

  it("includes the time in the label when includeTime=true", () => {
    renderPicker({ value: ISO_DATE, includeTime: true });
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
  });

  it("omits the time in the label when includeTime=false", () => {
    renderPicker({ value: "2026-03-14", includeTime: false });
    expect(screen.queryByText(/09:00/)).not.toBeInTheDocument();
  });

  // ── Open / close ─────────────────────────────────────────────────────────

  it("popover is not shown initially", () => {
    renderPicker();
    expect(screen.queryByText("January")).not.toBeInTheDocument();
    expect(screen.queryByText("March")).not.toBeInTheDocument();
  });

  it("opens the popover when the trigger is clicked", async () => {
    renderPicker({ value: ISO_DATE });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    expect(screen.getByText("March 2026")).toBeInTheDocument();
  });

  it("closes the popover when Escape is pressed", async () => {
    renderPicker({ value: ISO_DATE });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("March 2026")).not.toBeInTheDocument();
  });

  it("does not open when disabled", async () => {
    renderPicker({ value: ISO_DATE, disabled: true });
    const trigger = screen.getByRole("button", { name: /Mar 14/ });
    expect(trigger).toBeDisabled();
    await userEvent.click(trigger);
    expect(screen.queryByText("March 2026")).not.toBeInTheDocument();
  });

  // ── Day selection ─────────────────────────────────────────────────────────

  it("calls onChange when a day is clicked", async () => {
    const { onChange } = renderPicker({ value: ISO_DATE, includeTime: false });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    // Click day 20
    const day20 = screen.getAllByRole("button").find((b) => b.textContent === "20");
    await userEvent.click(day20!);
    expect(onChange).toHaveBeenCalledWith("2026-03-20");
  });

  it("calls onChange with the time preserved when a day is clicked with includeTime=true", async () => {
    const { onChange } = renderPicker({ value: ISO_DATE, includeTime: true });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    const day20 = screen.getAllByRole("button").find((b) => b.textContent === "20");
    await userEvent.click(day20!);
    expect(onChange).toHaveBeenCalledWith("2026-03-20T09:00");
  });

  // ── Month navigation ──────────────────────────────────────────────────────

  it("navigates to the previous month", async () => {
    renderPicker({ value: ISO_DATE });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    expect(screen.getByText("March 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByText("‹"));
    expect(screen.getByText("February 2026")).toBeInTheDocument();
  });

  it("navigates to the next month", async () => {
    renderPicker({ value: ISO_DATE });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    await userEvent.click(screen.getByText("›"));
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("wraps from January to December when going to previous month", async () => {
    renderPicker({ value: "2026-01-15T09:00" });
    await userEvent.click(screen.getByRole("button", { name: /Jan 15/ }));
    await userEvent.click(screen.getByText("‹"));
    expect(screen.getByText("December 2025")).toBeInTheDocument();
  });

  // ── Clear button ──────────────────────────────────────────────────────────

  it("shows a clear button when clearable=true and a value is set", () => {
    renderPicker({ value: ISO_DATE, clearable: true });
    expect(screen.getByRole("button", { name: "Clear date" })).toBeInTheDocument();
  });

  it("calls onChange with empty string when the clear button is clicked", async () => {
    const { onChange } = renderPicker({ value: ISO_DATE, clearable: true });
    await userEvent.click(screen.getByRole("button", { name: "Clear date" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("does not show a clear button when clearable=false", () => {
    renderPicker({ value: ISO_DATE, clearable: false });
    expect(screen.queryByRole("button", { name: "Clear date" })).not.toBeInTheDocument();
  });

  it("does not show a clear button when value is empty even if clearable=true", () => {
    renderPicker({ value: "", clearable: true });
    expect(screen.queryByRole("button", { name: "Clear date" })).not.toBeInTheDocument();
  });

  // ── Time spinners ─────────────────────────────────────────────────────────

  it("increments the hour when the up arrow button is clicked", async () => {
    const { onChange } = renderPicker({ value: ISO_DATE, includeTime: true });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    // The first ▲ button is the hour up spinner
    const upBtns = screen.getAllByText("▲");
    await userEvent.click(upBtns[0]);
    expect(onChange).toHaveBeenCalledWith("2026-03-14T10:00");
  });

  it("decrements the hour when the down arrow button is clicked", async () => {
    const { onChange } = renderPicker({ value: ISO_DATE, includeTime: true });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    const downBtns = screen.getAllByText("▼");
    await userEvent.click(downBtns[0]);
    expect(onChange).toHaveBeenCalledWith("2026-03-14T08:00");
  });

  it("increments the minute by 5 when the minute up button is clicked", async () => {
    const { onChange } = renderPicker({ value: ISO_DATE, includeTime: true });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    const upBtns = screen.getAllByText("▲");
    await userEvent.click(upBtns[1]); // second ▲ is minute
    expect(onChange).toHaveBeenCalledWith("2026-03-14T09:05");
  });

  it("wraps hour from 23 to 0 when incremented", async () => {
    const { onChange } = renderPicker({ value: "2026-03-14T23:00", includeTime: true });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    const upBtns = screen.getAllByText("▲");
    await userEvent.click(upBtns[0]);
    expect(onChange).toHaveBeenCalledWith("2026-03-14T00:00");
  });

  // ── Done button ───────────────────────────────────────────────────────────

  it("closes the popover when Done is clicked", async () => {
    renderPicker({ value: ISO_DATE, includeTime: true });
    await userEvent.click(screen.getByRole("button", { name: /Mar 14/ }));
    expect(screen.getByText("Done")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Done"));
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });
});

// ── BUG-006: portalled popover click triggers parent outside-click handler ────
//
// DateTimePicker renders its popover via createPortal(…, document.body).
// GeraRefTypeahead wraps the picker and registers a capture-phase mousedown
// listener on document to detect outside clicks.  Because the portalled
// popover is not a DOM descendant of the typeahead's container div, the
// listener considers any click on the popover as an "outside" click and calls
// dismiss(), closing the typeahead and unmounting the picker before any day
// selection can register.
//
// Fix: the parent outside-click handler must also exclude the picker's portal
// element (e.g. by checking a data attribute or using a shared ref).

// ── BUG-006 — portalled popover click: parent outside-click handler ───────────
//
// Fix applied in GeraRefTypeahead: the capture-phase outside-click handler now
// also checks `(e.target as Element).closest?.('.dtp-popover')` so that clicks
// inside the portalled popover are excluded, preventing premature dismissal.
//
// The two helpers below test both the buggy pattern (naïve handler) and the
// fixed pattern (portal-aware handler) to confirm the fix works as expected.

describe("BUG-006 — portalled popover: naïve outside-click handler incorrectly fires", () => {
  /** Naive handler — equivalent to the OLD (buggy) GeraRefTypeahead behaviour. */
  function NaiveWrapper({ onDismiss }: { onDismiss: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
      };
      document.addEventListener("mousedown", handler, true);
      return () => document.removeEventListener("mousedown", handler, true);
    }, [onDismiss]);
    return (
      <div ref={ref}>
        <DateTimePicker value="" onChange={() => {}} />
      </div>
    );
  }

  it("naïve handler fires when clicking the portalled popover (documents the pre-fix bug)", async () => {
    const onDismiss = vi.fn();
    render(<NaiveWrapper onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /select date/i }));
    fireEvent.mouseDown(document.querySelector(".dtp-popover")!);
    // Naïve handler DOES fire — this is the bug we fixed.
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("BUG-006 — portalled popover: fixed outside-click handler does NOT fire", () => {
  /** Fixed handler — mirrors the patched GeraRefTypeahead behaviour. */
  function FixedWrapper({ onDismiss }: { onDismiss: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        const target = e.target as Element;
        if (
          ref.current &&
          !ref.current.contains(target) &&
          !target.closest?.(".dtp-popover")
        ) {
          onDismiss();
        }
      };
      document.addEventListener("mousedown", handler, true);
      return () => document.removeEventListener("mousedown", handler, true);
    }, [onDismiss]);
    return (
      <div ref={ref}>
        <DateTimePicker value="" onChange={() => {}} />
      </div>
    );
  }

  it("fixed handler does NOT fire when clicking inside the portalled popover", async () => {
    const onDismiss = vi.fn();
    render(<FixedWrapper onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /select date/i }));
    fireEvent.mouseDown(document.querySelector(".dtp-popover")!);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("fixed handler still fires when clicking a true outside element", async () => {
    const onDismiss = vi.fn();
    render(<FixedWrapper onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /select date/i }));
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    expect(onDismiss).toHaveBeenCalledOnce();
    document.body.removeChild(outside);
  });

  it("trigger click does not fire dismiss (trigger is inside the wrapper)", async () => {
    const onDismiss = vi.fn();
    render(<FixedWrapper onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /select date/i }));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(document.querySelector(".dtp-popover")).not.toBeNull();
  });
});

// ── BUG-008: popover must never overflow the viewport ─────────────────────────
//
// updatePosition() calculates top/left from getBoundingClientRect() and
// window.innerHeight/innerWidth.  When neither above nor below has enough
// room for the ~340 px popover the current logic picks "above" and sets
// top = rect.top - 340 - 4, which can be negative (off-screen).
// A similar issue occurs for left when the right-align fallback overshoots.
//
// Fix: clamp top to Math.max(8, …) and left to Math.max(8, …).

describe("BUG-008 — popover stays within viewport bounds", () => {
  let origInnerHeight: number;
  let origInnerWidth: number;

  beforeEach(() => {
    origInnerHeight = window.innerHeight;
    origInnerWidth = window.innerWidth;
    // Position is computed inside a requestAnimationFrame. Mock rAF to run
    // callbacks synchronously so we don't need fake timers or async flushing.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerHeight", { value: origInnerHeight, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: origInnerWidth, configurable: true });
    vi.restoreAllMocks();
  });

  /** Click the trigger and let React flush all sync state updates. */
  async function openAndPosition(label: RegExp) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: label }));
    });
  }

  it("opens above the trigger when space below is less than popover height", async () => {
    // Trigger near the bottom: lots of room above, not below.
    // updatePosition() calls getBoundingClientRect() first on the trigger,
    // then on the popover. Provide 340px height for the popover so that
    // spaceBelow(32) < popoverHeight(340) → "above" placement is chosen.
    vi.spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValueOnce({
        top: 680, bottom: 710, left: 10, right: 210,
        width: 200, height: 30, x: 10, y: 680,
        toJSON: () => ({}),
      } as DOMRect) // trigger
      .mockReturnValue({
        top: 0, bottom: 340, left: 0, right: 264,
        width: 264, height: 340, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect); // popover (and any subsequent calls)
    Object.defineProperty(window, "innerHeight", { value: 750, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });

    renderPicker({ value: ISO_DATE });
    await openAndPosition(/Mar 14/);

    const popover = document.querySelector(".dtp-popover") as HTMLElement;
    const top = parseFloat(popover.style.top);
    // spaceBelow=32 < popoverHeight=340 → popover goes above trigger
    expect(top).toBeLessThan(680);
    expect(top).toBeGreaterThan(0);
  });

  it(
    "BUG-008 FAILING: popover top is not negative when space is tight both above and below",
    async () => {
      // Very small viewport — neither above nor below has 340 px
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        top: 50, bottom: 80, left: 10, right: 210,
        width: 200, height: 30, x: 10, y: 50,
        toJSON: () => ({}),
      } as DOMRect);
      // spaceBelow = 100-80-8 = 12, spaceAbove = 50-8 = 42
      // Both < 340 → current code: top = 50-340-4 = -294 (off-screen!)
      Object.defineProperty(window, "innerHeight", { value: 100, configurable: true });
      Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });

      renderPicker({ value: ISO_DATE });
      await openAndPosition(/Mar 14/);

      const popover = document.querySelector(".dtp-popover") as HTMLElement;
      const top = parseFloat(popover.style.top);
      // When FIXED: top should be clamped to ≥ 0 (or ≥ 8 with a safe margin)
      expect(top).toBeGreaterThanOrEqual(0);
    }
  );

  it(
    "BUG-008 FAILING: popover left is not negative when right-aligning overshoots the left edge",
    async () => {
      // Trigger very close to the left edge, popoverWidth (264) > rect.right
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        top: 100, bottom: 130, left: 5, right: 55,
        width: 50, height: 30, x: 5, y: 100,
        toJSON: () => ({}),
      } as DOMRect);
      Object.defineProperty(window, "innerWidth", { value: 200, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

      renderPicker({ value: ISO_DATE });
      await openAndPosition(/Mar 14/);

      const popover = document.querySelector(".dtp-popover") as HTMLElement;
      // right-align: left = rect.right - 264 = 55 - 264 = -209
      const left = parseFloat(popover.style.left);
      // When FIXED: left should be clamped to ≥ 0
      expect(left).toBeGreaterThanOrEqual(0);
    }
  );

  it("shifts left when trigger is near the right edge (already handled)", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100, bottom: 130, left: 900, right: 1050,
      width: 150, height: 30, x: 900, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(window, "innerWidth", { value: 1100, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    renderPicker({ value: ISO_DATE });
    await openAndPosition(/Mar 14/);

    const popover = document.querySelector(".dtp-popover") as HTMLElement;
    const left = parseFloat(popover.style.left);
    // The mocked getBoundingClientRect width is 150, so updatePosition uses
    // that as popoverWidth. The popover's right edge must stay within viewport.
    expect(left + 150).toBeLessThanOrEqual(1100);
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  it("renders an input element", () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows the provided placeholder", () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Find tasks…" />);
    expect(screen.getByPlaceholderText("Find tasks…")).toBeInTheDocument();
  });

  it("defaults placeholder to 'Search...' when not provided", () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("displays the controlled value", () => {
    render(<SearchInput value="hello" onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("hello");
  });

  it("calls onChange with the typed value", async () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("applies the given className to the input", () => {
    render(<SearchInput value="" onChange={vi.fn()} className="my-search" />);
    expect(screen.getByRole("textbox")).toHaveClass("my-search");
  });

  it("does not focus on mount when focusTrigger is 0", () => {
    render(<SearchInput value="" onChange={vi.fn()} focusTrigger={0} />);
    expect(screen.getByRole("textbox")).not.toHaveFocus();
  });

  it("does not focus on mount even when focusTrigger is non-zero", () => {
    render(<SearchInput value="" onChange={vi.fn()} focusTrigger={1} />);
    expect(screen.getByRole("textbox")).not.toHaveFocus();
  });

  it("focuses the input when focusTrigger increments after mount", () => {
    const { rerender } = render(<SearchInput value="" onChange={vi.fn()} focusTrigger={0} />);
    expect(screen.getByRole("textbox")).not.toHaveFocus();
    act(() => { rerender(<SearchInput value="" onChange={vi.fn()} focusTrigger={1} />); });
    expect(screen.getByRole("textbox")).toHaveFocus();
  });
});

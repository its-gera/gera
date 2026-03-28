import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("renders with role=checkbox", () => {
    render(<Checkbox checked={false} />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("has aria-checked=false when unchecked", () => {
    render(<Checkbox checked={false} />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
  });

  it("has aria-checked=true when checked", () => {
    render(<Checkbox checked={true} />);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("renders the check icon when checked", () => {
    const { container } = render(<Checkbox checked={true} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render the check icon when unchecked", () => {
    const { container } = render(<Checkbox checked={false} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("calls onChange when clicked", async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("does not throw when clicked without an onChange handler", async () => {
    render(<Checkbox checked={false} />);
    await expect(userEvent.click(screen.getByRole("checkbox"))).resolves.not.toThrow();
  });

  it("applies a custom className alongside the base class", () => {
    render(<Checkbox checked={false} className="my-class" />);
    expect(screen.getByRole("checkbox")).toHaveClass("checkbox", "my-class");
  });

  it("applies the 'checked' class when checked", () => {
    render(<Checkbox checked={true} />);
    expect(screen.getByRole("checkbox")).toHaveClass("checked");
  });

  it("does not apply the 'checked' class when unchecked", () => {
    render(<Checkbox checked={false} />);
    expect(screen.getByRole("checkbox")).not.toHaveClass("checked");
  });
});

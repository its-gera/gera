import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the provided message", () => {
    render(<EmptyState message="Nothing here yet" />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("renders the default message when none is provided", () => {
    render(<EmptyState />);
    expect(screen.getByText("No items yet")).toBeInTheDocument();
  });

  it("applies a custom className", () => {
    const { container } = render(<EmptyState className="my-empty" />);
    expect(container.firstChild).toHaveClass("my-empty");
  });
});

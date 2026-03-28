import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const props = {
    title: "Delete item?",
    message: "This cannot be undone.",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<ConfirmDialog {...props} />);
  return props;
}

describe("ConfirmDialog", () => {
  it("renders the title", () => {
    renderDialog({ title: "Are you sure?" });
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("renders the message", () => {
    renderDialog({ message: "This will be gone forever." });
    expect(screen.getByText("This will be gone forever.")).toBeInTheDocument();
  });

  it("renders a confirm button with the default label 'Delete'", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("renders a cancel button with the default label 'Cancel'", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses a custom confirmLabel", () => {
    renderDialog({ confirmLabel: "Remove" });
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("uses a custom cancelLabel", () => {
    renderDialog({ cancelLabel: "Go back" });
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const { onConfirm } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the cancel button is clicked", async () => {
    const { onCancel } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the backdrop is clicked", async () => {
    const { onCancel } = renderDialog();
    await userEvent.click(document.querySelector(".modal-backdrop")!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Escape is pressed", async () => {
    const { onCancel } = renderDialog();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not call onCancel when clicking inside the panel", async () => {
    const { onCancel } = renderDialog();
    await userEvent.click(document.querySelector(".modal-panel")!);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

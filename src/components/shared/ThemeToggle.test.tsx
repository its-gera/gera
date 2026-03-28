import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";

// jsdom ships without a working localStorage — provide a simple in-memory stub
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

// matchMedia is used by the component for system theme detection
const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));
vi.stubGlobal("matchMedia", matchMediaMock);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  matchMediaMock.mockClear();
});

describe("ThemeToggle", () => {
  it("renders three buttons: Light, Dark, Auto", () => {
    render(<ThemeToggle />);
    expect(screen.getByTitle("Light")).toBeInTheDocument();
    expect(screen.getByTitle("Dark")).toBeInTheDocument();
    expect(screen.getByTitle("Auto")).toBeInTheDocument();
  });

  it("defaults to Auto (system) mode when localStorage is empty", () => {
    render(<ThemeToggle />);
    expect(screen.getByTitle("Auto")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Light")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTitle("Dark")).toHaveAttribute("aria-pressed", "false");
  });

  it("restores light mode from localStorage", () => {
    localStorage.setItem("gera:theme", "light");
    render(<ThemeToggle />);
    expect(screen.getByTitle("Light")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Dark")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTitle("Auto")).toHaveAttribute("aria-pressed", "false");
  });

  it("restores dark mode from localStorage", () => {
    localStorage.setItem("gera:theme", "dark");
    render(<ThemeToggle />);
    expect(screen.getByTitle("Dark")).toHaveAttribute("aria-pressed", "true");
  });

  it("sets data-theme on <html> on mount (system = light when prefers-color-scheme not dark)", async () => {
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
  });

  it("clicking Light sets data-theme to light and persists", async () => {
    localStorage.setItem("gera:theme", "dark");
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTitle("Light"));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
    expect(localStorage.getItem("gera:theme")).toBe("light");
  });

  it("clicking Dark sets data-theme to dark and persists", async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTitle("Dark"));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    expect(localStorage.getItem("gera:theme")).toBe("dark");
  });

  it("clicking Auto persists system to localStorage", async () => {
    localStorage.setItem("gera:theme", "dark");
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTitle("Auto"));
    await waitFor(() => {
      expect(localStorage.getItem("gera:theme")).toBe("system");
    });
  });
});

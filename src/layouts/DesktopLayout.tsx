import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "../stores/useAppStore";
import { Sidebar } from "../components/layout/Sidebar";
import { Inspector } from "../components/layout/Inspector";
import { TasksView } from "../components/tasks/TasksView";
import { CalendarView } from "../components/calendar/CalendarView";
import { NotesView } from "../components/notes/NotesView";
import { CommandPalette } from "../components/command-palette/CommandPalette";
import { SettingsModal } from "../components/settings/SettingsModal";

function DesktopShell() {
  const location = useLocation();
  const currentPath = location.pathname.split("/")[1] || "tasks";
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const isCalendar = currentPath === "calendar";

  return (
    <>
      <div className={`app-container${isCalendar ? "" : " no-inspector"}`}>
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks" element={<TasksView />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/notes" element={<NotesView />} />
          </Routes>
        </main>
        <Inspector isVisible={isCalendar} />
      </div>
      <CommandPalette />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

export function DesktopLayout() {
  const loading = useAppStore((s) => s.loading);

  if (loading) {
    return (
      <div className="app-container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-tertiary)", fontSize: 16 }}>Loading workspace…</div>
      </div>
    );
  }

  return <DesktopShell />;
}

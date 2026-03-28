import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../stores/useAppStore";
import { TasksView } from "../components/tasks/TasksView";
import { CalendarView } from "../components/calendar/CalendarView";
import { NotesView } from "../components/notes/NotesView";
import { SettingsModal } from "../components/settings/SettingsModal";
import { InboxIcon, CalendarIcon, DocumentIcon, CogIcon } from "../components/icons/Icons";

function MobileTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.split("/")[1] || "tasks";
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  const tabs = [
    { id: "tasks",    label: "Tasks",    icon: <InboxIcon />,    path: "/tasks" },
    { id: "notes",    label: "Notes",    icon: <DocumentIcon />, path: "/notes" },
    { id: "calendar", label: "Calendar", icon: <CalendarIcon />, path: "/calendar" },
  ] as const;

  return (
    <nav className="mobile-tab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`mobile-tab${currentPath === tab.id ? " mobile-tab--active" : ""}`}
          onClick={() => navigate(tab.path)}
        >
          <span className="mobile-tab__icon">{tab.icon}</span>
          <span className="mobile-tab__label">{tab.label}</span>
        </button>
      ))}
      <button
        className="mobile-tab"
        onClick={() => setSettingsOpen(true)}
      >
        <span className="mobile-tab__icon"><CogIcon /></span>
        <span className="mobile-tab__label">Settings</span>
      </button>
    </nav>
  );
}

function MobileShell() {
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <div className="mobile-container">
      <main className="mobile-content">
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={<TasksView />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/notes" element={<NotesView />} />
        </Routes>
      </main>
      <MobileTabBar />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export function MobileLayout() {
  const loading = useAppStore((s) => s.loading);

  if (loading) {
    return (
      <div className="mobile-container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-tertiary)", fontSize: 16 }}>Loading workspace…</div>
      </div>
    );
  }

  return <MobileShell />;
}

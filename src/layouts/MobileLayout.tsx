import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../stores/useAppStore";
import { MobileTasksView } from "../components/mobile/MobileTasksView";
import { MobileCalendarView } from "../components/mobile/MobileCalendarView";
import { MobileNotesView } from "../components/mobile/MobileNotesView";
import { MobileSettingsView } from "../components/mobile/MobileSettingsView";
import { InboxIcon, CalendarIcon, DocumentIcon, CogIcon } from "../components/icons/Icons";
import '../styles/mobile.css';

function MobileTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname.split("/")[1] || "tasks";

  const tabs = [
    { id: "tasks",    label: "Tasks",    icon: <InboxIcon />,    path: "/tasks" },
    { id: "notes",    label: "Notes",    icon: <DocumentIcon />, path: "/notes" },
    { id: "calendar", label: "Calendar", icon: <CalendarIcon />, path: "/calendar" },
    { id: "settings", label: "Settings", icon: <CogIcon />,      path: "/settings" },
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
    </nav>
  );
}

function MobileShell() {
  return (
    <div className="mobile-container">
      <main className="mobile-content">
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={<MobileTasksView />} />
          <Route path="/calendar" element={<MobileCalendarView />} />
          <Route path="/notes" element={<MobileNotesView />} />
          <Route path="/settings" element={<MobileSettingsView />} />
        </Routes>
      </main>
      <MobileTabBar />
    </div>
  );
}

export function MobileLayout() {
  const loading = useAppStore((s) => s.loading);

  useEffect(() => {
    document.documentElement.setAttribute('data-mobile', 'true');
    return () => document.documentElement.removeAttribute('data-mobile');
  }, []);

  if (loading) {
    return (
      <div className="mobile-container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-tertiary)", fontSize: 16 }}>Loading workspace…</div>
      </div>
    );
  }

  return <MobileShell />;
}

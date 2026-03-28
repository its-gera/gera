import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../stores/useAppStore';
import { useCalendarStore } from '../../stores/useCalendarStore';
import { searchNotes, searchTasks, NoteEntity, TaskEntity } from '../../api';
import { cleanTaskDisplay } from '../../utils/taskFormatting';
import { formatEventDate } from '../../utils/dateFormatting';
import './CommandPalette.css';

interface PaletteItem {
  id: string;
  label: string;
  meta?: string;
  shortcut?: string;
  section: string;
  action: () => void;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setPendingCreate = useAppStore((s) => s.setPendingCreate);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const setSelectedEvent = useAppStore((s) => s.setSelectedEvent);
  const setPendingFocusTask = useAppStore((s) => s.setPendingFocusTask);
  const events = useAppStore((s) => s.events);
  const notes = useAppStore((s) => s.notes);
  const tasks = useAppStore((s) => s.tasks);
  const setCurrentPeriodStart = useCalendarStore((s) => s.setCurrentPeriodStart);
  const setCalendarView = useCalendarStore((s) => s.setCalendarView);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [ftsNotes, setFtsNotes] = useState<NoteEntity[]>([]);
  const [ftsTasks, setFtsTasks] = useState<TaskEntity[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setCommandPaletteOpen(false);
    setQuery('');
    setActiveIndex(0);
    setFtsNotes([]);
    setFtsTasks([]);
  };

  // Focus input on open, clear state on close
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setActiveIndex(0);
      setFtsNotes([]);
      setFtsTasks([]);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commandPaletteOpen]);

  // Debounced FTS for query >= 3 chars
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setFtsNotes([]);
      setFtsTasks([]);
      return;
    }
    const timer = setTimeout(async () => {
      const [n, t] = await Promise.all([searchNotes(q), searchTasks(q)]);
      setFtsNotes(n);
      setFtsTasks(t);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const staticItems: PaletteItem[] = useMemo(() => [
    { id: 'nav-tasks',    label: 'Go to Tasks',    section: 'Navigate', shortcut: '⌘1', action: () => { navigate('/tasks');    close(); } },
    { id: 'nav-notes',    label: 'Go to Notes',    section: 'Navigate', shortcut: '⌘2', action: () => { navigate('/notes');    close(); } },
    { id: 'nav-calendar', label: 'Go to Calendar', section: 'Navigate', shortcut: '⌘3', action: () => { navigate('/calendar'); close(); } },
    { id: 'create-task',  label: 'New Task',        section: 'Create',   action: () => { navigate('/tasks');    setPendingCreate('task');  close(); } },
    { id: 'create-note',  label: 'New Note',        section: 'Create',   action: () => { navigate('/notes');    setPendingCreate('note');  close(); } },
    { id: 'create-event', label: 'New Event',       section: 'Create',   action: () => { navigate('/calendar'); setPendingCreate('event'); close(); } },
    { id: 'settings',     label: 'Open Settings',   section: 'System',   shortcut: '⌘,', action: () => { setSettingsOpen(true); close(); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [navigate, setSettingsOpen, setPendingCreate]);

  const filteredStatic = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staticItems;
    return staticItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.section.toLowerCase().includes(q)
    );
  }, [staticItems, query]);

  // Entity search results — shown only when there is a query
  const entityItems: PaletteItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const items: PaletteItem[] = [];

    // Tasks: prefer FTS results if available, otherwise filter store
    const taskSource = ftsTasks.length > 0 ? ftsTasks
      : tasks.filter((t) => cleanTaskDisplay(t).toLowerCase().includes(q));
    taskSource.slice(0, 5).forEach((t) => {
      const display = cleanTaskDisplay(t);
      const source = t.source_file === 'tasks.md' ? 'Standalone'
        : t.source_file.replace(/^notes\//, '').replace(/\.md$/, '');
      items.push({
        id: `task-${t.source_file}-${t.line_number}`,
        label: display,
        meta: source,
        section: 'Tasks',
        action: () => {
          navigate('/tasks');
          setPendingFocusTask({ source_file: t.source_file, line_number: t.line_number });
          close();
        },
      });
    });

    // Notes: prefer FTS results, otherwise filter by title
    const noteSource = ftsNotes.length > 0 ? ftsNotes
      : notes.filter((n) => (n.title || n.filename).toLowerCase().includes(q));
    noteSource.slice(0, 5).forEach((n) => {
      items.push({
        id: `note-${n.filename}`,
        label: n.title || n.filename.replace(/\.md$/, ''),
        meta: n.body_preview ? n.body_preview.slice(0, 72) : undefined,
        section: 'Notes',
        action: () => { setSelectedNote(n); navigate('/notes'); close(); },
      });
    });

    // Events: always from store (all loaded in memory)
    events
      .filter((e) => e.name.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((e) => {
        items.push({
          id: `event-${e.id}`,
          label: e.name,
          meta: formatEventDate(e.from_),
          section: 'Events',
          action: () => {
            setCurrentPeriodStart(new Date(e.from_));
            setCalendarView('day');
            setSelectedEvent(e);
            navigate('/calendar');
            close();
          },
        });
      });

    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tasks, notes, events, ftsTasks, ftsNotes]);

  const allItems = useMemo(() => [...filteredStatic, ...entityItems], [filteredStatic, entityItems]);

  // Reset active index when results change
  useEffect(() => { setActiveIndex(0); }, [allItems.length]);

  // Group by section for rendering
  const sections = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of allItems) {
      if (!map.has(item.section)) map.set(item.section, []);
      map.get(item.section)!.push(item);
    }
    return map;
  }, [allItems]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape')    { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, allItems.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter')     { e.preventDefault(); allItems[activeIndex]?.action(); return; }
  };

  if (!commandPaletteOpen) return null;

  return createPortal(
    <div className="cp-backdrop" onClick={close}>
      <div className="cp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cp-input-row">
          <svg className="cp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="cp-input"
            placeholder="Search or run a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          <kbd className="cp-kbd">Esc</kbd>
        </div>

        <div className="cp-results">
          {allItems.length === 0 && (
            <div className="cp-empty">No results for "{query}"</div>
          )}
          {[...sections.entries()].map(([section, sectionItems]) => (
            <div key={section} className="cp-section">
              <div className="cp-section-label">{section}</div>
              {sectionItems.map((item) => {
                const globalIndex = allItems.indexOf(item);
                return (
                  <button
                    key={item.id}
                    className={`cp-item${globalIndex === activeIndex ? ' cp-item--active' : ''}`}
                    onClick={item.action}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                  >
                    <span className="cp-item-body">
                      <span className="cp-item-label">{item.label}</span>
                      {item.meta && <span className="cp-item-meta">{item.meta}</span>}
                    </span>
                    {item.shortcut && <kbd className="cp-shortcut">{item.shortcut}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

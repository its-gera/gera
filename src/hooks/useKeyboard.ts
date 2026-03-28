import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { useCalendarStore } from '../stores/useCalendarStore';
import { matchesKeys, getActiveKeys } from '../types/keybindings';

/** Compute column count of a CSS auto-fill grid by inspecting tile positions. */
function getGridColCount(tiles: HTMLElement[]): number {
  if (tiles.length < 2) return 1;
  const firstTop = tiles[0].getBoundingClientRect().top;
  return tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - firstTop) < 5).length;
}

/** Returns true when the event target is a focusable text input where
 *  single-key shortcuts should be suppressed. */
function isInTextInput(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  return false;
}

/** Registers all global keyboard shortcuts for the app.
 *  Must be called inside a component that is rendered within the Router. */
export function useKeyboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setPendingCreate = useAppStore((s) => s.setPendingCreate);
  const triggerSearchFocus = useAppStore((s) => s.triggerSearchFocus);
  const selectedNote = useAppStore((s) => s.selectedNote);
  const goToPrevious = useCalendarStore((s) => s.goToPrevious);
  const goToNext = useCalendarStore((s) => s.goToNext);
  const goToToday = useCalendarStore((s) => s.goToToday);
  const setCalendarView = useCalendarStore((s) => s.setCalendarView);

  useEffect(() => {
    const currentPath = location.pathname.split('/')[1] || 'tasks';

    const handler = (e: KeyboardEvent) => {
      // Open command palette (fires even inside text inputs)
      if (matchesKeys(e, getActiveKeys('openCommandPalette'))) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // Escape — close command palette if open
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
        return;
      }

      // All shortcuts are suppressed when any modal is open
      if (document.querySelector('.modal-backdrop')) return;

      // Navigation shortcuts fire even inside text inputs
      if (matchesKeys(e, getActiveKeys('goToTasks')))    { e.preventDefault(); navigate('/tasks');    return; }
      if (matchesKeys(e, getActiveKeys('goToNotes')))    { e.preventDefault(); navigate('/notes');    return; }
      if (matchesKeys(e, getActiveKeys('goToCalendar'))) { e.preventDefault(); navigate('/calendar'); return; }

      // All remaining shortcuts are suppressed when typing in an input
      if (isInTextInput(e.target)) return;

      // All shortcuts are suppressed while the onboarding tour is active
      if (document.querySelector('.driver-popover')) return;

      // ── Global: settings ──
      if (matchesKeys(e, getActiveKeys('openSettings'))) { e.preventDefault(); setSettingsOpen(true); return; }
      if (matchesKeys(e, getActiveKeys('focusSearch')))  { e.preventDefault(); triggerSearchFocus(); return; }
      if (e.key === '/') { e.preventDefault(); triggerSearchFocus(); return; }

      // ── N: context-sensitive create ──
      if (e.key === 'n' || e.key === 'N') {
        if (currentPath === 'tasks')    { setPendingCreate('task');  return; }
        if (currentPath === 'notes')    { setPendingCreate('note');  return; }
        if (currentPath === 'calendar') { setPendingCreate('event'); return; }
      }

      // ── Calendar shortcuts (only on /calendar) ──
      if (currentPath === 'calendar') {
        if (e.key === 'ArrowLeft')  { e.preventDefault(); goToPrevious(); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); goToNext();     return; }
        if (e.key === 't' || e.key === 'T') { goToToday(); return; }
        if (e.key === '1') { setCalendarView('day');   return; }
        if (e.key === '3') { setCalendarView('3day');  return; }
        if (e.key === '7') { setCalendarView('week');  return; }
      }

      // ── Tasks shortcuts (only on /tasks) ──
      if (currentPath === 'tasks') {
        const items = Array.from(document.querySelectorAll<HTMLElement>('.task-item[tabindex]'));
        if (items.length === 0) return;
        const focused = document.activeElement as HTMLElement;
        const idx = items.indexOf(focused);

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          (items[idx + 1] ?? items[0]).focus();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          (items[idx - 1] ?? items[items.length - 1]).focus();
          return;
        }
      }

      // ── Notes grid shortcuts (only on /notes, only when editor is closed) ──
      if (currentPath === 'notes' && !selectedNote) {
        const tiles = Array.from(document.querySelectorAll<HTMLElement>('.note-tile[tabindex]'));
        if (tiles.length === 0) return;
        const focused = document.activeElement as HTMLElement;
        const idx = tiles.indexOf(focused);

        if (e.key === 'ArrowRight') {
          e.preventDefault();
          (tiles[idx + 1] ?? tiles[0]).focus();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          (tiles[Math.max(idx - 1, 0)] ?? tiles[tiles.length - 1]).focus();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const cols = getGridColCount(tiles);
          (tiles[idx + cols] ?? tiles[idx]).focus();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const cols = getGridColCount(tiles);
          (tiles[idx - cols] ?? tiles[idx]).focus();
          return;
        }
        // Focus first tile if none focused and an arrow key was pressed
        if (['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(e.key) && idx === -1) {
          e.preventDefault();
          tiles[0].focus();
          return;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [
    navigate,
    location.pathname,
    commandPaletteOpen,
    setCommandPaletteOpen,
    setSettingsOpen,
    setPendingCreate,
    triggerSearchFocus,
    selectedNote,
    goToPrevious,
    goToNext,
    goToToday,
    setCalendarView,
  ]);
}

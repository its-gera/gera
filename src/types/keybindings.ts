export type Scope = 'global' | 'tasks' | 'calendar' | 'notes';

export interface KeyBinding {
  action: string;
  label: string;
  /** Display string shown in UI, e.g. "⌘K" or "⌘1" */
  keys: string;
  scope: Scope;
  configurable?: boolean;
}

const STORAGE_KEY = 'keybinding-overrides';

// ── Storage adapter (injectable for testing) ───────────────────────────────

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let _storage: StorageAdapter = localStorage;

export function setStorageAdapter(s: StorageAdapter): void {
  _storage = s;
}

export const ALL_BINDINGS: KeyBinding[] = [
  // ── Configurable global shortcuts ──────────────────────────────────────
  { action: 'openCommandPalette', label: 'Open command palette', keys: '⌘K',  scope: 'global',   configurable: true },
  { action: 'goToTasks',          label: 'Go to Tasks',          keys: '⌘1',  scope: 'global',   configurable: true },
  { action: 'goToNotes',          label: 'Go to Notes',          keys: '⌘2',  scope: 'global',   configurable: true },
  { action: 'goToCalendar',       label: 'Go to Calendar',       keys: '⌘3',  scope: 'global',   configurable: true },
  { action: 'openSettings',       label: 'Open Settings',        keys: '⌘,',  scope: 'global',   configurable: true },
  { action: 'focusSearch',        label: 'Focus search',         keys: '⌘F',  scope: 'global',   configurable: true },
  // ── Non-configurable context shortcuts ─────────────────────────────────
  { action: 'createInContext',    label: 'Create new item',      keys: 'N',     scope: 'global'   },
  { action: 'taskPrev',           label: 'Previous task',        keys: '↑',     scope: 'tasks'    },
  { action: 'taskNext',           label: 'Next task',            keys: '↓',     scope: 'tasks'    },
  { action: 'taskToggle',         label: 'Toggle task done',     keys: 'Space', scope: 'tasks'    },
  { action: 'calPrev',            label: 'Previous period',      keys: '←',     scope: 'calendar' },
  { action: 'calNext',            label: 'Next period',          keys: '→',     scope: 'calendar' },
  { action: 'calToday',           label: 'Go to today',          keys: 'T',     scope: 'calendar' },
  { action: 'calDayView',         label: 'Day view',             keys: '1',     scope: 'calendar' },
  { action: 'cal3DayView',        label: '3-day view',           keys: '3',     scope: 'calendar' },
  { action: 'calWeekView',        label: 'Week view',            keys: '7',     scope: 'calendar' },
  { action: 'toggleEditorMode',   label: 'Toggle Rich/Plain mode', keys: '⌘\\', scope: 'notes'    },
];

// ── Persistence ────────────────────────────────────────────────────────────

function loadOverrides(): Record<string, string> {
  try {
    return JSON.parse(_storage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveOverride(action: string, keys: string): void {
  const overrides = loadOverrides();
  overrides[action] = keys;
  _storage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetAllOverrides(): void {
  _storage.removeItem(STORAGE_KEY);
}

// ── Lookup ─────────────────────────────────────────────────────────────────

/** Return the active key string for an action (override > default). */
export function getActiveKeys(action: string): string {
  const overrides = loadOverrides();
  return overrides[action] ?? ALL_BINDINGS.find((b) => b.action === action)?.keys ?? '';
}

/** Return all bindings with overrides applied. */
export function getMergedBindings(): KeyBinding[] {
  const overrides = loadOverrides();
  return ALL_BINDINGS.map((b) =>
    b.configurable && overrides[b.action] ? { ...b, keys: overrides[b.action] } : b
  );
}

// ── Key matching ───────────────────────────────────────────────────────────

interface ParsedKey {
  meta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parseKeys(keys: string): ParsedKey {
  return {
    meta:  keys.includes('⌘'),
    shift: keys.includes('⇧'),
    alt:   keys.includes('⌥'),
    key:   keys.replace(/[⌘⇧⌥]/g, ''),
  };
}

/** Test whether a KeyboardEvent matches a display key string like "⌘K". */
export function matchesKeys(e: KeyboardEvent, keys: string): boolean {
  const p = parseKeys(keys);
  const meta = e.metaKey || e.ctrlKey;
  if (p.meta  !== meta)        return false;
  if (p.shift !== e.shiftKey)  return false;
  if (p.alt   !== e.altKey)    return false;
  return e.key.toLowerCase() === p.key.toLowerCase();
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);

/**
 * Convert an internal key string (always using Mac symbols) to a
 * platform-appropriate display string.
 *   Mac:          "⌘⇧K"  →  "⌘⇧K"
 *   Windows/Linux: "⌘⇧K"  →  "Ctrl+Shift+K"
 */
export function formatKeysForDisplay(keys: string): string {
  if (isMac) return keys;
  return keys
    .replace(/⌘/g, 'Ctrl+')
    .replace(/⇧/g, 'Shift+')
    .replace(/⌥/g, 'Alt+');
}

/** Convert a KeyboardEvent to a display key string like "⌘⇧K". */
export function formatKeyEvent(e: KeyboardEvent): string {
  let s = '';
  if (e.metaKey || e.ctrlKey) s += '⌘';
  if (e.shiftKey)              s += '⇧';
  if (e.altKey)                s += '⌥';
  s += e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return s;
}

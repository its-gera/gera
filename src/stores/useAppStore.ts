import { create } from 'zustand';
import { EventEntity, NoteEntity, TaskEntity } from '../api';

export interface AppStore {
  // Navigation
  activeView: 'tasks' | 'calendar' | 'notes';
  setActiveView: (view: 'tasks' | 'calendar' | 'notes') => void;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Settings modal (lifted so shortcuts can open it from anywhere)
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  // Pending create action — set by command palette, consumed by view components
  pendingCreate: 'task' | 'note' | 'event' | null;
  setPendingCreate: (action: 'task' | 'note' | 'event' | null) => void;

  // Data
  events: EventEntity[];
  notes: NoteEntity[];
  tasks: TaskEntity[];
  loading: boolean;
  setEvents: (events: EventEntity[]) => void;
  setNotes: (notes: NoteEntity[]) => void;
  setTasks: (tasks: TaskEntity[]) => void;
  setLoading: (loading: boolean) => void;
  
  // Selections
  selectedEvent: EventEntity | null;
  selectedNote: NoteEntity | null;
  setSelectedEvent: (event: EventEntity | null) => void;
  setSelectedNote: (note: NoteEntity | null) => void;
  
  // Search filters
  tasksSearch: string;
  notesSearch: string;
  setTasksSearch: (search: string) => void;
  setNotesSearch: (search: string) => void;

  // Focus a specific task after navigation
  pendingFocusTask: { source_file: string; line_number: number } | null;
  setPendingFocusTask: (task: { source_file: string; line_number: number } | null) => void;

  // Focus search bar in current view
  searchFocusTrigger: number;
  triggerSearchFocus: () => void;

  // Cross-reference navigation
  focusLine: number | null;
  setFocusLine: (line: number | null) => void;

  // Return-to navigation (e.g. open note from calendar, return on close)
  returnView: string | null;
  setReturnView: (view: string | null) => void;

  // Temporarily highlight an event block in the calendar
  highlightEventId: string | null;
  setHighlightEventId: (id: string | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Navigation
  activeView: 'calendar',
  setActiveView: (view) => set({ activeView: view }),

  // Command palette
  commandPaletteOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

  // Settings modal
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  // Pending create
  pendingCreate: null,
  setPendingCreate: (pendingCreate) => set({ pendingCreate }),

  // Data
  events: [],
  notes: [],
  tasks: [],
  loading: true,
  setEvents: (events) => set({ events }),
  setNotes: (notes) => set({ notes }),
  setTasks: (tasks) => set({ tasks }),
  setLoading: (loading) => set({ loading }),
  
  // Selections
  selectedEvent: null,
  selectedNote: null,
  setSelectedEvent: (selectedEvent) => set({ selectedEvent }),
  setSelectedNote: (selectedNote) => set({ selectedNote }),
  
  // Search filters
  tasksSearch: '',
  notesSearch: '',
  setTasksSearch: (tasksSearch) => set({ tasksSearch }),
  setNotesSearch: (notesSearch) => set({ notesSearch }),

  // Focus a specific task after navigation
  pendingFocusTask: null,
  setPendingFocusTask: (pendingFocusTask) => set({ pendingFocusTask }),

  // Focus search bar
  searchFocusTrigger: 0,
  triggerSearchFocus: () => set((s) => ({ searchFocusTrigger: s.searchFocusTrigger + 1 })),

  // Cross-reference navigation
  focusLine: null,
  setFocusLine: (focusLine) => set({ focusLine }),

  // Return-to navigation
  returnView: null,
  setReturnView: (returnView) => set({ returnView }),

  // Temporarily highlight an event block in the calendar
  highlightEventId: null,
  setHighlightEventId: (highlightEventId) => set({ highlightEventId }),
}));

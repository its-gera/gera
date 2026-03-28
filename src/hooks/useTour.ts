import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { driver, DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../components/tour/TourStyles.css';
import {
  createTask, deleteTask,
  createNote, deleteNote,
  createEvent, deleteEvent,
} from '../api';
import type { TaskEntity, NoteEntity, EventEntity } from '../api';
import { useAppStore } from '../stores/useAppStore';
import { useCalendarStore } from '../stores/useCalendarStore';

const TOUR_KEY = 'gera:tour-done';

// ── Example data ─────────────────────────────────────────────────────────────

interface TourData {
  task:  TaskEntity  | null;  // non-null only when we created it
  note:  NoteEntity  | null;
  event: EventEntity | null;
}

async function setupTourData(
  tasks:  TaskEntity[],
  notes:  NoteEntity[],
  events: EventEntity[],
): Promise<TourData> {
  const tourData: TourData = { task: null, note: null, event: null };

  if (tasks.length === 0) {
    try {
      tourData.task = await createTask('Prepare weekly standup notes');
    } catch (e) { console.warn('Tour: failed to create example task', e); }
  }

  if (notes.length === 0) {
    try {
      tourData.note = await createNote(
        '_tour_example.md',
        '# Welcome to Gera\n\nNotes support full **Markdown** formatting.\n\n' +
        '- [ ] Try creating a task from a note\n' +
        '- [ ] Link this note to a calendar event\n',
      );
    } catch (e) { console.warn('Tour: failed to create example note', e); }
  }

  if (events.length === 0) {
    try {
      const d    = new Date();
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0, 0);
      const to   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 11, 0, 0);
      tourData.event = await createEvent({
        id:          `_tour_example_${Date.now()}`,
        name:        'Team Standup',
        from_:       from.toISOString(),
        to:          to.toISOString(),
        description: 'Weekly team sync',
      });
    } catch (e) { console.warn('Tour: failed to create example event', e); }
  }

  return tourData;
}

async function cleanupTourData(tourData: TourData): Promise<void> {
  if (tourData.task)
    await deleteTask(tourData.task.source_file, tourData.task.line_number).catch(console.warn);
  if (tourData.note)
    await deleteNote(tourData.note.filename).catch(console.warn);
  if (tourData.event)
    await deleteEvent(tourData.event.id).catch(console.warn);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function exists(selector: string): boolean {
  const el = document.querySelector(selector);
  if (!el) return false;
  const { width, height } = (el as HTMLElement).getBoundingClientRect();
  return width > 0 && height > 0;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTour() {
  const navigate          = useNavigate();
  const setCurrentPeriod  = useCalendarStore.getState().setCurrentPeriodStart;

  const startTour = useCallback(async () => {
    const { tasks, notes, events, setSelectedNote, setSelectedEvent } = useAppStore.getState();

    // Set up example data for empty workspaces
    const tourData = await setupTourData(tasks, notes, events);

    // Refresh store state after potential creates
    const fresh = useAppStore.getState();
    const tourNote  = tourData.note  ?? fresh.notes[0]  ?? null;
    const tourEvent = tourData.event ?? fresh.events[0] ?? null;

    // Make sure we start on the tasks view
    navigate('/tasks');

    let driverObj: ReturnType<typeof driver> | undefined;
    const getDriver = () => driverObj!;

    driverObj = driver({
      showProgress:   true,
      animate:        true,
      overlayOpacity: 0.35,
      popoverClass:   'gera-tour',
      nextBtnText:    'Next →',
      prevBtnText:    '← Back',
      doneBtnText:    'Done',
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_KEY, '1');
        setSelectedNote(null);
        setSelectedEvent(null);
        cleanupTourData(tourData).catch(console.warn);
        driverObj!.destroy();
      },
      steps: buildSteps({ navigate, getDriver, setCurrentPeriod, tourNote, tourEvent }),
    });

    // Small delay so the tasks view has rendered before we start
    setTimeout(() => driverObj!.drive(), 100);
  }, [navigate, setCurrentPeriod]);

  return { startTour };
}

export function isTourDone(): boolean {
  return !!localStorage.getItem(TOUR_KEY);
}

export function resetTour(): void {
  localStorage.removeItem(TOUR_KEY);
}

// ── Step builder ──────────────────────────────────────────────────────────────

interface StepContext {
  navigate:          ReturnType<typeof useNavigate>;
  getDriver:         () => ReturnType<typeof driver>;
  setCurrentPeriod:  (d: Date) => void;
  tourNote:          NoteEntity  | null;
  tourEvent:         EventEntity | null;
}

function buildSteps(ctx: StepContext): DriveStep[] {
  const { navigate, getDriver, setCurrentPeriod, tourNote, tourEvent } = ctx;
  const { setSelectedNote, setSelectedEvent } = useAppStore.getState();

  function goForward(path: string) {
    navigate(path);
    setTimeout(() => getDriver().moveNext(), 200);
  }

  function goBackward(path: string) {
    navigate(path);
    setTimeout(() => getDriver().movePrevious(), 200);
  }

  function goToStep(path: string, index: number) {
    navigate(path);
    setTimeout(() => getDriver().moveTo(index), 200);
  }

  // Step indices — must stay in sync with the array below
  const IDX = {
    taskItem:     4,
    eventTag:     5,  // optional
    notesGrid:    6,
    noteTile:     7,
    noteEditor:   8,
    calendarPane: 9,
    eventBlock:   10, // optional
    rightColumn:  11,
  } as const;

  /** Open the note editor for the tour note. */
  function openTourNote() {
    if (tourNote) setSelectedNote(tourNote);
  }

  /** Close the note editor. */
  function closeTourNote() {
    setSelectedNote(null);
  }

  /** Select the tour event and scroll calendar to its date. */
  function selectTourEvent() {
    if (!tourEvent) return;
    setCurrentPeriod(new Date(tourEvent.from_));
    setSelectedEvent(tourEvent);
  }

  return [
    // ── Act 1: Tasks ─────────────────────────────────────────────────────
    {
      element: '.left-column',
      popover: {
        title: 'Welcome to Gera',
        description: 'Your workspace for tasks, notes, and calendar — all linked together. This quick tour takes about a minute.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '.sidebar-block:nth-child(2)',
      popover: {
        title: 'Navigate',
        description: 'Switch between Tasks, Notes, and Calendar here. Keyboard shortcuts ⌘1, ⌘2, ⌘3 also work from anywhere.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '.tasks-search',
      popover: {
        title: 'Search',
        description: 'Filter tasks by name, event, or project. Press / or ⌘F to focus the search bar without reaching for the mouse.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '.icon-btn--accent',
      popover: {
        title: 'Create a task',
        description: 'Add a standalone task here, or press N while on this view. Tasks can also be written as checkboxes inside any note.',
        side: 'left',
        align: 'center',
      },
    },
    {
      // IDX.taskItem = 4
      element: '.task-item',
      popover: {
        title: 'Task item',
        description: 'Click a task to edit it, set a due date, or link it to a calendar event. Press Space to toggle it done when focused.',
        side: 'bottom',
        align: 'start',
        onNextClick: () => {
          if (exists('.task-tag--event')) {
            getDriver().moveNext();
          } else {
            goToStep('/notes', IDX.notesGrid);
          }
        },
      },
    },
    {
      // IDX.eventTag = 5 — only shown when a task has an event tag
      element: '.task-tag--event',
      popover: {
        title: 'Event tags',
        description: "Tasks tagged @event-name are linked to a calendar event. You'll see them together in the Context Inspector on the Calendar view.",
        side: 'bottom',
        align: 'start',
        onNextClick: () => goForward('/notes'),
        onPrevClick: () => getDriver().movePrevious(),
      },
    },

    // ── Act 2: Notes ─────────────────────────────────────────────────────
    {
      // IDX.notesGrid = 6
      element: '.notes-grid',
      popover: {
        title: 'Notes',
        description: 'Notes are plain Markdown files on disk. Each tile shows the title and a content preview.',
        side: 'bottom',
        align: 'start',
        onPrevClick: () => {
          if (exists('.task-tag--event')) {
            goBackward('/tasks');
          } else {
            goToStep('/tasks', IDX.taskItem);
          }
        },
      },
    },
    {
      // IDX.noteTile = 7
      element: '.note-tile',
      popover: {
        title: 'Open a note',
        description: 'Click a tile to open the Markdown editor. Type @event-name inside a note to link it to a calendar event. Any `- [ ] item` line becomes a task automatically.',
        side: 'bottom',
        align: 'start',
        onNextClick: () => {
          openTourNote();
          setTimeout(() => getDriver().moveNext(), 300);
        },
        // onPrevClick default — stays on notes view
      },
    },
    {
      // IDX.noteEditor = 8
      element: '.note-editor',
      popover: {
        title: 'Markdown editor',
        description: 'Full Markdown with a toolbar. Any checklist line (`- [ ] …`) is automatically synced to your Tasks view.',
        side: 'right',
        align: 'start',
        onNextClick: () => {
          closeTourNote();
          navigate('/calendar');
          setTimeout(() => {
            selectTourEvent();
            getDriver().moveNext();
          }, 300);
        },
        onPrevClick: () => {
          closeTourNote();
          setTimeout(() => getDriver().movePrevious(), 200);
        },
      },
    },

    // ── Act 3: Calendar ──────────────────────────────────────────────────
    {
      // IDX.calendarPane = 9
      element: '.calendar-pane',
      popover: {
        title: 'Calendar',
        description: 'View events by day, 3-day, or week. Use ← → to move between periods, T to jump to today.',
        side: 'bottom',
        align: 'start',
        onPrevClick: () => {
          setSelectedEvent(null);
          navigate('/notes');
          setTimeout(() => {
            openTourNote();
            getDriver().movePrevious(); // → IDX.noteEditor
          }, 300);
        },
      },
    },
    {
      // IDX.eventBlock = 10
      element: '.event-block',
      popover: {
        title: 'Events',
        description: 'This is the event the tour just focused. The Context Inspector on the right shows its linked notes and tasks.',
        side: 'left',
        align: 'center',
        onNextClick: () => {
          if (exists('.event-block')) {
            getDriver().moveNext();
          } else {
            getDriver().moveTo(IDX.rightColumn);
          }
        },
        onPrevClick: () => {
          if (exists('.event-block')) {
            getDriver().movePrevious();
          } else {
            getDriver().moveTo(IDX.calendarPane);
          }
        },
      },
    },
    {
      // IDX.rightColumn = 11
      element: '.right-column',
      popover: {
        title: 'Context Inspector',
        description: 'See event details, linked notes, and linked tasks here. Link items by typing @event-name inside any note or task.',
        side: 'left',
        align: 'start',
        onPrevClick: () => {
          if (exists('.event-block')) {
            getDriver().movePrevious();
          } else {
            getDriver().moveTo(IDX.calendarPane);
          }
        },
      },
    },
    {
      element: '.sidebar-settings-btn',
      popover: {
        title: 'Settings',
        description: 'Connect Google Calendar, switch light/dark theme, and customise keyboard shortcuts.',
        side: 'right',
        align: 'end',
      },
    },

    // ── Finale ───────────────────────────────────────────────────────────
    {
      popover: {
        title: "You're all set",
        description: "Press ⌘K at any time to open the command palette — it's the fastest way to navigate, search, and create anything.",
        align: 'center',
      },
    },
  ];
}

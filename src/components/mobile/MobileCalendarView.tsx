import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { EventEntity, NoteEntity, TaskEntity, createNote } from '../../api';
import { MobilePageHeader } from './MobilePageHeader';
import { MobileInspectorCard } from './MobileInspectorCard';
import { EventCreateModal } from '../calendar/EventCreateModal';
import { EventEditModal } from '../calendar/EventEditModal';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons/Icons';

// ─── Date helpers ──────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function firstWeekdayOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), 1).getDay();
}

function formatMonthHeading(d: Date): string {
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function formatDayDetailHeader(d: Date): string {
  return d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const SWIPE_THRESHOLD = 50; // px needed to trigger expand/collapse

// ─── Component ─────────────────────────────────────────────────────────────────

export function MobileCalendarView() {
  const events = useAppStore((s) => s.events);
  const tasks = useAppStore((s) => s.tasks);
  const notes = useAppStore((s) => s.notes);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const setSelectedEvent = useAppStore((s) => s.setSelectedEvent);

  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(today));
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editEvent, setEditEvent] = useState<EventEntity | null>(null);

  // Touch gesture tracking — attached to the top calendar area
  const touchStartY = useRef(0);
  const gestureRef = useRef<HTMLDivElement>(null);

  // Sync currentMonth when expanding
  useEffect(() => {
    if (monthExpanded) setCurrentMonth(startOfMonth(selectedDate));
  }, [monthExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gesture handlers ────────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (!monthExpanded && dy > SWIPE_THRESHOLD) {
      setMonthExpanded(true);
    } else if (monthExpanded && dy < -SWIPE_THRESHOLD) {
      setMonthExpanded(false);
    }
  }

  // Also allow pull-down from the day-detail scroll area when at the top
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTouchStartY = useRef(0);
  const scrollTouchStartTop = useRef(0);

  function onScrollTouchStart(e: React.TouchEvent) {
    scrollTouchStartY.current = e.touches[0].clientY;
    scrollTouchStartTop.current = scrollRef.current?.scrollTop ?? 0;
  }

  function onScrollTouchEnd(e: React.TouchEvent) {
    const dy = e.changedTouches[0].clientY - scrollTouchStartY.current;
    const wasAtTop = scrollTouchStartTop.current <= 0;
    if (!monthExpanded && wasAtTop && dy > SWIPE_THRESHOLD) {
      setMonthExpanded(true);
    } else if (monthExpanded && dy < -SWIPE_THRESHOLD) {
      setMonthExpanded(false);
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────────
  const eventDates = new Set(
    events.map((e) => {
      const d = new Date(e.from_);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );

  function hasEvents(date: Date): boolean {
    return eventDates.has(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
  }

  const dayEvents = events.filter((e) => isSameDay(new Date(e.from_), selectedDate));

  function getLinkedTasks(event: EventEntity): TaskEntity[] {
    return tasks.filter((t) => t.event_ids?.includes(event.id));
  }
  function getLinkedNotes(event: EventEntity): NoteEntity[] {
    return notes.filter((n) => n.event_ids?.includes(event.id));
  }

  // Week strip
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Month grid
  const firstWeekday = firstWeekdayOfMonth(currentMonth);
  const totalDays = daysInMonth(currentMonth);
  const cells: Array<Date | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) =>
      new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1)
    ),
  ];

  function selectDate(date: Date) {
    setSelectedDate(date);
    if (monthExpanded) setCurrentMonth(startOfMonth(date));
  }

  function navigatePrev() {
    if (monthExpanded) setCurrentMonth((m) => addMonths(m, -1));
    else setSelectedDate((d) => addDays(d, -7));
  }

  function navigateNext() {
    if (monthExpanded) setCurrentMonth((m) => addMonths(m, 1));
    else setSelectedDate((d) => addDays(d, 7));
  }

  const handleNewNote = useCallback(async (event: EventEntity) => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const note = await createNote(`note-${ts}`, '', [event.id]);
      setSelectedNote(note);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  }, [setSelectedNote]);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <MobilePageHeader
        label={monthExpanded ? formatMonthHeading(currentMonth) : 'CALENDAR'}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, background: 'var(--surface-secondary)', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              onClick={() => { setSelectedDate(today); setCurrentMonth(startOfMonth(today)); }}
            >
              Today
            </button>
            <button className="mobile-back-btn" onClick={navigatePrev} aria-label="Previous">
              <ChevronLeftIcon />
            </button>
            <button className="mobile-back-btn" onClick={navigateNext} aria-label="Next">
              <ChevronRightIcon />
            </button>
          </div>
        }
      />

      {/*
        Gesture area: the week strip and month grid animate between each other.
        Drag down → expand month. Drag up → collapse to week.
        The grid-template-rows trick animates height from 0 → auto smoothly.
      */}
      <div
        ref={gestureRef}
        className="mobile-cal-gesture-area"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* ── Month grid (visible only when expanded) ── */}
        <div className={`mobile-cal-panel ${monthExpanded ? 'mobile-cal-panel--open' : ''}`}>
          <div className="mobile-cal-panel__inner">
            <div className="mobile-cal-grid mobile-cal-grid--header">
              {WEEKDAY_LABELS.map((l) => (
                <div key={l} className="mobile-cal-weekday-label">{l}</div>
              ))}
            </div>
            <div className="mobile-cal-grid">
              {cells.map((date, i) => {
                if (!date) return <div key={`e-${i}`} />;
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate);
                const otherMonth = date.getMonth() !== currentMonth.getMonth();
                return (
                  <div
                    key={date.toISOString()}
                    className={[
                      'mobile-cal-cell',
                      isSelected ? 'mobile-cal-cell--selected' : isToday ? 'mobile-cal-cell--today' : '',
                      otherMonth ? 'mobile-cal-cell--other-month' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => selectDate(date)}
                  >
                    {date.getDate()}
                    {hasEvents(date) && <div className="mobile-cal-cell__dot" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Week strip (visible only when collapsed) ── */}
        <div className={`mobile-cal-panel ${!monthExpanded ? 'mobile-cal-panel--open' : ''}`}>
          <div className="mobile-cal-panel__inner">
            <div className="mobile-week-strip">
              {weekDays.map((d) => {
                const isToday = isSameDay(d, today);
                const isSelected = isSameDay(d, selectedDate);
                return (
                  <div
                    key={d.toISOString()}
                    className={`mobile-week-day${isSelected ? ' mobile-week-day--active' : ''}`}
                    onClick={() => selectDate(d)}
                  >
                    <span className="mobile-week-day__label">{WEEKDAY_LABELS[d.getDay()]}</span>
                    <span className={`mobile-week-day__num${!isSelected && isToday ? ' mobile-week-day__num--today' : ''}`}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Day detail ─────────────────────────────────────────── */}
      <div className="mobile-day-detail-header">{formatDayDetailHeader(selectedDate)}</div>

      <div
        ref={scrollRef}
        className="mobile-scroll-content"
        style={{ flex: 1, overflowY: 'auto' }}
        onTouchStart={onScrollTouchStart}
        onTouchEnd={onScrollTouchEnd}
      >
        {dayEvents.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
            No events on this day
          </div>
        ) : (
          dayEvents.map((event) => (
            <MobileInspectorCard
              key={event.id}
              event={event}
              linkedTasks={getLinkedTasks(event)}
              linkedNotes={getLinkedNotes(event)}
              onEditEvent={() => { setSelectedEvent(event); setEditEvent(event); }}
              onNewNote={() => handleNewNote(event)}
            />
          ))
        )}
        <div style={{ height: 80 }} />
      </div>

      <button className="mobile-fab" onClick={() => setShowCreateModal(true)} aria-label="New event">
        <PlusIcon />
      </button>

      {showCreateModal && (() => {
        const y = selectedDate.getFullYear();
        const mo = pad(selectedDate.getMonth() + 1);
        const d = pad(selectedDate.getDate());
        const now = new Date();
        const isToday =
          now.getFullYear() === selectedDate.getFullYear() &&
          now.getMonth() === selectedDate.getMonth() &&
          now.getDate() === selectedDate.getDate();
        let startH: number, startMin: number;
        if (isToday) {
          const totalMins = now.getHours() * 60 + now.getMinutes();
          const nextHalfHour = Math.ceil(totalMins / 30) * 30;
          startH = Math.floor(nextHalfHour / 60) % 24;
          startMin = nextHalfHour % 60;
        } else {
          startH = 9;
          startMin = 0;
        }
        const endTotalMins = startH * 60 + startMin + 30;
        const endH = Math.floor(endTotalMins / 60) % 24;
        const endMin = endTotalMins % 60;
        return (
          <EventCreateModal
            fromIso={`${y}-${mo}-${d}T${pad(startH)}:${pad(startMin)}`}
            toIso={`${y}-${mo}-${d}T${pad(endH)}:${pad(endMin)}`}
            onClose={() => setShowCreateModal(false)}
          />
        );
      })()}

      {editEvent && (
        <EventEditModal event={editEvent} onClose={() => setEditEvent(null)} />
      )}
    </div>
  );
}

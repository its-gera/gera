import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { EventEntity, NoteEntity } from '../../types';
import { getAllDayEventsForDay, computeOverlapLayout, isAllDayEvent, OverlapLayout, HOUR_HEIGHT_PX } from '../../utils/eventPositioning';
import { useAppStore } from '../../stores/useAppStore';
import { EventBlock } from './EventBlock';
import EventCreateModal from './EventCreateModal';

interface CalendarGridProps {
  dayNames: string[];
  weekDates: Date[];
  hours: number[];
  formatHour: (hour: number) => string;
  events: EventEntity[];
  notes: NoteEntity[];
  getEventForCell: (
    events: EventEntity[],
    hourIndex: number,
    dayIndex: number,
    weekDates: Date[]
  ) => EventEntity[];
}

export function CalendarGrid({
  dayNames,
  weekDates,
  hours,
  formatHour,
  events,
  notes,
  getEventForCell,
}: CalendarGridProps) {
  const [creating, setCreating] = useState(false);
  const [createFromIso, setCreateFromIso] = useState('');
  const [createToIso, setCreateToIso] = useState('');
  const colCount = weekDates.length;
  const gridStyle = {
    gridTemplateColumns: `60px repeat(${colCount}, 1fr)`,
  };
  const gridRef = useRef<HTMLDivElement>(null);
  // Capture highlight target at render time — before any effects can clear it — so
  // StrictMode's double-effect invocation doesn't see a stale null from the store.
  const scrollTargetId = useRef(useAppStore.getState().highlightEventId);
  const scrollDone = useRef(false);

  // Current time — refreshed every minute
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const minuteOffsetPx = (currentMinute / 60) * HOUR_HEIGHT_PX;

  // Today's column index in the visible range (-1 if today isn't visible)
  const todayIndex = weekDates.findIndex(
    (d) => d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate()
  );

  // Scroll once on mount. scrollDone guards against StrictMode's double-invoke.
  // scrollTargetId is captured at render time so EventBlock's useEffect clearing
  // highlightEventId in the store doesn't race with us.
  useLayoutEffect(() => {
    if (scrollDone.current) return;
    scrollDone.current = true;
    const el = gridRef.current;
    if (!el) return;
    const targetId = scrollTargetId.current;
    if (targetId) {
      const ev = useAppStore.getState().events.find((e) => e.id === targetId);
      if (ev) {
        const d = new Date(ev.from_);
        const eventTopPx = (d.getHours() + d.getMinutes() / 60) * HOUR_HEIGHT_PX;
        el.scrollTop = Math.max(0, eventTopPx - el.clientHeight / 3);
        return;
      }
    }
    el.scrollTop = Math.max(0, currentHour - 5) * HOUR_HEIGHT_PX;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute overlap layout once per day so EventBlock can position itself correctly
  const dayLayouts: Map<string, OverlapLayout>[] = weekDates.map((day) => {
    const y = day.getFullYear(), m = day.getMonth(), d = day.getDate();
    const timedEvents = events.filter((ev) => {
      if (isAllDayEvent(ev)) return false;
      try {
        const s = new Date(ev.from_);
        return s.getFullYear() === y && s.getMonth() === m && s.getDate() === d;
      } catch { return false; }
    });
    return computeOverlapLayout(timedEvents);
  });

  const setSelectedEvent = useAppStore((s) => s.setSelectedEvent);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);
  const pendingCreate = useAppStore((s) => s.pendingCreate);
  const setPendingCreate = useAppStore((s) => s.setPendingCreate);

  // Open event create modal at the current time when triggered via command palette
  useEffect(() => {
    if (pendingCreate !== 'event') return;
    setPendingCreate(null);
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocalIso = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    setCreateFromIso(toLocalIso(now));
    setCreateToIso(toLocalIso(end));
    setCreating(true);
  }, [pendingCreate, setPendingCreate]);

  return (
    <div className="calendar-grid" style={gridStyle} ref={gridRef}>
      {/* Day headers row */}
      <div className="calendar-corner"></div>
      {dayNames.map((day, i) => {
        const allDayEvs = getAllDayEventsForDay(events, weekDates[i]);
        const isToday = i === todayIndex;
        return (
          <div key={day + i} className={`day-header${isToday ? ' day-header--today' : ''}`}>
            <span className="day-name">{day}</span>
            <span className="day-number">{weekDates[i].getDate()}</span>
            {allDayEvs.length > 0 && (
              <div className="all-day-chips">
                {allDayEvs.map((ev) => (
                  <div
                    key={ev.id}
                    className="all-day-chip"
                    title={ev.name}
                    onClick={() => {
                      setSelectedEvent(ev);
                      const linkedNote = notes.find((n) => n.event_ids.includes(ev.id));
                      setSelectedNote(linkedNote ?? null);
                    }}
                  >
                    {ev.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Time rows */}
      {hours.map((hour, hourIndex) => (
        <React.Fragment key={`row-${hourIndex}`}>
          <div className="time-cell">
            {formatHour(hour)}
            {todayIndex >= 0 && hourIndex === currentHour && (
              <>
                <div className="current-time-line" style={{ top: `${minuteOffsetPx}px` }} />
                <div className="current-time-dot" style={{ top: `${minuteOffsetPx}px` }} />
              </>
            )}
          </div>
          {dayNames.map((_, dayIndex) => {
            const cellEvents = getEventForCell(events, hourIndex, dayIndex, weekDates);
            const handleCellClick = () => {
              const base = new Date(weekDates[dayIndex]);
              base.setHours(hours[hourIndex], 0, 0, 0);
              const end = new Date(base);
              end.setHours(base.getHours() + 1);
              const pad = (n: number) => String(n).padStart(2, '0');
              const toLocalIso = (d: Date) => {
                return (
                  d.getFullYear() + '-' +
                  pad(d.getMonth() + 1) + '-' +
                  pad(d.getDate()) + 'T' +
                  pad(d.getHours()) + ':' +
                  pad(d.getMinutes()) + ':' +
                  pad(d.getSeconds())
                );
              };

              setCreateFromIso(toLocalIso(base));
              setCreateToIso(toLocalIso(end));
              setCreating(true);
            };

            return (
              <div key={`cell-${hourIndex}-${dayIndex}`} className="grid-cell" onClick={handleCellClick}>
                {todayIndex >= 0 && hourIndex === currentHour && (
                  <div className="current-time-line" style={{ top: `${minuteOffsetPx}px` }} />
                )}
                {cellEvents.map((ev) => {
                  const layout = dayLayouts[dayIndex].get(ev.id);
                  return (
                    <EventBlock
                      key={ev.id}
                      event={ev}
                      notes={notes}
                      columnIndex={layout?.columnIndex ?? 0}
                      columnCount={layout?.columnCount ?? 1}
                    />
                  );
                })}
              </div>
            );
          })}
        </React.Fragment>
      ))}
      {creating && (
        <EventCreateModal
          fromIso={createFromIso}
          toIso={createToIso}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

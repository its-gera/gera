import { useEffect, useState } from 'react';
import { EventEntity, NoteEntity } from '../../types';
import { useAppStore } from '../../stores/useAppStore';
import { calculateEventStyle } from '../../utils/eventPositioning';
import { formatEventTime } from '../../utils/dateFormatting';
import { EventEditModal } from './EventEditModal';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface EventBlockProps {
  event: EventEntity;
  notes: NoteEntity[];
  columnIndex?: number;
  columnCount?: number;
}

export function EventBlock({ event, notes, columnIndex = 0, columnCount = 1 }: EventBlockProps) {
  const setSelectedEvent = useAppStore((state) => state.setSelectedEvent);
  const setSelectedNote = useAppStore((state) => state.setSelectedNote);
  const highlightEventId = useAppStore((state) => state.highlightEventId);
  const setHighlightEventId = useAppStore((state) => state.setHighlightEventId);
  const [editing, setEditing] = useState(false);
  const [editProhibited, setEditProhibited] = useState(false);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    if (highlightEventId !== event.id) return;
    setHighlightEventId(null);
    setHighlighted(true);
    const timer = setTimeout(() => setHighlighted(false), 2000);
    return () => clearTimeout(timer);
  }, [highlightEventId, event.id, setHighlightEventId]);
  
  const eventStyle = calculateEventStyle(event);
  // Only show time if the block is tall enough to fit a second line (~44px = ~30min)
  const heightPx = parseFloat(eventStyle.height);
  const showTime = heightPx >= 44;

  // Horizontal positioning: events share the left 80% of the cell; the
  // rightmost 20% is always left empty so the user can click it to create events.
  const AVAILABLE = 95; // percent of cell width allocated to events
  const OUTER = 4;      // px inset on outer edges of the event area
  const GAP = 2;        // px gap between adjacent events
  const slotPct = AVAILABLE / columnCount;
  const leftPct = columnIndex * slotPct;
  const rightPct = 100 - (columnIndex + 1) * slotPct;
  const leftInset = columnIndex === 0 ? OUTER : GAP / 2;
  const rightInset = columnIndex === columnCount - 1 ? OUTER : GAP / 2;
  const leftStyle = `calc(${leftPct}% + ${leftInset}px)`;
  const rightStyle = `calc(${rightPct}% + ${rightInset}px)`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(event);
    const linkedNote = notes.find((n) => n.event_ids.includes(event.id));
    setSelectedNote(linkedNote ?? null);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Prevent editing of events imported from external calendars (e.g. Google)
    if (event.metadata?.source_platform === 'google_calendar') {
      setEditProhibited(true);
      return;
    }
    setEditing(true);
  };

  // Determine source badge
  const isGoogleCalendar = event.metadata?.source_platform === 'google_calendar';
  const sourceBadge = isGoogleCalendar ? (
    <div className="event-source-badge event-source-badge--google" title="From Google Calendar">
      G
    </div>
  ) : null;

  return (
    <>
      <div
        className={`event-block${highlighted ? ' event-block--highlight' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{
          cursor: "pointer",
          height: eventStyle.height,
          top: eventStyle.top,
          position: 'absolute',
          left: leftStyle,
          right: rightStyle,
        }}
      >
        <div className="event-block-content">
          <div className="event-title">{event.name}</div>
          {showTime && (
            <div className="event-time">
              {formatEventTime(event.from_)}
            </div>
          )}
        </div>
        {sourceBadge}
      </div>

      {editing && (
        <EventEditModal
          event={event}
          onClose={() => setEditing(false)}
        />
      )}

      {editProhibited && (
        <ConfirmDialog
          title="Edit Disabled"
          message="This event was imported from Google Calendar and must be edited there."
          confirmLabel="OK"
          cancelLabel="Cancel"
          onConfirm={() => setEditProhibited(false)}
          onCancel={() => setEditProhibited(false)}
        />
      )}
    </>
  );
}


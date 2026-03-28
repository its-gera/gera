import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createEvent, listEvents } from '../../api';
import { useAppStore } from '../../stores/useAppStore';
import { DateTimePicker } from '../shared/DateTimePicker';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface EventCreateModalProps {
  fromIso: string; // ISO or datetime-local substring
  toIso: string;
  onClose: () => void;
}

/** Convert ISO datetime string (2026-03-08T14:30:00) to datetime-local format (2026-03-08T14:30) */
function toDatetimeLocal(iso: string): string {
  return iso.substring(0, 16);
}

/** Convert datetime-local string (2026-03-08T14:30) to full ISO string */
function fromDatetimeLocal(local: string): string {
  return local.length === 16 ? local + ':00' : local;
}

export function EventCreateModal({ fromIso, toIso, onClose }: EventCreateModalProps) {
  const [name, setName] = useState('');
  const [fromVal, setFromVal] = useState(toDatetimeLocal(fromIso));
  const [toVal, setToVal] = useState(toDatetimeLocal(toIso));
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantInput, setParticipantInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const setEvents = useAppStore((s) => s.setEvents);

  useFocusTrap(panelRef);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSingleLineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const addParticipant = () => {
    const trimmed = participantInput.trim();
    if (trimmed && !participants.includes(trimmed)) {
      setParticipants((prev) => [...prev, trimmed]);
    }
    setParticipantInput('');
  };

  const removeParticipant = (p: string) => {
    setParticipants((prev) => prev.filter((x) => x !== p));
  };

  const handleParticipantKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addParticipant();
    } else if (e.key === 'Escape') {
      setParticipantInput('');
    }
  };

  const isValid = name.trim() && fromVal && toVal;

  const handleSave = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2, 10);
      await createEvent({
        id,
        source: 'local',
        name: name.trim(),
        from_: fromDatetimeLocal(fromVal),
        to: fromDatetimeLocal(toVal),
        description: description.trim(),
        location: location.trim(),
        participants,
        metadata: {
          source_platform: 'local',
          source_account: '',
          source_event_id: '',
          source_calendar_id: '',
          etag: '',
          last_synced_at: null,
          recurring_event_id: '',
          source_updated_at: null,
        },
      });
      const refreshed = await listEvents();
      setEvents(refreshed);
      onClose();
    } catch (err) {
      console.error('Failed to create event:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <div className="modal-panel event-edit-modal" role="dialog" aria-modal="true" ref={panelRef}>
        <div className="modal-header">
          <h2 className="modal-title">New Event</h2>
        </div>

        <div className="event-modal-field">
          <label className="event-modal-label">Name</label>
          <input
            ref={nameInputRef}
            className="modal-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleSingleLineKeyDown}
            placeholder="Event name"
          />
        </div>

        <div className="event-modal-time-row">
          <div className="event-modal-field">
            <label className="event-modal-label">Start</label>
            <DateTimePicker value={fromVal} onChange={setFromVal} />
          </div>
          <div className="event-modal-field">
            <label className="event-modal-label">End</label>
            <DateTimePicker value={toVal} onChange={setToVal} />
          </div>
        </div>

        <div className="event-modal-field">
          <label className="event-modal-label">Location</label>
          <input
            className="modal-input"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={handleSingleLineKeyDown}
            placeholder="Add location"
          />
        </div>

        <div className="event-modal-field">
          <label className="event-modal-label">Participants</label>
          <div className="event-modal-chips">
            {participants.map((p) => (
              <span key={p} className="event-modal-chip">
                {p}
                <button className="event-modal-chip-remove" onClick={() => removeParticipant(p)} title={`Remove ${p}`}>
                  ×
                </button>
              </span>
            ))}
            <input
              className="event-modal-chip-input"
              type="text"
              placeholder="Add participant…"
              value={participantInput}
              onChange={(e) => setParticipantInput(e.target.value)}
              onKeyDown={handleParticipantKeyDown}
              onBlur={addParticipant}
            />
          </div>
        </div>

        <div className="event-modal-field">
          <label className="event-modal-label">Description</label>
          <textarea
            className="modal-input event-modal-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add description"
            rows={3}
          />
        </div>

        <div className="modal-actions">
          <button className="modal-btn modal-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn modal-btn--submit" disabled={!isValid || isSubmitting} onClick={handleSave}>
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default EventCreateModal;

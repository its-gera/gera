import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EventEntity, updateEvent, deleteEvent } from '../../api';
import { useAppStore } from '../../stores/useAppStore';
import { TrashIcon } from '../icons/Icons';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { DateTimePicker } from '../shared/DateTimePicker';

interface EventEditModalProps {
  event: EventEntity;
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

export function EventEditModal({ event, onClose }: EventEditModalProps) {
  const setSelectedEvent = useAppStore((s) => s.setSelectedEvent);
  const [name, setName] = useState(event.name);
  const [fromVal, setFromVal] = useState(toDatetimeLocal(event.from_));
  const [toVal, setToVal] = useState(toDatetimeLocal(event.to));
  const [description, setDescription] = useState(event.description ?? '');
  const [location, setLocation] = useState(event.location ?? '');
  const [participants, setParticipants] = useState<string[]>(event.participants ?? []);
  const [participantInput, setParticipantInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useFocusTrap(panelRef);

  // Focus name input on open
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
      await updateEvent({
        id: event.id,
        name: name.trim(),
        from_: fromDatetimeLocal(fromVal),
        to: fromDatetimeLocal(toVal),
        description: description.trim(),
        location: location.trim(),
        participants,
      });
      onClose();
    } catch (err) {
      console.error('Failed to update event:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteEvent(event.id);
      setSelectedEvent(null);
      onClose();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      ref={backdropRef}
      onClick={handleBackdropClick}
    >
      <div className="modal-panel event-edit-modal" role="dialog" aria-modal="true" ref={panelRef}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Edit Event</h2>
          <button
            className="modal-delete-btn"
            title="Delete event"
            onClick={() => setConfirmDelete(true)}
          >
            <TrashIcon />
          </button>
        </div>

        {/* Name */}
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

        {/* Time row */}
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

        {/* Location */}
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

        {/* Participants */}
        <div className="event-modal-field">
          <label className="event-modal-label">Participants</label>
          <div className="event-modal-chips">
            {participants.map((p) => (
              <span key={p} className="event-modal-chip">
                {p}
                <button
                  className="event-modal-chip-remove"
                  onClick={() => removeParticipant(p)}
                  title={`Remove ${p}`}
                >
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

        {/* Description */}
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

        {/* Actions */}
        <div className="modal-actions">
          <button className="modal-btn modal-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn modal-btn--submit"
            disabled={!isValid || isSubmitting}
            onClick={handleSave}
          >
            {isSubmitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Event"
          message={`Delete "${event.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>,
    document.body
  );
}

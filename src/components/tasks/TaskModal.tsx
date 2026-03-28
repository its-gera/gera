/**
 * Shared modal for creating and editing tasks.
 *
 * Callers provide initial values and an onSave callback that receives the
 * fully-composed task text (e.g. "Buy milk @2026-03-15T09:00 @event-id").
 * The modal handles all state, the event picker, and keyboard shortcuts.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../stores/useAppStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { TrashIcon } from '../icons/Icons';
import { DateTimePicker } from '../shared/DateTimePicker';

interface TaskModalProps {
  title: string;
  submitLabel: string;
  initialText?: string;
  initialEventIds?: string[];
  initialDeadline?: string;
  /** Read-only event IDs inherited from a note's frontmatter (edit mode only). */
  inheritedEventIds?: string[];
  onSave: (fullText: string) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

export function TaskModal({
  title,
  submitLabel,
  initialText = '',
  initialEventIds = [],
  initialDeadline = '',
  inheritedEventIds = [],
  onSave,
  onDelete,
  onClose,
}: TaskModalProps) {
  const allEvents = useAppStore((s) => s.events);

  const [text, setText] = useState(initialText);
  const [eventIds, setEventIds] = useState<string[]>(initialEventIds);
  const [deadline, setDeadline] = useState(initialDeadline);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showEventPicker, setShowEventPicker] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [pickerMeasured, setPickerMeasured] = useState(false);
  const [pickerTop, setPickerTop] = useState<number | undefined>(undefined);
  const [pickerListMaxHeight, setPickerListMaxHeight] = useState<number | undefined>(undefined);

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  useFocusTrap(panelRef);

  // Escape closes modal (unless picker is open, which handles its own Escape)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showEventPicker) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, showEventPicker]);

  // Focus picker search when it opens
  useEffect(() => {
    if (showEventPicker && pickerMeasured) pickerSearchRef.current?.focus();
  }, [showEventPicker, pickerMeasured]);

  // Measure and position the event picker dropdown
  useLayoutEffect(() => {
    if (!showEventPicker || !pickerRef.current) {
      setPickerMeasured(false);
      setPickerTop(undefined);
      setPickerListMaxHeight(undefined);
      return;
    }
    const wrapper = pickerRef.current;
    const popup = wrapper.querySelector<HTMLElement>('.metadata-event-picker');
    if (!popup) return;

    const searchInput = popup.querySelector<HTMLInputElement>('.metadata-picker-search');
    const listEl = popup.querySelector<HTMLElement>('.metadata-picker-list');
    const wrapperRect = wrapper.getBoundingClientRect();
    const viewportHeight = document.documentElement.clientHeight;
    const margin = 12;
    const headerHeight = searchInput ? searchInput.getBoundingClientRect().height : 40;
    const desiredListHeight = listEl ? Math.min(listEl.scrollHeight, 600) : 180;
    const spaceBelow = Math.max(0, viewportHeight - wrapperRect.bottom - margin);
    const spaceAbove = Math.max(0, wrapperRect.top - margin);
    const minListHeight = 60;
    const availableBelow = Math.max(0, spaceBelow - headerHeight - 8);
    const availableAbove = Math.max(0, spaceAbove - headerHeight - 8);

    let topPx: number;
    let maxListHeight: number;
    if (availableBelow >= minListHeight) {
      topPx = wrapperRect.height + 6;
      maxListHeight = Math.max(minListHeight, Math.min(desiredListHeight, availableBelow));
    } else if (availableAbove >= minListHeight) {
      maxListHeight = Math.max(minListHeight, Math.min(desiredListHeight, availableAbove));
      topPx = -(headerHeight + maxListHeight + 6);
    } else {
      topPx = wrapperRect.height + 6;
      maxListHeight = Math.max(40, Math.min(desiredListHeight, availableBelow || availableAbove || 80));
    }

    setPickerTop(topPx);
    setPickerListMaxHeight(maxListHeight);
    setPickerMeasured(true);
  }, [showEventPicker, eventSearch, eventIds.length, inheritedEventIds.length, allEvents.length]);

  // Close picker on outside click
  useEffect(() => {
    if (!showEventPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEventPicker(false);
        setEventSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEventPicker]);

  const handleSave = async () => {
    const baseText = text.trim();
    if (!baseText || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const tokens: string[] = [];
      if (deadline) tokens.push(`@${deadline}`);
      eventIds.forEach((id) => tokens.push(`@${id}`));
      const fullText = tokens.length > 0 ? `${baseText} ${tokens.join(' ')}` : baseText;
      await onSave(fullText);
      onClose();
    } catch (err) {
      console.error('Task modal save failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    else if (e.key === 'Escape') onClose();
  };

  const availableEvents = allEvents.filter(
    (e) =>
      !eventIds.includes(e.id) &&
      !inheritedEventIds.includes(e.id) &&
      e.name.toLowerCase().includes(eventSearch.toLowerCase())
  );

  return createPortal(
    <div
      className="modal-backdrop"
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="modal-panel" ref={panelRef}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          {onDelete && (
            <button className="modal-delete-btn" onClick={onDelete} title="Delete task">
              <TrashIcon />
            </button>
          )}
        </div>

        <input
          type="text"
          className="modal-input"
          placeholder="Task description…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={isSubmitting}
        />

        {/* Deadline */}
        <div className="task-modal-events">
          <span className="task-modal-events-label">Due date / time</span>
          <DateTimePicker
            value={deadline}
            onChange={setDeadline}
            disabled={isSubmitting}
            placeholder="No due date"
            clearable
          />
        </div>

        {/* Event associations */}
        <div className="task-modal-events">
          <span className="task-modal-events-label">Events</span>
          <div className="task-modal-chips">
            {inheritedEventIds.map((eid) => {
              const name = allEvents.find((e) => e.id === eid)?.name ?? eid;
              return (
                <span
                  key={eid}
                  className="metadata-chip metadata-chip--event metadata-chip--readonly"
                  title="Inherited from note"
                >
                  @{name}
                </span>
              );
            })}
            {eventIds.map((eid) => {
              const name = allEvents.find((e) => e.id === eid)?.name ?? eid;
              return (
                <span key={eid} className="metadata-chip metadata-chip--event">
                  @{name}
                  <button
                    className="metadata-chip-remove"
                    onClick={() => setEventIds((ids) => ids.filter((id) => id !== eid))}
                    title="Remove event"
                  >×</button>
                </span>
              );
            })}

            <div className="metadata-add-wrapper" ref={pickerRef}>
              <button
                className="metadata-chip metadata-chip--add"
                onClick={() => { setShowEventPicker((v) => !v); setEventSearch(''); }}
              >
                + Event
              </button>
              {showEventPicker && (
                <div
                  className="metadata-event-picker"
                  style={{ top: pickerTop !== undefined ? `${pickerTop}px` : undefined }}
                >
                  <input
                    ref={pickerSearchRef}
                    className="metadata-picker-search"
                    placeholder="Search events…"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        (pickerRef.current?.querySelector<HTMLButtonElement>('.metadata-picker-item'))?.focus();
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        setShowEventPicker(false);
                        setEventSearch('');
                      }
                    }}
                  />
                  <div
                    className="metadata-picker-list"
                    style={{ maxHeight: pickerListMaxHeight !== undefined ? `${pickerListMaxHeight}px` : undefined }}
                  >
                    {availableEvents.slice(0, 10).map((e) => (
                      <button
                        key={e.id}
                        className="metadata-picker-item"
                        onClick={() => {
                          setEventIds((ids) => [...ids, e.id]);
                          setShowEventPicker(false);
                          setEventSearch('');
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'ArrowDown') {
                            ev.preventDefault(); ev.stopPropagation();
                            (ev.currentTarget.nextElementSibling as HTMLButtonElement | null)?.focus();
                          } else if (ev.key === 'ArrowUp') {
                            ev.preventDefault(); ev.stopPropagation();
                            const prev = ev.currentTarget.previousElementSibling as HTMLButtonElement | null;
                            if (prev) prev.focus();
                            else pickerRef.current?.querySelector<HTMLInputElement>('.metadata-picker-search')?.focus();
                          } else if (ev.key === 'Escape') {
                            ev.stopPropagation();
                            setShowEventPicker(false);
                            setEventSearch('');
                          }
                        }}
                      >
                        {e.name}
                      </button>
                    ))}
                    {availableEvents.length === 0 && (
                      <span className="metadata-picker-empty">No events found</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {inheritedEventIds.length === 0 && eventIds.length === 0 && !showEventPicker && (
              <span className="task-modal-events-empty">None</span>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-btn modal-btn--cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn modal-btn--submit"
            onClick={handleSave}
            disabled={!text.trim() || isSubmitting}
          >
            {isSubmitting ? `${submitLabel}…` : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

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
import { TimeReference } from '../../api';

type DueMode = 'absolute' | 'relative';
type RelModifier = 'before' | 'after';
type RelUnit = 'm' | 'h' | 'd' | 'W';

const REL_UNITS: { value: RelUnit; label: string }[] = [
  { value: 'm', label: 'min' },
  { value: 'h', label: 'hr' },
  { value: 'd', label: 'day' },
  { value: 'W', label: 'wk' },
];

interface TaskModalProps {
  title: string;
  submitLabel: string;
  initialText?: string;
  initialEventIds?: string[];
  initialDeadline?: string;
  initialTimeRef?: TimeReference;
  /** Read-only event IDs inherited from a note's frontmatter (edit mode only). */
  inheritedEventIds?: string[];
  onSave: (fullText: string) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

/** Compute dropdown position relative to a wrapper element. */
function measurePicker(
  wrapperEl: HTMLElement,
  popupEl: HTMLElement
): { top: number; maxListHeight: number } {
  const searchInput = popupEl.querySelector<HTMLInputElement>('.metadata-picker-search');
  const listEl = popupEl.querySelector<HTMLElement>('.metadata-picker-list');
  const wrapperRect = wrapperEl.getBoundingClientRect();
  const viewportHeight = document.documentElement.clientHeight;
  const margin = 12;
  const headerHeight = searchInput ? searchInput.getBoundingClientRect().height : 40;
  const desiredListHeight = listEl ? Math.min(listEl.scrollHeight, 600) : 180;
  const spaceBelow = Math.max(0, viewportHeight - wrapperRect.bottom - margin);
  const spaceAbove = Math.max(0, wrapperRect.top - margin);
  const minListHeight = 60;
  const availableBelow = Math.max(0, spaceBelow - headerHeight - 8);
  const availableAbove = Math.max(0, spaceAbove - headerHeight - 8);

  if (availableBelow >= minListHeight) {
    return {
      top: wrapperRect.height + 6,
      maxListHeight: Math.max(minListHeight, Math.min(desiredListHeight, availableBelow)),
    };
  } else if (availableAbove >= minListHeight) {
    const maxListHeight = Math.max(minListHeight, Math.min(desiredListHeight, availableAbove));
    return { top: -(headerHeight + maxListHeight + 6), maxListHeight };
  } else {
    return {
      top: wrapperRect.height + 6,
      maxListHeight: Math.max(40, Math.min(desiredListHeight, availableBelow || availableAbove || 80)),
    };
  }
}

export function TaskModal({
  title,
  submitLabel,
  initialText = '',
  initialEventIds = [],
  initialDeadline = '',
  initialTimeRef,
  inheritedEventIds = [],
  onSave,
  onDelete,
  onClose,
}: TaskModalProps) {
  const allEvents = useAppStore((s) => s.events);

  const [text, setText] = useState(initialText);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Due mode ──────────────────────────────────────────────────────────────
  const [dueMode, setDueMode] = useState<DueMode>(initialTimeRef ? 'relative' : 'absolute');
  const [deadline, setDeadline] = useState(initialDeadline);

  // ── Relative timing ───────────────────────────────────────────────────────
  const [relEventId, setRelEventId] = useState(initialTimeRef?.target_id ?? '');
  const [relModifier, setRelModifier] = useState<RelModifier>(
    (initialTimeRef?.modifier as RelModifier) ?? 'before'
  );
  const [relAmount, setRelAmount] = useState(initialTimeRef ? String(initialTimeRef.amount) : '1');
  const [relUnit, setRelUnit] = useState<RelUnit>((initialTimeRef?.unit as RelUnit) ?? 'h');

  // ── Rel event picker ──────────────────────────────────────────────────────
  const [showRelPicker, setShowRelPicker] = useState(false);
  const [relSearch, setRelSearch] = useState('');
  const [relPickerMeasured, setRelPickerMeasured] = useState(false);
  const [relPickerTop, setRelPickerTop] = useState<number | undefined>(undefined);
  const [relPickerListMaxHeight, setRelPickerListMaxHeight] = useState<number | undefined>(undefined);
  const relPickerRef = useRef<HTMLDivElement>(null);
  const relPickerSearchRef = useRef<HTMLInputElement>(null);

  // ── Event associations ────────────────────────────────────────────────────
  const [eventIds, setEventIds] = useState<string[]>(() => {
    const ids = [...initialEventIds];
    if (initialTimeRef?.target_id && !ids.includes(initialTimeRef.target_id)) {
      ids.push(initialTimeRef.target_id);
    }
    return ids;
  });

  const [showEventPicker, setShowEventPicker] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [pickerMeasured, setPickerMeasured] = useState(false);
  const [pickerTop, setPickerTop] = useState<number | undefined>(undefined);
  const [pickerListMaxHeight, setPickerListMaxHeight] = useState<number | undefined>(undefined);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);

  // Escape closes modal (unless a picker is open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showEventPicker && !showRelPicker) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, showEventPicker, showRelPicker]);

  // Focus search when pickers open
  useEffect(() => {
    if (showEventPicker && pickerMeasured) pickerSearchRef.current?.focus();
  }, [showEventPicker, pickerMeasured]);

  useEffect(() => {
    if (showRelPicker && relPickerMeasured) relPickerSearchRef.current?.focus();
  }, [showRelPicker, relPickerMeasured]);

  // Measure and position the linked-event picker
  useLayoutEffect(() => {
    if (!showEventPicker || !pickerRef.current) {
      setPickerMeasured(false);
      setPickerTop(undefined);
      setPickerListMaxHeight(undefined);
      return;
    }
    const popup = pickerRef.current.querySelector<HTMLElement>('.metadata-event-picker');
    if (!popup) return;
    const { top, maxListHeight } = measurePicker(pickerRef.current, popup);
    setPickerTop(top);
    setPickerListMaxHeight(maxListHeight);
    setPickerMeasured(true);
  }, [showEventPicker, eventSearch, eventIds.length, inheritedEventIds.length, allEvents.length]);

  // Measure and position the relative-event picker
  useLayoutEffect(() => {
    if (!showRelPicker || !relPickerRef.current) {
      setRelPickerMeasured(false);
      setRelPickerTop(undefined);
      setRelPickerListMaxHeight(undefined);
      return;
    }
    const popup = relPickerRef.current.querySelector<HTMLElement>('.metadata-event-picker');
    if (!popup) return;
    const { top, maxListHeight } = measurePicker(relPickerRef.current, popup);
    setRelPickerTop(top);
    setRelPickerListMaxHeight(maxListHeight);
    setRelPickerMeasured(true);
  }, [showRelPicker, relSearch, allEvents.length]);

  // Close pickers on outside click
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

  useEffect(() => {
    if (!showRelPicker) return;
    const handler = (e: MouseEvent) => {
      if (relPickerRef.current && !relPickerRef.current.contains(e.target as Node)) {
        setShowRelPicker(false);
        setRelSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showRelPicker]);

  function pickRelEvent(id: string) {
    setRelEventId(id);
    if (id && !eventIds.includes(id)) setEventIds((ids) => [...ids, id]);
    setShowRelPicker(false);
    setRelSearch('');
  }

  const handleSave = async () => {
    const baseText = text.trim();
    if (!baseText || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const tokens: string[] = [];

      if (dueMode === 'absolute') {
        if (deadline) tokens.push(`@${deadline}`);
      } else if (relEventId) {
        const n = Math.max(1, parseInt(relAmount) || 1);
        tokens.push(`@${relModifier}[${n}${relUnit}]:${relEventId}`);
      }

      for (const id of eventIds) {
        if (dueMode === 'relative' && id === relEventId) continue;
        tokens.push(`@${id}`);
      }

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

  const relSearchResults = allEvents
    .filter((e) => e.name.toLowerCase().includes(relSearch.toLowerCase()))
    .slice(0, 10);

  const relEventName = allEvents.find((e) => e.id === relEventId)?.name;

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

        {/* Due date / time */}
        <div className="task-modal-events">
          <div className="task-modal-due-header">
            <span className="task-modal-events-label">Due date / time</span>
            <div className="task-modal-due-toggle">
              <button
                className={`task-modal-due-toggle-btn${dueMode === 'absolute' ? ' task-modal-due-toggle-btn--active' : ''}`}
                onClick={() => setDueMode('absolute')}
                type="button"
              >
                Absolute
              </button>
              <button
                className={`task-modal-due-toggle-btn${dueMode === 'relative' ? ' task-modal-due-toggle-btn--active' : ''}`}
                onClick={() => setDueMode('relative')}
                type="button"
              >
                Event Relative
              </button>
            </div>
          </div>

          {dueMode === 'absolute' && (
            <DateTimePicker
              value={deadline}
              onChange={setDeadline}
              disabled={isSubmitting}
              placeholder="No due date"
              clearable
            />
          )}

          {dueMode === 'relative' && (
            <div className="task-modal-rel-row">
              {/* Relative event picker */}
              <div className="metadata-add-wrapper" ref={relPickerRef}>
                <button
                  type="button"
                  className={`task-modal-rel-event-btn${relEventName ? ' task-modal-rel-event-btn--selected' : ''}`}
                  onClick={() => { setShowRelPicker((v) => !v); setRelSearch(''); }}
                >
                  {relEventName ?? 'Select event…'}
                </button>
                {showRelPicker && (
                  <div
                    className="metadata-event-picker"
                    style={{ top: relPickerTop !== undefined ? `${relPickerTop}px` : undefined }}
                  >
                    <input
                      ref={relPickerSearchRef}
                      className="metadata-picker-search"
                      placeholder="Search events…"
                      value={relSearch}
                      onChange={(e) => setRelSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          (relPickerRef.current?.querySelector<HTMLButtonElement>('.metadata-picker-item'))?.focus();
                        } else if (e.key === 'Escape') {
                          e.stopPropagation();
                          setShowRelPicker(false);
                          setRelSearch('');
                        }
                      }}
                    />
                    <div
                      className="metadata-picker-list"
                      style={{ maxHeight: relPickerListMaxHeight !== undefined ? `${relPickerListMaxHeight}px` : undefined }}
                    >
                      {relSearchResults.map((e) => (
                        <button
                          key={e.id}
                          className={`metadata-picker-item${e.id === relEventId ? ' metadata-picker-item--selected' : ''}`}
                          onClick={() => pickRelEvent(e.id)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'ArrowDown') {
                              ev.preventDefault(); ev.stopPropagation();
                              (ev.currentTarget.nextElementSibling as HTMLButtonElement | null)?.focus();
                            } else if (ev.key === 'ArrowUp') {
                              ev.preventDefault(); ev.stopPropagation();
                              const prev = ev.currentTarget.previousElementSibling as HTMLButtonElement | null;
                              if (prev) prev.focus();
                              else relPickerRef.current?.querySelector<HTMLInputElement>('.metadata-picker-search')?.focus();
                            } else if (ev.key === 'Escape') {
                              ev.stopPropagation();
                              setShowRelPicker(false);
                              setRelSearch('');
                            }
                          }}
                        >
                          {e.name}
                        </button>
                      ))}
                      {relSearchResults.length === 0 && (
                        <span className="metadata-picker-empty">No events found</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Before / After + amount + unit */}
              <div className="task-modal-rel-controls">
                <div className="task-modal-due-toggle">
                  <button
                    type="button"
                    className={`task-modal-due-toggle-btn${relModifier === 'before' ? ' task-modal-due-toggle-btn--active' : ''}`}
                    onClick={() => setRelModifier('before')}
                  >
                    Before
                  </button>
                  <button
                    type="button"
                    className={`task-modal-due-toggle-btn${relModifier === 'after' ? ' task-modal-due-toggle-btn--active' : ''}`}
                    onClick={() => setRelModifier('after')}
                  >
                    After
                  </button>
                </div>
                <input
                  className="task-modal-rel-amount"
                  type="number"
                  min="1"
                  value={relAmount}
                  onChange={(e) => setRelAmount(e.target.value)}
                  placeholder="1"
                />
                <div className="task-modal-due-toggle">
                  {REL_UNITS.map((u) => (
                    <button
                      key={u.value}
                      type="button"
                      className={`task-modal-due-toggle-btn${relUnit === u.value ? ' task-modal-due-toggle-btn--active' : ''}`}
                      onClick={() => setRelUnit(u.value)}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
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
                    onClick={() => {
                      setEventIds((ids) => ids.filter((id) => id !== eid));
                      if (relEventId === eid) setRelEventId('');
                    }}
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

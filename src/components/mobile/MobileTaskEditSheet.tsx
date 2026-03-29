import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TaskEntity } from '../../api';
import { createTask, updateTask, deleteTask } from '../../api';
import { TrashIcon, CalendarIcon } from '../icons/Icons';
import { cleanTaskDisplay } from '../../utils/taskFormatting';
import { formatEventDate, formatEventTime } from '../../utils/dateFormatting';
import { useSheetGesture } from '../../hooks/useSheetGesture';
import { useAppStore } from '../../stores/useAppStore';

type DueMode = 'absolute' | 'relative';
type RelModifier = 'before' | 'after';
type RelUnit = 'm' | 'h' | 'd' | 'W';

const UNITS: { value: RelUnit; label: string }[] = [
  { value: 'm', label: 'min' },
  { value: 'h', label: 'hr' },
  { value: 'd', label: 'day' },
  { value: 'W', label: 'wk' },
];

interface MobileTaskEditSheetProps {
  task?: TaskEntity;
  onClose: () => void;
}

export function MobileTaskEditSheet({ task, onClose }: MobileTaskEditSheetProps) {
  const isNew = !task;
  const allEvents = useAppStore((s) => s.events);

  // ── Basic ──────────────────────────────────────────────────────────────────
  const [text, setText] = useState(task ? cleanTaskDisplay(task) : '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Linked events ──────────────────────────────────────────────────────────
  const [linkedIds, setLinkedIds] = useState<string[]>(task?.event_ids ?? []);
  const [eventSearch, setEventSearch] = useState('');
  const [showEventSearch, setShowEventSearch] = useState(false);

  // ── Due mode ───────────────────────────────────────────────────────────────
  const initRef = task?.time_references?.find(
    (r) => r.modifier === 'before' || r.modifier === 'after'
  );
  const [dueMode, setDueMode] = useState<DueMode>(initRef ? 'relative' : 'absolute');
  const [deadline, setDeadline] = useState(
    !initRef && task?.deadline ? task.deadline.slice(0, 16) : ''
  );

  // ── Relative timing ────────────────────────────────────────────────────────
  const [relEventId, setRelEventId] = useState(initRef?.target_id ?? '');
  const [relModifier, setRelModifier] = useState<RelModifier>(
    (initRef?.modifier as RelModifier) ?? 'before'
  );
  const [relAmount, setRelAmount] = useState(initRef ? String(initRef.amount) : '1');
  const [relUnit, setRelUnit] = useState<RelUnit>((initRef?.unit as RelUnit) ?? 'h');
  const [relSearch, setRelSearch] = useState('');
  const [showRelSearch, setShowRelSearch] = useState(false);

  // ── Gesture ────────────────────────────────────────────────────────────────
  const sheetRef = useRef<HTMLDivElement>(null);
  const { dismissing, dismiss, handleTouchStart, handleTouchMove, handleTouchEnd, panelStyle } =
    useSheetGesture(onClose, sheetRef);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const eventName = (id: string) =>
    task?.resolved_event_names?.[id] ?? allEvents.find((e) => e.id === id)?.name ?? id;

  const deadlineDisplay = deadline
    ? `${formatEventDate(deadline)} ${formatEventTime(deadline)}`
    : 'No due date';

  const relEvent = allEvents.find((e) => e.id === relEventId);

  const eventSearchResults = allEvents
    .filter((e) => !linkedIds.includes(e.id))
    .filter((e) => e.name.toLowerCase().includes(eventSearch.toLowerCase()))
    .slice(0, 8);

  const relSearchResults = allEvents
    .filter((e) => e.name.toLowerCase().includes(relSearch.toLowerCase()))
    .slice(0, 8);

  // ── Actions ────────────────────────────────────────────────────────────────
  function addEvent(id: string) {
    setLinkedIds((p) => [...p, id]);
    setEventSearch('');
    setShowEventSearch(false);
  }

  function removeEvent(id: string) {
    setLinkedIds((p) => p.filter((x) => x !== id));
    if (relEventId === id) setRelEventId('');
  }

  function pickRelEvent(id: string) {
    setRelEventId(id);
    if (!linkedIds.includes(id)) setLinkedIds((p) => [...p, id]);
    setRelSearch('');
    setShowRelSearch(false);
  }

  async function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const tokens: string[] = [];

      if (dueMode === 'absolute') {
        if (deadline) tokens.push(`@${deadline.slice(0, 16)}`);
      } else if (relEventId) {
        const n = Math.max(1, parseInt(relAmount) || 1);
        tokens.push(`@${relModifier}[${n}${relUnit}]:${relEventId}`);
      }

      for (const eid of linkedIds) {
        // The relative event is already expressed in its time-ref token above
        if (dueMode === 'relative' && eid === relEventId) continue;
        tokens.push(`@${eid}`);
      }

      const fullText = tokens.length > 0 ? `${trimmed} ${tokens.join(' ')}` : trimmed;

      if (isNew) {
        await createTask(fullText);
      } else {
        await updateTask(task.source_file, task.line_number, fullText);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    try {
      await deleteTask(task.source_file, task.line_number);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) dismiss();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return createPortal(
    <div
      className={`mobile-sheet-overlay${dismissing ? ' mobile-sheet-overlay--dismissing' : ''}`}
      onClick={handleOverlayClick}
    >
      <div
        className={`mobile-sheet${dismissing ? ' mobile-sheet--dismissing' : ''}`}
        ref={sheetRef}
        style={panelStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="mobile-sheet-handle" />

        {/* Header */}
        <div className="mobile-sheet-header">
          <span className="mobile-sheet-title">{isNew ? 'New Task' : 'Edit Task'}</span>
          {!isNew && (
            <button
              className="mobile-sheet-delete-btn"
              onClick={handleDelete}
              title={confirmDelete ? 'Tap again to confirm' : 'Delete task'}
            >
              <TrashIcon />
              {confirmDelete && <span style={{ fontSize: 11, marginLeft: 4 }}>Confirm?</span>}
            </button>
          )}
        </div>

        {/* Task text */}
        <input
          className="mobile-sheet-text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Task description…"
          autoFocus
          onFocus={(e) => {
            const len = e.target.value.length;
            e.target.setSelectionRange(len, len);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
        />

        {/* ── EVENTS ── */}
        <div className="mobile-sheet-section-label">EVENTS</div>

        <div className="mobile-event-chips" style={{ marginBottom: 8 }}>
          {linkedIds.map((eid) => (
            <span key={eid} className="mobile-event-chip">
              {eventName(eid)}
              <button className="mobile-task-sheet-chip-remove" onClick={() => removeEvent(eid)}>
                ×
              </button>
            </span>
          ))}
          {!showEventSearch && (
            <button className="mobile-task-sheet-add-event" onClick={() => setShowEventSearch(true)}>
              + Add
            </button>
          )}
        </div>

        {showEventSearch && (
          <div className="mobile-task-sheet-search-box">
            <input
              className="mobile-sheet-text-input"
              style={{ marginBottom: 4 }}
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
              placeholder="Search events…"
              autoFocus
            />
            <div className="mobile-task-sheet-results">
              {eventSearchResults.map((e) => (
                <button key={e.id} className="mobile-task-sheet-result-row" onClick={() => addEvent(e.id)}>
                  {e.name}
                </button>
              ))}
              {eventSearchResults.length === 0 && (
                <div className="mobile-task-sheet-no-results">No events found</div>
              )}
            </div>
            <button className="mobile-task-sheet-cancel-search"
              onClick={() => { setShowEventSearch(false); setEventSearch(''); }}>
              Cancel
            </button>
          </div>
        )}

        {/* ── DUE DATE / TIME ── */}
        <div className="mobile-sheet-section-label">DUE DATE / TIME</div>

        <div className="mobile-seg-ctrl" style={{ marginBottom: 12 }}>
          <button
            className={`mobile-seg-opt${dueMode === 'absolute' ? ' mobile-seg-opt--active' : ''}`}
            onClick={() => setDueMode('absolute')}
          >
            Absolute
          </button>
          <button
            className={`mobile-seg-opt${dueMode === 'relative' ? ' mobile-seg-opt--active' : ''}`}
            onClick={() => setDueMode('relative')}
          >
            Event Relative
          </button>
        </div>

        {dueMode === 'absolute' && (
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <div className="mobile-sheet-date-row" style={{ pointerEvents: 'none' }}>
              <CalendarIcon />
              <span className="mobile-sheet-row__value">{deadlineDisplay}</span>
            </div>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                right: deadline ? 44 : 0,
                opacity: 0, cursor: 'pointer', zIndex: 1,
              }}
            />
            {deadline && (
              <button
                className="mobile-sheet-clear-btn"
                onClick={() => setDeadline('')}
                aria-label="Clear due date"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {dueMode === 'relative' && (
          <div className="mobile-task-sheet-relative">
            {/* Event selector */}
            {!showRelSearch ? (
              <button
                className="mobile-sheet-date-row mobile-task-sheet-rel-event-btn"
                onClick={() => setShowRelSearch(true)}
              >
                <CalendarIcon />
                <span className="mobile-sheet-row__value" style={{ color: relEvent ? 'var(--text-primary)' : undefined }}>
                  {relEvent ? relEvent.name : 'Select event…'}
                </span>
              </button>
            ) : (
              <div className="mobile-task-sheet-search-box">
                <input
                  className="mobile-sheet-text-input"
                  style={{ marginBottom: 4 }}
                  value={relSearch}
                  onChange={(e) => setRelSearch(e.target.value)}
                  placeholder="Search events…"
                  autoFocus
                />
                <div className="mobile-task-sheet-results">
                  {relSearchResults.map((e) => (
                    <button key={e.id} className="mobile-task-sheet-result-row" onClick={() => pickRelEvent(e.id)}>
                      {e.name}
                    </button>
                  ))}
                  {relSearchResults.length === 0 && (
                    <div className="mobile-task-sheet-no-results">No events found</div>
                  )}
                </div>
                <button className="mobile-task-sheet-cancel-search"
                  onClick={() => { setShowRelSearch(false); setRelSearch(''); }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Before / After */}
            <div className="mobile-seg-ctrl">
              <button
                className={`mobile-seg-opt${relModifier === 'before' ? ' mobile-seg-opt--active' : ''}`}
                onClick={() => setRelModifier('before')}
              >
                Before
              </button>
              <button
                className={`mobile-seg-opt${relModifier === 'after' ? ' mobile-seg-opt--active' : ''}`}
                onClick={() => setRelModifier('after')}
              >
                After
              </button>
            </div>

            {/* Amount + unit */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="mobile-sheet-text-input"
                style={{ width: 72, marginBottom: 0, textAlign: 'center' }}
                type="number"
                min="1"
                value={relAmount}
                onChange={(e) => setRelAmount(e.target.value)}
                placeholder="1"
              />
              <div className="mobile-seg-ctrl" style={{ flex: 1, margin: 0 }}>
                {UNITS.map((u) => (
                  <button
                    key={u.value}
                    className={`mobile-seg-opt${relUnit === u.value ? ' mobile-seg-opt--active' : ''}`}
                    onClick={() => setRelUnit(u.value)}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mobile-sheet-actions">
          <button
            className="mobile-sheet-btn mobile-sheet-btn--primary"
            onClick={handleSave}
            disabled={saving || !text.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

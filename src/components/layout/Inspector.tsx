import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../stores/useAppStore';
import {
  ClockIcon,
  UsersIcon,
  DocumentIcon,
  PencilIcon,
  PlusIcon,
} from '../icons/Icons';
import { Checkbox } from '../shared/Checkbox';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { NoteTile } from '../notes/NoteTile';
import { cleanTaskDisplay, getTaskTags } from '../../utils/taskFormatting';
import { formatEventDate, formatEventTime } from '../../utils/dateFormatting';
import { toggleTask, createNote, createTask } from '../../api';
import { EventEditModal } from '../calendar/EventEditModal';
import { TaskModal } from '../tasks/TaskModal';


interface InspectorProps {
  isVisible: boolean;
}

export function Inspector({ isVisible }: InspectorProps) {
  const navigate = useNavigate();
  const selectedEvent = useAppStore((state) => state.selectedEvent);
  const setSelectedNote = useAppStore((state) => state.setSelectedNote);
  const setReturnView = useAppStore((state) => state.setReturnView);
  const notes = useAppStore((state) => state.notes);
  const tasks = useAppStore((state) => state.tasks);
  const [editingEvent, setEditingEvent] = useState(false);

  const linkedNotes = selectedEvent
    ? notes.filter((n) => n.event_ids.includes(selectedEvent.id))
    : [];

  const linkedTasks = selectedEvent
    ? tasks.filter((t) => t.event_ids.includes(selectedEvent.id))
    : [];

  if (!isVisible) return null;

  return (
    <>
      <div className="right-column">
        <InspectorContent
          selectedEvent={selectedEvent}
          linkedNotes={linkedNotes}
          linkedTasks={linkedTasks}
          editingEvent={editingEvent}
          setEditingEvent={setEditingEvent}
          navigate={navigate}
          setSelectedNote={setSelectedNote}
          setReturnView={setReturnView}
        />
      </div>

      {editingEvent && selectedEvent && selectedEvent.metadata?.source_platform !== 'google_calendar' && (
        <EventEditModal event={selectedEvent} onClose={() => setEditingEvent(false)} />
      )}
    </>
  );
}

function InspectorContent({
  selectedEvent,
  linkedNotes,
  linkedTasks,
  editingEvent,
  setEditingEvent,
  navigate,
  setSelectedNote,
  setReturnView,
}: {
  selectedEvent: ReturnType<typeof useAppStore.getState>['selectedEvent'];
  linkedNotes: ReturnType<typeof useAppStore.getState>['notes'];
  linkedTasks: ReturnType<typeof useAppStore.getState>['tasks'];
  editingEvent: boolean;
  setEditingEvent: (v: boolean) => void;
  navigate: ReturnType<typeof useNavigate>;
  setSelectedNote: ReturnType<typeof useAppStore.getState>['setSelectedNote'];
  setReturnView: ReturnType<typeof useAppStore.getState>['setReturnView'];
}) {
  const setPendingFocusTask = useAppStore((state) => state.setPendingFocusTask);
  const events = useAppStore((state) => state.events);
  const [editProhibited, setEditProhibited] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [isCreatingNote, setIsCreatingNote] = useState(false);

  const handleCreateNote = async () => {
    if (!selectedEvent || isCreatingNote) return;
    setIsCreatingNote(true);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const note = await createNote(`note-${ts}`, '', [selectedEvent.id]);
      setSelectedNote(note);
      setReturnView('/calendar');
      navigate('/notes');
    } catch (err) {
      console.error('Failed to create note:', err);
    } finally {
      setIsCreatingNote(false);
    }
  };

  return (
    <>
      <div className="island-pane context-inspector">
        <div className="section-header-row">
          <div className="section-label">CONTEXT INSPECTOR</div>
        </div>

        {selectedEvent ? (
          <div className="inspector-content">
            <div className="inspector-title-row">
              <h2 className="inspector-title">{selectedEvent.name}</h2>
              <button
                className="inspector-edit-btn"
                title="Edit event"
                onClick={() => {
                  if (selectedEvent?.metadata?.source_platform === 'google_calendar') {
                    setEditProhibited(true);
                  } else {
                    setEditingEvent(true);
                  }
                }}
              >
                <PencilIcon />
              </button>
            </div>

            <div className="inspector-details">
              <div className="detail-row">
                <ClockIcon />
                <span>
                  {formatEventDate(selectedEvent.from_)}{" "}
                  {formatEventTime(selectedEvent.from_)}
                  {" – "}
                  {formatEventTime(selectedEvent.to)}
                </span>
              </div>
              {selectedEvent.participants.length > 0 && (
                <div className="detail-row">
                  <UsersIcon />
                  <span>{selectedEvent.participants.join(", ")}</span>
                </div>
              )}
              {selectedEvent.description && (
                <div className="detail-row">
                  <DocumentIcon />
                  <span>{selectedEvent.description}</span>
                </div>
              )}
              {selectedEvent.metadata?.source_platform === 'google_calendar' && (
                <div className="detail-row source-info">
                  <span className="source-badge">🔗 Google Calendar</span>
                  {selectedEvent.metadata?.source_account && (
                    <span className="source-account">{selectedEvent.metadata.source_account}</span>
                  )}
                </div>
              )}
            </div>

            {editProhibited && selectedEvent && (
              <ConfirmDialog
                title="Edit Disabled"
                message="This event was imported from Google Calendar and must be edited there."
                confirmLabel="OK"
                cancelLabel="Close"
                onConfirm={() => setEditProhibited(false)}
                onCancel={() => setEditProhibited(false)}
              />
            )}
          </div>
        ) : (
          <div className="inspector-content">
            <p style={{ color: "var(--text-tertiary)" }}>Select an event to inspect</p>
          </div>
        )}
      </div>

      {selectedEvent && (
        <div className="island-pane linked-tasks-pane">
          <div className="section-header-row">
            <div className="section-label">LINKED NOTES</div>
            <button
              className="icon-btn icon-btn--accent"
              onClick={handleCreateNote}
              disabled={isCreatingNote}
              aria-label="New linked note"
              title="New linked note"
            >
              <PlusIcon />
            </button>
          </div>
          {linkedNotes.length > 0 ? (
            <div className="notes-grid notes-grid--compact">
              {linkedNotes.map((n) => (
                <NoteTile
                  key={n.filename}
                  note={n}
                  onOpen={() => {
                    setSelectedNote(n);
                    setReturnView('/calendar');
                    navigate('/notes');
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="linked-empty-hint">No linked notes yet</p>
          )}
        </div>
      )}

      {selectedEvent && (
        <div className="island-pane linked-tasks-pane">
          <div className="section-header-row">
            <div className="section-label">LINKED TASKS</div>
            <button
              className="icon-btn icon-btn--accent"
              onClick={() => setShowTaskModal(true)}
              aria-label="New linked task"
              title="New linked task"
            >
              <PlusIcon />
            </button>
          </div>
          {linkedTasks.length > 0 ? (
            <div className="task-groups">
              {linkedTasks.map((t) => {
                const { hasDeadline } = getTaskTags(t);
                const otherEventTags = (t.event_ids ?? [])
                  .filter((eid) => eid !== selectedEvent.id)
                  .map((eid) => ({
                    id: eid,
                    name: t.resolved_event_names?.[eid]
                      || events.find((e) => e.id === eid)?.name
                      || eid,
                  }));
                return (
                  <div
                    key={`${t.source_file}:${t.line_number}`}
                    className="task-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setPendingFocusTask({ source_file: t.source_file, line_number: t.line_number });
                      navigate('/tasks');
                    }}
                  >
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={t.completed}
                        onChange={() => toggleTask(t.source_file, t.line_number).catch(console.error)}
                      />
                    </div>
                    <div className="task-content">
                      <span className={`task-text${t.completed ? ' completed' : ''}`}>
                        {cleanTaskDisplay(t)}
                      </span>
                      {(hasDeadline || otherEventTags.length > 0) && (
                        <div className="task-tags">
                          {hasDeadline && (
                            <span className="task-tag task-tag--deadline">
                              <ClockIcon />
                              {formatEventDate(t.deadline!)} {formatEventTime(t.deadline!)}
                            </span>
                          )}
                          {otherEventTags.map((tag) => (
                            <span key={tag.id} className="task-tag task-tag--event">
                              @{tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="linked-empty-hint">No linked tasks yet</p>
          )}
        </div>
      )}

      {editingEvent && selectedEvent && selectedEvent.metadata?.source_platform !== 'google_calendar' && (
        <EventEditModal event={selectedEvent} onClose={() => setEditingEvent(false)} />
      )}

      {showTaskModal && (
        <TaskModal
          title="New Task"
          submitLabel="Create"
          initialEventIds={selectedEvent ? [selectedEvent.id] : []}
          onSave={async (fullText) => { await createTask(fullText); }}
          onClose={() => setShowTaskModal(false)}
        />
      )}
    </>
  );
}

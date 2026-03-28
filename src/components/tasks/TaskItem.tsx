import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskEntity } from '../../types';
import { Checkbox } from '../shared/Checkbox';
import { ClockIcon, LinkIcon } from '../icons/Icons';
import { cleanTaskDisplay, getTaskTags } from '../../utils/taskFormatting';
import { formatEventDate, formatEventTime } from '../../utils/dateFormatting';
import { toggleTask, updateTask, deleteTask } from '../../api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppStore } from '../../stores/useAppStore';
import { useCalendarStore } from '../../stores/useCalendarStore';
import { TaskModal } from './TaskModal';

interface TaskItemProps {
  task: TaskEntity;
  /** When provided, clicking the item calls this instead of opening the edit modal. */
  onNavigate?: () => void;
  /** Show a red "Overdue" chip on the task. */
  overdue?: boolean;
}

export function TaskItem({ task, onNavigate, overdue }: TaskItemProps) {
  const display = cleanTaskDisplay(task);
  const { eventTags, projectTags, hasDeadline } = getTaskTags(task);
  const notes = useAppStore((state) => state.notes);
  const allTasks = useAppStore((state) => state.tasks);
  const events = useAppStore((state) => state.events);
  const setSelectedNote = useAppStore((state) => state.setSelectedNote);
  const setSelectedEvent = useAppStore((state) => state.setSelectedEvent);
  const setHighlightEventId = useAppStore((state) => state.setHighlightEventId);
  const goToDate = useCalendarStore((state) => state.goToDate);
  const setFocusLine = useAppStore((state) => state.setFocusLine);
  const pendingFocusTask = useAppStore((state) => state.pendingFocusTask);
  const setPendingFocusTask = useAppStore((state) => state.setPendingFocusTask);
  const navigate = useNavigate();

  // Which event IDs appear literally as @id tokens in the task text (vs. inherited from note frontmatter)
  const ownEventIdsInText = (task.event_ids ?? []).filter((eid) =>
    new RegExp(`@${eid}(?=[^a-z0-9-]|$)`).test(task.text)
  );
  // Event IDs inherited from the note's frontmatter (can't be removed from here)
  const inheritedEventIds = (task.event_ids ?? []).filter((eid) => !ownEventIdsInText.includes(eid));
  const isStandalone = task.source_file === 'tasks.md';

  // Source label: note title, or "Standalone" for tasks.md tasks
  const sourceLabel = useMemo(() => {
    if (task.source_file === 'tasks.md') return 'Standalone';
    if (task.source_file.startsWith('notes/')) {
      const filename = task.source_file.replace(/^notes\//, '');
      const note = notes.find((n) => n.filename === filename);
      return note?.title || filename.replace(/\.md$/, '');
    }
    return task.source_file.replace(/^(projects|notes)\//, '').replace(/\.md$/, '');
  }, [task.source_file, notes]);

  const hasTags = eventTags.length > 0 || projectTags.length > 0 || hasDeadline;

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openEdit = onNavigate ?? (() => setEditing(true));
  const itemRef = useRef<HTMLDivElement>(null);

  // Focus and scroll into view when selected from command palette or Inspector.
  // Skip when onNavigate is set — those items are triggers, not targets.
  useEffect(() => {
    if (onNavigate) return;
    if (!pendingFocusTask) return;
    if (pendingFocusTask.source_file === task.source_file && pendingFocusTask.line_number === task.line_number) {
      itemRef.current?.focus();
      itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingFocusTask(null);
    }
  }, [onNavigate, pendingFocusTask, task.source_file, task.line_number, setPendingFocusTask]);


  const handleToggle = async () => {
    try {
      await toggleTask(task.source_file, task.line_number);
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTask(task.source_file, task.line_number);
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
    setConfirmDelete(false);
    setEditing(false);
  };

  const handleGoToSource = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.source_file.startsWith('notes/')) {
      const noteFilename = task.source_file.replace(/^notes\//, '');
      const note = notes.find((n) => n.filename === noteFilename);
      if (note) {
        const noteTasks = allTasks
          .filter((t) => t.source_file === task.source_file)
          .sort((a, b) => a.line_number - b.line_number);
        const taskIdx = noteTasks.findIndex((t) => t.line_number === task.line_number);
        setFocusLine(taskIdx >= 0 ? taskIdx : 0);
        setSelectedNote(note);
        navigate('/notes');
      }
    }
  };

  return (
    <>
      <div
        ref={itemRef}
        className="task-item"
        tabIndex={0}
        onClick={openEdit}
        onKeyDown={(e) => {
          if (e.key === ' ') { e.preventDefault(); handleToggle(); }
          else if (e.key === 'Enter') { e.preventDefault(); openEdit(); }
        }}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={task.completed} onChange={handleToggle} />
        </div>
        <div className="task-content">
          <span className={`task-text${task.completed ? ' completed' : ''}`}>
            {display}
          </span>
          {(hasTags || overdue) && (
            <div className="task-tags">
              {overdue && (
                <span className="task-tag task-tag--overdue">Overdue</span>
              )}
              {eventTags.map((tag) => (
                <button
                  key={tag.id}
                  className="task-tag task-tag--event task-tag--link"
                  onClick={(e) => {
                    e.stopPropagation();
                    const event = events.find((ev) => ev.id === tag.id);
                    if (event) {
                      setSelectedEvent(event);
                      setHighlightEventId(event.id);
                      goToDate(new Date(event.from_));
                      navigate('/calendar');
                    }
                  }}
                  title={`Go to event: ${tag.name}`}
                >
                  @{tag.name}
                </button>
              ))}
              {projectTags.map((tag) => (
                <span key={tag.id} className="task-tag task-tag--project">
                  #{tag.name}
                </span>
              ))}
              {hasDeadline && (
                <span className="task-tag task-tag--deadline">
                  <ClockIcon />
                  {formatEventDate(task.deadline!)} {formatEventTime(task.deadline!)}
                </span>
              )}
            </div>
          )}
        </div>
        {sourceLabel && !isStandalone && (
          <button
            className="task-source-label"
            onClick={handleGoToSource}
            title={`Go to ${task.source_file}`}
          >
            <LinkIcon />
            {sourceLabel}
          </button>
        )}
        {sourceLabel && isStandalone && (
          <span className="task-source-label task-source-label--static">{sourceLabel}</span>
        )}
      </div>

      {editing && (
        <TaskModal
          title="Edit Task"
          submitLabel="Save"
          initialText={display}
          initialEventIds={[...ownEventIdsInText]}
          initialDeadline={task.deadline ? task.deadline.slice(0, 16) : ''}
          inheritedEventIds={inheritedEventIds}
          onSave={(fullText) => updateTask(task.source_file, task.line_number, fullText)}
          onDelete={() => setConfirmDelete(true)}
          onClose={() => setEditing(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete task"
          message={`"${display}" will be permanently deleted.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

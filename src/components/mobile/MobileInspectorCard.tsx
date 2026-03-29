import { EventEntity, TaskEntity, NoteEntity } from '../../api';
import { Checkbox } from '../shared/Checkbox';
import { toggleTask } from '../../api';
import { formatEventDate, formatEventTime } from '../../utils/dateFormatting';
import { PencilIcon, PlusIcon } from '../icons/Icons';
import { cleanTaskDisplay } from '../../utils/taskFormatting';

interface MobileInspectorCardProps {
  event: EventEntity;
  linkedTasks: TaskEntity[];
  linkedNotes: NoteEntity[];
  onEditEvent?: () => void;
  onNewTask?: () => void;
  onOpenNote?: (note: NoteEntity) => void;
  onNewNote?: () => void;
}

export function MobileInspectorCard({
  event,
  linkedTasks,
  linkedNotes,
  onEditEvent,
  onNewTask,
  onOpenNote,
  onNewNote,
}: MobileInspectorCardProps) {
  const isEditable = event.source !== 'google';

  const timeLabel = `${formatEventDate(event.from_)} ${formatEventTime(event.from_)} – ${formatEventDate(event.to)} ${formatEventTime(event.to)}`;

  return (
    <div className="mobile-inspector-card">
      <div className="mobile-inspector-card__event-header">
        <div className="mobile-inspector-card__event-dot" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mobile-inspector-card__event-name">{event.name}</div>
          <div className="mobile-inspector-card__event-meta">
            {timeLabel} · {event.source}
          </div>
        </div>
        {isEditable && onEditEvent && (
          <button
            className="mobile-inspector-card__edit-btn"
            onClick={onEditEvent}
            aria-label="Edit event"
          >
            <PencilIcon />
          </button>
        )}
      </div>

      {/* Linked tasks */}
      <div className="mobile-inspector-section-label">LINKED TASKS</div>
      {linkedTasks.map((task, i) => (
        <div
          key={`${task.source_file}:${task.line_number}:${i}`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}
        >
          <Checkbox
            checked={task.completed}
            onChange={() => toggleTask(task.source_file, task.line_number)}
          />
          <span style={{ fontSize: 13, color: task.completed ? 'var(--text-tertiary)' : 'var(--text-primary)', textDecoration: task.completed ? 'line-through' : 'none', flex: 1 }}>
            {cleanTaskDisplay(task)}
          </span>
        </div>
      ))}
      {onNewTask && (
        <button className="mobile-inspector-add-row" onClick={onNewTask}>
          <PlusIcon /> <span>New task</span>
        </button>
      )}

      {/* Linked notes */}
      <div className="mobile-inspector-section-label" style={{ marginTop: 12 }}>LINKED NOTES</div>
      {linkedNotes.map((note) => (
        <div
          key={note.filename}
          className="mobile-inspector-note-row"
          onClick={() => onOpenNote?.(note)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onOpenNote?.(note); }}
        >
          <span className="mobile-inspector-note-title">{note.title || note.filename}</span>
          {note.body_preview && (
            <span className="mobile-inspector-note-preview">{note.body_preview}</span>
          )}
        </div>
      ))}
      {onNewNote && (
        <button className="mobile-inspector-add-row" onClick={onNewNote}>
          <PlusIcon /> <span>New note</span>
        </button>
      )}
    </div>
  );
}

import { TaskEntity } from '../../api';
import { Checkbox } from '../shared/Checkbox';
import { cleanTaskDisplay, getTaskTags } from '../../utils/taskFormatting';
import { toggleTask } from '../../api';
import { formatEventDate, formatEventTime } from '../../utils/dateFormatting';

interface MobileTaskRowProps {
  task: TaskEntity;
  overdue?: boolean;
  onTap: () => void;
}

export function MobileTaskRow({ task, overdue, onTap }: MobileTaskRowProps) {
  const displayText = cleanTaskDisplay(task);
  const { eventTags, projectTags, hasDeadline } = getTaskTags(task);

  async function handleCheck(e: React.MouseEvent) {
    e.stopPropagation();
    await toggleTask(task.source_file, task.line_number);
  }

  const sourceLabel = task.resolved_event_names && Object.keys(task.resolved_event_names).length > 0
    ? undefined // already shown as event tags
    : task.source_file.split('/').pop()?.replace('.md', '') ?? 'Standalone';

  return (
    <div
      className={`mobile-task-row${overdue ? ' mobile-task-row--overdue' : ''}${task.completed ? ' mobile-task-row--done' : ''}`}
      onClick={onTap}
    >
      <div onClick={handleCheck} style={{ flexShrink: 0 }}>
        <Checkbox checked={task.completed} />
      </div>
      <div className="mobile-task-row__body">
        <span className={`mobile-task-row__text${task.completed ? ' mobile-task-row__text--done' : ''}`}>
          {displayText || task.text}
        </span>
        {(eventTags.length > 0 || projectTags.length > 0 || hasDeadline) && (
          <div className="mobile-task-row__tags">
            {hasDeadline && (
              <span className="mobile-task-tag mobile-task-tag--deadline">
                {formatEventDate(task.deadline!)} {formatEventTime(task.deadline!)}
              </span>
            )}
            {eventTags.map((t) => (
              <span key={t.id} className="mobile-task-tag mobile-task-tag--event">{t.name}</span>
            ))}
            {projectTags.map((t) => (
              <span key={t.id} className="mobile-task-tag mobile-task-tag--project">{t.name}</span>
            ))}
          </div>
        )}
      </div>
      {sourceLabel && (
        <span className="mobile-task-row__source">{sourceLabel}</span>
      )}
    </div>
  );
}

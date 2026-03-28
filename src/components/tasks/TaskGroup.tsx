import { useState } from 'react';
import { EventEntity, TaskEntity } from '../../types';
import { TaskItem } from './TaskItem';
import { formatEventDate, formatEventTime } from '../../utils/dateFormatting';
import { ChevronRightIcon, ChevronDownIcon } from '../icons/Icons';

interface TaskGroupProps {
  title: string;
  subtitle?: string;
  tasks: TaskEntity[];
}

export function TaskGroup({ title, subtitle, tasks }: TaskGroupProps) {
  return (
    <div className="task-group">
      <div className="task-category">
        {title}
        {subtitle && (
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>
            {subtitle}
          </span>
        )}
      </div>
      {tasks.map((task, i) => (
        <TaskItem key={i} task={task} />
      ))}
    </div>
  );
}

interface EventTaskGroupProps {
  event: EventEntity;
  tasks: TaskEntity[];
}

export function EventTaskGroup({ event, tasks }: EventTaskGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const subtitle = `${formatEventDate(event.from_)} ${formatEventTime(event.from_)}`;

  return (
    <div className="task-group">
      <button
        className="task-group-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="task-group-chevron">
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        </span>
        <span className="task-category" style={{ margin: 0 }}>{event.name}</span>
        <span className="task-group-subtitle">{subtitle}</span>
        <span className="task-group-count">{tasks.length}</span>
      </button>
      {!collapsed && tasks.map((task, i) => (
        <TaskItem key={i} task={task} />
      ))}
    </div>
  );
}

import { useState } from 'react';
import { EventEntity, TaskEntity } from '../../types';
import { EventTaskGroup, TaskGroup } from './TaskGroup';
import { EmptyState } from '../shared/EmptyState';
import { TaskItem } from './TaskItem';
import { ChevronRightIcon, ChevronDownIcon } from '../icons/Icons';

export type TasksViewMode = 'grouped' | 'timeline' | 'unscheduled';

interface TaskListProps {
  filteredEventsWithTasks: EventEntity[];
  filteredOtherTasks: TaskEntity[];
  timelineOverdueTasks: TaskEntity[];
  timelineScheduledTasks: TaskEntity[];
  timelineUnscheduledTasks: TaskEntity[];
  getTasksForEvent: (eventId: string) => TaskEntity[];
  viewMode: TasksViewMode;
}

function OverdueBlock({ tasks }: { tasks: TaskEntity[] }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="task-group task-group--overdue">
      <button
        className="task-group-header"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="task-group-chevron">
          {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
        </span>
        <span className="task-category" style={{ margin: 0 }}>Overdue</span>
        <span className="task-group-count">{tasks.length}</span>
      </button>
      {!collapsed && tasks.map((task, i) => (
        <TaskItem key={`${task.source_file}:${task.line_number}:${i}`} task={task} overdue />
      ))}
    </div>
  );
}

export function TaskList({
  filteredEventsWithTasks,
  filteredOtherTasks,
  timelineOverdueTasks,
  timelineScheduledTasks,
  timelineUnscheduledTasks,
  getTasksForEvent,
  viewMode,
}: TaskListProps) {
  if (viewMode === 'timeline') {
    const hasOverdue = timelineOverdueTasks.length > 0;
    const hasScheduled = timelineScheduledTasks.length > 0;

    if (!hasOverdue && !hasScheduled) return <EmptyState message="No scheduled tasks" />;

    return (
      <div className="tasks-list tasks-list--timeline">
        <div className="timeline-scheduled-pane">
          {hasOverdue && <OverdueBlock tasks={timelineOverdueTasks} />}
          {hasScheduled ? (
            timelineScheduledTasks.map((task, i) => (
              <TaskItem key={`${task.source_file}:${task.line_number}:${i}`} task={task} />
            ))
          ) : (
            <p className="timeline-scheduled-empty">No scheduled tasks</p>
          )}
        </div>
      </div>
    );
  }

  if (viewMode === 'unscheduled') {
    if (timelineUnscheduledTasks.length === 0) return <EmptyState message="No unscheduled tasks" />;
    return (
      <div className="tasks-list">
        {timelineUnscheduledTasks.map((task, i) => (
          <TaskItem key={`${task.source_file}:${task.line_number}:${i}`} task={task} />
        ))}
      </div>
    );
  }

  // Grouped view — exclude tasks with no scheduling info (those belong to unscheduled view)
  const scheduledOtherTasks = filteredOtherTasks.filter((t) => !!t.deadline);
  const isEmpty = filteredEventsWithTasks.length === 0 && scheduledOtherTasks.length === 0;
  if (isEmpty) return <EmptyState message="No tasks yet" />;

  return (
    <div className="tasks-list">
      {filteredEventsWithTasks.map((event) => {
        const eventTasks = getTasksForEvent(event.id);
        if (eventTasks.length === 0) return null;
        return (
          <EventTaskGroup
            key={event.id}
            event={event}
            tasks={eventTasks}
          />
        );
      })}
      {scheduledOtherTasks.length > 0 && (
        <TaskGroup
          title="Other Tasks"
          tasks={scheduledOtherTasks}
        />
      )}
    </div>
  );
}


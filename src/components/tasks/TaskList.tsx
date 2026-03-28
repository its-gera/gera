import { useRef, useState } from 'react';
import { EventEntity, TaskEntity } from '../../types';
import { EventTaskGroup, TaskGroup } from './TaskGroup';
import { EmptyState } from '../shared/EmptyState';
import { TaskItem } from './TaskItem';
import { SearchInput } from '../shared/SearchInput';
import { ChevronRightIcon, ChevronDownIcon } from '../icons/Icons';

export type TasksViewMode = 'grouped' | 'timeline';

interface TaskListProps {
  filteredEventsWithTasks: EventEntity[];
  filteredOtherTasks: TaskEntity[];
  timelineOverdueTasks: TaskEntity[];
  timelineScheduledTasks: TaskEntity[];
  timelineUnscheduledTasks: TaskEntity[];
  getTasksForEvent: (eventId: string) => TaskEntity[];
  viewMode: TasksViewMode;
}

const UNSCHEDULED_HEIGHT_KEY = 'gera:unscheduled-block-height';
const UNSCHEDULED_HEIGHT_DEFAULT = 220;
const UNSCHEDULED_HEIGHT_MIN = 80;
const UNSCHEDULED_HEIGHT_MAX = 0.8; // fraction of window height

/** Separately scrollable + searchable block for unscheduled tasks at the bottom of Timeline. */
function UnscheduledTasksBlock({ tasks }: { tasks: TaskEntity[] }) {
  const [search, setSearch] = useState('');
  const filtered = tasks.filter(
    (t) => !search || t.text.toLowerCase().includes(search.toLowerCase())
  );

  const [height, setHeight] = useState(() => {
    const stored = localStorage.getItem(UNSCHEDULED_HEIGHT_KEY);
    return stored ? parseInt(stored, 10) : UNSCHEDULED_HEIGHT_DEFAULT;
  });
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startHeight: height };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta = dragState.current.startY - e.clientY; // drag up → positive → taller
    const clamped = Math.round(Math.max(
      UNSCHEDULED_HEIGHT_MIN,
      Math.min(window.innerHeight * UNSCHEDULED_HEIGHT_MAX, dragState.current.startHeight + delta),
    ));
    setHeight(clamped);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta = dragState.current.startY - e.clientY;
    const clamped = Math.round(Math.max(
      UNSCHEDULED_HEIGHT_MIN,
      Math.min(window.innerHeight * UNSCHEDULED_HEIGHT_MAX, dragState.current.startHeight + delta),
    ));
    localStorage.setItem(UNSCHEDULED_HEIGHT_KEY, String(clamped));
    dragState.current = null;
  };

  return (
    <div className="unscheduled-block" style={{ height: `${height}px` }}>
      {/* Drag handle — grab and drag upward to expand, downward to shrink */}
      <div
        className="unscheduled-drag-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragState.current = null; }}
        aria-label="Resize unscheduled panel"
        role="separator"
        aria-orientation="horizontal"
      />
      <div className="unscheduled-block-header">
        <span className="task-category" style={{ margin: 0 }}>Unscheduled</span>
        <span className="unscheduled-block-count">{tasks.length}</span>
      </div>
      <div className="unscheduled-block-search">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search unscheduled…"
          className="unscheduled-search-input"
        />
      </div>
      <div className="unscheduled-block-scroll">
        {filtered.length === 0 ? (
          <p className="unscheduled-block-empty">No matching tasks</p>
        ) : (
          filtered.map((task, i) => (
            <TaskItem key={`${task.source_file}:${task.line_number}:${i}`} task={task} />
          ))
        )}
      </div>
    </div>
  );
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
    const hasUnscheduled = timelineUnscheduledTasks.length > 0;

    if (!hasOverdue && !hasScheduled && !hasUnscheduled) return <EmptyState message="No tasks yet" />;

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
        {hasUnscheduled && (
          <UnscheduledTasksBlock tasks={timelineUnscheduledTasks} />
        )}
      </div>
    );
  }

  // Grouped view
  const isEmpty = filteredEventsWithTasks.length === 0 && filteredOtherTasks.length === 0;
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
      {filteredOtherTasks.length > 0 && (
        <TaskGroup
          title="Other Tasks"
          tasks={filteredOtherTasks}
        />
      )}
    </div>
  );
}


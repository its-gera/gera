import { useState } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { useTaskFiltering } from '../../hooks/useTaskFiltering';
import { TaskEntity } from '../../api';
import { MobilePageHeader } from './MobilePageHeader';
import { MobileTaskRow } from './MobileTaskRow';
import { MobileTaskEditSheet } from './MobileTaskEditSheet';
import { PlusIcon } from '../icons/Icons';

type MobileTasksTab = 'timeline' | 'grouped' | 'unscheduled';

export function MobileTasksView() {
  const events = useAppStore((s) => s.events);
  const tasks = useAppStore((s) => s.tasks);
  const tasksSearch = useAppStore((s) => s.tasksSearch);
  const setTasksSearch = useAppStore((s) => s.setTasksSearch);

  const [tab, setTab] = useState<MobileTasksTab>('timeline');
  const [editTask, setEditTask] = useState<TaskEntity | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);

  const {
    filteredEventsWithTasks,
    filteredOtherTasks,
    timelineOverdueTasks,
    timelineScheduledTasks,
    timelineUnscheduledTasks,
    getTasksForEvent,
  } = useTaskFiltering(tasks, events, tasksSearch);

  function openNew() {
    setEditTask(undefined);
    setSheetOpen(true);
  }

  function openEdit(task: TaskEntity) {
    setEditTask(task);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditTask(undefined);
  }

  const scheduledOtherTasks = filteredOtherTasks.filter((t) => !!t.deadline);

  return (
    <div className="mobile-tasks-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MobilePageHeader label="TASKS" />

      {/* Segmented control */}
      <div style={{ padding: '0 16px 8px' }}>
        <div className="mobile-seg-ctrl">
          <button
            className={`mobile-seg-opt${tab === 'timeline' ? ' mobile-seg-opt--active' : ''}`}
            onClick={() => setTab('timeline')}
          >
            Timeline
          </button>
          <button
            className={`mobile-seg-opt${tab === 'grouped' ? ' mobile-seg-opt--active' : ''}`}
            onClick={() => setTab('grouped')}
          >
            By Event
          </button>
          <button
            className={`mobile-seg-opt${tab === 'unscheduled' ? ' mobile-seg-opt--active' : ''}`}
            onClick={() => setTab('unscheduled')}
          >
            Unscheduled
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px 8px' }}>
        <input
          className="mobile-search-input"
          value={tasksSearch}
          onChange={(e) => setTasksSearch(e.target.value)}
          placeholder="Search by event or project"
        />
      </div>

      {/* Content */}
      <div className="mobile-scroll-content" style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'timeline' && (
          <>
            {timelineOverdueTasks.length > 0 && (
              <>
                <div className="mobile-section-label">
                  OVERDUE
                  <span className="mobile-section-count mobile-section-count--overdue">
                    {timelineOverdueTasks.length}
                  </span>
                </div>
                {timelineOverdueTasks.map((task, i) => (
                  <MobileTaskRow
                    key={`${task.source_file}:${task.line_number}:${i}`}
                    task={task}
                    overdue
                    onTap={() => openEdit(task)}
                  />
                ))}
              </>
            )}
            {timelineScheduledTasks.length > 0 && (
              <>
                <div className="mobile-section-label">UPCOMING</div>
                {timelineScheduledTasks.map((task, i) => (
                  <MobileTaskRow
                    key={`${task.source_file}:${task.line_number}:${i}`}
                    task={task}
                    onTap={() => openEdit(task)}
                  />
                ))}
              </>
            )}
            {timelineOverdueTasks.length === 0 && timelineScheduledTasks.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                No scheduled tasks
              </div>
            )}
          </>
        )}

        {tab === 'grouped' && (
          <>
            {filteredEventsWithTasks.map((event) => {
              const eventTasks = getTasksForEvent(event.id);
              if (eventTasks.length === 0) return null;
              return (
                <div key={event.id}>
                  <div className="mobile-section-label">
                    {event.name}
                    <span className="mobile-section-count">{eventTasks.length}</span>
                  </div>
                  {eventTasks.map((task, i) => (
                    <MobileTaskRow
                      key={`${task.source_file}:${task.line_number}:${i}`}
                      task={task}
                      onTap={() => openEdit(task)}
                    />
                  ))}
                </div>
              );
            })}
            {scheduledOtherTasks.length > 0 && (
              <div>
                <div className="mobile-section-label">
                  OTHER TASKS
                  <span className="mobile-section-count">{scheduledOtherTasks.length}</span>
                </div>
                {scheduledOtherTasks.map((task, i) => (
                  <MobileTaskRow
                    key={`${task.source_file}:${task.line_number}:${i}`}
                    task={task}
                    onTap={() => openEdit(task)}
                  />
                ))}
              </div>
            )}
            {filteredEventsWithTasks.length === 0 && scheduledOtherTasks.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                No tasks yet
              </div>
            )}
          </>
        )}

        {tab === 'unscheduled' && (
          <>
            {timelineUnscheduledTasks.length > 0
              ? timelineUnscheduledTasks.map((task, i) => (
                  <MobileTaskRow
                    key={`${task.source_file}:${task.line_number}:${i}`}
                    task={task}
                    onTap={() => openEdit(task)}
                  />
                ))
              : (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
                  No unscheduled tasks
                </div>
              )
            }
          </>
        )}
      </div>

      {/* FAB */}
      <button
        className="mobile-fab"
        onClick={openNew}
        aria-label="New task"
      >
        <PlusIcon />
      </button>

      {sheetOpen && (
        <MobileTaskEditSheet task={editTask} onClose={closeSheet} />
      )}
    </div>
  );
}

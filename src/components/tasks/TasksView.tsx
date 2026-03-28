import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { useTaskFiltering } from '../../hooks/useTaskFiltering';
import { createTask } from '../../api';
import { SearchInput } from '../shared/SearchInput';
import { TaskList, TasksViewMode } from './TaskList';
import { PlusIcon } from '../icons/Icons';
import { TaskModal } from './TaskModal';

interface TasksViewProps {}

export function TasksView({}: TasksViewProps) {
  const events = useAppStore((state) => state.events);
  const tasks = useAppStore((state) => state.tasks);
  const tasksSearch = useAppStore((state) => state.tasksSearch);
  const setTasksSearch = useAppStore((state) => state.setTasksSearch);
  const pendingCreate = useAppStore((state) => state.pendingCreate);
  const setPendingCreate = useAppStore((state) => state.setPendingCreate);
  const searchFocusTrigger = useAppStore((state) => state.searchFocusTrigger);

  const pendingFocusTask = useAppStore((state) => state.pendingFocusTask);

  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState<TasksViewMode>('timeline');

  useEffect(() => {
    if (pendingCreate === 'task') {
      setShowModal(true);
      setPendingCreate(null);
    }
  }, [pendingCreate, setPendingCreate]);

  // When navigating to a specific task, clear any filter and switch to timeline
  // so the task is guaranteed to be rendered and TaskItem can focus it.
  useEffect(() => {
    if (!pendingFocusTask) return;
    if (tasksSearch) setTasksSearch('');
    setViewMode('timeline');
  }, [pendingFocusTask]);

  const { filteredEventsWithTasks, filteredOtherTasks, timelineOverdueTasks, timelineScheduledTasks, timelineUnscheduledTasks, getTasksForEvent } =
    useTaskFiltering(tasks, events, tasksSearch);

  return (
    <div className="tasks-view">
      <div className="tasks-header">
        <div className="section-header-row">
          <div className="section-label">TASKS</div>
          <div className="tasks-view-toggle">
            <button
              className={`tasks-view-toggle-btn${viewMode === 'timeline' ? ' active' : ''}`}
              onClick={() => setViewMode('timeline')}
            >
              Timeline
            </button>
            <button
              className={`tasks-view-toggle-btn${viewMode === 'grouped' ? ' active' : ''}`}
              onClick={() => setViewMode('grouped')}
            >
              By Event
            </button>
          </div>
          <button
            className="icon-btn icon-btn--accent"
            onClick={() => setShowModal(true)}
            aria-label="New task"
            title="New task"
          >
            <PlusIcon />
          </button>
        </div>
        <SearchInput
          value={tasksSearch}
          onChange={setTasksSearch}
          placeholder="Search by event or project"
          className="tasks-search"
          focusTrigger={searchFocusTrigger}
        />
      </div>
      <TaskList
        filteredEventsWithTasks={filteredEventsWithTasks}
        filteredOtherTasks={filteredOtherTasks}
        timelineOverdueTasks={timelineOverdueTasks}
        timelineScheduledTasks={timelineScheduledTasks}
        timelineUnscheduledTasks={timelineUnscheduledTasks}
        getTasksForEvent={getTasksForEvent}
        viewMode={viewMode}
      />

      {showModal && (
        <TaskModal
          title="New Task"
          submitLabel="Create"
          onSave={async (fullText) => { await createTask(fullText); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

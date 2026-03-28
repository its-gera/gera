import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { EventEntity, TaskEntity, searchTasks } from '../api';
import { getTaskDedupeKey, deduplicate } from '../utils/deduplication';

/** Convert a time-reference unit+amount to milliseconds. */
function unitToMs(amount: number, unit: string): number {
  const table: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    W: 604_800_000,
    M: 2_592_000_000,
    Y: 31_536_000_000,
  };
  return (table[unit] ?? 86_400_000) * amount;
}

/**
 * Return the effective scheduled timestamp for a task, or null if unscheduled.
 *
 * Priority:
 *  1. Absolute deadline  (@YYYY-MM-DDTHH:MM stored in task.deadline)
 *  2. Relative time references  (@before[2d]:event-id → event.from_ − 2d)
 *  3. Earliest linked event start time
 */
export function getEffectiveTimeMs(task: TaskEntity, events: EventEntity[]): number | null {
  if (task.deadline) return new Date(task.deadline).getTime();

  for (const ref of task.time_references ?? []) {
    const event = events.find((e) => e.id === ref.target_id);
    if (!event) continue;
    const base = new Date(ref.modifier === 'before' ? event.from_ : event.to).getTime();
    const offset = unitToMs(ref.amount, ref.unit);
    return ref.modifier === 'before' ? base - offset : base + offset;
  }

  if (task.event_ids.length > 0) {
    const times = task.event_ids
      .map((id) => events.find((e) => e.id === id)?.from_)
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime());
    if (times.length) return Math.min(...times);
  }

  return null;
}

/**
 * Hook that handles task filtering and grouping logic.
 * Separates standalone tasks from event-linked tasks and filters both by search query.
 *
 * Hybrid search approach:
 * 1. First filters locally (instant, but limited to loaded data)
 * 2. If query is long enough and results are few, searches backend FTS5
 * 3. Merges results, deduplicating by source_file:line_number:text_hash
 */
export function useTaskFiltering(
  tasks: TaskEntity[],
  events: EventEntity[],
  search: string
) {
  const [backendResults, setBackendResults] = useState<TaskEntity[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Helper function to filter individual tasks
  const filterTask = useCallback((task: TaskEntity, searchText: string): boolean => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();

    // Search in task text
    if (task.text.toLowerCase().includes(searchLower)) return true;

    // Search in resolved event names
    if (task.resolved_event_names) {
      for (const name of Object.values(task.resolved_event_names)) {
        if ((name as string).toLowerCase().includes(searchLower)) return true;
      }
    }

    // Search in resolved project names
    if (task.resolved_project_names) {
      for (const name of Object.values(task.resolved_project_names)) {
        if ((name as string).toLowerCase().includes(searchLower)) return true;
      }
    }

    return false;
  }, []);

  // Get map of task IDs to tasks for event linking
  const tasksByEventId = useMemo(() => {
    const map = new Map<string, TaskEntity[]>();
    events.forEach((event) => {
      map.set(event.id, tasks.filter((t) => t.event_ids.includes(event.id)));
    });
    return map;
  }, [tasks, events]);

  // Tasks with no event associations (shown in "Other Tasks" group)
  const otherTasks = useMemo(
    () => tasks.filter((t) => t.event_ids.length === 0),
    [tasks]
  );

  // Events that have tasks, future only (past events excluded from grouped view), sorted by time
  const upcomingEventsWithTasks = useMemo(() => {
    const now = Date.now();
    return events
      .filter((ev) => (tasksByEventId.get(ev.id)?.length ?? 0) > 0)
      .filter((ev) => new Date(ev.to).getTime() >= now)
      .sort((a, b) => new Date(a.from_).getTime() - new Date(b.from_).getTime());
  }, [events, tasksByEventId]);

  // Apply search filter to other tasks — scheduled (by deadline) first, unscheduled last
  const filteredOtherTasks = useMemo(() => {
    const filtered = otherTasks.filter((t) => filterTask(t, search));
    return [...filtered].sort((a, b) => {
      const at = a.deadline ? new Date(a.deadline).getTime() : null;
      const bt = b.deadline ? new Date(b.deadline).getTime() : null;
      if (at !== null && bt !== null) return at - bt;
      if (at !== null) return -1;
      if (bt !== null) return 1;
      return 0;
    });
  }, [otherTasks, search, filterTask]);

  // Apply search filter to events with tasks (local filtering)
  const filteredEventsWithTasks = useMemo(() => {
    if (!search) return upcomingEventsWithTasks;
    const searchLower = search.toLowerCase();
    return upcomingEventsWithTasks.filter((ev) => {
      // Include event if name matches
      if (ev.name.toLowerCase().includes(searchLower)) return true;
      // Include event if any task matches
      const eventTasks = tasksByEventId.get(ev.id) ?? [];
      return eventTasks.some((t) => filterTask(t, search));
    });
  }, [upcomingEventsWithTasks, search, filterTask, tasksByEventId]);

  // Snapshot the local result count into a ref so the FTS effect can read
  // it without listing the derived arrays as deps (which would cause an
  // infinite loop: FTS resolves → setBackendResults → re-render → new array
  // refs → effect re-fires → repeat).
  const localResultCountRef = useRef(0);
  localResultCountRef.current = filteredOtherTasks.length + filteredEventsWithTasks.length;

  // Backend search: if local results are few and query is long enough, search backend
  useEffect(() => {
    if (search.length < 3) {
      setBackendResults([]);
      return;
    }

    // Only search backend if we have few local results
    if (localResultCountRef.current < 5) {
      setIsSearching(true);
      const timer = setTimeout(async () => {
        try {
          const results = await searchTasks(search);
          setBackendResults(results);
        } catch (error) {
          console.error('Backend task search failed:', error);
          setBackendResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300); // debounce 300ms

      return () => clearTimeout(timer);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge local and backend results, deduping; re-apply deadline sort
  const mergedOtherTasks = useMemo(() => {
    const base = backendResults.length === 0
      ? filteredOtherTasks
      : deduplicate(
          [...filteredOtherTasks, ...backendResults.filter((t) => t.event_ids.length === 0)],
          getTaskDedupeKey
        );
    return [...base].sort((a, b) => {
      const at = a.deadline ? new Date(a.deadline).getTime() : null;
      const bt = b.deadline ? new Date(b.deadline).getTime() : null;
      if (at !== null && bt !== null) return at - bt;
      if (at !== null) return -1;
      if (bt !== null) return 1;
      return 0;
    });
  }, [filteredOtherTasks, backendResults]);

  // Timeline: split into overdue, scheduled, and unscheduled.
  // When not searching: completed past tasks are hidden; incomplete past tasks go to overdue.
  // When searching: all matching tasks appear in the normal scheduled list.
  const { timelineOverdueTasks, timelineScheduledTasks, timelineUnscheduledTasks } = useMemo(() => {
    const now = Date.now();
    const allFiltered = tasks.filter((t) => filterTask(t, search));
    const merged = backendResults.length > 0
      ? deduplicate([...allFiltered, ...backendResults], getTaskDedupeKey)
      : allFiltered;

    const overdue: TaskEntity[] = [];
    const scheduled: TaskEntity[] = [];
    const unscheduled: TaskEntity[] = [];

    for (const task of merged) {
      const effectiveTime = getEffectiveTimeMs(task, events);
      if (effectiveTime === null) {
        unscheduled.push(task);
      } else if (!search && effectiveTime < now) {
        if (!task.completed) overdue.push(task);
        // completed past tasks silently dropped when not searching
      } else {
        scheduled.push(task);
      }
    }

    overdue.sort((a, b) => getEffectiveTimeMs(a, events)! - getEffectiveTimeMs(b, events)!);
    scheduled.sort((a, b) => getEffectiveTimeMs(a, events)! - getEffectiveTimeMs(b, events)!);

    return { timelineOverdueTasks: overdue, timelineScheduledTasks: scheduled, timelineUnscheduledTasks: unscheduled };
  }, [tasks, events, search, filterTask, backendResults]);

  // Helper to get tasks for a specific event
  const getTasksForEvent = useCallback(
    (eventId: string) => tasksByEventId.get(eventId) ?? [],
    [tasksByEventId]
  );

  return {
    filteredEventsWithTasks,
    filteredOtherTasks: mergedOtherTasks,
    timelineOverdueTasks,
    timelineScheduledTasks,
    timelineUnscheduledTasks,
    getTasksForEvent,
    isSearching,
  };
}

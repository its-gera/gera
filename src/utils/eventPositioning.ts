import { EventEntity } from '../api';

export const HOUR_HEIGHT_PX = 56;

export interface OverlapLayout {
  columnIndex: number;
  columnCount: number;
}

/**
 * Given the timed events for a single day, compute horizontal layout for
 * overlapping events.
 *
 * Events whose time ranges overlap (even by a single minute) are placed in the
 * same group. Within a group of N events, each event occupies 1/N of the column
 * width for its entire duration — even if only a small portion of it overlaps.
 *
 * Returns a Map<eventId, {columnIndex, columnCount}>.
 */
export function computeOverlapLayout(events: EventEntity[]): Map<string, OverlapLayout> {
  const result = new Map<string, OverlapLayout>();
  const n = events.length;
  if (n === 0) return result;

  const times = events.map((ev) => ({
    from: new Date(ev.from_).getTime(),
    to: new Date(ev.to).getTime(),
  }));

  // Adjacency: two events are adjacent if their time ranges overlap
  const adj: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (times[i].from < times[j].to && times[j].from < times[i].to) {
        adj[i][j] = true;
        adj[j][i] = true;
      }
    }
  }

  // BFS to find connected components; sort each by start time then assign columns
  const visited = new Array<boolean>(n).fill(false);
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    const component: number[] = [];
    const queue: number[] = [start];
    visited[start] = true;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      for (let j = 0; j < n; j++) {
        if (!visited[j] && adj[cur][j]) {
          visited[j] = true;
          queue.push(j);
        }
      }
    }
    component.sort((a, b) => times[a].from - times[b].from);
    const columnCount = component.length;
    component.forEach((idx, colIdx) => {
      result.set(events[idx].id, { columnIndex: colIdx, columnCount });
    });
  }

  return result;
}

/** True if the event spans 24 hours or more (all-day / multi-day). */
export function isAllDayEvent(event: EventEntity): boolean {
  try {
    const durationMs = new Date(event.to).getTime() - new Date(event.from_).getTime();
    return durationMs >= 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Return all-day events that overlap a given calendar column date. */
export function getAllDayEventsForDay(events: EventEntity[], day: Date): EventEntity[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return events.filter((ev) => {
    if (!isAllDayEvent(ev)) return false;
    try {
      const from = new Date(ev.from_).getTime();
      const to = new Date(ev.to).getTime();
      return from < dayEnd && to > dayStart;
    } catch {
      return false;
    }
  });
}

export interface EventStyle {
  height: string;
  top: string;
}

/**
 * Calculate CSS height and top positioning for an event block in the calendar grid.
 * Height is based on event duration, and top is based on minute offset within the hour.
 */
export function calculateEventStyle(event: EventEntity): EventStyle {
  const fallback: EventStyle = { height: '0px', top: '0%' };
  try {
    const from = new Date(event.from_);
    const to = new Date(event.to);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) return fallback;

    // Duration in hours (decimal)
    const durationMs = to.getTime() - from.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    // Offset within the hour (for minute positioning)
    const minuteOffset = from.getMinutes();
    const minuteOffsetPercent = (minuteOffset / 60) * 100;

    // Height calculation (56px per hour as per grid-cell min-height)
    const height = durationHours * HOUR_HEIGHT_PX;

    return {
      height: `${height}px`,
      top: `${minuteOffsetPercent}%`,
    };
  } catch {
    return fallback;
  }
}

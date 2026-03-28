import { useCallback, useMemo } from 'react';
import { EventEntity } from '../api';
import { isAllDayEvent } from '../utils/eventPositioning';

/**
 * Hook that provides calendar utility functions for date calculations and event positioning.
 */
export function useCalendarUtils() {
  /**
   * Get array of dates for a week starting from the given Monday
   */
  const getWeekDates = useCallback((weekStart: Date): Date[] => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, []);

  /**
   * Format hour number to 12-hour format (e.g., "2 PM")
   */
  const formatHour = useCallback((h: number): string => {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${display} ${suffix}`;
  }, []);

  /**
   * Get day names for week
   */
  const dayNames = useMemo(() => {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  }, []);

  /**
   * Get hour indices (0-23)
   */
  const hours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i);
  }, []);

  /**
   * Get events that occur during a specific hour on a specific day
   */
  const getEventForCell = useCallback(
    (events: EventEntity[], hourIndex: number, dayIndex: number, weekDates: Date[]) => {
      const cellDate = weekDates[dayIndex];
      return events.filter((ev) => {
        if (isAllDayEvent(ev)) return false;
        try {
          const from = new Date(ev.from_);
          return (
            from.getFullYear() === cellDate.getFullYear() &&
            from.getMonth() === cellDate.getMonth() &&
            from.getDate() === cellDate.getDate() &&
            from.getHours() === hourIndex
          );
        } catch {
          return false;
        }
      });
    },
    []
  );

  return {
    getWeekDates,
    formatHour,
    dayNames,
    hours,
    getEventForCell,
  };
}

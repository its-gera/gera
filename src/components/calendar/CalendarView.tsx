import { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { useCalendarStore, VIEW_DAYS, CalendarView as CalendarViewType } from '../../stores/useCalendarStore';
import { useCalendarUtils } from '../../hooks/useCalendarUtils';
import { formatMonthYear } from '../../utils/dateFormatting';
import { CalendarHeader } from './CalendarHeader';
import { CalendarGrid } from './CalendarGrid';

/** Derive the appropriate view from a pane pixel width. */
function autoViewFromWidth(width: number): CalendarViewType {
  if (width < 260) return 'day';
  if (width < 640) return '3day';
  return 'week';
}

interface CalendarViewProps {}

export function CalendarView({}: CalendarViewProps) {
  const events = useAppStore((state) => state.events);
  const notes = useAppStore((state) => state.notes);
  const currentPeriodStart = useCalendarStore((state) => state.currentPeriodStart);
  const calendarView = useCalendarStore((state) => state.calendarView);
  const setCalendarView = useCalendarStore((state) => state.setCalendarView);
  const goToPrevious = useCalendarStore((state) => state.goToPrevious);
  const goToNext = useCalendarStore((state) => state.goToNext);
  const goToToday = useCalendarStore((state) => state.goToToday);

  const { formatHour, hours, getEventForCell } = useCalendarUtils();

    // Scheduled event refresh every hour (browser-safe)
    const setEvents = useAppStore((s) => s.setEvents);
    useEffect(() => {
      let timer: number | null = null;
      async function refreshEvents() {
        try {
          await import('../../api').then(async (api) => {
            const accounts = await api.listGoogleAccounts();
            for (const acc of accounts) {
              if (acc.account_email) {
                await api.syncGoogleCalendar(acc.account_email);
              }
            }
            const newEvents = await api.listEvents();
            setEvents(newEvents);
          });
        } catch (err) {
          console.error('Background calendar sync failed:', err);
        }
      }
      refreshEvents();
      timer = window.setInterval(refreshEvents, 60 * 60 * 1000); // 1 hour
      return () => {
        if (timer) window.clearInterval(timer);
      };
    }, [setEvents]);

  // Auto-switch view based on available container width
  const paneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      const derived = autoViewFromWidth(width);
      setCalendarView(derived);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [setCalendarView]);

  const viewDays = VIEW_DAYS[calendarView];

  const visibleDates = Array.from({ length: viewDays }, (_, i) => {
    const d = new Date(currentPeriodStart);
    d.setDate(currentPeriodStart.getDate() + i);
    return d;
  });
  const visibleDayNames = visibleDates.map((d) =>
    d.toLocaleDateString('en', { weekday: 'short' })
  );
  const monthYear = visibleDates[0] ? formatMonthYear(visibleDates[0]) : '';

  return (
    <div className="calendar-pane" ref={paneRef}>
      <CalendarHeader
        monthYear={monthYear}
        calendarView={calendarView}
        onViewChange={setCalendarView}
        onPrevious={goToPrevious}
        onNext={goToNext}
        onToday={goToToday}
        onRefresh={async () => {
          await import('../../api').then(async (api) => {
            const accounts = await api.listGoogleAccounts();
            for (const acc of accounts) {
              if (acc.account_email) {
                await api.syncGoogleCalendar(acc.account_email);
              }
            }
            const newEvents = await api.listEvents();
            setEvents(newEvents);
          });
        }}
      />
      <CalendarGrid
        dayNames={visibleDayNames}
        weekDates={visibleDates}
        hours={hours}
        formatHour={formatHour}
        events={events}
        notes={notes}
        getEventForCell={getEventForCell}
      />
    </div>
  );
}


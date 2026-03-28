import { useRef, useState, useEffect } from 'react';
import { listGoogleAccounts } from '../../api';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons/Icons';
import { CalendarView } from '../../stores/useCalendarStore';

const VIEW_LABELS: Record<CalendarView, string> = {
  week: 'Week',
  '3day': '3 Days',
  day: 'Day',
};

interface CalendarHeaderProps {
  monthYear: string;
  calendarView: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
}

export function CalendarHeader({ monthYear, calendarView, onViewChange, onPrevious, onNext, onToday, onRefresh }: CalendarHeaderProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [hasAccounts, setHasAccounts] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const accts = await listGoogleAccounts();
        if (!mounted) return;
        setHasAccounts(Array.isArray(accts) && accts.filter((a) => !!a.account_email).length > 0);
      } catch (e) {
        // ignore — treat as no accounts
        if (mounted) setHasAccounts(false);
      }
    };
    load();

    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as any[] | undefined;
        if (Array.isArray(detail)) {
          setHasAccounts(detail.filter((a) => !!a.account_email).length > 0);
        } else {
          // fallback: re-load
          load();
        }
      } catch {
        load();
      }
    };

    window.addEventListener('google-accounts-changed', handler as EventListener);
    return () => {
      mounted = false;
      window.removeEventListener('google-accounts-changed', handler as EventListener);
    };
  }, []);

  return (
    <div className="calendar-header">
      <div className="calendar-header-left">
        <div className="section-label">CALENDAR</div>
        <h2 className="calendar-month">{monthYear}</h2>
      </div>
      <div className="calendar-header-right">
        {hasAccounts && (
          <button className="refresh-btn" onClick={onRefresh} title="Refresh events">
            Refresh
          </button>
        )}
        <button className="today-btn" onClick={onToday}>Today</button>

        {/* View picker */}
        <div className="cal-view-picker" ref={ref}>
          <button className="cal-view-btn" onClick={() => setOpen((o) => !o)}>
            {VIEW_LABELS[calendarView]}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {open && (
            <div className="cal-view-dropdown">
              {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
                <button
                  key={v}
                  className={`cal-view-option${calendarView === v ? ' active' : ''}`}
                  onClick={() => { onViewChange(v); setOpen(false); }}
                >
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="calendar-nav">
          <button className="nav-btn" onClick={onPrevious} aria-label="Previous">
            <ChevronLeftIcon />
          </button>
          <button className="nav-btn" onClick={onNext} aria-label="Next">
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

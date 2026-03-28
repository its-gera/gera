import { create } from 'zustand';

export type CalendarView = 'week' | '3day' | 'day';

export const VIEW_DAYS: Record<CalendarView, number> = {
  week: 7,
  '3day': 3,
  day: 1,
};

export interface CalendarStore {
  currentPeriodStart: Date;
  calendarView: CalendarView;
  setCurrentPeriodStart: (date: Date) => void;
  setCalendarView: (view: CalendarView) => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToToday: () => void;
  goToDate: (date: Date) => void;
}

export const useCalendarStore = create<CalendarStore>((set, get) => {
  const getMonday = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const today = new Date();

  return {
    currentPeriodStart: getMonday(today),
    calendarView: 'week',
    setCurrentPeriodStart: (date) => set({ currentPeriodStart: date }),
    setCalendarView: (view) => {
      // When switching to week view snap to Monday
      if (view === 'week') {
        const monday = getMonday(get().currentPeriodStart);
        set({ calendarView: view, currentPeriodStart: monday });
      } else {
        set({ calendarView: view });
      }
    },
    goToPrevious: () =>
      set((state) => {
        const days = VIEW_DAYS[state.calendarView];
        const prev = new Date(state.currentPeriodStart);
        prev.setDate(prev.getDate() - days);
        return { currentPeriodStart: prev };
      }),
    goToNext: () =>
      set((state) => {
        const days = VIEW_DAYS[state.calendarView];
        const next = new Date(state.currentPeriodStart);
        next.setDate(next.getDate() + days);
        return { currentPeriodStart: next };
      }),
    goToToday: () => {
      const view = get().calendarView;
      const start = view === 'week' ? getMonday(today) : new Date(today);
      set({ currentPeriodStart: start });
    },
    goToDate: (date: Date) => {
      const view = get().calendarView;
      const start = view === 'week' ? getMonday(date) : new Date(date);
      set({ currentPeriodStart: start });
    },
  };
});

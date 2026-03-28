import { useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { listEvents, listNotes, listFloatingTasks } from '../api';
import { useAppStore } from '../stores/useAppStore';

/**
 * Hook that manages initial data loading and data change synchronization.
 * Listens to gera://data-changed events and reloads data whenever entities change.
 */
export function useGeraSync() {
  const setEvents = useAppStore((state) => state.setEvents);
  const setNotes = useAppStore((state) => state.setNotes);
  const setTasks = useAppStore((state) => state.setTasks);
  const setLoading = useAppStore((state) => state.setLoading);
  const setSelectedEvent = useAppStore((state) => state.setSelectedEvent);
  const setSelectedNote = useAppStore((state) => state.setSelectedNote);

  const reloadData = useCallback(async () => {
    try {
      // Load all events (not just current week) so tasks can reference any event
      const [ev, nt, tk] = await Promise.all([
        listEvents(),
        listNotes(),
        listFloatingTasks(),
      ]);
      setEvents(ev);
      setNotes(nt);
      setTasks(tk);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, [setEvents, setNotes, setTasks]);

  // Initial load on mount
  useEffect(() => {
    reloadData().then(() => setLoading(false));
  }, [reloadData, setLoading]);

  // Listen to data changes (from both file system and backend mutations)
  useEffect(() => {
    const unlisten = listen<{ changes: { entity: string; ids: string[] | null }[] }>(
      'gera://data-changed',
      () => {
        reloadData().then(() => setLoading(false));
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [reloadData, setLoading]);

  // On vault switch: clear all data + selections immediately, show loading
  useEffect(() => {
    const unlisten = listen<{ path: string }>('gera://vault-changed', () => {
      setEvents([]);
      setNotes([]);
      setTasks([]);
      setSelectedEvent(null);
      setSelectedNote(null);
      setLoading(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setEvents, setNotes, setTasks, setSelectedEvent, setSelectedNote, setLoading]);
}

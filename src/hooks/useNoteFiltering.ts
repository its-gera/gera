import { useMemo, useState, useEffect, useRef } from 'react';
import { NoteEntity, searchNotes } from '../api';
import { getNoteDedupeKey, deduplicate } from '../utils/deduplication';

/**
 * Hook that handles note filtering logic.
 * Filters all notes by search query.
 * 
 * Hybrid search approach:
 * 1. First filters locally (instant, but limited to loaded data)
 * 2. If query is long enough and results are few, searches backend FTS5
 * 3. Merges results, deduplicating by filename:0:title_hash
 */
export function useNoteFiltering(notes: NoteEntity[], search: string) {
  const [backendResults, setBackendResults] = useState<NoteEntity[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Apply search filter (local filtering)
  const filteredNotes = useMemo(() => {
    if (!search) return notes;
    const searchLower = search.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(searchLower) ||
        n.body_preview.toLowerCase().includes(searchLower)
    );
  }, [notes, search]);

  // Snapshot local count into a ref — same pattern as useTaskFiltering to
  // prevent the FTS effect from listing filteredNotes as a dep (which causes
  // an infinite re-render loop via setBackendResults → new array ref → re-fire).
  const localResultCountRef = useRef(0);
  localResultCountRef.current = filteredNotes.length;

  // Backend search: if local results are few and query is long enough, search backend
  useEffect(() => {
    if (search.length < 3) {
      setBackendResults([]);
      return;
    }

    if (localResultCountRef.current < 5) {
      setIsSearching(true);
      const timer = setTimeout(async () => {
        try {
          const results = await searchNotes(search);
          setBackendResults(results);
        } catch (error) {
          console.error('Backend note search failed:', error);
          setBackendResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300); // debounce 300ms

      return () => clearTimeout(timer);
    }
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge local and backend results, deduping by filename:0:title_hash
  const mergedNotes = useMemo(() => {
    if (backendResults.length === 0) return filteredNotes;
    
    // Get all notes (local + backend)
    const allNotes = [...filteredNotes, ...backendResults];

    // Deduplicate using filename + title hash
    return deduplicate(allNotes, getNoteDedupeKey);
  }, [filteredNotes, backendResults]);

  return {
    filteredNotes: mergedNotes,
    isSearching,
  };
}

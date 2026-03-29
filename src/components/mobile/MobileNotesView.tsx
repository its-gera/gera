import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { useAppStore } from '../../stores/useAppStore';
import { useNoteFiltering } from '../../hooks/useNoteFiltering';
import { getNoteContent, createNote, updateNoteContent, deleteNote } from '../../api';
import { NoteEditor, type EditorMode, type NoteEditorRef } from '../../editor/NoteEditor';
import { parseFrontmatter } from '../../utils/frontmatter';
import { MobilePageHeader } from './MobilePageHeader';
import { MobileNoteListItem } from './MobileNoteListItem';
import { PlusIcon, ChevronLeftIcon, TrashIcon } from '../icons/Icons';

export function MobileNotesView() {
  const events = useAppStore((s) => s.events);
  const notes = useAppStore((s) => s.notes);
  const notesSearch = useAppStore((s) => s.notesSearch);
  const setNotesSearch = useAppStore((s) => s.setNotesSearch);
  const selectedNote = useAppStore((s) => s.selectedNote);
  const setSelectedNote = useAppStore((s) => s.setSelectedNote);

  const { filteredNotes } = useNoteFiltering(notes, notesSearch);

  const [noteContent, setNoteContent] = useState<string | null>(null);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editorMode, setEditorMode] = useState<EditorMode>(
    () => (localStorage.getItem('noteEditorMode') as EditorMode) ?? 'rich'
  );

  const noteEditorRef = useRef<NoteEditorRef>(null);

  // Event picker
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const [pickerMeasured, setPickerMeasured] = useState(false);
  const [pickerTop, setPickerTop] = useState<number | undefined>(undefined);
  const [pickerListMaxHeight, setPickerListMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (showEventPicker && pickerMeasured) pickerSearchRef.current?.focus();
  }, [showEventPicker, pickerMeasured]);

  useLayoutEffect(() => {
    if (!showEventPicker || !pickerRef.current) {
      setPickerMeasured(false);
      setPickerTop(undefined);
      setPickerListMaxHeight(undefined);
      return;
    }
    const wrapper = pickerRef.current;
    const popup = wrapper.querySelector<HTMLElement>('.metadata-event-picker');
    if (!popup) return;
    const searchInput = popup.querySelector<HTMLInputElement>('.metadata-picker-search');
    const listEl = popup.querySelector<HTMLElement>('.metadata-picker-list');
    const wrapperRect = wrapper.getBoundingClientRect();
    const viewportHeight = document.documentElement.clientHeight;
    const margin = 12;
    const headerHeight = searchInput ? searchInput.getBoundingClientRect().height : 40;
    const desiredListHeight = listEl ? Math.min(listEl.scrollHeight, 300) : 180;
    const spaceBelow = Math.max(0, viewportHeight - wrapperRect.bottom - margin);
    const minListHeight = 60;
    const availableBelowForList = Math.max(0, spaceBelow - headerHeight - 8);
    const spaceAbove = Math.max(0, wrapperRect.top - margin);
    const availableAboveForList = Math.max(0, spaceAbove - headerHeight - 8);
    let topPx: number;
    let maxListHeight: number;
    if (availableBelowForList >= minListHeight) {
      topPx = wrapperRect.height + 6;
      maxListHeight = Math.max(minListHeight, Math.min(desiredListHeight, availableBelowForList));
    } else if (availableAboveForList >= minListHeight) {
      maxListHeight = Math.max(minListHeight, Math.min(desiredListHeight, availableAboveForList));
      topPx = -(headerHeight + maxListHeight + 6);
    } else {
      topPx = wrapperRect.height + 6;
      maxListHeight = Math.max(40, availableBelowForList || 80);
    }
    setPickerTop(topPx);
    setPickerListMaxHeight(maxListHeight);
    setPickerMeasured(true);
  }, [showEventPicker, eventSearch, eventIds.length, events.length]);

  useEffect(() => {
    if (!showEventPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEventPicker(false);
        setEventSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEventPicker]);

  // Reset confirm-delete when note changes
  useEffect(() => { setConfirmDelete(false); }, [selectedNote]);

  // Load note content
  useEffect(() => {
    if (!selectedNote) { setNoteContent(null); setLoadError(null); return; }
    setNoteContent(null);
    setIsLoadingNote(true);
    setLoadError(null);
    getNoteContent(selectedNote.filename)
      .then((result) => {
        try {
          const { metadata, body } = parseFrontmatter(result.raw_content);
          setNoteContent(body);
          setEventIds(metadata.event_ids || []);
          setProjectIds(metadata.project_ids || []);
        } catch {
          setNoteContent(result.raw_content);
          setEventIds([]);
          setProjectIds([]);
        }
      })
      .catch(() => setLoadError('Failed to load note'))
      .finally(() => setIsLoadingNote(false));
  }, [selectedNote]);

  const handleMetadataChange = async (newEventIds: string[], newProjectIds: string[]) => {
    if (!selectedNote) return;
    try {
      const result = await getNoteContent(selectedNote.filename);
      const { body } = parseFrontmatter(result.raw_content);
      const lines: string[] = ['---'];
      if (newEventIds.length > 0) {
        lines.push('event_ids:');
        newEventIds.forEach((id) => lines.push(`  - ${id}`));
      }
      if (newProjectIds.length > 0) {
        lines.push('project_ids:');
        newProjectIds.forEach((id) => lines.push(`  - ${id}`));
      }
      const frontmatter = (newEventIds.length > 0 || newProjectIds.length > 0)
        ? lines.join('\n') + '\n---\n\n'
        : '';
      await updateNoteContent(selectedNote.filename, frontmatter + body);
    } catch (err) {
      console.error('Failed to update note metadata:', err);
    }
  };

  const removeEventId = (id: string) => {
    const next = eventIds.filter((e) => e !== id);
    setEventIds(next);
    handleMetadataChange(next, projectIds);
  };

  const addEventId = (id: string) => {
    if (eventIds.includes(id)) return;
    const next = [...eventIds, id];
    setEventIds(next);
    handleMetadataChange(next, projectIds);
    setShowEventPicker(false);
    setEventSearch('');
  };

  const handleCreateNote = async () => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const note = await createNote(`note-${ts}`, '');
      setSelectedNote(note);
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  const handleDeleteNote = async () => {
    if (!selectedNote) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await deleteNote(selectedNote.filename);
      setSelectedNote(null);
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const availableEvents = events.filter(
    (e) => !eventIds.includes(e.id) &&
      (eventSearch === '' || e.name.toLowerCase().includes(eventSearch.toLowerCase()))
  );

  // ── Editor view ──────────────────────────────────────────────────────────
  if (selectedNote) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header: [<] [title] [delete] [Rich|Plain] */}
        <div className="mobile-note-editor-header">
          <button
            className="mobile-back-btn"
            onClick={() => setSelectedNote(null)}
            aria-label="Back to notes"
          >
            <ChevronLeftIcon />
          </button>

          <span className="mobile-note-editor-title">
            {selectedNote.title || 'Untitled'}
          </span>

          <button
            className={`mobile-sheet-delete-btn${confirmDelete ? ' mobile-sheet-delete-btn--confirm' : ''}`}
            onClick={handleDeleteNote}
            title={confirmDelete ? 'Tap again to confirm' : 'Delete note'}
          >
            <TrashIcon />
            {confirmDelete && <span style={{ fontSize: 11, marginLeft: 4 }}>Confirm?</span>}
          </button>

          <div className="mobile-editor-toggle">
            <button
              className={`mobile-editor-toggle-btn${editorMode === 'rich' ? ' mobile-editor-toggle-btn--active' : ' mobile-editor-toggle-btn--inactive'}`}
              onClick={() => noteEditorRef.current?.switchToRich()}
            >
              Rich
            </button>
            <button
              className={`mobile-editor-toggle-btn${editorMode === 'plain' ? ' mobile-editor-toggle-btn--active' : ' mobile-editor-toggle-btn--inactive'}`}
              onClick={() => noteEditorRef.current?.switchToPlain()}
            >
              Plain
            </button>
          </div>
        </div>

        {/* Event chips row — below header, left-aligned */}
        <div className="mobile-note-event-row">
          {eventIds.map((id) => {
            const event = events.find((e) => e.id === id);
            return (
              <span key={id} className="mobile-event-chip" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                @{event?.name ?? id}
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', fontSize: 13, lineHeight: 1 }}
                  onClick={() => removeEventId(id)}
                  aria-label="Remove event"
                >×</button>
              </span>
            );
          })}
          <div className="metadata-add-wrapper" ref={pickerRef} style={{ position: 'relative' }}>
            <button
              className="mobile-add-badge"
              onClick={() => { setShowEventPicker((v) => !v); setEventSearch(''); }}
              title="Link event"
            >
              + Event
            </button>
            {showEventPicker && (
              <div
                className="metadata-event-picker"
                style={{ top: pickerTop !== undefined ? `${pickerTop}px` : undefined }}
              >
                <input
                  ref={pickerSearchRef}
                  className="metadata-picker-search"
                  placeholder="Search events…"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.stopPropagation(); setShowEventPicker(false); setEventSearch(''); }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      (pickerRef.current?.querySelector<HTMLButtonElement>('.metadata-picker-item'))?.focus();
                    }
                  }}
                />
                <div
                  className="metadata-picker-list"
                  style={{ maxHeight: pickerListMaxHeight !== undefined ? `${pickerListMaxHeight}px` : undefined }}
                >
                  {availableEvents.length === 0
                    ? <div className="metadata-picker-empty">No events found</div>
                    : availableEvents.map((e) => (
                      <button key={e.id} className="metadata-picker-item" onClick={() => addEventId(e.id)}>
                        {e.name}
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Note content */}
        {loadError ? (
          <div style={{ padding: 20, color: 'var(--text-error, red)' }}>{loadError}</div>
        ) : isLoadingNote || noteContent === null ? (
          <div style={{ padding: 20, color: 'var(--text-tertiary)' }}>Loading…</div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <NoteEditor
              ref={noteEditorRef}
              key={selectedNote.filename}
              filename={selectedNote.filename}
              content={noteContent}
              eventIds={eventIds}
              projectIds={projectIds}
              autoSave={true}
              autoSaveDelay={1000}
              mode={editorMode}
              onModeChange={setEditorMode}
            />
          </div>
        )}
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MobilePageHeader label="NOTES" />
      <div style={{ padding: '0 16px 8px' }}>
        <input
          className="mobile-search-input"
          value={notesSearch}
          onChange={(e) => setNotesSearch(e.target.value)}
          placeholder="Search notes"
        />
      </div>
      <div className="mobile-scroll-content" style={{ flex: 1, overflowY: 'auto' }}>
        {filteredNotes.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
            No notes yet
          </div>
        ) : (
          filteredNotes.map((note) => (
            <MobileNoteListItem
              key={note.filename}
              note={note}
              onOpen={() => setSelectedNote(note)}
            />
          ))
        )}
      </div>

      {/* FAB — same position as tasks/calendar */}
      <button
        className="mobile-fab"
        onClick={handleCreateNote}
        aria-label="New note"
      >
        <PlusIcon />
      </button>
    </div>
  );
}

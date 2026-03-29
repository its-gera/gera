import { NoteEntity } from '../../api';

interface MobileNoteListItemProps {
  note: NoteEntity;
  onOpen: () => void;
}

export function MobileNoteListItem({ note, onOpen }: MobileNoteListItemProps) {
  const title = note.title || note.filename;
  const preview = note.body_preview?.trim() ?? '';
  const hasEvents = note.event_ids.length > 0;

  return (
    <div className="mobile-note-list-item" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      <div className="mobile-note-list-item__title">{title}</div>
      {preview && (
        <div className="mobile-note-list-item__preview">{preview}</div>
      )}
      {hasEvents && (
        <div style={{ marginTop: 4 }}>
          <span className="mobile-note-list-item__chip">
            {note.event_ids.length} event{note.event_ids.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

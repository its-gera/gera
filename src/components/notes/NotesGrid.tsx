import { NoteEntity } from '../../types';
import { NoteTile } from './NoteTile';
import { EmptyState } from '../shared/EmptyState';

interface NotesGridProps {
  notes: NoteEntity[];
}

export function NotesGrid({ notes }: NotesGridProps) {
  if (notes.length === 0) {
    return <EmptyState message="No notes yet" />;
  }

  return (
    <div className="notes-grid">
      {notes.map((note) => (
        <NoteTile key={note.filename} note={note} />
      ))}
    </div>
  );
}

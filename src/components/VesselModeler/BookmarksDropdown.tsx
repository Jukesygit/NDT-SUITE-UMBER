import { useState, useRef, useEffect } from 'react';
import { Bookmark, ChevronDown, Plus, Trash2, Pencil } from 'lucide-react';
import type { CameraBookmark } from './types';

interface BookmarksDropdownProps {
  bookmarks: CameraBookmark[];
  /** Capture the current camera pose as a new bookmark. */
  onSave: () => void;
  /** Fly the camera to a saved bookmark. */
  onRecall: (bookmark: CameraBookmark) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Camera-bookmarks dropdown for the actions cluster (HistoryDropdown pattern):
 * "Save current view", then a list of saved views — click to recall, pencil to
 * rename inline, trash to delete.
 */
export default function BookmarksDropdown({
  bookmarks,
  onSave,
  onRecall,
  onRename,
  onDelete,
}: BookmarksDropdownProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startRename = (bm: CameraBookmark) => {
    setEditingId(bm.id);
    setDraft(bm.name);
  };

  const commitRename = () => {
    if (editingId) {
      const name = draft.trim();
      if (name) onRename(editingId, name);
    }
    setEditingId(null);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`vm-popout-trigger ${open ? 'open' : ''} ${bookmarks.length ? 'vm-popout-trigger--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Camera views"
      >
        <Bookmark size={14} />
        Views
        <ChevronDown size={12} className={`vm-popout-chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <div className="vm-popout-panel vm-bookmarks-panel">
          <button
            className="vm-popout-item"
            onClick={() => {
              onSave();
            }}
          >
            <Plus size={13} />
            Save current view
          </button>
          {bookmarks.length > 0 && <div className="vm-popout-divider" />}
          {bookmarks.map((bm) => (
            <div key={bm.id} className="vm-bookmark-row">
              {editingId === bm.id ? (
                <input
                  className="vm-bookmark-rename"
                  value={draft}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <button
                  className="vm-popout-item vm-bookmark-name"
                  onClick={() => {
                    onRecall(bm);
                    setOpen(false);
                  }}
                  title="Recall this view"
                >
                  <Bookmark size={12} />
                  {bm.name}
                </button>
              )}
              <button
                className="vm-bookmark-action"
                onClick={() => startRename(bm)}
                title="Rename"
              >
                <Pencil size={12} />
              </button>
              <button
                className="vm-bookmark-action vm-bookmark-action--danger"
                onClick={() => onDelete(bm.id)}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { History, ChevronDown, Undo2, Redo2 } from 'lucide-react';
import type { HistoryEntry } from './engine/vessel-history';

interface HistoryDropdownProps {
  /** Undo stack, oldest → newest (as stored in the reducer). */
  past: HistoryEntry[];
  /** Redo stack, oldest → newest redo target (as stored in the reducer). */
  future: HistoryEntry[];
  /** Jump the document to before the past entry at `index` (folded undo). */
  onUndoTo: (index: number) => void;
  /** Jump the document forward to the future entry at `index` (folded redo). */
  onRedoTo: (index: number) => void;
}

/** Compact "2m ago" style relative time from a record timestamp (ms). */
function relativeTime(at: number, now: number): string {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * History dropdown for the actions cluster — mirrors StatsDropdown's open/close
 * and styling. Lists redo entries (above a divider) then past entries, both
 * newest-first, each with its label and a relative time; a click folds the whole
 * jump into a single UNDO_TO / REDO_TO dispatch.
 */
export default function HistoryDropdown({
  past,
  future,
  onUndoTo,
  onRedoTo,
}: HistoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const empty = past.length === 0 && future.length === 0;
  const now = Date.now();
  const timeStyle = { marginLeft: 'auto', opacity: 0.6, fontSize: 11 } as const;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={`vm-popout-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        disabled={empty}
        title="Edit history"
      >
        <History size={14} />
        History
        <ChevronDown size={12} className={`vm-popout-chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <div className="vm-popout-panel">
          {/* Redo entries, newest redo target first. */}
          {future
            .map((entry, i) => ({ entry, index: i }))
            .reverse()
            .map(({ entry, index }) => (
              <button
                key={`redo-${index}`}
                className="vm-popout-item"
                onClick={() => {
                  onRedoTo(index);
                  setOpen(false);
                }}
              >
                <Redo2 size={13} />
                {entry.label}
                <span style={timeStyle}>{relativeTime(entry.at, now)}</span>
              </button>
            ))}
          {future.length > 0 && past.length > 0 && <div className="vm-popout-divider" />}
          {/* Past entries, newest change first — click reverts back to before it. */}
          {past
            .map((entry, i) => ({ entry, index: i }))
            .reverse()
            .map(({ entry, index }) => (
              <button
                key={`undo-${index}`}
                className="vm-popout-item"
                onClick={() => {
                  onUndoTo(index);
                  setOpen(false);
                }}
              >
                <Undo2 size={13} />
                {entry.label}
                <span style={timeStyle}>{relativeTime(entry.at, now)}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

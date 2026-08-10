import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import {
  filterPaletteItems,
  type PaletteAction,
  type PaletteItem,
} from './engine/palette-registry';

interface CommandPaletteProps {
  /** Full registry (built by VesselModeler from the vessel state). */
  items: PaletteItem[];
  /** Execute the chosen item's descriptor (VesselModeler's handlePaletteAction). */
  onExecute: (action: PaletteAction) => void;
  /** Close without executing (Esc / backdrop click). */
  onClose: () => void;
}

/**
 * Centered command-palette overlay (C14). Own compact markup + vm styling — not
 * the app Modal. Autofocused search input; up/down/Enter/Esc keyboard nav plus
 * click. Empty query shows commands first (a default action list); typing ranks
 * via {@link filterPaletteItems}. Selecting an item calls `onExecute` then the
 * parent closes the palette.
 */
export default function CommandPalette({ items, onExecute, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => filterPaletteItems(items, query), [items, query]);

  // Autofocus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the active row valid + visible as the result set changes.
  useEffect(() => {
    setActiveIndex((i) => (i >= results.length ? 0 : i));
  }, [results.length]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onExecute(item.action);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      run(results[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="vm-cmdk__backdrop" onMouseDown={onClose}>
      <div
        className="vm-cmdk"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="vm-cmdk__input-row">
          <Search size={15} className="vm-cmdk__search-icon" />
          <input
            ref={inputRef}
            className="vm-cmdk__input"
            type="text"
            placeholder="Search entities and commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="vm-cmdk__hint">Esc</kbd>
        </div>

        <div className="vm-cmdk__list" ref={listRef}>
          {results.length === 0 ? (
            <div className="vm-cmdk__empty">No matches</div>
          ) : (
            results.map((item, i) => (
              <button
                key={item.id}
                type="button"
                data-active={i === activeIndex}
                className={`vm-cmdk__row ${i === activeIndex ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => run(item)}
              >
                <span className={`vm-cmdk__badge vm-cmdk__badge--${item.kind}`} aria-hidden="true">
                  {item.kind === 'entity' ? 'Entity' : 'Command'}
                </span>
                <span className="vm-cmdk__label">{item.label}</span>
                {i === activeIndex && (
                  <CornerDownLeft size={13} className="vm-cmdk__enter" aria-hidden="true" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

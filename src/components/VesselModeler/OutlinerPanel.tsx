import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Eye, EyeOff, Lock, Layers, X } from 'lucide-react';
import type { VesselState } from './types';
import type { SelectionState } from './engine/vessel-reducer';
import type { LayerVisibility } from './engine/layer-visibility';
import {
  buildOutlinerTree,
  type LayerKey,
  type OutlinerSelectAction,
  type OutlinerToggleRef,
} from './outliner-tree';

interface OutlinerPanelProps {
  vesselState: VesselState;
  selection: SelectionState;
  /** Layer overlay (`ui.layers`); ABSENT key ⇒ visible. */
  layers?: LayerVisibility;
  /** Sidebar overlays the viewport's left 340px — offset beside it when open. */
  sidebarOpen: boolean;
  /** Close the whole panel (toolbar toggle). */
  onClose: () => void;
  /** Dispatch a verbatim SELECT_* descriptor. */
  onSelect: (action: OutlinerSelectAction) => void;
  /** Route a per-row / per-body visibility toggle to its owning hook callback. */
  onToggleVisible: (ref: OutlinerToggleRef) => void;
  /** Flip one body's slice of one category layer. */
  onToggleLayer: (bodyKey: string, categoryKey: LayerKey) => void;
}

/**
 * Layers panel (the C13b outliner, repurposed) — a collapsible floating panel on
 * the left edge of the 3D viewport. Renders the body → category → row tree from
 * `outliner-tree.ts`. Row click dispatches the row's SELECT_* action; the row Eye
 * toggles that entity, the category Eye toggles the whole layer for that body.
 * Both are visual only — stats are never filtered. A row inside a hidden layer
 * renders dimmed but keeps its own eye functional (the two flags are independent
 * and compose). Body/category collapse is local component state. Rendered by
 * VesselModeler in viewMode === '3d' only.
 */
export default function OutlinerPanel({
  vesselState,
  selection,
  layers,
  sidebarOpen,
  onClose,
  onSelect,
  onToggleVisible,
  onToggleLayer,
}: OutlinerPanelProps) {
  const tree = useMemo(
    () => buildOutlinerTree(vesselState, selection, layers),
    [vesselState, selection, layers]
  );

  // Collapsed keys (default: everything expanded). Bodies keyed by body key;
  // categories keyed by `${bodyKey}/${categoryKey}` for cross-body uniqueness.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const isCollapsed = (k: string) => collapsed.has(k);
  const toggleCollapsed = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const eyeStyle = (visible: boolean) =>
    visible ? undefined : { color: 'rgba(255,255,255,0.25)' };

  return (
    <div
      className="vm-outliner"
      style={{ left: sidebarOpen ? 354 : 14 }}
      role="tree"
      aria-label="Layers"
    >
      <div className="vm-outliner__header">
        <Layers size={13} />
        <span className="vm-outliner__title">Layers</span>
        <button
          className="vm-outliner__close"
          onClick={onClose}
          title="Close layers"
          aria-label="Close layers"
        >
          <X size={13} />
        </button>
      </div>

      <div className="vm-outliner__body">
        {tree.map((body) => {
          const bodyCollapsed = isCollapsed(body.key);
          return (
            <div key={body.key} className="vm-outliner__group">
              <div className={`vm-outliner__body-head ${body.selected ? 'is-selected' : ''}`}>
                <button
                  className="vm-outliner__twisty"
                  onClick={() => toggleCollapsed(body.key)}
                  aria-label={bodyCollapsed ? 'Expand body' : 'Collapse body'}
                >
                  {bodyCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
                <span
                  className="vm-outliner__body-label"
                  onClick={() => body.selectAction && onSelect(body.selectAction)}
                  style={body.selectAction ? { cursor: 'pointer' } : undefined}
                  title={body.label}
                >
                  {body.label}
                </span>
                {body.locked && (
                  <Lock size={11} className="vm-outliner__lock" aria-label="Locked" />
                )}
                {body.toggleRef && (
                  <button
                    className="vm-btn-icon vm-outliner__eye"
                    onClick={() => body.toggleRef && onToggleVisible(body.toggleRef)}
                    title={body.visible ? 'Hide' : 'Show'}
                    style={eyeStyle(body.visible)}
                  >
                    {body.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                )}
              </div>

              {!bodyCollapsed &&
                body.categories.map((cat) => {
                  const catKey = `${body.key}/${cat.key}`;
                  const catCollapsed = isCollapsed(catKey);
                  return (
                    <div key={catKey} className="vm-outliner__cat">
                      <div className={`vm-outliner__cat-head ${cat.visible ? '' : 'is-hidden'}`}>
                        <button
                          className="vm-outliner__twisty"
                          onClick={() => toggleCollapsed(catKey)}
                          aria-label={catCollapsed ? 'Expand layer' : 'Collapse layer'}
                        >
                          {catCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                        </button>
                        <span
                          className="vm-outliner__cat-label"
                          onClick={() => toggleCollapsed(catKey)}
                        >
                          {cat.label}
                        </span>
                        <span className="vm-outliner__count">{cat.rows.length}</span>
                        <button
                          className="vm-btn-icon vm-outliner__eye"
                          onClick={() => onToggleLayer(body.key, cat.key)}
                          title={cat.visible ? 'Hide layer' : 'Show layer'}
                          aria-label={cat.visible ? 'Hide layer' : 'Show layer'}
                          style={eyeStyle(cat.visible)}
                        >
                          {cat.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                        </button>
                      </div>

                      {!catCollapsed &&
                        cat.rows.map((row) => (
                          <div
                            key={row.key}
                            className={`vm-outliner__row ${row.selected ? 'is-selected' : ''}`}
                            onClick={() => onSelect(row.selectAction)}
                          >
                            <span
                              className={`vm-outliner__row-label ${
                                row.visible && cat.visible ? '' : 'is-hidden'
                              }`}
                              title={row.label}
                            >
                              {row.label}
                            </span>
                            <span className="vm-outliner__row-actions">
                              {row.locked && (
                                <Lock size={11} className="vm-outliner__lock" aria-label="Locked" />
                              )}
                              <button
                                className="vm-btn-icon vm-outliner__eye"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleVisible(row.toggleRef);
                                }}
                                title={row.visible ? 'Hide' : 'Show'}
                                style={eyeStyle(row.visible)}
                              >
                                {row.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                              </button>
                            </span>
                          </div>
                        ))}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

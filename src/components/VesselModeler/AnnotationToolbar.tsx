// =============================================================================
// AnnotationToolbar - Vertical floating toolbar for Screenshot Mode annotations
// =============================================================================
// Matches the original standalone viewer's on-canvas annotation toolbar:
// vertical layout, floating on the left side of the canvas area.
// =============================================================================

import {
  Hand,
  MousePointer2,
  X,
  Type,
  ArrowUpRight,
  Square,
  Circle,
  Ruler,
  Pen,
  Undo2,
  Trash2,
} from 'lucide-react';
import type { AnnotationTool } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extended tool type: null = pan, 'select' = select/move, or an AnnotationTool */
export type ToolbarTool = AnnotationTool | 'select' | null;

interface AnnotationToolbarProps {
  currentTool: ToolbarTool;
  onSelectTool: (tool: ToolbarTool) => void;
  currentColor: string;
  onColorChange: (color: string) => void;
  selectedAnnotationId: string | null;
  onDeleteSelected: () => void;
  onUndo: () => void;
  onClearAll: () => void;
  canUndo: boolean;
}

// ---------------------------------------------------------------------------
// Drawing tool definitions (matching original: text, arrow, rect, ellipse,
// dimension, freehand — no line or stamp in toolbar)
// ---------------------------------------------------------------------------

const DRAW_TOOLS: Array<{ key: AnnotationTool; label: string; Icon: typeof ArrowUpRight }> = [
  { key: 'text',      label: 'Text Label',     Icon: Type },
  { key: 'arrow',     label: 'Arrow',           Icon: ArrowUpRight },
  { key: 'rect',      label: 'Rectangle',       Icon: Square },
  { key: 'circle',    label: 'Ellipse',         Icon: Circle },
  { key: 'dimension', label: 'Dimension Line',  Icon: Ruler },
  { key: 'freehand',  label: 'Freehand Draw',   Icon: Pen },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnnotationToolbar({
  currentTool,
  onSelectTool,
  currentColor,
  onColorChange,
  selectedAnnotationId,
  onDeleteSelected,
  onUndo,
  onClearAll,
  canUndo,
}: AnnotationToolbarProps) {
  return (
    <div className="vm-annotation-toolbar">
      {/* Pan / Rotate View */}
      <button
        className={`vm-ann-tool-btn ${currentTool === null ? 'active' : ''}`}
        onClick={() => onSelectTool(null)}
        title="Pan / Rotate View"
      >
        <Hand size={18} />
      </button>

      {/* Select / Move */}
      <button
        className={`vm-ann-tool-btn ${currentTool === 'select' ? 'active' : ''}`}
        onClick={() => onSelectTool('select')}
        title="Select / Move"
      >
        <MousePointer2 size={18} />
      </button>

      {/* Delete Selected (only visible when annotation selected) */}
      {selectedAnnotationId && (
        <button
          className="vm-ann-tool-btn vm-ann-tool-btn-danger"
          onClick={onDeleteSelected}
          title="Delete Selected (Del)"
        >
          <X size={18} />
        </button>
      )}

      <div className="vm-ann-divider" />

      {/* Drawing tools */}
      {DRAW_TOOLS.map(({ key, label, Icon }) => (
        <button
          key={key}
          className={`vm-ann-tool-btn ${currentTool === key ? 'active' : ''}`}
          onClick={() => onSelectTool(currentTool === key ? null : key)}
          title={label}
        >
          <Icon size={18} />
        </button>
      ))}

      <div className="vm-ann-divider" />

      {/* Color picker */}
      <input
        type="color"
        value={currentColor}
        onChange={(e) => onColorChange(e.target.value)}
        className="vm-ann-color-picker"
        title="Annotation Color"
      />

      <div className="vm-ann-divider" />

      {/* Undo / Clear */}
      <button
        className="vm-ann-tool-btn"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo Last"
      >
        <Undo2 size={18} />
      </button>
      <button
        className="vm-ann-tool-btn"
        onClick={onClearAll}
        disabled={!canUndo}
        title="Clear All"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}

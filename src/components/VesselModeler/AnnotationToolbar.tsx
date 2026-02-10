// =============================================================================
// AnnotationToolbar - Drawing tools for Screenshot Mode annotation overlay
// =============================================================================

import {
  MousePointer2,
  ArrowUpRight,
  Minus,
  Square,
  Circle,
  Type,
  Ruler,
  Pen,
  Stamp,
  Undo2,
  Trash2,
} from 'lucide-react';
import type { AnnotationTool } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnnotationToolbarProps {
  currentTool: AnnotationTool | null;
  onSelectTool: (tool: AnnotationTool | null) => void;
  currentColor: string;
  onColorChange: (color: string) => void;
  lineWidth: number;
  onLineWidthChange: (width: number) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onUndo: () => void;
  onClearAll: () => void;
  canUndo: boolean;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Array<{ key: AnnotationTool; label: string; Icon: typeof Minus }> = [
  { key: 'arrow',     label: 'Arrow',     Icon: ArrowUpRight },
  { key: 'line',      label: 'Line',      Icon: Minus },
  { key: 'rect',      label: 'Rectangle', Icon: Square },
  { key: 'circle',    label: 'Circle',    Icon: Circle },
  { key: 'text',      label: 'Text',      Icon: Type },
  { key: 'dimension', label: 'Dimension', Icon: Ruler },
  { key: 'freehand',  label: 'Freehand',  Icon: Pen },
  { key: 'stamp',     label: 'Stamp',     Icon: Stamp },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnnotationToolbar({
  currentTool,
  onSelectTool,
  currentColor,
  onColorChange,
  lineWidth,
  onLineWidthChange,
  fontSize,
  onFontSizeChange,
  onUndo,
  onClearAll,
  canUndo,
}: AnnotationToolbarProps) {
  return (
    <div className="vm-screenshot-toolbar">
      {/* Pan (deselect tool) */}
      <div className="vm-toolbar-group">
        <button
          className={`vm-toolbar-btn ${currentTool === null ? 'active' : ''}`}
          onClick={() => onSelectTool(null)}
          title="Pan / Select"
        >
          <MousePointer2 size={16} />
        </button>

        <div className="vm-toolbar-separator" />

        {/* Drawing tools */}
        <div className="vm-toolbar-buttons">
          {TOOLS.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`vm-toolbar-btn ${currentTool === key ? 'active' : ''}`}
              onClick={() => onSelectTool(currentTool === key ? null : key)}
              title={label}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="vm-toolbar-separator" />

      {/* Color picker */}
      <div className="vm-toolbar-group">
        <span className="vm-toolbar-label">Color</span>
        <input
          type="color"
          value={currentColor}
          onChange={(e) => onColorChange(e.target.value)}
          className="vm-toolbar-color"
          title="Annotation color"
        />
      </div>

      {/* Line width */}
      <div className="vm-toolbar-group">
        <span className="vm-toolbar-label">Width</span>
        <input
          type="number"
          min={1}
          max={10}
          value={lineWidth}
          onChange={(e) => onLineWidthChange(Number(e.target.value))}
          className="vm-input"
          style={{ width: 48 }}
          title="Line width"
        />
      </div>

      {/* Font size (shown only when text tool active) */}
      {currentTool === 'text' && (
        <div className="vm-toolbar-group">
          <span className="vm-toolbar-label">Size</span>
          <input
            type="number"
            min={10}
            max={72}
            value={fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            className="vm-input"
            style={{ width: 52 }}
            title="Font size"
          />
        </div>
      )}

      <div className="vm-toolbar-separator" />

      {/* Undo / Clear */}
      <div className="vm-toolbar-group">
        <div className="vm-toolbar-buttons">
          <button
            className="vm-toolbar-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo last annotation"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="vm-toolbar-btn"
            onClick={onClearAll}
            disabled={!canUndo}
            title="Clear all annotations"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ScanViewerToolbar — bottom toolbar with save, regenerate, colormap selector.
 */

interface ScanViewerToolbarProps {
  colormap: string;
  onColormapChange: (colormap: string) => void;
  isDirty: boolean;
  companionConnected: boolean;
  onRegenerate?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  isRegenerating?: boolean;
  canEdit: boolean;
}

const COLORMAPS = ['Jet', 'Viridis', 'Plasma', 'Inferno', 'Hot', 'Blues', 'RdBu', 'Greys'];

export default function ScanViewerToolbar({
  colormap,
  onColormapChange,
  isDirty,
  companionConnected,
  onRegenerate,
  onSave,
  isSaving,
  isRegenerating,
  canEdit,
}: ScanViewerToolbarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Left: actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {canEdit && (
          <>
            <button
              onClick={onRegenerate}
              disabled={!companionConnected || isRegenerating}
              style={{
                ...btnStyle,
                opacity: !companionConnected || isRegenerating ? 0.4 : 1,
              }}
            >
              {isRegenerating ? 'Generating...' : 'Re-generate'}
            </button>

            <button
              onClick={onSave}
              disabled={isSaving}
              style={{
                ...btnStyle,
                borderColor: '#22c55e',
                color: '#4ade80',
                opacity: isSaving ? 0.4 : 1,
              }}
            >
              {isSaving ? 'Saving...' : 'Save to Cloud'}
            </button>
          </>
        )}

        {/* Unsaved indicator */}
        {isDirty && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#f59e0b' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            Unsaved changes
          </span>
        )}
      </div>

      {/* Right: colormap selector */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)' }}>Color:</span>
        <select
          value={colormap}
          onChange={e => onColormapChange(e.target.value)}
          style={{
            fontSize: '0.72rem',
            padding: '3px 8px',
            borderRadius: 4,
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-base)',
            color: 'var(--text-secondary)',
          }}
        >
          {COLORMAPS.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  padding: '4px 12px',
  borderRadius: 4,
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

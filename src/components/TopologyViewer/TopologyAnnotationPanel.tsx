import { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { TopologyAnnotation } from './types';

interface TopologyAnnotationPanelProps {
  annotations: TopologyAnnotation[];
  onDelete: (id: string) => void;
}

export default function TopologyAnnotationPanel({
  annotations,
  onDelete,
}: TopologyAnnotationPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (annotations.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 220,
        background: 'rgba(20, 25, 35, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 8,
        padding: '8px 10px',
        fontFamily: 'var(--font-mono, monospace)',
        color: 'rgba(255, 255, 255, 0.85)',
        zIndex: 10,
        maxHeight: '50vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'rgba(255, 255, 255, 0.5)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
          Annotations ({annotations.length})
        </span>
        {collapsed
          ? <ChevronDown size={14} style={{ opacity: 0.5 }} />
          : <ChevronUp size={14} style={{ opacity: 0.5 }} />
        }
      </div>

      {!collapsed && (
        <div style={{
          marginTop: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          overflowY: 'auto',
          flex: 1,
        }}>
          {annotations.map((ann, i) => (
            <div
              key={ann.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 6,
                padding: '4px 6px',
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.04)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'rgba(0, 204, 102, 0.9)', fontWeight: 600 }}>
                    #{i + 1}
                  </span>
                  {' '}
                  <span style={{ fontWeight: 600 }}>
                    {ann.thickness != null ? `${ann.thickness.toFixed(2)} mm` : 'ND'}
                  </span>
                </div>
                <div style={{ fontSize: 10, opacity: 0.5, marginTop: 1 }}>
                  S {ann.scanMm.toFixed(1)} &middot; I {ann.indexMm.toFixed(1)}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
                title="Delete annotation"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: 'rgba(255, 255, 255, 0.3)',
                  flexShrink: 0,
                  marginTop: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ff4444')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.3)')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

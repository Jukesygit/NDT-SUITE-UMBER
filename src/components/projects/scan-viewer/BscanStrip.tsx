/**
 * BscanStrip — displays a companion-rendered B-scan image.
 *
 * Uses useCompanionImage for request coalescing.
 * Shows "Companion disconnected" overlay when unavailable.
 */

import { useCompanionImage } from '../../../hooks/queries/useCompanionImage';
import type { GateSettings } from '../../../types/companion';

interface BscanStripProps {
  type: 'bscan-axial' | 'bscan-index';
  port: number | null;
  folders: string[];
  scanMm: number;
  indexMm: number;
  gateSettings?: GateSettings;
  width?: number;
  height?: number;
}

export default function BscanStrip({
  type,
  port,
  folders,
  scanMm,
  indexMm,
  gateSettings,
  width = 400,
  height = 150,
}: BscanStripProps) {
  const { blobUrl, isLoading, degraded } = useCompanionImage({
    port,
    type,
    folders,
    scanMm,
    indexMm,
    width,
    height,
    gateSettings,
    enabled: !!port && folders.length > 0,
  });

  const label = type === 'bscan-axial' ? 'D-scan (axial)' : 'B-scan (index)';

  return (
    <div style={{
      position: 'relative',
      width,
      height,
      background: 'var(--surface-elevated)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
    }}>
      {blobUrl && (
        <img
          src={blobUrl}
          alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'fill' }}
        />
      )}

      {/* Label */}
      <span style={{
        position: 'absolute',
        top: 4,
        left: 6,
        fontSize: '0.6rem',
        color: 'rgba(255,255,255,0.5)',
        pointerEvents: 'none',
      }}>
        {label}
      </span>

      {/* Disconnected overlay */}
      {!port && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.5)',
          color: 'var(--text-quaternary)',
          fontSize: '0.75rem',
        }}>
          Companion disconnected
        </div>
      )}

      {/* Degraded indicator */}
      {degraded && (
        <span style={{
          position: 'absolute',
          top: 4,
          right: 6,
          fontSize: '0.55rem',
          color: '#f59e0b',
        }}>
          slow
        </span>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div style={{
          position: 'absolute',
          bottom: 4,
          right: 6,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#3b82f6',
          opacity: 0.7,
        }} />
      )}
    </div>
  );
}

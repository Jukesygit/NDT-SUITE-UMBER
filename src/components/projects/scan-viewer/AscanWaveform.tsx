/**
 * AscanWaveform — displays a companion-rendered A-scan image.
 */

import { useCompanionImage } from '../../../hooks/queries/useCompanionImage';
import type { GateSettings } from '../../../types/companion';

interface AscanWaveformProps {
  port: number | null;
  folders: string[];
  scanMm: number;
  indexMm: number;
  gateSettings?: GateSettings;
  width?: number;
  height?: number;
}

export default function AscanWaveform({
  port,
  folders,
  scanMm,
  indexMm,
  gateSettings,
  width = 400,
  height = 120,
}: AscanWaveformProps) {
  const { blobUrl, isLoading } = useCompanionImage({
    port,
    type: 'ascan',
    folders,
    scanMm,
    indexMm,
    width,
    height,
    gateSettings,
    enabled: !!port && folders.length > 0,
  });

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
          alt="A-scan waveform"
          style={{ width: '100%', height: '100%', objectFit: 'fill' }}
        />
      )}

      <span style={{
        position: 'absolute',
        top: 4,
        left: 6,
        fontSize: '0.6rem',
        color: 'rgba(255,255,255,0.5)',
        pointerEvents: 'none',
      }}>
        A-scan
      </span>

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

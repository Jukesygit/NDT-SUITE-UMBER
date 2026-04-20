/**
 * AscanWaveform — displays a companion-rendered A-scan image.
 *
 * Fills its parent container.
 */

import { useEffect, useRef, useState } from 'react';
import { useCompanionImage } from '../../../hooks/queries/useCompanionImage';
import type { GateSettings } from '../../../types/companion';

interface AscanWaveformProps {
  port: number | null;
  folders: string[];
  scanMm: number;
  indexMm: number;
  gateSettings?: GateSettings;
}

export default function AscanWaveform({
  port,
  folders,
  scanMm,
  indexMm,
  gateSettings,
}: AscanWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 120 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) setSize({ w: Math.round(w), h: Math.round(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { blobUrl, isLoading } = useCompanionImage({
    port,
    type: 'ascan',
    folders,
    scanMm,
    indexMm,
    width: size.w,
    height: size.h,
    gateSettings,
    enabled: !!port && folders.length > 0,
  });

  return (
    <div ref={containerRef} style={{
      position: 'relative',
      width: '100%',
      height: '100%',
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

/**
 * BscanStrip — displays a companion-rendered B-scan image.
 *
 * Uses useCompanionImage for request coalescing.
 * Fills its parent container; pass explicit width/height to override.
 */

import { useEffect, useRef, useState } from 'react';
import { useCompanionImage } from '../../../hooks/queries/useCompanionImage';
import type { GateSettings } from '../../../types/companion';

interface BscanStripProps {
  type: 'bscan-axial' | 'bscan-index';
  port: number | null;
  folders: string[];
  scanMm: number;
  indexMm: number;
  gateSettings?: GateSettings;
  /** When provided, use this blob URL directly and skip internal HTTP fetching. */
  blobUrl?: string | null;
}

export default function BscanStrip({
  type,
  port,
  folders,
  scanMm,
  indexMm,
  gateSettings,
  blobUrl: externalBlobUrl,
}: BscanStripProps) {
  // Use internal HTTP fetch when no external blob URL is available.
  // externalBlobUrl is undefined when prop not passed (project viewer),
  // or null when WebSocket hasn't returned data yet — both mean "use HTTP".
  const useInternalFetch = !externalBlobUrl;
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 150 });

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

  // When an external blobUrl is provided (via WebSocket), skip HTTP fetching.
  // The hook is always called (hooks can't be conditional) but disabled.
  const { blobUrl: internalBlobUrl, isLoading, degraded } = useCompanionImage({
    port,
    type,
    folders,
    scanMm,
    indexMm,
    width: size.w,
    height: size.h,
    gateSettings,
    enabled: useInternalFetch && !!port && folders.length > 0,
  });

  const blobUrl = useInternalFetch ? internalBlobUrl : externalBlobUrl;

  const label = type === 'bscan-axial' ? 'D-scan (axial)' : 'B-scan (index)';

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

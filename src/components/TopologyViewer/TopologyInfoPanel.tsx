import type { CscanData } from '../CscanVisualizer/types';
import type { HoverInfo } from './types';

interface TopologyInfoPanelProps {
  hoverInfo: HoverInfo | null;
  cscanData: CscanData | null;
  nominalThickness: number;
  isAutoNominal: boolean;
  isDecimated: boolean;
  isGeometryClamped: boolean;
  isDenoised: boolean;
}

const LABEL: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 11,
  minWidth: 56,
};

const VALUE: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  color: 'var(--text-primary)',
};

function fmt(v: number, decimals = 1): string {
  return v.toFixed(decimals);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={LABEL}>{label}</span>
      <span style={VALUE}>{value}</span>
    </div>
  );
}

export default function TopologyInfoPanel({
  hoverInfo,
  cscanData,
  nominalThickness,
  isAutoNominal,
  isDecimated,
  isGeometryClamped,
  isDenoised,
}: TopologyInfoPanelProps) {
  if (!cscanData) return null;

  const stats = cscanData.stats;

  const wallLoss =
    hoverInfo?.thickness != null
      ? Math.max(0, nominalThickness - hoverInfo.thickness)
      : null;

  const validPercent =
    stats != null && stats.totalPoints > 0
      ? (stats.validPoints / stats.totalPoints) * 100
      : null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        width: 200,
        background: 'var(--ctrl)',
        opacity: 0.9,
        border: '1px solid var(--glass-border)',
        borderRadius: 4,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {/* ── Hover readout ── */}
      {hoverInfo && (
        <>
          <Row
            label="Thickness"
            value={hoverInfo.thickness != null ? `${fmt(hoverInfo.thickness)} mm` : 'ND'}
          />
          {wallLoss != null && <Row label="Wall loss" value={`${fmt(wallLoss)} mm`} />}
          <Row label="Scan" value={`${fmt(hoverInfo.scanMm)} mm`} />
          <Row label="Index" value={`${fmt(hoverInfo.indexMm)} mm`} />
          <Row label="Grid cell" value={`[${hoverInfo.row}, ${hoverInfo.col}]`} />
          <div
            style={{
              borderTop: '1px solid var(--glass-border)',
              margin: '2px 0',
            }}
          />
        </>
      )}

      {/* ── Static stats ── */}
      <Row
        label="Nominal"
        value={`${fmt(nominalThickness)} mm ${isAutoNominal ? '(auto 95th%)' : '(user)'}`}
      />
      {stats && (
        <>
          <Row label="Min" value={`${fmt(stats.min)} mm`} />
          <Row label="Max" value={`${fmt(stats.max)} mm`} />
          <Row label="Mean" value={`${fmt(stats.mean)} mm`} />
        </>
      )}
      <Row label="Grid" value={`${cscanData.width} × ${cscanData.height}`} />
      {validPercent != null && <Row label="Valid" value={`${fmt(validPercent)}%`} />}
      {isDecimated && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-dim, #9a968f)',
            fontStyle: 'italic',
            marginTop: 2,
          }}
        >
          display decimated
        </span>
      )}
      {isDenoised && (
        <span
          style={{
            fontSize: 10,
            color: '#6ba3d6',
            fontStyle: 'italic',
            marginTop: 2,
          }}
        >
          surface denoised, values raw
        </span>
      )}
      {isGeometryClamped && (
        <span
          style={{
            fontSize: 10,
            color: '#d4981e',
            fontStyle: 'italic',
            marginTop: 2,
          }}
        >
          geometry clamped, values raw
        </span>
      )}
    </div>
  );
}

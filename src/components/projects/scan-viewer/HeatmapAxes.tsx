/**
 * HeatmapAxes — axis labels around the heatmap (scan axis bottom, index axis left).
 */

interface HeatmapAxesProps {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
}

export default function HeatmapAxes({ xMin, xMax, yMin, yMax, width, height }: HeatmapAxesProps) {
  const xTicks = generateTicks(xMin, xMax, 5);
  const yTicks = generateTicks(yMin, yMax, 4);

  return (
    <>
      {/* Bottom axis — scan (mm) */}
      <div style={{
        position: 'absolute',
        bottom: -18,
        left: 0,
        width,
        display: 'flex',
        justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        {xTicks.map((v, i) => (
          <span key={i} style={{ fontSize: '0.6rem', color: 'var(--text-quaternary)' }}>
            {v.toFixed(0)}
          </span>
        ))}
      </div>
      <div style={{
        position: 'absolute',
        bottom: -30,
        left: width / 2,
        transform: 'translateX(-50%)',
        fontSize: '0.6rem',
        color: 'var(--text-quaternary)',
        pointerEvents: 'none',
      }}>
        Scan (mm)
      </div>

      {/* Left axis — index (mm) */}
      <div style={{
        position: 'absolute',
        left: -34,
        top: 0,
        height,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        {yTicks.map((v, i) => (
          <span key={i} style={{ fontSize: '0.6rem', color: 'var(--text-quaternary)', textAlign: 'right', width: 30 }}>
            {v.toFixed(0)}
          </span>
        ))}
      </div>
    </>
  );
}

function generateTicks(min: number, max: number, count: number): number[] {
  if (count <= 1) return [(min + max) / 2];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

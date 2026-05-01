import type { BackpressureState } from '../../hooks/useCompanionWebSocket';

interface Props {
  state: BackpressureState;
  avgMs: number;
}

export function BackpressureIndicator({ state, avgMs }: Props) {
  if (state === 'normal') return null;

  const color = state === 'degraded' ? 'var(--error)' : 'var(--warning)';
  const label = state === 'degraded'
    ? `Rendering slow (${avgMs}ms) — reducing update rate`
    : `Elevated latency (${avgMs}ms)`;

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      {state === 'degraded' && <span>{label}</span>}
    </span>
  );
}

interface Props {
  connected: boolean;
  port: number | null;
  wasEverConnected: boolean;
  onReconnect?: () => void;
  onSetup?: () => void;
}

export function CompanionStatusBanner({
  connected,
  port,
  wasEverConnected,
  onReconnect,
  onSetup,
}: Props) {
  if (connected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'var(--success)',
          }}
        />
        <span style={{ color: 'var(--text-secondary)' }}>
          Companion connected{port ? ` (port ${port})` : ''}
        </span>
      </div>
    );
  }

  // Only show disconnected banner if we were previously connected
  if (!wasEverConnected) return null;

  return (
    <div
      className="glass-card"
      role="alert"
      style={{
        padding: 'var(--spacing-sm) var(--spacing-md)',
        borderLeft: '4px solid var(--error)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-md)',
        fontSize: '13px',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: 'var(--error)',
        }}
      />
      <span>Companion disconnected</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--spacing-sm)' }}>
        {onReconnect && (
          <button className="btn btn--secondary" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={onReconnect}>
            Reconnect
          </button>
        )}
        {onSetup && (
          <button className="btn btn--secondary" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={onSetup}>
            Setup
          </button>
        )}
      </div>
    </div>
  );
}

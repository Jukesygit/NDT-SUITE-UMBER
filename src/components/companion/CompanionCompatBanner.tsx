import type { CompatResult } from '../../utils/companionCompat';

interface Props {
  compat: CompatResult | null;
}

export function CompanionCompatBanner({ compat }: Props) {
  if (!compat || compat.state === 'compatible') return null;

  if (compat.state === 'incompatible') {
    return (
      <div
        className="glass-card"
        role="alert"
        style={{
          padding: 'var(--spacing-md)',
          borderLeft: '4px solid var(--error)',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        <strong>Companion app is incompatible</strong>
        <p style={{ color: 'var(--text-secondary)', margin: 'var(--spacing-xs) 0 0' }}>
          Your companion app (API v{compat.companionVersion}) is too old for this version of Matrix Portal.
          Please download the latest companion app.
        </p>
      </div>
    );
  }

  return (
    <div
      className="glass-card"
      role="status"
      style={{
        padding: 'var(--spacing-md)',
        borderLeft: '4px solid var(--warning)',
        marginBottom: 'var(--spacing-md)',
      }}
    >
      <strong>Companion app is outdated</strong>
      <p style={{ color: 'var(--text-secondary)', margin: 'var(--spacing-xs) 0 0' }}>
        Some features may not work. Missing: {compat.missingFeatures.join(', ')}.
        Update your companion app for the best experience.
      </p>
    </div>
  );
}

import { useCallback } from 'react';

interface BackupCodesDisplayProps {
  codes: string[];
}

export function BackupCodesDisplay({ codes }: BackupCodesDisplayProps) {
  const handleCopyAll = useCallback(async () => {
    await navigator.clipboard.writeText(codes.join('\n'));
  }, [codes]);

  const handleDownload = useCallback(() => {
    const content = codes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [codes]);

  return (
    <div className="backup-codes-display">
      <div className="backup-codes-warning">
        <p>
          <strong>Store these securely.</strong> Each code is single-use.
        </p>
      </div>
      <div
        className="backup-codes-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.5rem',
          fontFamily: 'monospace',
        }}
      >
        {codes.map((code) => (
          <div key={code} className="backup-code mono">
            {code}
          </div>
        ))}
      </div>
      <div
        className="backup-codes-actions"
        style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}
      >
        <button type="button" onClick={handleCopyAll}>
          Copy All
        </button>
        <button type="button" onClick={handleDownload}>
          Download
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useCompanionDirectory } from '../../hooks/queries/useCompanionDirectory';
import { useRecentDirectories } from '../../hooks/useRecentDirectories';

interface Props {
  port: number | null;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export function DirectoryBrowser({ port, onSelect, onCancel }: Props) {
  const [currentPath, setCurrentPath] = useState('');
  const { data, isLoading } = useCompanionDirectory(port, currentPath);
  const { directories: recent, addDirectory } = useRecentDirectories();

  const breadcrumbs = currentPath ? currentPath.split(/[/\\]/).filter(Boolean) : [];

  const handleSelect = (dirName: string) => {
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const newPath = currentPath ? `${currentPath}${sep}${dirName}` : dirName;
    setCurrentPath(newPath);
  };

  const handleConfirm = () => {
    if (currentPath) {
      addDirectory(currentPath);
      onSelect(currentPath);
    }
  };

  const navigateTo = (index: number) => {
    if (index < 0) {
      setCurrentPath('');
      return;
    }
    const sep = currentPath.includes('\\') ? '\\' : '/';
    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    setCurrentPath(parts.slice(0, index + 1).join(sep));
  };

  return (
    <div className="glass-card" style={{ padding: 'var(--spacing-md)', maxWidth: 500 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-sm)' }}>
        <h4 style={{ margin: 0 }}>Select Directory</h4>
        <button className="btn btn--secondary" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {/* Breadcrumbs */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: 'var(--spacing-sm)', fontSize: '12px' }}>
        <button
          onClick={() => navigateTo(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '2px 4px' }}
        >
          Root
        </button>
        {breadcrumbs.map((part, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>/</span>
            <button
              onClick={() => navigateTo(i)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '2px 4px' }}
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* Recent directories */}
      {!currentPath && recent.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-sm)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Recent</div>
          {recent.map((dir) => (
            <button
              key={dir}
              onClick={() => { setCurrentPath(dir); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: '13px',
                borderRadius: '4px',
              }}
              onMouseOver={(e) => { (e.target as HTMLElement).style.background = 'var(--surface-elevated)'; }}
              onMouseOut={(e) => { (e.target as HTMLElement).style.background = 'none'; }}
            >
              {dir}
            </button>
          ))}
        </div>
      )}

      {/* Directory entries */}
      <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
        {isLoading && <div style={{ padding: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>Loading...</div>}
        {data?.entries.map((entry) => (
          <button
            key={entry.name}
            onClick={() => handleSelect(entry.name)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
            onMouseOver={(e) => { (e.target as HTMLElement).style.background = 'var(--surface-elevated)'; }}
            onMouseOut={(e) => { (e.target as HTMLElement).style.background = 'none'; }}
          >
            {entry.name}
          </button>
        ))}
        {data && data.entries.length === 0 && (
          <div style={{ padding: 'var(--spacing-md)', color: 'var(--text-secondary)', fontSize: '13px' }}>
            No subdirectories
          </div>
        )}
      </div>

      {/* Confirm button */}
      {currentPath && (
        <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button className="btn btn--primary" style={{ flex: 1, minHeight: 44 }} onClick={handleConfirm}>
            Select: {currentPath.split(/[/\\]/).pop()}
          </button>
        </div>
      )}
    </div>
  );
}

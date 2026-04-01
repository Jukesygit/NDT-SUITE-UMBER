import type { ParsedData } from './types';

interface ImportPreviewProps {
  parseData: ParsedData;
  fileType: 'csv' | 'excel' | null;
  onCancel: () => void;
  onStartImport: () => void;
}

export default function ImportPreview({ parseData, fileType, onCancel, onStartImport }: ImportPreviewProps) {
  return (
    <div>
      <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
        <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '12px' }}>
          Preview ({fileType === 'excel' ? 'Excel' : 'CSV'} File)
        </h4>
        <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
          Found <strong style={{ color: '#10b981' }}>{parseData.rows.length}</strong> employees to import
        </div>

        <div style={{ maxHeight: '300px', overflowY: 'auto' }} className="glass-scrollbar">
          <table style={{ width: '100%', fontSize: '13px' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(8px)' }}>
              <tr>
                <th style={{ padding: '8px', textAlign: 'left', color: 'rgba(255, 255, 255, 0.7)' }}>Name</th>
                <th style={{ padding: '8px', textAlign: 'left', color: 'rgba(255, 255, 255, 0.7)' }}>Email</th>
                <th style={{ padding: '8px', textAlign: 'left', color: 'rgba(255, 255, 255, 0.7)' }}>Position</th>
                <th style={{ padding: '8px', textAlign: 'left', color: 'rgba(255, 255, 255, 0.7)' }}>Mobile</th>
              </tr>
            </thead>
            <tbody>
              {parseData.rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                    {row['Employee Name'] as string}
                  </td>
                  <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px' }}>
                    {(row['Email Address'] as string) || <span style={{ color: '#ef4444' }}>Missing</span>}
                  </td>
                  <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.6)' }}>
                    {(row['Job Position'] as string) || '-'}
                  </td>
                  <td style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.6)' }}>
                    {(row['Mobile Number'] as string) || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button onClick={onStartImport} className="btn-primary">
          Start Import
        </button>
      </div>
    </div>
  );
}

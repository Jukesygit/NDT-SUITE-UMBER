import React from 'react';

interface ImportCompleteProps {
  successCount: number;
  totalCount: number;
  errors: string[];
  onClose: () => void;
}

export default function ImportComplete({ successCount, totalCount, errors, onClose }: ImportCompleteProps) {
  return (
    <div>
      <div className="glass-card" style={{ padding: '32px', textAlign: 'center', marginBottom: '20px' }}>
        <svg style={{ width: '64px', height: '64px', margin: '0 auto 16px', color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <h4 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
          Import Complete
        </h4>
        <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
          Successfully imported <strong style={{ color: '#10b981' }}>{successCount}</strong> of {totalCount} employees
        </p>
      </div>

      {errors.length > 0 && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '20px', borderLeft: '4px solid #ef4444' }}>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444', marginBottom: '12px' }}>
            Errors ({errors.length})
          </h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }} className="glass-scrollbar">
            {errors.map((error, i) => (
              <div key={i} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                {error}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button onClick={onClose} className="btn-primary">
          Close and View Personnel
        </button>
      </div>
    </div>
  );
}

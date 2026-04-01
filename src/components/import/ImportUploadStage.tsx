import React from 'react';

interface ImportUploadStageProps {
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ImportUploadStage({ onFileUpload }: ImportUploadStageProps) {
  return (
    <div>
      <div className="glass-card" style={{ padding: '32px', textAlign: 'center', marginBottom: '20px' }}>
        <svg style={{ width: '64px', height: '64px', margin: '0 auto 16px', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '20px' }}>
          Upload your Training and Competency Matrix file
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={onFileUpload}
          style={{ display: 'none' }}
          id="file-upload"
        />
        <label htmlFor="file-upload" className="btn-primary" style={{ display: 'inline-block', cursor: 'pointer' }}>
          Choose File (CSV or Excel)
        </label>
      </div>

      <div className="glass-item" style={{ padding: '16px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginBottom: '12px' }}>
          Supported Formats:
        </h4>
        <ul style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
          <li><strong>Excel (.xlsx, .xls):</strong> Training and Competency Matrix format</li>
          <li><strong>CSV (.csv):</strong> Exported matrix data</li>
        </ul>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff', marginTop: '16px', marginBottom: '12px' }}>
          Import Features:
        </h4>
        <ul style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)', margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
          <li>Creates or updates user accounts</li>
          <li>Imports all competency data with expiry dates</li>
          <li>Handles Excel date formats automatically</li>
          <li>Skips empty or N/A values</li>
          <li>Generates emails for users without them</li>
        </ul>
      </div>
    </div>
  );
}

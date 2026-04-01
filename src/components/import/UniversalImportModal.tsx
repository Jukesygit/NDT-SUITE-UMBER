import React, { useState } from 'react';
import { parseExcelFile, parseCSVFile } from './parseUtils';
import { runImport } from './importLogic';
import ImportUploadStage from './ImportUploadStage';
import ImportPreview from './ImportPreview';
import ImportProgressStage from './ImportProgressStage';
import ImportComplete from './ImportComplete';
import type { ParsedData, ImportProgress, ImportStage, UniversalImportModalProps } from './types';

export default function UniversalImportModal({ onClose, onComplete }: UniversalImportModalProps) {
  const [_file, setFile] = useState<File | null>(null);
  const [parseData, setParseData] = useState<ParsedData | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress>({ current: 0, total: 0, status: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [stage, setStage] = useState<ImportStage>('upload');
  const [fileType, setFileType] = useState<'csv' | 'excel' | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setErrors([]);

    const fileName = uploadedFile.name.toLowerCase();

    if (fileName.endsWith('.csv')) {
      setFileType('csv');
      parseCSVFile(uploadedFile, setParseData, setStage, setErrors);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      setFileType('excel');
      parseExcelFile(uploadedFile, setParseData, setStage, setErrors);
    } else {
      setErrors(['Please upload a CSV or Excel file (.csv, .xlsx, .xls)']);
    }
  };

  const handleCancel = () => {
    setStage('upload');
    setParseData(null);
    setFile(null);
    setFileType(null);
  };

  const startImport = () => {
    if (!parseData) return;
    runImport(parseData, setImporting, setStage, setProgress, setSuccessCount, setErrors);
  };

  const handleComplete = () => {
    onComplete();
    onClose();
  };

  return (
    <div className="modal" style={{ display: 'flex', position: 'fixed', inset: 0, zIndex: 9999 }}>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
            Import Personnel from File
          </h3>
          <button
            onClick={onClose}
            disabled={importing}
            style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', fontSize: '24px', padding: 0 }}
          >
            &times;
          </button>
        </div>

        {stage === 'upload' && (
          <ImportUploadStage onFileUpload={handleFileUpload} />
        )}

        {stage === 'preview' && parseData && (
          <ImportPreview
            parseData={parseData}
            fileType={fileType}
            onCancel={handleCancel}
            onStartImport={startImport}
          />
        )}

        {stage === 'importing' && (
          <ImportProgressStage progress={progress} />
        )}

        {stage === 'complete' && (
          <ImportComplete
            successCount={successCount}
            totalCount={parseData?.rows.length ?? 0}
            errors={errors}
            onClose={handleComplete}
          />
        )}
      </div>
    </div>
  );
}

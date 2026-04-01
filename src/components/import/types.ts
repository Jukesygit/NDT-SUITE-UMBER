export interface ParsedData {
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface ImportProgress {
  current: number;
  total: number;
  status: string;
}

export type ImportStage = 'upload' | 'preview' | 'importing' | 'complete';

export interface UniversalImportModalProps {
  onClose: () => void;
  onComplete: () => void;
}

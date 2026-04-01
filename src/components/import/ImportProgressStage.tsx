import { RandomMatrixSpinner } from '../MatrixSpinners';
import type { ImportProgress } from './types';

interface ImportProgressStageProps {
  progress: ImportProgress;
}

export default function ImportProgressStage({ progress }: ImportProgressStageProps) {
  return (
    <div>
      <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <RandomMatrixSpinner size={100} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
            {progress.status}
          </div>
          <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)' }}>
            {progress.current} of {progress.total} employees
          </div>
        </div>

        <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
              transition: 'width 0.3s ease'
            }}
          ></div>
        </div>
      </div>
    </div>
  );
}

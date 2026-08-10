import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { CscanData, OffsetDetection } from './types';
import { checkOverlapAgreement, OverlapCheck, OVERLAP_CONFIRM_MM } from './utils/overlapConfidence';
import { detectionShift } from './utils/fileParser';

export interface TruncatedFileInfo {
  filename: string;
  expected: number;
  actual: number;
}

/**
 * Derives the repair modal's cross-check state: overlap agreement at the
 * currently proposed placement (shift axes virtually — data arrays are
 * shared by reference, detectionShift is the same transform the repair
 * applies), truncated-export warnings, and whether any placement rests on
 * the batch halving heuristic.
 */
export const useRepairCrossCheck = (
  scans: CscanData[],
  detections: OffsetDetection[],
  correctIndex: boolean,
  correctScan: boolean
) => {
  const overlapChecks = useMemo(() => {
    const previews = scans
      .filter((s) => !s.isComposite)
      .map((scan) => {
        const d = detections.find((det) => det.fileId === scan.id);
        if (!d) return scan;
        const { dx, dy } = detectionShift(d, correctIndex, correctScan);
        if (dx === 0 && dy === 0) return scan;
        return {
          ...scan,
          xAxis: dx !== 0 ? scan.xAxis.map((x) => x + dx) : scan.xAxis,
          yAxis: dy !== 0 ? scan.yAxis.map((y) => y + dy) : scan.yAxis,
        };
      });
    return checkOverlapAgreement(previews);
  }, [scans, detections, correctIndex, correctScan]);

  const truncatedFiles = useMemo<TruncatedFileInfo[]>(
    () =>
      scans
        .filter((s) => s.metadata?._truncatedRows)
        .map((s) => ({ filename: s.filename, ...s.metadata!._truncatedRows })),
    [scans]
  );

  const usesHalving = detections.some(
    (d) => d.indexSource === 'metadata-halved' || d.scanSource === 'metadata-halved'
  );

  return { overlapChecks, truncatedFiles, usesHalving };
};

interface CsvRepairOverlapPanelProps {
  checks: OverlapCheck[];
  truncatedFiles: TruncatedFileInfo[];
  usesHalving: boolean;
}

/**
 * Repair-modal section: truncated-export warnings plus the overlap
 * cross-check — do overlapping tiles agree where they cover the same
 * physical region under the currently proposed placement?
 */
const CsvRepairOverlapPanel: React.FC<CsvRepairOverlapPanelProps> = ({
  checks,
  truncatedFiles,
  usesHalving,
}) => {
  const confirmed = checks.filter((c) => c.verdict === 'confirmed');
  const mismatched = checks.filter((c) => c.verdict === 'mismatch');

  if (checks.length === 0 && truncatedFiles.length === 0 && !usesHalving) return null;

  return (
    <div className="space-y-3">
      {usesHalving && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-sm"
          style={{ backgroundColor: '#3a2f0f' }}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-amber-200/90">
            Some positions were inferred by halving doubled metadata (Source: &quot;metadata
            ÷2&quot;) — a batch-level heuristic. Verify them with the overlap cross-check below
            before applying.
          </p>
        </div>
      )}

      {truncatedFiles.length > 0 && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-sm"
          style={{ backgroundColor: '#3a2f0f' }}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-amber-200/90">
            <p className="font-medium">
              Truncated export{truncatedFiles.length !== 1 ? 's' : ''} detected
            </p>
            {truncatedFiles.map((f) => (
              <p key={f.filename} className="font-mono text-xs mt-1" title={f.filename}>
                {f.filename}: {f.actual} of {f.expected} rows — the missing region will stay empty.
                Re-export from the instrument if possible.
              </p>
            ))}
          </div>
        </div>
      )}

      {checks.length > 0 && (
        <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#111827' }}>
          <p className="text-gray-300 mb-2">
            Overlap cross-check:{' '}
            <span className={mismatched.length > 0 ? 'text-red-400' : 'text-green-400'}>
              {confirmed.length} of {checks.length} overlapping pair
              {checks.length !== 1 ? 's' : ''} agree within {OVERLAP_CONFIRM_MM} mm
            </span>
          </p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {checks.map((c) => (
              <div
                key={`${c.fileA}|${c.fileB}`}
                className="flex items-center gap-2 text-xs text-gray-400"
                title={`${c.points.toLocaleString()} co-valid points`}
              >
                {c.verdict === 'confirmed' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                )}
                {c.verdict === 'mismatch' && (
                  <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                )}
                {c.verdict === 'insufficient' && (
                  <MinusCircle className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                )}
                <span className="truncate">
                  {c.fileA} ↔ {c.fileB}
                </span>
                <span className="ml-auto shrink-0 font-mono">
                  {c.verdict === 'insufficient'
                    ? 'no overlap data'
                    : `Δ ${c.meanAbsDiff.toFixed(3)} mm`}
                </span>
              </div>
            ))}
          </div>
          {mismatched.length > 0 && (
            <p className="mt-2 text-xs text-red-300/90">
              Disagreeing overlaps usually mean a tile is still misplaced — check the Source column
              and try &quot;Prioritize filenames&quot; before applying.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default CsvRepairOverlapPanel;

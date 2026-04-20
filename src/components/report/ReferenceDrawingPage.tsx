/**
 * ReferenceDrawingPage — displays reference drawings (P&ID, GA, plot plan, etc.)
 * as full-page images with labeled figure captions.
 */

import { useEffect, useState } from 'react';
import type { ProjectFile } from '../../types/inspection-project';
import type { FigureCounter } from './ReportDocument';
import { getProjectFileUrl } from '../../services/inspection-project-service';

export interface ReferenceDrawingPageProps {
    drawings: ProjectFile[];
    figureCounter: FigureCounter;
}

const FILE_TYPE_LABELS: Record<string, string> = {
    ga_drawing: 'General Arrangement Drawing',
    pid: 'P&ID',
    pid_drawing: 'P&ID',
    location_drawing: 'Location Drawing',
    plot_plan: 'Plot Plan',
};

function getDrawingLabel(fileType: string, name: string): string {
    return FILE_TYPE_LABELS[fileType] ?? name;
}

interface ResolvedDrawing {
    id: string;
    url: string;
    label: string;
}

export default function ReferenceDrawingPage({
    drawings,
    figureCounter,
}: ReferenceDrawingPageProps) {
    const [resolved, setResolved] = useState<ResolvedDrawing[]>([]);

    useEffect(() => {
        let cancelled = false;

        async function resolveUrls() {
            const results: ResolvedDrawing[] = [];
            for (const file of drawings) {
                try {
                    const url = await getProjectFileUrl(file.storage_path, file.storage_bucket);
                    results.push({
                        id: file.id,
                        url,
                        label: getDrawingLabel(file.file_type, file.name),
                    });
                } catch {
                    // Skip drawings that fail to resolve
                }
            }
            if (!cancelled) setResolved(results);
        }

        void resolveUrls();
        return () => {
            cancelled = true;
        };
    }, [drawings]);

    if (resolved.length === 0) return null;

    return (
        <div>
            <div className="report-section-header">Reference Drawings</div>
            {resolved.map((drawing) => (
                <div key={drawing.id} style={{ marginBottom: 20 }}>
                    <img
                        className="report-full-image"
                        src={drawing.url}
                        alt={drawing.label}
                    />
                    <div className="report-figure-caption">
                        Figure {figureCounter.next()} — {drawing.label}
                    </div>
                </div>
            ))}
        </div>
    );
}

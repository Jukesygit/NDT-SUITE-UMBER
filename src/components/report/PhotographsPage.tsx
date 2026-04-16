/**
 * PhotographsPage — displays site photographs in a 2-column grid for the PAUT report.
 *
 * Each image is rendered in a card with a figure caption showing its name/description.
 * Storage URLs are resolved on mount via signed URL generation.
 */

import { useEffect, useState } from 'react';
import type { ProjectImage } from '@/types/inspection-project';
import type { FigureCounter } from './ReportDocument';
import { getProjectFileUrl } from '@/services/inspection-project-service';

export interface PhotographsPageProps {
    images: ProjectImage[];
    figureCounter: FigureCounter;
}

interface ResolvedImage {
    id: string;
    url: string;
    caption: string;
}

export default function PhotographsPage({ images, figureCounter }: PhotographsPageProps) {
    const [resolved, setResolved] = useState<ResolvedImage[]>([]);

    useEffect(() => {
        let cancelled = false;

        async function resolveUrls() {
            const results: ResolvedImage[] = [];
            for (const img of images) {
                try {
                    const url = await getProjectFileUrl(img.storage_path, img.storage_bucket);
                    results.push({
                        id: img.id,
                        url,
                        caption: img.description || img.name,
                    });
                } catch {
                    // Skip images that fail to resolve
                }
            }
            if (!cancelled) setResolved(results);
        }

        void resolveUrls();
        return () => {
            cancelled = true;
        };
    }, [images]);

    if (resolved.length === 0) return null;

    return (
        <div>
            <div className="report-section-header">Photographs</div>
            <div className="report-image-grid">
                {resolved.map((img) => (
                    <div key={img.id} className="report-image-card">
                        <img src={img.url} alt={img.caption} />
                        <div className="report-image-card__label">
                            Figure {figureCounter.next()} — {img.caption}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

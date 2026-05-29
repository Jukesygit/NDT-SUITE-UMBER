import { useState, useRef } from 'react';
import CollapsibleSection from './CollapsibleSection';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel } from '../../../types/inspection-project';

interface ResultsSummarySectionProps {
    vessel: ProjectVessel;
    projectId: string;
}

export default function ResultsSummarySection({ vessel, projectId }: ResultsSummarySectionProps) {
    const updateVessel = useUpdateProjectVessel();
    const [value, setValue] = useState(vessel.results_summary ?? '');
    const originalRef = useRef(vessel.results_summary ?? '');

    const handleBlur = () => {
        if (value === originalRef.current) return;
        originalRef.current = value;
        updateVessel.mutate({
            id: vessel.id,
            projectId,
            params: { resultsSummary: value || null },
        });
    };

    return (
        <CollapsibleSection title="Inspection Results Summary">
            <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={handleBlur}
                placeholder="Enter inspection results summary..."
                style={{
                    width: '100%',
                    minHeight: 120,
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    background: 'var(--clean-surface)',
                    border: '1px solid var(--clean-border)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--clean-text-primary)',
                    outline: 'none',
                }}
            />
        </CollapsibleSection>
    );
}

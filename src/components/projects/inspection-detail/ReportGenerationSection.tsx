import { useNavigate } from 'react-router-dom';
import CollapsibleSection from './CollapsibleSection';
import type {
    ProjectVessel,
    InspectionProject,
    InspectionProcedure,
    ProjectFile,
    ScanLogEntry,
    CalibrationLogEntry,
} from '../../../types/inspection-project';

interface ReportGenerationSectionProps {
    vessel: ProjectVessel;
    project: InspectionProject;
    procedures: InspectionProcedure[];
    files: ProjectFile[];
    scanLogEntries: ScanLogEntry[];
    calLogEntries: CalibrationLogEntry[];
    compositeCount: number;
    overviewUrl?: string;
}

interface CheckItem {
    label: string;
    ready: boolean;
    info?: string;
    external?: boolean;
}

function StatusDot({ ready }: { ready: boolean }) {
    return (
        <span
            style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: ready ? 'var(--clean-green)' : 'var(--clean-border)',
                flexShrink: 0,
            }}
        />
    );
}

export default function ReportGenerationSection({
    vessel,
    project,
    procedures,
    files,
    scanLogEntries,
    calLogEntries,
    compositeCount,
    overviewUrl,
}: ReportGenerationSectionProps) {
    const navigate = useNavigate();
    const checks: CheckItem[] = [
        {
            label: 'Component Details',
            ready: !!(vessel.description || vessel.material),
        },
        {
            label: 'Procedure',
            ready: !!vessel.procedure_id && procedures.length > 0,
        },
        {
            label: 'Equipment',
            ready: !!vessel.equipment_config?.model,
        },
        {
            label: 'Calibration Log',
            ready: calLogEntries.length > 0,
        },
        {
            label: 'Scan Log',
            ready: scanLogEntries.length > 0,
        },
        {
            label: 'Annotations',
            ready: true,
            info: `${compositeCount} composite${compositeCount !== 1 ? 's' : ''}`,
            external: true,
        },
        {
            label: 'Documents',
            ready: files.length > 0,
            external: true,
        },
        {
            label: 'Results Summary',
            ready: !!vessel.results_summary,
        },
        {
            label: 'Sign-off',
            ready: !!vessel.signoff_details?.technician?.name,
        },
    ];

    const allReady = checks.every((c) => c.ready);
    const readyCount = checks.filter((c) => c.ready).length;

    return (
        <CollapsibleSection title="Report Generation">
            {/* Progress summary */}
            <div
                style={{
                    fontSize: '0.85rem',
                    color: 'var(--clean-text-secondary)',
                    marginBottom: 12,
                }}
            >
                {readyCount} of {checks.length} sections ready
            </div>

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {checks.map((item) => (
                    <div
                        key={item.label}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 12px',
                            background: 'var(--clean-surface-secondary)',
                            border: '1px solid var(--clean-border)',
                            borderRadius: 6,
                        }}
                    >
                        <StatusDot ready={item.ready} />
                        <span
                            style={{
                                flex: 1,
                                fontSize: '0.85rem',
                                color: item.ready ? 'var(--clean-text-primary)' : 'var(--clean-text-tertiary)',
                            }}
                        >
                            {item.label}
                        </span>
                        <span
                            style={{
                                fontSize: '0.78rem',
                                color: item.info
                                    ? 'var(--clean-text-tertiary)'
                                    : item.ready
                                      ? 'var(--clean-badge-green-text)'
                                      : 'var(--clean-text-quaternary)',
                            }}
                        >
                            {item.info ??
                                (item.ready
                                    ? 'Ready'
                                    : overviewUrl && item.external
                                      ? (
                                            <a
                                                href={overviewUrl}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    navigate(overviewUrl);
                                                }}
                                                style={{
                                                    color: 'var(--clean-green)',
                                                    textDecoration: 'none',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Manage on overview
                                            </a>
                                        )
                                      : 'Not filled')}
                        </span>
                    </div>
                ))}
            </div>

            {/* Generate button */}
            <button
                type="button"
                disabled={!allReady}
                className={allReady ? 'pj-btn primary' : 'pj-btn secondary'}
                style={{
                    marginTop: 16,
                    width: '100%',
                    opacity: allReady ? 1 : 0.5,
                    cursor: allReady ? 'pointer' : 'not-allowed',
                }}
                onClick={() => {
                    if (allReady) {
                        window.open(
                            `/projects/${project.id}/vessels/${vessel.id}/report`,
                            '_blank',
                        );
                    }
                }}
            >
                Generate Report
            </button>
        </CollapsibleSection>
    );
}

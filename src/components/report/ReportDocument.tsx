/**
 * ReportDocument — top-level layout that assembles all PAUT report pages.
 *
 * Receives all data as props and renders each page section with
 * page-break dividers between them. Figure numbering is tracked
 * with a mutable counter passed down to child pages.
 */

import { useMemo } from 'react';
import type {
    InspectionProject,
    ProjectVessel,
    InspectionProcedure,
    ProjectFile,
    ScanLogEntry,
    CalibrationLogEntry,
    ProjectImage,
} from '@/types/inspection-project';

import CoverPage from './CoverPage';
import ReportHeader from './ReportHeader';
// Pages created in subsequent tasks — uncomment as they become available
// import DashboardPage from './DashboardPage';
// import InspectionResultPage from './InspectionResultPage';
// import PhotographsPage from './PhotographsPage';
// import FlattenedProjectionPage from './FlattenedProjectionPage';
// import VesselOverviewPage from './VesselOverviewPage';
// import ScanLogPage from './ScanLogPage';
// import CalibrationLogPage from './CalibrationLogPage';
// import ReferenceDrawingPage from './ReferenceDrawingPage';

export interface ReportDocumentProps {
    project: InspectionProject;
    vessel: ProjectVessel;
    procedures: InspectionProcedure[];
    files: ProjectFile[];
    scanLogEntries: ScanLogEntry[];
    calLogEntries: CalibrationLogEntry[];
    images: ProjectImage[];
    modelConfig?: Record<string, unknown>;
    reportAssets?: Record<string, unknown>;
}

/** Mutable counter that child pages increment as they render figures. */
export interface FigureCounter {
    current: number;
    next(): number;
}

function createFigureCounter(): FigureCounter {
    const counter: FigureCounter = {
        current: 0,
        next() {
            counter.current += 1;
            return counter.current;
        },
    };
    return counter;
}

export default function ReportDocument({
    project,
    vessel,
    procedures,
    files,
    scanLogEntries,
    calLogEntries,
    images,
    modelConfig,
    reportAssets,
}: ReportDocumentProps) {
    // Extract model state and pre-rendered images from config
    const modelState = modelConfig?.modelState as Record<string, unknown> | undefined;
    const annotations = (modelState?.annotations ?? []) as Record<string, unknown>[];
    // Will be used by DashboardPage / InspectionResultPage (Tasks 9-10)
    const _scanComposites = (modelConfig?.scanComposites ?? []) as Record<string, unknown>[];
    const _thresholds = modelConfig?.thresholds as Record<string, unknown> | undefined;
    void _scanComposites;
    void _thresholds;

    // Pre-rendered report images from reportAssets
    const overviewRenders = (reportAssets?.overviewRenders ?? []) as string[];
    const flattenedView = reportAssets?.flattenedView as string | undefined;
    // Will be used by InspectionResultPage (Task 10)
    const _annotationRenders = (reportAssets?.annotationRenders ?? {}) as Record<string, string[]>;
    void _annotationRenders;

    // Figure numbering counter — will be passed to child pages in Tasks 9-11
    const _figureCounter = useMemo(() => createFigureCounter(), []);
    void _figureCounter;

    // Reference drawings from files
    const referenceDrawings = files.filter(
        (f) => f.file_type === 'ga_drawing' || f.file_type === 'location_drawing'
    );

    // Photos from images pool
    const photos = images;

    // Common header props
    const reportTitle = 'PAUT Inspection Report';
    const reportNumber = project.report_number;
    const vesselName = vessel.vessel_name;
    const reportDate = project.start_date;

    return (
        <div className="report-document">
            {/* Page 1: Cover */}
            <CoverPage project={project} vessel={vessel} procedures={procedures} />
            <div className="page-break" />

            {/* Page 2: Executive Dashboard */}
            <ReportHeader
                reportTitle={reportTitle}
                reportNumber={reportNumber}
                vesselName={vesselName}
                date={reportDate}
            />
            {/* TODO: <DashboardPage /> — Task 9 */}
            <div className="report-section-header">Executive Dashboard</div>
            <p style={{ color: 'var(--report-text-muted)', fontStyle: 'italic' }}>
                Dashboard page placeholder — will be implemented in Task 9.
            </p>
            <div className="page-break" />

            {/* Page 3: Photographs */}
            {photos.length > 0 && (
                <>
                    <ReportHeader
                        reportTitle={reportTitle}
                        reportNumber={reportNumber}
                        vesselName={vesselName}
                        date={reportDate}
                    />
                    {/* TODO: <PhotographsPage /> — Task 11 */}
                    <div className="report-section-header">Photographs</div>
                    <p style={{ color: 'var(--report-text-muted)', fontStyle: 'italic' }}>
                        Photographs page placeholder — will be implemented in Task 11.
                    </p>
                    <div className="page-break" />
                </>
            )}

            {/* Per-annotation inspection result pages */}
            {annotations.map((annotation, idx) => {
                const annotationId = annotation.id as string;
                return (
                    <div key={annotationId ?? idx}>
                        <ReportHeader
                            reportTitle={reportTitle}
                            reportNumber={reportNumber}
                            vesselName={vesselName}
                            date={reportDate}
                        />
                        {/* TODO: <InspectionResultPage /> — Task 10 */}
                        <div className="report-section-header">
                            Inspection Result — {(annotation.label as string) ?? `Area ${idx + 1}`}
                        </div>
                        <p style={{ color: 'var(--report-text-muted)', fontStyle: 'italic' }}>
                            Inspection result page placeholder — will be implemented in Task 10.
                        </p>
                        <div className="page-break" />
                    </div>
                );
            })}

            {/* Flattened Projection */}
            {flattenedView && (
                <>
                    <ReportHeader
                        reportTitle={reportTitle}
                        reportNumber={reportNumber}
                        vesselName={vesselName}
                        date={reportDate}
                    />
                    {/* TODO: <FlattenedProjectionPage /> — Task 11 */}
                    <div className="report-section-header">Flattened Projection</div>
                    <p style={{ color: 'var(--report-text-muted)', fontStyle: 'italic' }}>
                        Flattened projection page placeholder — will be implemented in Task 11.
                    </p>
                    <div className="page-break" />
                </>
            )}

            {/* 3D Vessel Overview */}
            {overviewRenders.length > 0 && (
                <>
                    <ReportHeader
                        reportTitle={reportTitle}
                        reportNumber={reportNumber}
                        vesselName={vesselName}
                        date={reportDate}
                    />
                    {/* TODO: <VesselOverviewPage /> — Task 11 */}
                    <div className="report-section-header">3D Vessel Overview</div>
                    <p style={{ color: 'var(--report-text-muted)', fontStyle: 'italic' }}>
                        3D overview page placeholder — will be implemented in Task 11.
                    </p>
                    <div className="page-break" />
                </>
            )}

            {/* Scan Log */}
            {scanLogEntries.length > 0 && (
                <>
                    <ReportHeader
                        reportTitle={reportTitle}
                        reportNumber={reportNumber}
                        vesselName={vesselName}
                        date={reportDate}
                    />
                    {/* TODO: <ScanLogPage /> — Task 11 */}
                    <div className="report-section-header">Scan Log</div>
                    <p style={{ color: 'var(--report-text-muted)', fontStyle: 'italic' }}>
                        Scan log page placeholder — will be implemented in Task 11.
                    </p>
                    <div className="page-break" />
                </>
            )}

            {/* Calibration Log */}
            {calLogEntries.length > 0 && (
                <>
                    <ReportHeader
                        reportTitle={reportTitle}
                        reportNumber={reportNumber}
                        vesselName={vesselName}
                        date={reportDate}
                    />
                    {/* TODO: <CalibrationLogPage /> — Task 11 */}
                    <div className="report-section-header">Calibration Log</div>
                    <p style={{ color: 'var(--report-text-muted)', fontStyle: 'italic' }}>
                        Calibration log page placeholder — will be implemented in Task 11.
                    </p>
                    <div className="page-break" />
                </>
            )}

            {/* Reference Drawings */}
            {referenceDrawings.length > 0 && (
                <>
                    <ReportHeader
                        reportTitle={reportTitle}
                        reportNumber={reportNumber}
                        vesselName={vesselName}
                        date={reportDate}
                    />
                    {/* TODO: <ReferenceDrawingPage /> — Task 11 */}
                    <div className="report-section-header">Reference Drawings</div>
                    <p style={{ color: 'var(--report-text-muted)', fontStyle: 'italic' }}>
                        Reference drawings page placeholder — will be implemented in Task 11.
                    </p>
                </>
            )}
        </div>
    );
}

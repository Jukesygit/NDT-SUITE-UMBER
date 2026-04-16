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
} from '../../types/inspection-project';

import CoverPage from './CoverPage';
import DashboardPage from './DashboardPage';
import type { DashboardPageProps } from './DashboardPage';
import ReportHeader from './ReportHeader';
import InspectionResultPage from './InspectionResultPage';
import type { AnnotationShapeConfig, ThicknessThresholds } from '../VesselModeler/types';
import PhotographsPage from './PhotographsPage';
import FlattenedProjectionPage from './FlattenedProjectionPage';
import VesselOverviewPage from './VesselOverviewPage';
import ScanLogPage from './ScanLogPage';
import CalibrationLogPage from './CalibrationLogPage';
import ReferenceDrawingPage from './ReferenceDrawingPage';

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
    // Extract model state from config (buildSaveConfig stores annotations/scanComposites at root)
    const annotations = (modelConfig?.annotations ?? []) as Record<string, unknown>[];
    const thresholds = (modelConfig?.vessel as Record<string, unknown> | undefined)?.thicknessThresholds as Record<string, unknown> | undefined;

    // Pre-rendered report images from reportAssets
    // overviewRenders is { label: string; dataUrl: string }[] from captureVesselOverviews
    const overviewRenders = (reportAssets?.overviewRenders ?? []) as Array<{ label: string; dataUrl: string }>;
    const flattenedView = reportAssets?.flattenedView as string | undefined;
    // annotationHeatmaps and annotationContextImages are Record<number, string>
    const annotationHeatmaps = (reportAssets?.annotationHeatmaps ?? {}) as Record<string, string>;
    const annotationContextImages = (reportAssets?.annotationContextImages ?? {}) as Record<string, string>;

    // Figure numbering counter — passed to child pages
    const figureCounter = useMemo(() => createFigureCounter(), []);

    // Reference drawings from files
    const referenceDrawings = files.filter(
        (f) => f.file_type === 'pid_drawing' || f.file_type === 'reference' || (f.file_type as string) === 'ga_drawing' || (f.file_type as string) === 'location_drawing'
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
            <DashboardPage
                vessel={vessel}
                scanLogEntries={scanLogEntries}
                annotations={annotations}
                thresholds={thresholds as DashboardPageProps['thresholds']}
            />
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
                    <PhotographsPage images={photos} figureCounter={figureCounter} />
                    <div className="page-break" />
                </>
            )}

            {/* Per-annotation inspection result pages */}
            {annotations.map((annotation, idx) => {
                const annotationId = String(annotation.id ?? idx);
                return (
                    <div key={annotationId}>
                        <ReportHeader
                            reportTitle={reportTitle}
                            reportNumber={reportNumber}
                            vesselName={vesselName}
                            date={reportDate}
                        />
                        <InspectionResultPage
                            annotation={annotation as unknown as AnnotationShapeConfig}
                            index={idx}
                            annotationHeatmap={annotationHeatmaps[annotationId]}
                            annotationContextImage={annotationContextImages[annotationId]}
                            thresholds={thresholds as ThicknessThresholds | undefined}
                            figureCounter={figureCounter}
                        />
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
                    <FlattenedProjectionPage
                        flattenedView={flattenedView}
                        figureCounter={figureCounter}
                    />
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
                    <VesselOverviewPage
                        overviewRenders={overviewRenders}
                        figureCounter={figureCounter}
                    />
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
                    <ScanLogPage
                        entries={scanLogEntries}
                        thresholds={thresholds as { mode?: string; redBelow?: number; yellowBelow?: number } | undefined}
                    />
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
                    <CalibrationLogPage entries={calLogEntries} />
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
                    <ReferenceDrawingPage
                        drawings={referenceDrawings}
                        figureCounter={figureCounter}
                    />
                </>
            )}
        </div>
    );
}

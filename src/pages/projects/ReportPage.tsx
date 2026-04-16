import { useParams } from 'react-router-dom';
import {
    useProject,
    useProjectVessel,
    useProjectProcedures,
    useVesselFiles,
    useScanLogEntries,
    useCalibrationLogEntries,
    useProjectImages,
} from '../../hooks/queries/useInspectionProjects';
import { useVesselModelForReport } from '../../hooks/queries/useVesselModelForReport';

export default function ReportPage() {
    const { projectId, vesselId } = useParams<{ projectId: string; vesselId: string }>();

    const { data: project, isLoading: loadingProject } = useProject(projectId);
    const { data: vessel, isLoading: loadingVessel } = useProjectVessel(vesselId);
    const { data: procedures = [] } = useProjectProcedures(projectId);
    const { data: files = [] } = useVesselFiles(vesselId);
    const { data: scanLogEntries = [] } = useScanLogEntries(vesselId);
    const { data: calLogEntries = [] } = useCalibrationLogEntries(vesselId);
    const { data: images = [] } = useProjectImages(vesselId);
    const { data: vesselModel } = useVesselModelForReport(vesselId);

    const isLoading = loadingProject || loadingVessel;

    if (isLoading) {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    fontFamily: 'Inter, sans-serif',
                    color: '#94a3b8',
                }}
            >
                <p>Loading report data...</p>
            </div>
        );
    }

    if (!project || !vessel) {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    fontFamily: 'Inter, sans-serif',
                    color: '#94a3b8',
                }}
            >
                <p>Report data not found.</p>
            </div>
        );
    }

    const modelConfig = vesselModel?.config as Record<string, unknown> | undefined;
    const reportAssets = modelConfig?.reportAssets as Record<string, unknown> | undefined;

    // Placeholder -- ReportDocument will be wired in Task 7
    return (
        <div
            style={{
                maxWidth: '210mm',
                margin: '60px auto',
                padding: '20mm',
                fontFamily: 'Inter, sans-serif',
                background: 'white',
            }}
        >
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '12px',
                    background: '#0a1628',
                }}
            >
                <button
                    onClick={() => window.print()}
                    style={{
                        padding: '10px 32px',
                        background: '#00875a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Save as PDF
                </button>
            </div>
            <h1>PAUT Inspection Report</h1>
            <p>Project: {project.name}</p>
            <p>Vessel: {vessel.vessel_name}</p>
            <p>Scan log entries: {scanLogEntries.length}</p>
            <p>Calibration log entries: {calLogEntries.length}</p>
            <p>Files: {files.length}</p>
            <p>Images: {images.length}</p>
            <p>Procedures: {procedures.length}</p>
            <p>Vessel model loaded: {vesselModel ? 'Yes' : 'No'}</p>
            <p>Report assets available: {reportAssets ? 'Yes' : 'No'}</p>
            {Array.isArray(reportAssets?.overviewRenders) && (
                <p>Overview renders: {(reportAssets.overviewRenders as unknown[]).length}</p>
            )}
            {reportAssets?.flattenedView != null && <p>Flattened view: available</p>}
        </div>
    );
}

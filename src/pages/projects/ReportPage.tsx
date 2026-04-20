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
import ReportDocument from '../../components/report/ReportDocument';
import '../../components/report/report.css';

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
            <div className="report-loading">
                <div className="report-loading__spinner" />
                <p>Loading report data...</p>
            </div>
        );
    }

    if (!project || !vessel) {
        return (
            <div className="report-loading">
                <p>Report data not found.</p>
            </div>
        );
    }

    const modelConfig = vesselModel?.config as Record<string, unknown> | undefined;
    const reportAssets = modelConfig?.reportAssets as Record<string, unknown> | undefined;

    return (
        <>
            <div className="report-print-bar no-print">
                <button className="report-print-btn" onClick={() => window.print()}>
                    Save as PDF
                </button>
            </div>
            <ReportDocument
                project={project}
                vessel={vessel}
                procedures={procedures}
                files={files}
                scanLogEntries={scanLogEntries}
                calLogEntries={calLogEntries}
                images={images}
                modelConfig={modelConfig}
                reportAssets={reportAssets}
            />
        </>
    );
}

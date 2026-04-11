// ============================================================================
// Inspection Project Types
// ============================================================================

export type ProjectStatus = 'planned' | 'mobilizing' | 'in_progress' | 'review' | 'completed' | 'archived';

export type VesselStatus = 'not_started' | 'setup' | 'scanning' | 'annotating' | 'report_ready' | 'completed';

export type ProjectFileType = 'ga_drawing' | 'location_drawing' | 'photo' | 'reference' | 'report' | 'nde_file' | 'other';

export interface EquipmentConfig {
    model?: string;
    probe?: string;
    wedge?: string;
    calibration_blocks?: string;
    procedure_ref?: string;
    beamset_config?: string;
}

export interface CompanionConfig {
    watch_folder?: string;
    auto_upload_enabled?: boolean;
}

export interface DrawingData {
    url: string;
    filename: string;
    size_bytes?: number;
    annotations?: DrawingAnnotation[];
    comment?: string;
}

export interface DrawingAnnotation {
    id: string;
    type: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    label?: string;
}

// ----------------------------------------------------------------------------
// Inspection Project
// ----------------------------------------------------------------------------

export interface InspectionProject {
    id: string;
    organization_id: string;
    created_by: string;
    name: string;
    status: ProjectStatus;
    client_name: string | null;
    site_name: string | null;
    location_description: string | null;
    start_date: string | null;
    end_date: string | null;
    equipment: EquipmentConfig;
    companion_config: CompanionConfig;
    created_at: string;
    updated_at: string;
}

export interface InspectionProjectSummary {
    id: string;
    name: string;
    status: ProjectStatus;
    client_name: string | null;
    site_name: string | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
    updated_at: string;
    vessel_count: number;
    completed_vessel_count: number;
}

export interface CreateProjectParams {
    name: string;
    organizationId: string;
    userId: string;
    clientName?: string;
    siteName?: string;
    locationDescription?: string;
    startDate?: string;
    endDate?: string;
    equipment?: EquipmentConfig;
}

export interface UpdateProjectParams {
    name?: string;
    status?: ProjectStatus;
    clientName?: string;
    siteName?: string;
    locationDescription?: string;
    startDate?: string;
    endDate?: string;
    equipment?: EquipmentConfig;
    companionConfig?: CompanionConfig;
}

// ----------------------------------------------------------------------------
// Project Vessel
// ----------------------------------------------------------------------------

export interface ProjectVessel {
    id: string;
    project_id: string;
    vessel_name: string;
    vessel_tag: string | null;
    vessel_type: string | null;
    vessel_model_id: string | null;
    coverage_target_pct: number | null;
    coverage_actual_pct: number | null;
    ga_drawing: DrawingData | null;
    location_drawing: DrawingData | null;
    status: VesselStatus;
    notes: string | null;
    inspector_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateVesselParams {
    projectId: string;
    vesselName: string;
    vesselTag?: string;
    vesselType?: string;
    coverageTargetPct?: number;
    inspectorId?: string;
}

export interface UpdateVesselParams {
    vesselName?: string;
    vesselTag?: string;
    vesselType?: string;
    vesselModelId?: string | null;
    coverageTargetPct?: number | null;
    coverageActualPct?: number | null;
    gaDrawing?: DrawingData | null;
    locationDrawing?: DrawingData | null;
    status?: VesselStatus;
    notes?: string;
    inspectorId?: string | null;
}

// ----------------------------------------------------------------------------
// Project File
// ----------------------------------------------------------------------------

export interface ProjectFile {
    id: string;
    project_id: string;
    project_vessel_id: string | null;
    uploaded_by: string;
    name: string;
    file_type: ProjectFileType;
    storage_path: string;
    storage_bucket: string;
    filename: string;
    size_bytes: number | null;
    mime_type: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
}

export interface UploadFileParams {
    projectId: string;
    projectVesselId?: string;
    userId: string;
    name: string;
    fileType: ProjectFileType;
    file: File;
}

// ----------------------------------------------------------------------------
// Status display helpers
// ----------------------------------------------------------------------------

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
    planned: 'Planned',
    mobilizing: 'Mobilizing',
    in_progress: 'In Progress',
    review: 'Under Review',
    completed: 'Completed',
    archived: 'Archived',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
    planned: '#6b7280',
    mobilizing: '#f59e0b',
    in_progress: '#3b82f6',
    review: '#8b5cf6',
    completed: '#22c55e',
    archived: '#4b5563',
};

export const VESSEL_STATUS_LABELS: Record<VesselStatus, string> = {
    not_started: 'Not Started',
    setup: 'Setup',
    scanning: 'Scanning',
    annotating: 'Annotating',
    report_ready: 'Report Ready',
    completed: 'Completed',
};

export const VESSEL_STATUS_COLORS: Record<VesselStatus, string> = {
    not_started: '#6b7280',
    setup: '#f59e0b',
    scanning: '#3b82f6',
    annotating: '#8b5cf6',
    report_ready: '#14b8a6',
    completed: '#22c55e',
};

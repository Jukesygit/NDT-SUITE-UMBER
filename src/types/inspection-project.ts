// ============================================================================
// Inspection Project Types
// ============================================================================

export type ProjectStatus = 'planned' | 'mobilizing' | 'in_progress' | 'review' | 'completed' | 'archived';

export type VesselStatus = 'not_started' | 'setup' | 'scanning' | 'annotating' | 'report_ready' | 'completed';

export type ProjectFileType = 'ga_drawing' | 'location_drawing' | 'pid_drawing' | 'rba_file' | 'photo' | 'reference' | 'report' | 'nde_file' | 'other';

export interface EquipmentConfig {
    model?: string;
    probe?: string;
    wedge?: string;
    calibration_blocks?: string;
    procedure_ref?: string;
    beamset_config?: string;
}

export interface VesselEquipmentConfig {
    model?: string;
    serial_no?: string;
    probe?: string;
    wedge?: string;
    calibration_blocks?: string;
    scanner_frame?: string;
    ref_blocks?: string;
    couplant?: string;
    equipment_checks_ref?: string;
}

export interface BeamsetRow {
    group: string;
    type: string;
    active_elements: string;
    aperture: string;
    focal_depth: string;
    angle: string;
    skew: string;
    index_offset: string;
}

export interface SignoffPerson {
    name?: string;
    qualification?: string;
    position?: string;
    date?: string;
}

export interface SignoffDetails {
    technician?: SignoffPerson;
    reviewer?: SignoffPerson;
    client?: SignoffPerson;
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
    report_number: string | null;
    contract_number: string | null;
    work_order_number: string | null;
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
    reportNumber?: string;
    contractNumber?: string;
    workOrderNumber?: string;
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
    // Inspection detail fields
    description: string | null;
    drawing_number: string | null;
    nominal_thickness: string | null;
    shell_thickness: string | null;
    operating_temperature: string | null;
    line_tag_number: string | null;
    corrosion_allowance: string | null;
    coating_type: string | null;
    stress_relief: string | null;
    is_insulated: boolean;
    material: string | null;
    shell_area_sqm: number | null;
    coating_correction: string | null;
    equipment_config: VesselEquipmentConfig;
    beamset_config: BeamsetRow[];
    results_summary: string | null;
    signoff_details: SignoffDetails;
    procedure_id: string | null;
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
    // Inspection detail fields
    description?: string | null;
    drawingNumber?: string | null;
    nominalThickness?: string | null;
    shellThickness?: string | null;
    operatingTemperature?: string | null;
    lineTagNumber?: string | null;
    corrosionAllowance?: string | null;
    coatingType?: string | null;
    stressRelief?: string | null;
    isInsulated?: boolean;
    material?: string | null;
    shellAreaSqm?: number | null;
    coatingCorrection?: string | null;
    equipmentConfig?: VesselEquipmentConfig;
    beamsetConfig?: BeamsetRow[];
    resultsSummary?: string | null;
    signoffDetails?: SignoffDetails;
    procedureId?: string | null;
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

// ----------------------------------------------------------------------------
// Inspection Procedure
// ----------------------------------------------------------------------------

export interface InspectionProcedure {
    id: string;
    project_id: string;
    procedure_number: string | null;
    technique_numbers: string | null;
    acceptance_criteria: string | null;
    applicable_standard: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateProcedureParams {
    projectId: string;
    procedureNumber?: string;
    techniqueNumbers?: string;
    acceptanceCriteria?: string;
    applicableStandard?: string;
}

export interface UpdateProcedureParams {
    procedureNumber?: string;
    techniqueNumbers?: string;
    acceptanceCriteria?: string;
    applicableStandard?: string;
}

// ----------------------------------------------------------------------------
// Scan Log Entry
// ----------------------------------------------------------------------------

export interface ScanLogEntry {
    id: string;
    project_vessel_id: string;
    filename: string;
    date_inspected: string | null;
    setup_file_name: string | null;
    scan_start_x: number | null;
    scan_end_x: number | null;
    index_start_y: number | null;
    index_end_y: number | null;
    scan_index_datum: string | null;
    coating_correction: string | null;
    min_wt: number | null;
    comments: string | null;
    scan_composite_id: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface CreateScanLogEntryParams {
    projectVesselId: string;
    filename: string;
    dateInspected?: string;
    setupFileName?: string;
    scanStartX?: number;
    scanEndX?: number;
    indexStartY?: number;
    indexEndY?: number;
    scanIndexDatum?: string;
    coatingCorrection?: string;
    minWt?: number;
    comments?: string;
    scanCompositeId?: string;
    sortOrder?: number;
}

export interface UpdateScanLogEntryParams {
    filename?: string;
    dateInspected?: string | null;
    setupFileName?: string | null;
    scanStartX?: number | null;
    scanEndX?: number | null;
    indexStartY?: number | null;
    indexEndY?: number | null;
    scanIndexDatum?: string | null;
    coatingCorrection?: string | null;
    minWt?: number | null;
    comments?: string | null;
    sortOrder?: number;
}

// ----------------------------------------------------------------------------
// Calibration Log Entry
// ----------------------------------------------------------------------------

export interface CalibrationLogEntry {
    id: string;
    project_vessel_id: string;
    filename: string;
    setup_file: string | null;
    cal_date: string | null;
    scan_start: string | null;
    scan_end: string | null;
    ref_a_wt: number | null;
    meas_a_wt: number | null;
    velocity: number | null;
    comments: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface CreateCalibrationLogEntryParams {
    projectVesselId: string;
    filename: string;
    setupFile?: string;
    calDate?: string;
    scanStart?: string;
    scanEnd?: string;
    refAWt?: number;
    measAWt?: number;
    velocity?: number;
    comments?: string;
    sortOrder?: number;
}

export interface UpdateCalibrationLogEntryParams {
    filename?: string;
    setupFile?: string | null;
    calDate?: string | null;
    scanStart?: string | null;
    scanEnd?: string | null;
    refAWt?: number | null;
    measAWt?: number | null;
    velocity?: number | null;
    comments?: string | null;
    sortOrder?: number;
}

// ----------------------------------------------------------------------------
// Project Image (named image pool)
// ----------------------------------------------------------------------------

export interface ProjectImage {
    id: string;
    project_id: string;
    project_vessel_id: string | null;
    uploaded_by: string;
    name: string;
    description: string | null;
    storage_path: string;
    storage_bucket: string;
    filename: string;
    size_bytes: number | null;
    mime_type: string | null;
    created_at: string;
}

export interface UploadProjectImageParams {
    projectId: string;
    projectVesselId?: string;
    userId: string;
    name: string;
    description?: string;
    file: File;
}

// ----------------------------------------------------------------------------
// Asset View (vessel + parent project info)
// ----------------------------------------------------------------------------

export interface VesselWithProject extends ProjectVessel {
    inspection_projects: {
        name: string;
        site_name: string | null;
        start_date: string | null;
        end_date: string | null;
        status: ProjectStatus;
    };
}

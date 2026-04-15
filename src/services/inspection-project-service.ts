/**
 * Inspection Project Service
 * CRUD operations for inspection projects, project vessels, and project files
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;
// @ts-ignore - accessing property from untyped module
const isSupabaseConfigured: () => boolean = supabaseModule.isSupabaseConfigured;

import type {
    InspectionProject,
    InspectionProjectSummary,
    CreateProjectParams,
    UpdateProjectParams,
    ProjectVessel,
    CreateVesselParams,
    UpdateVesselParams,
    ProjectFile,
    UploadFileParams,
    InspectionProcedure,
    CreateProcedureParams,
    UpdateProcedureParams,
    ScanLogEntry,
    CreateScanLogEntryParams,
    UpdateScanLogEntryParams,
    CalibrationLogEntry,
    CreateCalibrationLogEntryParams,
    UpdateCalibrationLogEntryParams,
    VesselWithProject,
    ProjectImage,
    UploadProjectImageParams,
} from '../types/inspection-project';

const FILES_BUCKET = 'project-files';

function requireSupabase(): SupabaseClient {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    return supabase!;
}

// ============================================================================
// Inspection Project Operations
// ============================================================================

export async function createProject(params: CreateProjectParams): Promise<string> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('inspection_projects')
        .insert({
            name: params.name,
            organization_id: params.organizationId,
            created_by: params.userId,
            client_name: params.clientName ?? null,
            site_name: params.siteName ?? null,
            location_description: params.locationDescription ?? null,
            start_date: params.startDate ?? null,
            end_date: params.endDate ?? null,
            equipment: params.equipment ?? {},
        })
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
}

export async function getProject(id: string): Promise<InspectionProject> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('inspection_projects')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data as InspectionProject;
}

export async function listProjects(): Promise<InspectionProjectSummary[]> {
    const sb = requireSupabase();

    // Fetch projects
    const { data: projects, error } = await sb
        .from('inspection_projects')
        .select('id, name, status, client_name, site_name, start_date, end_date, created_at, updated_at')
        .order('updated_at', { ascending: false });

    if (error) throw error;
    if (!projects || projects.length === 0) return [];

    // Fetch vessel counts per project in one query
    const projectIds = projects.map(p => p.id);
    const { data: vessels } = await sb
        .from('project_vessels')
        .select('id, project_id, status')
        .in('project_id', projectIds);

    const vesselsByProject = new Map<string, { total: number; completed: number }>();
    for (const v of vessels ?? []) {
        const entry = vesselsByProject.get(v.project_id) ?? { total: 0, completed: 0 };
        entry.total++;
        if (v.status === 'completed') entry.completed++;
        vesselsByProject.set(v.project_id, entry);
    }

    return projects.map(p => ({
        ...p,
        vessel_count: vesselsByProject.get(p.id)?.total ?? 0,
        completed_vessel_count: vesselsByProject.get(p.id)?.completed ?? 0,
    })) as InspectionProjectSummary[];
}

export async function updateProject(id: string, params: UpdateProjectParams): Promise<void> {
    const sb = requireSupabase();

    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.status !== undefined) updates.status = params.status;
    if (params.clientName !== undefined) updates.client_name = params.clientName;
    if (params.siteName !== undefined) updates.site_name = params.siteName;
    if (params.locationDescription !== undefined) updates.location_description = params.locationDescription;
    if (params.startDate !== undefined) updates.start_date = params.startDate;
    if (params.endDate !== undefined) updates.end_date = params.endDate;
    if (params.equipment !== undefined) updates.equipment = params.equipment;
    if (params.companionConfig !== undefined) updates.companion_config = params.companionConfig;
    if (params.reportNumber !== undefined) updates.report_number = params.reportNumber;
    if (params.contractNumber !== undefined) updates.contract_number = params.contractNumber;
    if (params.workOrderNumber !== undefined) updates.work_order_number = params.workOrderNumber;

    const { error } = await sb
        .from('inspection_projects')
        .update(updates)
        .eq('id', id);

    if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
    const sb = requireSupabase();

    // Delete project files from storage first
    const { data: files } = await sb
        .from('project_files')
        .select('storage_path, storage_bucket')
        .eq('project_id', id);

    if (files && files.length > 0) {
        const byBucket = new Map<string, string[]>();
        for (const f of files) {
            const paths = byBucket.get(f.storage_bucket) ?? [];
            paths.push(f.storage_path);
            byBucket.set(f.storage_bucket, paths);
        }
        for (const [bucket, paths] of byBucket) {
            await sb.storage.from(bucket).remove(paths);
        }
    }

    // Cascade delete handles project_vessels, project_files rows
    const { error } = await sb
        .from('inspection_projects')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================================================
// Project Vessel Operations
// ============================================================================

export async function createProjectVessel(params: CreateVesselParams): Promise<string> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('project_vessels')
        .insert({
            project_id: params.projectId,
            vessel_name: params.vesselName,
            vessel_tag: params.vesselTag ?? null,
            vessel_type: params.vesselType ?? null,
            coverage_target_pct: params.coverageTargetPct ?? null,
            inspector_id: params.inspectorId ?? null,
        })
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
}

export async function listProjectVessels(projectId: string): Promise<ProjectVessel[]> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('project_vessels')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return (data as ProjectVessel[]) ?? [];
}

export async function getProjectVessel(id: string): Promise<ProjectVessel> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('project_vessels')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data as ProjectVessel;
}

export async function updateProjectVessel(id: string, params: UpdateVesselParams): Promise<void> {
    const sb = requireSupabase();

    const updates: Record<string, unknown> = {};
    if (params.vesselName !== undefined) updates.vessel_name = params.vesselName;
    if (params.vesselTag !== undefined) updates.vessel_tag = params.vesselTag;
    if (params.vesselType !== undefined) updates.vessel_type = params.vesselType;
    if (params.vesselModelId !== undefined) updates.vessel_model_id = params.vesselModelId;
    if (params.coverageTargetPct !== undefined) updates.coverage_target_pct = params.coverageTargetPct;
    if (params.coverageActualPct !== undefined) updates.coverage_actual_pct = params.coverageActualPct;
    if (params.gaDrawing !== undefined) updates.ga_drawing = params.gaDrawing;
    if (params.locationDrawing !== undefined) updates.location_drawing = params.locationDrawing;
    if (params.status !== undefined) updates.status = params.status;
    if (params.notes !== undefined) updates.notes = params.notes;
    if (params.inspectorId !== undefined) updates.inspector_id = params.inspectorId;
    if (params.description !== undefined) updates.description = params.description;
    if (params.drawingNumber !== undefined) updates.drawing_number = params.drawingNumber;
    if (params.nominalThickness !== undefined) updates.nominal_thickness = params.nominalThickness;
    if (params.shellThickness !== undefined) updates.shell_thickness = params.shellThickness;
    if (params.operatingTemperature !== undefined) updates.operating_temperature = params.operatingTemperature;
    if (params.lineTagNumber !== undefined) updates.line_tag_number = params.lineTagNumber;
    if (params.corrosionAllowance !== undefined) updates.corrosion_allowance = params.corrosionAllowance;
    if (params.coatingType !== undefined) updates.coating_type = params.coatingType;
    if (params.stressRelief !== undefined) updates.stress_relief = params.stressRelief;
    if (params.isInsulated !== undefined) updates.is_insulated = params.isInsulated;
    if (params.material !== undefined) updates.material = params.material;
    if (params.shellAreaSqm !== undefined) updates.shell_area_sqm = params.shellAreaSqm;
    if (params.coatingCorrection !== undefined) updates.coating_correction = params.coatingCorrection;
    if (params.equipmentConfig !== undefined) updates.equipment_config = params.equipmentConfig;
    if (params.beamsetConfig !== undefined) updates.beamset_config = params.beamsetConfig;
    if (params.resultsSummary !== undefined) updates.results_summary = params.resultsSummary;
    if (params.signoffDetails !== undefined) updates.signoff_details = params.signoffDetails;
    if (params.procedureId !== undefined) updates.procedure_id = params.procedureId;

    const { error } = await sb
        .from('project_vessels')
        .update(updates)
        .eq('id', id);

    if (error) throw error;
}

export async function deleteProjectVessel(id: string): Promise<void> {
    const sb = requireSupabase();

    const { error } = await sb
        .from('project_vessels')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================================================
// Project File Operations
// ============================================================================

export async function uploadProjectFile(params: UploadFileParams): Promise<string> {
    const sb = requireSupabase();

    const ext = params.file.name.split('.').pop() ?? '';
    const storagePath = `${params.projectId}/${params.projectVesselId ?? 'shared'}/${crypto.randomUUID()}.${ext}`;

    // Upload to storage — read as ArrayBuffer for reliable cross-browser upload
    const fileBuffer = await params.file.arrayBuffer();
    const { error: uploadError } = await sb.storage
        .from(FILES_BUCKET)
        .upload(storagePath, fileBuffer, {
            contentType: params.file.type || 'application/octet-stream',
            upsert: false,
        });

    if (uploadError) throw uploadError;

    // Create DB record
    const { data, error } = await sb
        .from('project_files')
        .insert({
            project_id: params.projectId,
            project_vessel_id: params.projectVesselId ?? null,
            uploaded_by: params.userId,
            name: params.name,
            file_type: params.fileType,
            storage_path: storagePath,
            storage_bucket: FILES_BUCKET,
            filename: params.file.name,
            size_bytes: params.file.size,
            mime_type: params.file.type || null,
        })
        .select('id')
        .single();

    if (error) {
        // Clean up storage on DB insert failure
        await sb.storage.from(FILES_BUCKET).remove([storagePath]);
        throw error;
    }

    return data.id;
}

export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('project_files')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as ProjectFile[]) ?? [];
}

export async function deleteProjectFile(id: string): Promise<void> {
    const sb = requireSupabase();

    // Get storage info before deleting
    const { data: file } = await sb
        .from('project_files')
        .select('storage_path, storage_bucket')
        .eq('id', id)
        .single();

    const { error } = await sb
        .from('project_files')
        .delete()
        .eq('id', id);

    if (error) throw error;

    // Clean up storage (best effort)
    if (file) {
        await sb.storage.from(file.storage_bucket).remove([file.storage_path]);
    }
}

export async function getProjectFileUrl(storagePath: string, bucket: string = FILES_BUCKET): Promise<string> {
    const sb = requireSupabase();

    const { data } = await sb.storage
        .from(bucket)
        .createSignedUrl(storagePath, 3600); // 1 hour

    if (!data?.signedUrl) throw new Error('Failed to generate signed URL');
    return data.signedUrl;
}

// ============================================================================
// Composite queries (for Files tab)
// ============================================================================

export async function listProjectScanComposites(projectVesselIds: string[]) {
    const sb = requireSupabase();
    if (projectVesselIds.length === 0) return [];

    const { data, error } = await sb
        .from('scan_composites')
        .select('id, name, width, height, stats, section_type, created_at, project_vessel_id')
        .in('project_vessel_id', projectVesselIds)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function listProjectVesselModels(projectVesselIds: string[]) {
    const sb = requireSupabase();
    if (projectVesselIds.length === 0) return [];

    // Select config to extract modelType client-side (model_type column may not exist yet)
    const { data, error } = await sb
        .from('vessel_models')
        .select('id, name, config, created_at, updated_at, project_vessel_id')
        .in('project_vessel_id', projectVesselIds)
        .order('updated_at', { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        model_type: (row.config as any)?.modelType ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        project_vessel_id: row.project_vessel_id,
    }));
}

// ============================================================================
// Asset View — All vessels with project info
// ============================================================================

export async function listAllProjectVesselsWithProjects(): Promise<VesselWithProject[]> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('project_vessels')
        .select('*, inspection_projects!inner(name, site_name, start_date, end_date, status)')
        .order('vessel_tag', { ascending: true });

    if (error) throw error;
    return (data as VesselWithProject[]) ?? [];
}

// ============================================================================
// Vessel Files (filtered by vessel)
// ============================================================================

export async function listVesselFiles(vesselId: string): Promise<ProjectFile[]> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('project_files')
        .select('*')
        .eq('project_vessel_id', vesselId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as ProjectFile[]) ?? [];
}

// ============================================================================
// Inspection Procedure Operations
// ============================================================================

export async function createInspectionProcedure(params: CreateProcedureParams): Promise<string> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('inspection_procedures')
        .insert({
            project_id: params.projectId,
            procedure_number: params.procedureNumber ?? null,
            technique_numbers: params.techniqueNumbers ?? null,
            acceptance_criteria: params.acceptanceCriteria ?? null,
            applicable_standard: params.applicableStandard ?? null,
        })
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
}

export async function listProjectProcedures(projectId: string): Promise<InspectionProcedure[]> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('inspection_procedures')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return (data as InspectionProcedure[]) ?? [];
}

export async function updateInspectionProcedure(id: string, params: UpdateProcedureParams): Promise<void> {
    const sb = requireSupabase();

    const updates: Record<string, unknown> = {};
    if (params.procedureNumber !== undefined) updates.procedure_number = params.procedureNumber;
    if (params.techniqueNumbers !== undefined) updates.technique_numbers = params.techniqueNumbers;
    if (params.acceptanceCriteria !== undefined) updates.acceptance_criteria = params.acceptanceCriteria;
    if (params.applicableStandard !== undefined) updates.applicable_standard = params.applicableStandard;

    const { error } = await sb
        .from('inspection_procedures')
        .update(updates)
        .eq('id', id);

    if (error) throw error;
}

export async function deleteInspectionProcedure(id: string): Promise<void> {
    const sb = requireSupabase();

    const { error } = await sb
        .from('inspection_procedures')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================================================
// Scan Log Entry Operations
// ============================================================================

export async function listScanLogEntries(projectVesselId: string): Promise<ScanLogEntry[]> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('scan_log_entries')
        .select('*')
        .eq('project_vessel_id', projectVesselId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) throw error;
    return (data as ScanLogEntry[]) ?? [];
}

export async function createScanLogEntry(params: CreateScanLogEntryParams): Promise<string> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('scan_log_entries')
        .insert({
            project_vessel_id: params.projectVesselId,
            filename: params.filename,
            date_inspected: params.dateInspected ?? null,
            setup_file_name: params.setupFileName ?? null,
            scan_start_x: params.scanStartX ?? null,
            scan_end_x: params.scanEndX ?? null,
            index_start_y: params.indexStartY ?? null,
            index_end_y: params.indexEndY ?? null,
            scan_index_datum: params.scanIndexDatum ?? null,
            coating_correction: params.coatingCorrection ?? null,
            min_wt: params.minWt ?? null,
            comments: params.comments ?? null,
            scan_composite_id: params.scanCompositeId ?? null,
            sort_order: params.sortOrder ?? 0,
        })
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
}

export async function updateScanLogEntry(id: string, params: UpdateScanLogEntryParams): Promise<void> {
    const sb = requireSupabase();

    const updates: Record<string, unknown> = {};
    if (params.filename !== undefined) updates.filename = params.filename;
    if (params.dateInspected !== undefined) updates.date_inspected = params.dateInspected;
    if (params.setupFileName !== undefined) updates.setup_file_name = params.setupFileName;
    if (params.scanStartX !== undefined) updates.scan_start_x = params.scanStartX;
    if (params.scanEndX !== undefined) updates.scan_end_x = params.scanEndX;
    if (params.indexStartY !== undefined) updates.index_start_y = params.indexStartY;
    if (params.indexEndY !== undefined) updates.index_end_y = params.indexEndY;
    if (params.scanIndexDatum !== undefined) updates.scan_index_datum = params.scanIndexDatum;
    if (params.coatingCorrection !== undefined) updates.coating_correction = params.coatingCorrection;
    if (params.minWt !== undefined) updates.min_wt = params.minWt;
    if (params.comments !== undefined) updates.comments = params.comments;
    if (params.sortOrder !== undefined) updates.sort_order = params.sortOrder;

    const { error } = await sb
        .from('scan_log_entries')
        .update(updates)
        .eq('id', id);

    if (error) throw error;
}

export async function deleteScanLogEntry(id: string): Promise<void> {
    const sb = requireSupabase();

    const { error } = await sb
        .from('scan_log_entries')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================================================
// Calibration Log Entry Operations
// ============================================================================

export async function listCalibrationLogEntries(projectVesselId: string): Promise<CalibrationLogEntry[]> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('calibration_log_entries')
        .select('*')
        .eq('project_vessel_id', projectVesselId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) throw error;
    return (data as CalibrationLogEntry[]) ?? [];
}

export async function createCalibrationLogEntry(params: CreateCalibrationLogEntryParams): Promise<string> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('calibration_log_entries')
        .insert({
            project_vessel_id: params.projectVesselId,
            filename: params.filename,
            setup_file: params.setupFile ?? null,
            cal_date: params.calDate ?? null,
            scan_start: params.scanStart ?? null,
            scan_end: params.scanEnd ?? null,
            ref_a_wt: params.refAWt ?? null,
            meas_a_wt: params.measAWt ?? null,
            velocity: params.velocity ?? null,
            comments: params.comments ?? null,
            sort_order: params.sortOrder ?? 0,
        })
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
}

export async function updateCalibrationLogEntry(id: string, params: UpdateCalibrationLogEntryParams): Promise<void> {
    const sb = requireSupabase();

    const updates: Record<string, unknown> = {};
    if (params.filename !== undefined) updates.filename = params.filename;
    if (params.setupFile !== undefined) updates.setup_file = params.setupFile;
    if (params.calDate !== undefined) updates.cal_date = params.calDate;
    if (params.scanStart !== undefined) updates.scan_start = params.scanStart;
    if (params.scanEnd !== undefined) updates.scan_end = params.scanEnd;
    if (params.refAWt !== undefined) updates.ref_a_wt = params.refAWt;
    if (params.measAWt !== undefined) updates.meas_a_wt = params.measAWt;
    if (params.velocity !== undefined) updates.velocity = params.velocity;
    if (params.comments !== undefined) updates.comments = params.comments;
    if (params.sortOrder !== undefined) updates.sort_order = params.sortOrder;

    const { error } = await sb
        .from('calibration_log_entries')
        .update(updates)
        .eq('id', id);

    if (error) throw error;
}

export async function deleteCalibrationLogEntry(id: string): Promise<void> {
    const sb = requireSupabase();

    const { error } = await sb
        .from('calibration_log_entries')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

// ============================================================================
// Project Image Operations
// ============================================================================

export async function listProjectImages(projectVesselId: string): Promise<ProjectImage[]> {
    const sb = requireSupabase();

    const { data, error } = await sb
        .from('project_images')
        .select('*')
        .eq('project_vessel_id', projectVesselId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as ProjectImage[]) ?? [];
}

export async function uploadProjectImage(params: UploadProjectImageParams): Promise<string> {
    const sb = requireSupabase();

    const ext = params.file.name.split('.').pop() ?? '';
    const storagePath = `${params.projectId}/images/${params.projectVesselId ?? 'shared'}/${crypto.randomUUID()}.${ext}`;

    const fileBuffer = await params.file.arrayBuffer();
    const { error: uploadError } = await sb.storage
        .from(FILES_BUCKET)
        .upload(storagePath, fileBuffer, {
            contentType: params.file.type || 'application/octet-stream',
            upsert: false,
        });

    if (uploadError) throw uploadError;

    const { data, error } = await sb
        .from('project_images')
        .insert({
            project_id: params.projectId,
            project_vessel_id: params.projectVesselId ?? null,
            uploaded_by: params.userId,
            name: params.name,
            description: params.description ?? null,
            storage_path: storagePath,
            storage_bucket: FILES_BUCKET,
            filename: params.file.name,
            size_bytes: params.file.size,
            mime_type: params.file.type || null,
        })
        .select('id')
        .single();

    if (error) {
        await sb.storage.from(FILES_BUCKET).remove([storagePath]);
        throw error;
    }

    return data.id;
}

export async function updateProjectImageName(id: string, name: string): Promise<void> {
    const sb = requireSupabase();

    const { error } = await sb
        .from('project_images')
        .update({ name })
        .eq('id', id);

    if (error) throw error;
}

export async function deleteProjectImage(id: string): Promise<void> {
    const sb = requireSupabase();

    const { data: img } = await sb
        .from('project_images')
        .select('storage_path, storage_bucket')
        .eq('id', id)
        .single();

    const { error } = await sb
        .from('project_images')
        .delete()
        .eq('id', id);

    if (error) throw error;

    if (img) {
        await sb.storage.from(img.storage_bucket).remove([img.storage_path]);
    }
}

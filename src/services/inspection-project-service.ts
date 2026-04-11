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

    // Upload to storage
    const { error: uploadError } = await sb.storage
        .from(FILES_BUCKET)
        .upload(storagePath, params.file, {
            contentType: params.file.type || 'application/octet-stream',
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
        .select('id, name, width, height, stats, created_at, project_vessel_id')
        .in('project_vessel_id', projectVesselIds)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function listProjectVesselModels(projectVesselIds: string[]) {
    const sb = requireSupabase();
    if (projectVesselIds.length === 0) return [];

    const { data, error } = await sb
        .from('vessel_models')
        .select('id, name, created_at, updated_at, project_vessel_id')
        .in('project_vessel_id', projectVesselIds)
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
}

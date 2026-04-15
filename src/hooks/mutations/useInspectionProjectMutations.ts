/**
 * Inspection project mutation hooks
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    createProject,
    updateProject,
    deleteProject,
    createProjectVessel,
    updateProjectVessel,
    deleteProjectVessel,
    uploadProjectFile,
    deleteProjectFile,
    createInspectionProcedure,
    updateInspectionProcedure,
    deleteInspectionProcedure,
    createScanLogEntry,
    updateScanLogEntry,
    deleteScanLogEntry,
    createCalibrationLogEntry,
    updateCalibrationLogEntry,
    deleteCalibrationLogEntry,
    uploadProjectImage,
    updateProjectImageName,
    deleteProjectImage,
} from '../../services/inspection-project-service';
import type {
    CreateProjectParams,
    UpdateProjectParams,
    CreateVesselParams,
    UpdateVesselParams,
    UploadFileParams,
    CreateProcedureParams,
    UpdateProcedureParams,
    CreateScanLogEntryParams,
    UpdateScanLogEntryParams,
    CreateCalibrationLogEntryParams,
    UpdateCalibrationLogEntryParams,
    UploadProjectImageParams,
} from '../../types/inspection-project';

export function useCreateProject() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: CreateProjectParams) => createProject(params),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['inspectionProjects'] }); },
    });
}

export function useUpdateProject() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, params }: { id: string; params: UpdateProjectParams }) =>
            updateProject(id, params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['inspectionProjects'] });
            qc.invalidateQueries({ queryKey: ['inspectionProjects', vars.id] });
        },
    });
}

export function useDeleteProject() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => deleteProject(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['inspectionProjects'] }); },
    });
}

export function useCreateProjectVessel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: CreateVesselParams) => createProjectVessel(params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectVessels', vars.projectId] });
            qc.invalidateQueries({ queryKey: ['inspectionProjects'] });
        },
    });
}

export function useUpdateProjectVessel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, params, projectId }: { id: string; params: UpdateVesselParams; projectId: string }) =>
            updateProjectVessel(id, params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectVessels', vars.projectId] });
            qc.invalidateQueries({ queryKey: ['projectVessel', vars.id] });
        },
    });
}

export function useDeleteProjectVessel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
            deleteProjectVessel(id),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectVessels', vars.projectId] });
            qc.invalidateQueries({ queryKey: ['inspectionProjects'] });
        },
    });
}

export function useUploadProjectFile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: UploadFileParams) => uploadProjectFile(params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectFiles', vars.projectId] });
            if (vars.projectVesselId) {
                qc.invalidateQueries({ queryKey: ['vesselFiles', vars.projectVesselId] });
            }
        },
    });
}

export function useDeleteProjectFile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, projectId, vesselId }: { id: string; projectId: string; vesselId?: string }) =>
            deleteProjectFile(id),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectFiles', vars.projectId] });
            if (vars.vesselId) {
                qc.invalidateQueries({ queryKey: ['vesselFiles', vars.vesselId] });
            }
        },
    });
}

// ============================================================================
// Inspection Procedure Mutations
// ============================================================================

export function useCreateProcedure() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: CreateProcedureParams) => createInspectionProcedure(params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectProcedures', vars.projectId] });
        },
    });
}

export function useUpdateProcedure() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, params, projectId }: { id: string; params: UpdateProcedureParams; projectId: string }) =>
            updateInspectionProcedure(id, params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectProcedures', vars.projectId] });
        },
    });
}

export function useDeleteProcedure() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
            deleteInspectionProcedure(id),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectProcedures', vars.projectId] });
        },
    });
}

// ============================================================================
// Scan Log Entry Mutations
// ============================================================================

export function useCreateScanLogEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: CreateScanLogEntryParams) => createScanLogEntry(params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['scanLogEntries', vars.projectVesselId] });
        },
    });
}

export function useUpdateScanLogEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, params, vesselId }: { id: string; params: UpdateScanLogEntryParams; vesselId: string }) =>
            updateScanLogEntry(id, params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['scanLogEntries', vars.vesselId] });
        },
    });
}

export function useDeleteScanLogEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, vesselId }: { id: string; vesselId: string }) =>
            deleteScanLogEntry(id),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['scanLogEntries', vars.vesselId] });
        },
    });
}

// ============================================================================
// Calibration Log Entry Mutations
// ============================================================================

export function useCreateCalibrationLogEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: CreateCalibrationLogEntryParams) => createCalibrationLogEntry(params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['calibrationLogEntries', vars.projectVesselId] });
        },
    });
}

export function useUpdateCalibrationLogEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, params, vesselId }: { id: string; params: UpdateCalibrationLogEntryParams; vesselId: string }) =>
            updateCalibrationLogEntry(id, params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['calibrationLogEntries', vars.vesselId] });
        },
    });
}

export function useDeleteCalibrationLogEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, vesselId }: { id: string; vesselId: string }) =>
            deleteCalibrationLogEntry(id),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['calibrationLogEntries', vars.vesselId] });
        },
    });
}

// ============================================================================
// Project Image Mutations
// ============================================================================

export function useUploadProjectImage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (params: UploadProjectImageParams) => uploadProjectImage(params),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectImages', vars.projectVesselId] });
        },
    });
}

export function useUpdateProjectImageName() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, name, vesselId }: { id: string; name: string; vesselId: string }) =>
            updateProjectImageName(id, name),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectImages', vars.vesselId] });
        },
    });
}

export function useDeleteProjectImage() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, vesselId }: { id: string; vesselId: string }) =>
            deleteProjectImage(id),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectImages', vars.vesselId] });
        },
    });
}

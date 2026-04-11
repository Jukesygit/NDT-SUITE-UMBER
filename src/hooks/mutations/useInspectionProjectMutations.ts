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
} from '../../services/inspection-project-service';
import type {
    CreateProjectParams,
    UpdateProjectParams,
    CreateVesselParams,
    UpdateVesselParams,
    UploadFileParams,
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
        },
    });
}

export function useDeleteProjectFile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, projectId }: { id: string; projectId: string }) =>
            deleteProjectFile(id),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: ['projectFiles', vars.projectId] });
        },
    });
}

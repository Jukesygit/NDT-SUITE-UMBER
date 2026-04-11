/**
 * React Query hooks for inspection project data fetching
 */

import { useQuery } from '@tanstack/react-query';
import {
    listProjects,
    getProject,
    listProjectVessels,
    getProjectVessel,
    listProjectFiles,
    listProjectScanComposites,
    listProjectVesselModels,
} from '../../services/inspection-project-service';

export type {
    InspectionProject,
    InspectionProjectSummary,
    ProjectVessel,
    ProjectFile,
} from '../../types/inspection-project';

export function useProjectList() {
    return useQuery({
        queryKey: ['inspectionProjects'],
        queryFn: () => listProjects(),
        staleTime: 2 * 60 * 1000,
    });
}

export function useProject(id: string | undefined) {
    return useQuery({
        queryKey: ['inspectionProjects', id],
        queryFn: () => getProject(id!),
        enabled: !!id,
        staleTime: 2 * 60 * 1000,
    });
}

export function useProjectVessels(projectId: string | undefined) {
    return useQuery({
        queryKey: ['projectVessels', projectId],
        queryFn: () => listProjectVessels(projectId!),
        enabled: !!projectId,
        staleTime: 2 * 60 * 1000,
    });
}

export function useProjectVessel(id: string | undefined) {
    return useQuery({
        queryKey: ['projectVessel', id],
        queryFn: () => getProjectVessel(id!),
        enabled: !!id,
        staleTime: 2 * 60 * 1000,
    });
}

export function useProjectFiles(projectId: string | undefined) {
    return useQuery({
        queryKey: ['projectFiles', projectId],
        queryFn: () => listProjectFiles(projectId!),
        enabled: !!projectId,
        staleTime: 2 * 60 * 1000,
    });
}

export function useProjectScanComposites(projectVesselIds: string[]) {
    return useQuery({
        queryKey: ['projectScanComposites', projectVesselIds],
        queryFn: () => listProjectScanComposites(projectVesselIds),
        enabled: projectVesselIds.length > 0,
        staleTime: 2 * 60 * 1000,
    });
}

export function useProjectVesselModels(projectVesselIds: string[]) {
    return useQuery({
        queryKey: ['projectVesselModels', projectVesselIds],
        queryFn: () => listProjectVesselModels(projectVesselIds),
        enabled: projectVesselIds.length > 0,
        staleTime: 2 * 60 * 1000,
    });
}

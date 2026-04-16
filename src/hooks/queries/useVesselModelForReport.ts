import { useQuery } from '@tanstack/react-query';
import { getVesselModelByProjectVessel } from '../../services/vessel-model-service';

/**
 * Fetch the full vessel model config for a project vessel.
 * Used by the report page to access pre-rendered images and vessel state.
 */
export function useVesselModelForReport(projectVesselId: string | undefined) {
    return useQuery({
        queryKey: ['vesselModelForReport', projectVesselId],
        queryFn: () => getVesselModelByProjectVessel(projectVesselId!),
        enabled: !!projectVesselId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Client shares on a project — the management-side read.
 *
 * Short stale time on purpose: revocation is a safety action, and a stale list
 * that still shows a revoked link as active is the one wrong answer here.
 */

import { useQuery } from '@tanstack/react-query';
import { listClientShares, getClientShareViews } from '../../services/client-share-service';

const STALE_TIME_MS = 30 * 1000;

export function useClientShares(projectId: string | undefined) {
  return useQuery({
    queryKey: ['clientShares', projectId],
    queryFn: () => listClientShares(projectId!),
    enabled: !!projectId,
    staleTime: STALE_TIME_MS,
  });
}

/** View counts for one share. Counts only — the audit stores no viewer. */
export function useClientShareViews(shareId: string | undefined) {
  return useQuery({
    queryKey: ['clientShareViews', shareId],
    queryFn: () => getClientShareViews(shareId!),
    enabled: !!shareId,
    staleTime: STALE_TIME_MS,
  });
}

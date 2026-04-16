/**
 * React Query hook for fetching companion folder listings.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchCompanionFolders } from '../../services/companion-service';

export function useCompanionFolders(port: number | null, query?: string) {
  return useQuery({
    queryKey: ['companion-folders', port, query],
    queryFn: () => fetchCompanionFolders(port!, query),
    enabled: !!port,
    staleTime: 30_000,
  });
}

/**
 * useAnnouncement - React Query hook for fetching active system announcement
 *
 * This hook fetches the current active announcement for all authenticated users.
 * The announcement is cached and refreshed periodically.
 */

import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { SystemAnnouncement } from '../../services/admin-service';

// Query keys for announcements
export const announcementKeys = {
  all: ['announcement'] as const,
  active: () => [...announcementKeys.all, 'active'] as const,
};

/**
 * Fetch the active system announcement
 * Available to all authenticated users
 */
export function useAnnouncement() {
  return useQuery<SystemAnnouncement | null>({
    queryKey: announcementKeys.active(),
    queryFn: () => adminService.getActiveAnnouncement(),
    staleTime: 2 * 60 * 1000, // 2 minutes - announcements don't change frequently
    refetchOnWindowFocus: true, // Refresh when user returns to tab
  });
}

/**
 * useAnnouncementMutations - React Query mutation hooks for system announcements
 *
 * Admin-only hooks for updating and clearing system announcements.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { UpdateAnnouncementData } from '../../services/admin-service';
import { announcementKeys } from '../queries/useAnnouncement';

/**
 * Update or create a system announcement (admin only)
 */
export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAnnouncementData) => adminService.updateAnnouncement(data),
    onSuccess: () => {
      // Invalidate announcement query to refetch
      queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    },
  });
}

/**
 * Clear (deactivate) the system announcement (admin only)
 */
export function useClearAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminService.clearAnnouncement(),
    onSuccess: () => {
      // Invalidate announcement query to refetch
      queryClient.invalidateQueries({ queryKey: announcementKeys.all });
    },
  });
}

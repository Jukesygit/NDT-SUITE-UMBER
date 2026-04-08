/**
 * useTabVisibility - React Query hook for tab visibility settings
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTabVisibilitySettings,
  updateTabVisibility,
  type TabVisibilitySetting,
} from '../../services/tab-visibility-service';

export const tabVisibilityKeys = {
  all: ['tabVisibility'] as const,
};

/**
 * Fetch tab visibility settings.
 * All authenticated users need this to know which tabs to render.
 */
export function useTabVisibility() {
  return useQuery<TabVisibilitySetting[]>({
    queryKey: tabVisibilityKeys.all,
    queryFn: getTabVisibilitySettings,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
  });
}

/**
 * Mutation to toggle a tab's visibility (super_admin only)
 */
export function useUpdateTabVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tabId, isVisible }: { tabId: string; isVisible: boolean }) =>
      updateTabVisibility(tabId, isVisible),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tabVisibilityKeys.all });
    },
  });
}

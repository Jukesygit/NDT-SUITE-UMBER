/**
 * useDeleteMyAccount - React Query mutation for GDPR account deletion
 * Deletes the user's account and all associated data (Article 17)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteMyAccount } from '../../services/gdpr-service';
import { logActivity } from '../../services/activity-log-service';

export function useDeleteMyAccount() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (userId: string) => {
            // Log before deletion (the log entry will be anonymised by the Edge Function)
            logActivity({
                userId,
                actionType: 'account_deleted',
                actionCategory: 'profile',
                description: 'User initiated account self-deletion (GDPR Article 17)',
            });

            await deleteMyAccount();
        },
        onSuccess: () => {
            queryClient.clear();
            window.location.href = '/login';
        },
    });
}

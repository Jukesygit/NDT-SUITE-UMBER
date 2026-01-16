/**
 * useNotificationMutations - React Query mutations for sending notifications
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    sendNotificationEmails,
    type SendNotificationParams,
    type SendNotificationResult,
} from '../../services/notification-email-service';
import { notificationLogKeys } from '../queries/useNotificationLogs';

/**
 * Hook to send notification emails
 */
export function useSendNotification() {
    const queryClient = useQueryClient();

    return useMutation<SendNotificationResult, Error, SendNotificationParams>({
        mutationFn: sendNotificationEmails,
        onSuccess: () => {
            // Invalidate logs after sending
            queryClient.invalidateQueries({ queryKey: notificationLogKeys.all });
        },
    });
}

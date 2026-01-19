/**
 * useNotificationMutations - React Query mutations for sending notifications
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    sendNotificationEmails,
    type SendNotificationParams,
    type SendNotificationResult,
    type EmailProgress,
} from '../../services/notification-email-service';
import { notificationLogKeys } from '../queries/useNotificationLogs';

export type { EmailProgress };

export interface SendNotificationWithProgressParams extends Omit<SendNotificationParams, 'onProgress'> {
    onProgress?: (progress: EmailProgress) => void;
}

/**
 * Hook to send notification emails with optional progress tracking
 */
export function useSendNotification() {
    const queryClient = useQueryClient();

    return useMutation<SendNotificationResult, Error, SendNotificationWithProgressParams>({
        mutationFn: (params) => sendNotificationEmails(params),
        onSuccess: () => {
            // Invalidate logs after sending
            queryClient.invalidateQueries({ queryKey: notificationLogKeys.all });
        },
    });
}

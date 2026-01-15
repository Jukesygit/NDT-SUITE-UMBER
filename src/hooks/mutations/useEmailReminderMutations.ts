/**
 * React Query mutation hooks for email reminder settings
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import emailReminderService, {
    type EmailReminderSettings,
    type UpdateSettingsData,
    type TriggerRemindersResult,
    type SendTestReminderResult,
} from '../../services/email-reminder-service';

/**
 * Hook to update email reminder settings
 */
export function useUpdateEmailReminderSettings() {
    const queryClient = useQueryClient();

    return useMutation<EmailReminderSettings, Error, UpdateSettingsData>({
        mutationFn: (data) => emailReminderService.updateEmailReminderSettings(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['email-reminder-settings'] });
        },
    });
}

/**
 * Hook to manually trigger expiration reminders
 */
export function useTriggerExpirationReminders() {
    const queryClient = useQueryClient();

    return useMutation<TriggerRemindersResult, Error, void>({
        mutationFn: () => emailReminderService.triggerExpirationReminders(),
        onSuccess: () => {
            // Invalidate logs after triggering reminders
            queryClient.invalidateQueries({ queryKey: ['email-reminder-logs'] });
        },
    });
}

/**
 * Hook to send a test reminder email
 */
export function useSendTestReminder() {
    return useMutation<SendTestReminderResult, Error, { userId: string; email: string }>({
        mutationFn: ({ userId, email }) => emailReminderService.sendTestReminder(userId, email),
    });
}

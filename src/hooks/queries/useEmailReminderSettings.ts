/**
 * React Query hooks for email reminder settings
 */

import { useQuery } from '@tanstack/react-query';
import emailReminderService, {
    type EmailReminderSettings,
    type EmailReminderLog,
} from '../../services/email-reminder-service';

// Re-export types for consumers
export type { EmailReminderSettings, EmailReminderLog };

/**
 * Hook to fetch email reminder settings
 */
export function useEmailReminderSettings() {
    return useQuery<EmailReminderSettings>({
        queryKey: ['email-reminder-settings'],
        queryFn: () => emailReminderService.getEmailReminderSettings(),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook to fetch email reminder logs
 */
export function useEmailReminderLogs(options?: { userId?: string; limit?: number }) {
    return useQuery<EmailReminderLog[]>({
        queryKey: ['email-reminder-logs', options?.userId, options?.limit],
        queryFn: () => emailReminderService.getEmailReminderLogs(options),
        staleTime: 60 * 1000, // 1 minute
    });
}

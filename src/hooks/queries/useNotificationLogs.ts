/**
 * useNotificationLogs - React Query hooks for notification email logs
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
    getNotificationLogs,
    getNotificationDetail,
    type NotificationLogFilters,
    type PaginatedNotificationLogs,
    type NotificationDetail,
} from '../../services/notification-email-service';

export const notificationLogKeys = {
    all: ['admin', 'notification-logs'] as const,
    list: (filters: NotificationLogFilters, page: number, pageSize: number) =>
        [...notificationLogKeys.all, 'list', { filters, page, pageSize }] as const,
    detail: (id: string) => [...notificationLogKeys.all, 'detail', id] as const,
};

/**
 * Fetch notification logs with pagination and filters
 */
export function useNotificationLogs(
    filters: NotificationLogFilters = {},
    page = 1,
    pageSize = 25
) {
    return useQuery<PaginatedNotificationLogs, Error>({
        queryKey: notificationLogKeys.list(filters, page, pageSize),
        queryFn: () => getNotificationLogs(filters, page, pageSize),
        staleTime: 30 * 1000, // 30 seconds
        placeholderData: keepPreviousData,
    });
}

/**
 * Fetch notification detail with recipients
 */
export function useNotificationDetail(notificationId: string | null) {
    return useQuery<NotificationDetail, Error>({
        queryKey: notificationLogKeys.detail(notificationId || ''),
        queryFn: () => getNotificationDetail(notificationId!),
        enabled: !!notificationId,
        staleTime: 60 * 1000, // 1 minute
    });
}

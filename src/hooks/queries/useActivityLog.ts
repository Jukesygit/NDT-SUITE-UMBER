/**
 * useActivityLog - React Query hooks for activity log
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
    getActivityLogs,
    getActivityUsers,
    type ActivityLogFilters,
    type PaginatedActivityLogs,
} from '../../services/activity-log-service';

/**
 * Query keys for activity logs
 */
export const activityLogKeys = {
    all: ['admin', 'activity-log'] as const,
    list: (filters: ActivityLogFilters, page: number, pageSize: number) =>
        [...activityLogKeys.all, 'list', { filters, page, pageSize }] as const,
    users: () => [...activityLogKeys.all, 'users'] as const,
};

/**
 * Fetch activity logs with pagination and filters
 */
export function useActivityLogs(
    filters: ActivityLogFilters = {},
    page = 1,
    pageSize = 25
) {
    return useQuery({
        queryKey: activityLogKeys.list(filters, page, pageSize),
        queryFn: async (): Promise<PaginatedActivityLogs> => {
            return getActivityLogs(filters, page, pageSize);
        },
        staleTime: 30 * 1000, // 30 seconds - activity logs change frequently
        placeholderData: keepPreviousData, // Keep previous data while fetching new page
    });
}

/**
 * Fetch unique users for filter dropdown
 */
export function useActivityUsers() {
    return useQuery({
        queryKey: activityLogKeys.users(),
        queryFn: getActivityUsers,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * useAdminUsers - React Query hooks for user management
 */

import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/admin-service';
import type { Profile } from '../../types/database.types';

/**
 * Query keys for users
 */
export const userKeys = {
    all: ['admin', 'users'] as const,
    list: () => [...userKeys.all, 'list'] as const,
    detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

/**
 * Fetch all users for admin view
 */
export function useAdminUsers() {
    return useQuery({
        queryKey: userKeys.list(),
        queryFn: async (): Promise<Profile[]> => {
            return await adminService.getUsers();
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

/**
 * Fetch a specific user by ID
 */
export function useAdminUser(userId: string | undefined) {
    return useQuery({
        queryKey: userKeys.detail(userId || ''),
        queryFn: async (): Promise<Profile | null> => {
            if (!userId) return null;
            return await adminService.getUser(userId);
        },
        enabled: !!userId,
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

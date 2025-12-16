/**
 * useCreatePermissionRequest - Mutation hook for creating permission request
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

// ES module import
// @ts-ignore - JS module without types
import supabaseImport from '../../supabase-client.js';
// @ts-ignore - typing JS module import
const supabase: SupabaseClient = supabaseImport;

interface CreatePermissionRequestParams {
    userId: string;
    requestedRole: string;
    userCurrentRole: string;
    message: string;
}

async function createPermissionRequest(params: CreatePermissionRequestParams): Promise<void> {
    const { userId, requestedRole, userCurrentRole, message } = params;

    // Check for existing pending request
    const { data: existingRequests } = await supabase
        .from('permission_requests')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'pending');

    if (existingRequests && existingRequests.length > 0) {
        throw new Error('You already have a pending permission request');
    }

    // Create permission request
    const { error } = await supabase
        .from('permission_requests')
        .insert({
            user_id: userId,
            requested_role: requestedRole,
            user_current_role: userCurrentRole,
            message: message.trim()
        });

    if (error) throw error;
}

/**
 * Hook for creating a permission request
 *
 * @example
 * const createRequest = useCreatePermissionRequest();
 *
 * const handleSubmit = () => {
 *     createRequest.mutate({
 *         userId,
 *         requestedRole: 'editor',
 *         userCurrentRole: 'viewer',
 *         message: 'I need editor access to...'
 *     }, {
 *         onSuccess: () => toast.success('Request submitted'),
 *         onError: (error) => toast.error(error.message)
 *     });
 * };
 */
export function useCreatePermissionRequest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createPermissionRequest,
        onSuccess: (_, variables) => {
            // Invalidate user's permission requests to refetch
            queryClient.invalidateQueries({ queryKey: ['userPermissionRequests', variables.userId] });
        },
    });
}

export default useCreatePermissionRequest;

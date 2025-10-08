// Sharing Manager Module - Handles asset sharing between organizations
import authManager from './auth-manager.js';
import { supabase } from './supabase-client.js';

class SharingManager {
    constructor() {
        this.initPromise = this.initialize();
    }

    async initialize() {
        await authManager.ensureInitialized();
    }

    async ensureInitialized() {
        await this.initPromise;
    }

    /**
     * Share an asset (or specific vessel/scan) with another organization
     * @param {Object} options - Sharing options
     * @param {string} options.assetId - The asset ID to share
     * @param {string} options.vesselId - (Optional) Specific vessel ID
     * @param {string} options.scanId - (Optional) Specific scan ID
     * @param {string} options.sharedWithOrganizationId - Target organization ID
     * @param {string} options.permission - 'view' or 'edit'
     * @returns {Promise<Object>} Result with success/error
     */
    async shareAsset({ assetId, vesselId = null, scanId = null, sharedWithOrganizationId, permission = 'view' }) {
        try {
            if (!authManager.isAdmin()) {
                return { success: false, error: 'Only admins can share assets' };
            }

            const ownerOrganizationId = authManager.getCurrentOrganizationId();
            if (!ownerOrganizationId) {
                return { success: false, error: 'No organization context' };
            }

            // Determine share type
            let shareType = 'asset';
            if (scanId) shareType = 'scan';
            else if (vesselId) shareType = 'vessel';

            const { data, error } = await supabase
                .from('shared_assets')
                .insert({
                    owner_organization_id: ownerOrganizationId,
                    shared_with_organization_id: sharedWithOrganizationId,
                    asset_id: assetId,
                    vessel_id: vesselId,
                    scan_id: scanId,
                    share_type: shareType,
                    permission: permission,
                    shared_by: authManager.getCurrentUser()?.id
                })
                .select()
                .single();

            if (error) {
                // Handle unique constraint violation
                if (error.code === '23505') {
                    return { success: false, error: 'This item is already shared with this organization' };
                }
                console.error('Error sharing asset:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.error('Error sharing asset:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Remove a share
     * @param {string} shareId - The share ID to remove
     * @returns {Promise<Object>} Result with success/error
     */
    async removeShare(shareId) {
        try {
            if (!authManager.isAdmin()) {
                return { success: false, error: 'Only admins can remove shares' };
            }

            const { error } = await supabase
                .from('shared_assets')
                .delete()
                .eq('id', shareId);

            if (error) {
                console.error('Error removing share:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error) {
            console.error('Error removing share:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update share permissions
     * @param {string} shareId - The share ID to update
     * @param {string} permission - New permission ('view' or 'edit')
     * @returns {Promise<Object>} Result with success/error
     */
    async updateSharePermission(shareId, permission) {
        try {
            if (!authManager.isAdmin()) {
                return { success: false, error: 'Only admins can update shares' };
            }

            const { data, error } = await supabase
                .from('shared_assets')
                .update({ permission })
                .eq('id', shareId)
                .select()
                .single();

            if (error) {
                console.error('Error updating share:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.error('Error updating share:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get all assets shared with the current organization
     * @returns {Promise<Array>} List of shared assets
     */
    async getSharedWithCurrentOrganization() {
        try {
            const currentOrgId = authManager.getCurrentOrganizationId();
            if (!currentOrgId) {
                return [];
            }

            const { data, error } = await supabase
                .rpc('get_shared_assets_for_organization', { org_id: currentOrgId });

            if (error) {
                console.error('Error getting shared assets:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error getting shared assets:', error);
            return [];
        }
    }

    /**
     * Get all organizations a specific asset is shared with
     * @param {string} assetId - The asset ID
     * @param {string} vesselId - (Optional) Vessel ID
     * @param {string} scanId - (Optional) Scan ID
     * @returns {Promise<Array>} List of organizations
     */
    async getOrganizationsForAsset(assetId, vesselId = null, scanId = null) {
        try {
            const currentOrgId = authManager.getCurrentOrganizationId();
            if (!currentOrgId) {
                return [];
            }

            const { data, error } = await supabase
                .rpc('get_organizations_for_shared_asset', {
                    p_owner_org_id: currentOrgId,
                    p_asset_id: assetId,
                    p_vessel_id: vesselId,
                    p_scan_id: scanId
                });

            if (error) {
                console.error('Error getting organizations for asset:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error getting organizations for asset:', error);
            return [];
        }
    }

    /**
     * Get all shares for the current organization (as owner)
     * @returns {Promise<Array>} List of shares
     */
    async getSharesByCurrentOrganization() {
        try {
            const currentOrgId = authManager.getCurrentOrganizationId();
            if (!currentOrgId) {
                return [];
            }

            const { data, error } = await supabase
                .from('shared_assets')
                .select(`
                    *,
                    shared_with_org:organizations!shared_assets_shared_with_organization_id_fkey(id, name)
                `)
                .eq('owner_organization_id', currentOrgId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error getting shares:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error getting shares:', error);
            return [];
        }
    }

    /**
     * Get all shares (admin only)
     * @returns {Promise<Array>} List of all shares
     */
    async getAllShares() {
        try {
            if (!authManager.isAdmin()) {
                return [];
            }

            const { data, error } = await supabase
                .from('shared_assets')
                .select(`
                    *,
                    owner_org:organizations!shared_assets_owner_organization_id_fkey(id, name),
                    shared_with_org:organizations!shared_assets_shared_with_organization_id_fkey(id, name)
                `)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error getting all shares:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error getting all shares:', error);
            return [];
        }
    }

    /**
     * Check if current user has access to a specific asset
     * @param {string} assetId - The asset ID
     * @param {string} ownerOrgId - The organization that owns the asset
     * @param {string} vesselId - (Optional) Vessel ID
     * @param {string} scanId - (Optional) Scan ID
     * @returns {Promise<Object>} { hasAccess: boolean, permission: string }
     */
    async checkAccess(assetId, ownerOrgId, vesselId = null, scanId = null) {
        try {
            const currentOrgId = authManager.getCurrentOrganizationId();

            // Owner always has full access
            if (currentOrgId === ownerOrgId) {
                return { hasAccess: true, permission: 'edit' };
            }

            // Check if shared
            let query = supabase
                .from('shared_assets')
                .select('permission')
                .eq('owner_organization_id', ownerOrgId)
                .eq('shared_with_organization_id', currentOrgId)
                .eq('asset_id', assetId);

            if (scanId) {
                query = query.eq('scan_id', scanId);
            } else if (vesselId) {
                query = query.eq('vessel_id', vesselId);
            } else {
                query = query.is('vessel_id', null).is('scan_id', null);
            }

            const { data, error } = await query.single();

            if (error || !data) {
                return { hasAccess: false, permission: null };
            }

            return { hasAccess: true, permission: data.permission };
        } catch (error) {
            console.error('Error checking access:', error);
            return { hasAccess: false, permission: null };
        }
    }

    // ========== Asset Access Request Functions ==========

    /**
     * Request access to an asset from another organization
     * @param {Object} options - Request options
     * @param {string} options.ownerOrganizationId - Organization that owns the asset
     * @param {string} options.assetId - The asset ID
     * @param {string} options.vesselId - (Optional) Specific vessel ID
     * @param {string} options.scanId - (Optional) Specific scan ID
     * @param {string} options.permission - 'view' or 'edit'
     * @param {string} options.message - Optional message to admin
     * @returns {Promise<Object>} Result with success/error
     */
    async requestAssetAccess({ ownerOrganizationId, assetId, vesselId = null, scanId = null, permission = 'view', message = '' }) {
        try {
            const currentUser = authManager.getCurrentUser();
            const currentOrgId = authManager.getCurrentOrganizationId();

            if (!currentUser || !currentOrgId) {
                return { success: false, error: 'User not authenticated' };
            }

            if (currentOrgId === ownerOrganizationId) {
                return { success: false, error: 'Cannot request access to your own organization assets' };
            }

            const { data, error } = await supabase
                .from('asset_access_requests')
                .insert({
                    user_id: currentUser.id,
                    user_organization_id: currentOrgId,
                    owner_organization_id: ownerOrganizationId,
                    asset_id: assetId,
                    vessel_id: vesselId,
                    scan_id: scanId,
                    requested_permission: permission,
                    message: message
                })
                .select()
                .single();

            if (error) {
                // Handle unique constraint violation (duplicate request)
                if (error.code === '23505') {
                    return { success: false, error: 'You already have a pending request for this asset' };
                }
                console.error('Error requesting asset access:', error);
                return { success: false, error: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.error('Error requesting asset access:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get pending asset access requests for current organization (admin/org_admin only)
     * @returns {Promise<Array>} List of pending requests
     */
    async getPendingAccessRequests() {
        try {
            const currentOrgId = authManager.getCurrentOrganizationId();
            if (!currentOrgId) {
                return [];
            }

            if (!authManager.isAdmin() && !authManager.isOrgAdmin()) {
                return [];
            }

            const { data, error } = await supabase
                .rpc('get_pending_asset_access_requests_for_org', { org_id: currentOrgId });

            if (error) {
                console.error('Error getting pending access requests:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error getting pending access requests:', error);
            return [];
        }
    }

    /**
     * Get user's own asset access requests
     * @returns {Promise<Array>} List of user's requests
     */
    async getUserAccessRequests() {
        try {
            const currentUser = authManager.getCurrentUser();
            if (!currentUser) {
                return [];
            }

            const { data, error } = await supabase
                .rpc('get_user_asset_access_requests', { p_user_id: currentUser.id });

            if (error) {
                console.error('Error getting user access requests:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error getting user access requests:', error);
            return [];
        }
    }

    /**
     * Approve an asset access request (admin/org_admin only)
     * @param {string} requestId - The request ID to approve
     * @returns {Promise<Object>} Result with success/error
     */
    async approveAccessRequest(requestId) {
        try {
            if (!authManager.isAdmin() && !authManager.isOrgAdmin()) {
                return { success: false, error: 'Only admins can approve access requests' };
            }

            const { data, error } = await supabase
                .rpc('approve_asset_access_request', { request_id: requestId });

            if (error) {
                console.error('Error approving access request:', error);
                return { success: false, error: error.message };
            }

            if (!data.success) {
                return { success: false, error: data.error };
            }

            return { success: true, message: data.message };
        } catch (error) {
            console.error('Error approving access request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Reject an asset access request (admin/org_admin only)
     * @param {string} requestId - The request ID to reject
     * @param {string} reason - Reason for rejection
     * @returns {Promise<Object>} Result with success/error
     */
    async rejectAccessRequest(requestId, reason = '') {
        try {
            if (!authManager.isAdmin() && !authManager.isOrgAdmin()) {
                return { success: false, error: 'Only admins can reject access requests' };
            }

            const { data, error } = await supabase
                .rpc('reject_asset_access_request', { request_id: requestId, reason: reason });

            if (error) {
                console.error('Error rejecting access request:', error);
                return { success: false, error: error.message };
            }

            if (!data.success) {
                return { success: false, error: data.error };
            }

            return { success: true, message: data.message };
        } catch (error) {
            console.error('Error rejecting access request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cancel own asset access request
     * @param {string} requestId - The request ID to cancel
     * @returns {Promise<Object>} Result with success/error
     */
    async cancelAccessRequest(requestId) {
        try {
            const currentUser = authManager.getCurrentUser();
            if (!currentUser) {
                return { success: false, error: 'User not authenticated' };
            }

            const { error } = await supabase
                .from('asset_access_requests')
                .delete()
                .eq('id', requestId)
                .eq('user_id', currentUser.id)
                .eq('status', 'pending');

            if (error) {
                console.error('Error canceling access request:', error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (error) {
            console.error('Error canceling access request:', error);
            return { success: false, error: error.message };
        }
    }
}

// Create singleton instance
const sharingManager = new SharingManager();

export default sharingManager;

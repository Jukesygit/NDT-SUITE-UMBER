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
}

// Create singleton instance
const sharingManager = new SharingManager();

export default sharingManager;

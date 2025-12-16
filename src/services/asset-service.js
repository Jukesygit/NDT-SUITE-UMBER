// Asset Service - Handles asset/vessel/scan queries for Data Hub
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import authManager from '../auth-manager.js';

/**
 * Allowed image MIME types for security
 */
const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp'
];

/**
 * Validate that a file is an allowed image type
 * @param {File} file - File to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateImageFile(file) {
    if (!file) {
        return { valid: false, error: 'No file provided' };
    }

    // Check MIME type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return {
            valid: false,
            error: `Invalid file type: ${file.type}. Allowed types: JPEG, PNG, GIF, WebP, BMP`
        };
    }

    // Reject SVG files (can contain JavaScript)
    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        return { valid: false, error: 'SVG files are not allowed for security reasons' };
    }

    // Check file size (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        return { valid: false, error: 'File size exceeds 10MB limit' };
    }

    return { valid: true };
}

/**
 * Service for managing assets, vessels, and scans
 * Designed for lazy-loading - fetch only what's needed when needed
 */
class AssetService {
    /**
     * Get all assets for the current organization (metadata only, no nested data)
     */
    async getAssets() {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const orgId = authManager.getCurrentOrganizationId();
        const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

        let query = supabase
            .from('assets')
            .select('id, name, organization_id, created_by, created_at, updated_at')
            .order('name', { ascending: true });

        // SYSTEM org sees all assets, others see only their own
        if (!isSystemOrg && orgId) {
            query = query.eq('organization_id', orgId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    }

    /**
     * Get assets for a specific organization with vessel/scan counts
     */
    async getAssetsByOrg(organizationId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!organizationId) {
            throw new Error('Organization ID is required');
        }

        // Fetch assets for the specific org
        const { data: assets, error } = await supabase
            .from('assets')
            .select('id, name, organization_id, created_by, created_at, updated_at')
            .eq('organization_id', organizationId)
            .order('name', { ascending: true });

        if (error) throw error;

        // Get vessel counts for each asset
        const assetsWithCounts = await Promise.all(
            (assets || []).map(async (asset) => {
                const { count: vesselCount } = await supabase
                    .from('vessels')
                    .select('*', { count: 'exact', head: true })
                    .eq('asset_id', asset.id);

                return {
                    ...asset,
                    vesselCount: vesselCount || 0
                };
            })
        );

        return assetsWithCounts;
    }

    /**
     * Get a single asset by ID
     */
    async getAsset(assetId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('assets')
            .select('id, name, organization_id, created_by, created_at, updated_at')
            .eq('id', assetId)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get vessels for a specific asset (lazy-loaded when asset is clicked)
     */
    async getVessels(assetId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!assetId) {
            throw new Error('Asset ID is required');
        }

        const { data, error } = await supabase
            .from('vessels')
            .select('id, name, asset_id, model_3d_url, created_at, updated_at')
            .eq('asset_id', assetId)
            .order('name', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get vessels for a specific asset with scan counts (optimized - no N+1 queries)
     * Uses Supabase's relational query with count to fetch all data in 1-2 queries
     */
    async getVesselsWithCounts(assetId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!assetId) {
            throw new Error('Asset ID is required');
        }

        // Try to use Supabase's aggregation feature to get vessels with scan counts in one query
        // This uses the foreign key relationship between vessels and scans
        const { data: vessels, error } = await supabase
            .from('vessels')
            .select(`
                id,
                name,
                asset_id,
                model_3d_url,
                created_at,
                updated_at,
                scans(count)
            `)
            .eq('asset_id', assetId)
            .order('name', { ascending: true });

        if (error) {
            // Fallback: If aggregation doesn't work, use the efficient count method
            console.warn('Aggregation query failed, falling back to count queries:', error);

            const { data: vesselsList, error: vesselError } = await supabase
                .from('vessels')
                .select('id, name, asset_id, model_3d_url, created_at, updated_at')
                .eq('asset_id', assetId)
                .order('name', { ascending: true });

            if (vesselError) throw vesselError;

            // Use efficient head-only count queries (no data transfer, just count)
            const vesselsWithCounts = await Promise.all(
                (vesselsList || []).map(async (vessel) => {
                    const { count: scanCount } = await supabase
                        .from('scans')
                        .select('*', { count: 'exact', head: true })
                        .eq('vessel_id', vessel.id);

                    return {
                        ...vessel,
                        scanCount: scanCount || 0
                    };
                })
            );

            return vesselsWithCounts;
        }

        // Map the aggregation result to our expected format
        return (vessels || []).map(vessel => ({
            id: vessel.id,
            name: vessel.name,
            asset_id: vessel.asset_id,
            model_3d_url: vessel.model_3d_url,
            created_at: vessel.created_at,
            updated_at: vessel.updated_at,
            scanCount: Array.isArray(vessel.scans) && vessel.scans.length > 0
                ? vessel.scans[0].count
                : 0
        }));
    }

    /**
     * Get a single vessel by ID with basic info
     */
    async getVessel(vesselId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('vessels')
            .select('id, name, asset_id, model_3d_url, created_at, updated_at')
            .eq('id', vesselId)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get scans for a specific vessel (lazy-loaded when vessel is clicked)
     */
    async getScans(vesselId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!vesselId) {
            throw new Error('Vessel ID is required');
        }

        const { data, error } = await supabase
            .from('scans')
            .select('id, name, vessel_id, tool_type, thumbnail_url, strake_id, created_at, updated_at')
            .eq('vessel_id', vesselId)
            .order('created_at', { descending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get full scan data (lazy-loaded when scan is opened for viewing)
     */
    async getScan(scanId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('scans')
            .select(`
                id,
                vessel_id,
                name,
                tool_type,
                data,
                data_url,
                thumbnail_url,
                heatmap_url,
                strake_id,
                created_at,
                updated_at,
                metadata
            `)
            .eq('id', scanId)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get vessel images (lazy-loaded when vessel detail is viewed)
     */
    async getVesselImages(vesselId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!vesselId) {
            throw new Error('Vessel ID is required');
        }

        const { data, error } = await supabase
            .from('vessel_images')
            .select('id, name, image_url, vessel_id, created_at')
            .eq('vessel_id', vesselId)
            .order('created_at', { descending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get strakes for a vessel (lazy-loaded when vessel detail is viewed)
     */
    async getStrakes(vesselId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!vesselId) {
            throw new Error('Vessel ID is required');
        }

        const { data, error } = await supabase
            .from('strakes')
            .select(`
                id,
                vessel_id,
                name,
                total_area,
                required_coverage,
                created_at,
                updated_at,
                metadata
            `)
            .eq('vessel_id', vesselId)
            .order('name', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get asset statistics (count of vessels/scans) - for dashboard display
     */
    async getAssetStats(assetId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Get vessel count
        const { count: vesselCount, error: vesselError } = await supabase
            .from('vessels')
            .select('*', { count: 'exact', head: true })
            .eq('asset_id', assetId);

        if (vesselError) throw vesselError;

        // Get scan count across all vessels for this asset
        const { data: vessels } = await supabase
            .from('vessels')
            .select('id')
            .eq('asset_id', assetId);

        let scanCount = 0;
        if (vessels && vessels.length > 0) {
            const vesselIds = vessels.map(v => v.id);
            const { count, error: scanError } = await supabase
                .from('scans')
                .select('*', { count: 'exact', head: true })
                .in('vessel_id', vesselIds);

            if (scanError) throw scanError;
            scanCount = count || 0;
        }

        return {
            vesselCount: vesselCount || 0,
            scanCount
        };
    }

    // ============== MUTATIONS ==============

    /**
     * Create a new asset
     * @param {string} name - Asset name
     * @param {string|null} organizationId - Optional org ID (for admins creating in other orgs)
     */
    async createAsset(name, organizationId = null) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const user = authManager.getCurrentUser();
        // Use provided orgId or fall back to user's current org
        const orgId = organizationId || authManager.getCurrentOrganizationId();

        if (!user || !orgId) {
            throw new Error('User not authenticated');
        }

        const { data, error } = await supabase
            .from('assets')
            .insert({
                id: this.generateId(),
                name,
                organization_id: orgId,
                created_by: user.id
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Update an asset
     */
    async updateAsset(assetId, updates) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('assets')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', assetId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Delete an asset
     */
    async deleteAsset(assetId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase
            .from('assets')
            .delete()
            .eq('id', assetId);

        if (error) throw error;
        return true;
    }

    /**
     * Create a new vessel
     */
    async createVessel(assetId, name) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('vessels')
            .insert({
                id: this.generateId(),
                name,
                asset_id: assetId
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Update a vessel
     */
    async updateVessel(vesselId, updates) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('vessels')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', vesselId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Delete a vessel
     */
    async deleteVessel(vesselId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase
            .from('vessels')
            .delete()
            .eq('id', vesselId);

        if (error) throw error;
        return true;
    }

    // ============== SCAN MUTATIONS ==============

    /**
     * Delete a scan
     */
    async deleteScan(scanId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase
            .from('scans')
            .delete()
            .eq('id', scanId);

        if (error) throw error;
        return true;
    }

    /**
     * Update a scan (e.g., reassign to strake)
     */
    async updateScan(scanId, updates) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('scans')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', scanId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============== IMAGE MUTATIONS ==============

    /**
     * Delete a vessel image
     */
    async deleteVesselImage(imageId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase
            .from('vessel_images')
            .delete()
            .eq('id', imageId);

        if (error) throw error;
        return true;
    }

    /**
     * Rename a vessel image
     */
    async renameVesselImage(imageId, newName) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('vessel_images')
            .update({ name: newName })
            .eq('id', imageId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ============== STRAKE MUTATIONS ==============

    /**
     * Create a new strake
     */
    async createStrake(vesselId, data) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data: strake, error } = await supabase
            .from('strakes')
            .insert({
                id: this.generateId(),
                vessel_id: vesselId,
                name: data.name,
                total_area: data.totalArea || 0,
                required_coverage: data.requiredCoverage || 100,
            })
            .select()
            .single();

        if (error) throw error;
        return strake;
    }

    /**
     * Update a strake
     */
    async updateStrake(strakeId, updates) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('strakes')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', strakeId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Delete a strake
     */
    async deleteStrake(strakeId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase
            .from('strakes')
            .delete()
            .eq('id', strakeId);

        if (error) throw error;
        return true;
    }

    // ============== VESSEL IMAGE UPLOAD ==============

    /**
     * Upload vessel images
     * @param {string} vesselId - Vessel ID
     * @param {File[]} files - Array of image files to upload
     */
    async uploadVesselImages(vesselId, files) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Get organization ID for storage path (required by RLS policy)
        const orgId = authManager.getCurrentOrganizationId();
        if (!orgId) {
            throw new Error('Organization ID not found - cannot upload images');
        }

        const uploadedImages = [];

        for (const file of files) {
            // Validate file type and size for security
            const validation = validateImageFile(file);
            if (!validation.valid) {
                throw new Error(`File "${file.name}": ${validation.error}`);
            }

            // Generate unique file path with org ID prefix (required by RLS policy)
            const fileExt = file.name.split('.').pop().toLowerCase();
            const fileName = `${this.generateId()}.${fileExt}`;
            const filePath = `${orgId}/vessels/${vesselId}/images/${fileName}`;

            // Upload to Supabase storage
            const { error: uploadError } = await supabase.storage
                .from('vessel-images')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false,
                });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('vessel-images')
                .getPublicUrl(filePath);

            // Create database record
            const { data: imageRecord, error: dbError } = await supabase
                .from('vessel_images')
                .insert({
                    id: this.generateId(),
                    vessel_id: vesselId,
                    name: file.name,
                    image_url: publicUrl,
                })
                .select()
                .single();

            if (dbError) throw dbError;

            uploadedImages.push(imageRecord);
        }

        return uploadedImages;
    }

    // ============== DRAWING MANAGEMENT ==============

    /**
     * Upload a drawing (location or GA) for a vessel
     * @param {string} vesselId - Vessel ID
     * @param {'location' | 'ga'} drawingType - Type of drawing
     * @param {File} file - Image file
     */
    async uploadDrawing(vesselId, drawingType, file) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Get organization ID for storage path (required by RLS policy)
        const orgId = authManager.getCurrentOrganizationId();
        if (!orgId) {
            throw new Error('Organization ID not found - cannot upload drawing');
        }

        // Validate file type and size for security
        const validation = validateImageFile(file);
        if (!validation.valid) {
            throw new Error(`Drawing file: ${validation.error}`);
        }

        // Validate drawing type
        if (!['location', 'ga'].includes(drawingType)) {
            throw new Error('Invalid drawing type. Must be "location" or "ga"');
        }

        const fileExt = file.name.split('.').pop().toLowerCase();
        const fileName = `${drawingType}_${this.generateId()}.${fileExt}`;
        const filePath = `${orgId}/vessels/${vesselId}/drawings/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
            .from('vessel-images')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false,
            });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('vessel-images')
            .getPublicUrl(filePath);

        // Update vessel record with drawing URL
        const updateField = drawingType === 'location' ? 'location_drawing' : 'ga_drawing';
        const drawingData = {
            image_url: publicUrl,
            annotations: [],
            comment: '',
        };

        const { data, error: dbError } = await supabase
            .from('vessels')
            .update({
                [updateField]: drawingData,
                updated_at: new Date().toISOString(),
            })
            .eq('id', vesselId)
            .select()
            .single();

        if (dbError) throw dbError;
        return data;
    }

    /**
     * Update drawing annotations and comment
     * @param {string} vesselId - Vessel ID
     * @param {'location' | 'ga'} drawingType - Type of drawing
     * @param {Array} annotations - Annotation objects
     * @param {string} comment - Comment text
     */
    async updateDrawingAnnotations(vesselId, drawingType, annotations, comment) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // First get the current drawing to preserve the image_url
        const { data: vessel, error: fetchError } = await supabase
            .from('vessels')
            .select(drawingType === 'location' ? 'location_drawing' : 'ga_drawing')
            .eq('id', vesselId)
            .single();

        if (fetchError) throw fetchError;

        const currentDrawing = drawingType === 'location' ? vessel.location_drawing : vessel.ga_drawing;
        if (!currentDrawing) throw new Error('Drawing not found');

        const updateField = drawingType === 'location' ? 'location_drawing' : 'ga_drawing';
        const drawingData = {
            ...currentDrawing,
            annotations,
            comment,
        };

        const { data, error } = await supabase
            .from('vessels')
            .update({
                [updateField]: drawingData,
                updated_at: new Date().toISOString(),
            })
            .eq('id', vesselId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Remove a drawing from a vessel
     * @param {string} vesselId - Vessel ID
     * @param {'location' | 'ga'} drawingType - Type of drawing
     */
    async removeDrawing(vesselId, drawingType) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const updateField = drawingType === 'location' ? 'location_drawing' : 'ga_drawing';

        const { data, error } = await supabase
            .from('vessels')
            .update({
                [updateField]: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', vesselId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get vessel with drawings
     */
    async getVesselWithDrawings(vesselId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('vessels')
            .select('id, name, asset_id, model_3d_url, location_drawing, ga_drawing, created_at, updated_at')
            .eq('id', vesselId)
            .single();

        if (error) throw error;
        return data;
    }

    // ============== INSPECTION METHODS ==============

    /**
     * Get all inspections for a vessel
     */
    async getInspections(vesselId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!vesselId) {
            throw new Error('Vessel ID is required');
        }

        const { data, error } = await supabase
            .from('inspections')
            .select(`
                id,
                name,
                status,
                inspector_id,
                inspection_date,
                notes,
                vessel_id,
                created_at,
                updated_at,
                metadata
            `)
            .eq('vessel_id', vesselId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    /**
     * Get a single inspection by ID with scan/image counts
     */
    async getInspection(inspectionId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('inspections')
            .select(`
                id,
                vessel_id,
                name,
                status,
                inspector_id,
                inspection_date,
                notes,
                created_at,
                updated_at,
                metadata
            `)
            .eq('id', inspectionId)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Create a new inspection
     * @param {string} vesselId - Vessel ID
     * @param {object} data - Inspection data (name, status, inspection_date, notes)
     */
    async createInspection(vesselId, data) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const user = authManager.getCurrentUser();
        if (!user) {
            throw new Error('User not authenticated');
        }

        const { data: inspection, error } = await supabase
            .from('inspections')
            .insert({
                id: this.generateId(),
                vessel_id: vesselId,
                name: data.name,
                status: data.status || 'in_progress',
                inspector_id: user.id,
                inspection_date: data.inspection_date || new Date().toISOString().split('T')[0],
                notes: data.notes || '',
            })
            .select()
            .single();

        if (error) throw error;
        return inspection;
    }

    /**
     * Update an inspection
     */
    async updateInspection(inspectionId, updates) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('inspections')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', inspectionId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Delete an inspection
     */
    async deleteInspection(inspectionId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase
            .from('inspections')
            .delete()
            .eq('id', inspectionId);

        if (error) throw error;
        return true;
    }

    /**
     * Generate a unique ID (matching existing pattern)
     */
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export const assetService = new AssetService();
export default assetService;

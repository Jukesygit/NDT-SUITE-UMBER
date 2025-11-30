/**
 * Sync Service - Handles synchronization between IndexedDB and Supabase
 *
 * This service manages:
 * - Uploading local data to Supabase (assets, vessels, scans, files)
 * - Downloading remote data from Supabase to IndexedDB
 * - Conflict resolution when data exists in both locations
 * - File uploads to Supabase Storage
 */

import { supabase } from './supabase-client.js';
import authManager from './auth-manager.js';
import indexedDB from './indexed-db.js';

class SyncService {
    constructor() {
        this.syncInProgress = false;
        this.lastSyncTime = null;
        this.lastSyncAttempt = null;
        this.syncCooldown = 30000; // 30 seconds cooldown between sync attempts
        this.syncQueue = [];
        this.deviceId = this.getOrCreateDeviceId();
        this.autoSyncEnabled = true;
        this.autoSyncInterval = 5 * 60 * 1000; // 5 minutes default
        this.autoSyncTimer = null;
        this.pendingChanges = false;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
    }

    /**
     * Get or create a unique device ID for sync tracking
     */
    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('ndt_device_id');
        if (!deviceId) {
            deviceId = this.generateId();
            localStorage.setItem('ndt_device_id', deviceId);
        }
        return deviceId;
    }

    /**
     * Generate a unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Sync: Upload local changes to Supabase
     *
     * NOTE: Downloads are no longer performed here. React Query handles all data
     * fetching with proper caching. This sync only uploads pending local changes.
     */
    async fullSync() {
        if (this.syncInProgress) {
            console.log('Sync already in progress, skipping...');
            return { success: false, error: 'Sync already in progress' };
        }

        if (!authManager.isLoggedIn()) {
            console.log('User not logged in, skipping sync');
            return { success: false, error: 'User not logged in' };
        }

        console.log('[SYNC] Starting upload sync...');
        this.syncInProgress = true;

        try {
            // Upload local data to Supabase
            // Note: Downloads removed - React Query handles fetching with lazy loading
            console.log('[SYNC] Uploading local changes...');
            const uploadResult = await this.uploadAllData();
            if (!uploadResult.success) {
                throw new Error(`Upload failed: ${uploadResult.error}`);
            }

            this.lastSyncTime = new Date();
            this.pendingChanges = false;
            console.log('[SYNC] Upload sync completed successfully');

            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('syncCompleted', {
                detail: {
                    success: true,
                    timestamp: this.lastSyncTime,
                    uploaded: uploadResult.count
                }
            }));

            return {
                success: true,
                uploaded: uploadResult.count,
                timestamp: this.lastSyncTime
            };

        } catch (error) {
            console.error('[SYNC] Upload failed:', error);

            window.dispatchEvent(new CustomEvent('syncFailed', {
                detail: { error: error.message }
            }));

            return { success: false, error: error.message };
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Fast initialization - only fetch asset metadata, no nested vessels/scans
     * This is used for initial page load to avoid N+1 queries
     * Vessels and scans are loaded lazily when user clicks on them
     */
    async downloadAssetsOnly() {
        const user = authManager.getCurrentUser();
        const orgId = authManager.getCurrentOrganizationId();

        if (!user || !orgId) {
            return { success: false, error: 'No user or organization' };
        }

        try {
            const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

            // Fetch ONLY asset metadata - no vessels, no scans
            let query = supabase
                .from('assets')
                .select('id, name, organization_id, created_by, created_at, updated_at')
                .abortSignal(AbortSignal.timeout(10000)); // 10s timeout is enough for just metadata

            if (!isSystemOrg) {
                query = query.eq('organization_id', orgId);
            }

            console.log('[SYNC-SERVICE] Fast init: Fetching asset metadata only...');
            const { data: assets, error: assetsError } = await query;

            if (assetsError) {
                if (assetsError.code === '57014' || assetsError.message?.includes('timeout')) {
                    console.warn('[SYNC-SERVICE] Fast init timeout, skipping');
                    return { success: true, count: 0, skipped: true };
                }
                throw assetsError;
            }

            if (!assets || assets.length === 0) {
                console.log('[SYNC-SERVICE] Fast init: No assets found');
                return { success: true, count: 0 };
            }

            console.log(`[SYNC-SERVICE] Fast init: Found ${assets.length} assets`);

            // Load current local data
            const localData = await indexedDB.loadData();

            // Process assets without fetching nested data
            for (const remoteAsset of assets) {
                const targetOrgId = isSystemOrg ? remoteAsset.organization_id : orgId;

                if (!localData[targetOrgId]) {
                    localData[targetOrgId] = { assets: [] };
                }

                let localAsset = localData[targetOrgId].assets.find(a => a.id === remoteAsset.id);

                if (!localAsset) {
                    localAsset = {
                        id: remoteAsset.id,
                        name: remoteAsset.name,
                        organizationId: remoteAsset.organization_id,
                        createdBy: remoteAsset.created_by,
                        createdAt: new Date(remoteAsset.created_at).getTime(),
                        vessels: [] // Empty - will be loaded lazily
                    };
                    localData[targetOrgId].assets.push(localAsset);
                } else {
                    // Update name if changed
                    localAsset.name = remoteAsset.name;
                }
            }

            // Save to IndexedDB
            await indexedDB.saveData(localData);
            console.log(`[SYNC-SERVICE] Fast init complete: ${assets.length} assets loaded`);

            return { success: true, count: assets.length };

        } catch (error) {
            console.error('[SYNC-SERVICE] Fast init failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Download all data from Supabase to IndexedDB
     */
    async downloadAllData() {
        const user = authManager.getCurrentUser();
        const orgId = authManager.getCurrentOrganizationId();

        if (!user || !orgId) {
            return { success: false, error: 'No user or organization' };
        }

        // Check cooldown period to prevent rapid retries
        if (this.lastSyncAttempt && (Date.now() - this.lastSyncAttempt < this.syncCooldown)) {
            const remaining = Math.ceil((this.syncCooldown - (Date.now() - this.lastSyncAttempt)) / 1000);
            console.log(`[SYNC-SERVICE] Cooldown active, ${remaining}s remaining`);
            return { success: true, count: 0, cooldown: true };
        }

        // Check consecutive failures
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            console.warn(`[SYNC-SERVICE] Max consecutive failures (${this.maxConsecutiveFailures}) reached, backing off`);
            return { success: true, count: 0, backoff: true };
        }

        this.lastSyncAttempt = Date.now();

        // Dispatch sync started event
        window.dispatchEvent(new CustomEvent('syncStarted'));

        try {
            // Check if user is in SYSTEM organization
            const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

            // Fetch assets based on organization with timeout
            let query = supabase.from('assets').select('*').abortSignal(AbortSignal.timeout(30000)); // Increased to 30s

            // SYSTEM org sees all assets, others see only their own + shared
            if (!isSystemOrg) {
                query = query.eq('organization_id', orgId);
            }

            console.log('[SYNC-SERVICE] Fetching assets from Supabase...');
            const { data: assets, error: assetsError } = await query;

            if (assetsError) {
                // If timeout or statement cancellation, return success with 0 count to avoid infinite retries
                if (assetsError.code === '57014' || assetsError.message?.includes('timeout') || assetsError.message?.includes('aborted')) {
                    console.warn('[SYNC-SERVICE] Assets query timeout, skipping download to avoid infinite retries');
                    return { success: true, count: 0, skipped: true };
                }
                throw assetsError;
            }

            if (!assets || assets.length === 0) {
                console.log('[SYNC-SERVICE] No remote assets found');
                return { success: true, count: 0 };
            }

            console.log(`[SYNC-SERVICE] Found ${assets.length} remote assets, starting download...`);

            // Load current local data
            const localData = await indexedDB.loadData();

            let downloadCount = 0;

            // Process each asset
            for (let assetIndex = 0; assetIndex < assets.length; assetIndex++) {
                const remoteAsset = assets[assetIndex];
                console.log(`[SYNC-SERVICE] Processing asset ${assetIndex + 1}/${assets.length}: ${remoteAsset.name}`);
                // For SYSTEM org, organize assets by their actual organization
                // For regular orgs, use current org
                const targetOrgId = isSystemOrg ? remoteAsset.organization_id : orgId;

                // Ensure org data structure exists
                if (!localData[targetOrgId]) {
                    localData[targetOrgId] = { assets: [] };
                }

                // Check if asset exists locally
                let localAsset = localData[targetOrgId].assets.find(a => a.id === remoteAsset.id);

                if (!localAsset) {
                    // New asset, create it
                    localAsset = {
                        id: remoteAsset.id,
                        name: remoteAsset.name,
                        organizationId: remoteAsset.organization_id,
                        createdBy: remoteAsset.created_by,
                        createdAt: new Date(remoteAsset.created_at).getTime(),
                        vessels: []
                    };
                    localData[targetOrgId].assets.push(localAsset);
                    downloadCount++;
                } else {
                    // Update existing asset if remote is newer
                    const remoteUpdated = new Date(remoteAsset.updated_at).getTime();
                    const localUpdated = localAsset.updatedAt || localAsset.createdAt;

                    if (remoteUpdated > localUpdated) {
                        localAsset.name = remoteAsset.name;
                        localAsset.updatedAt = remoteUpdated;
                        downloadCount++;
                    }
                }

                // Download vessels for this asset (metadata only, skip scan data)
                console.log(`[SYNC-SERVICE] Downloading vessels for asset: ${remoteAsset.name}`);
                const vesselsResult = await this.downloadVessels(remoteAsset.id, localAsset, true); // Pass skipScans=true
                downloadCount += vesselsResult.count;
                console.log(`[SYNC-SERVICE] Asset ${remoteAsset.name} complete. Total items so far: ${downloadCount}`);
            }

            // Save updated data to IndexedDB
            console.log('[SYNC-SERVICE] Saving downloaded data to IndexedDB...');
            await indexedDB.saveData(localData);
            console.log(`[SYNC-SERVICE] Download complete! Total items downloaded: ${downloadCount}`);

            // Success - reset failure counter
            this.consecutiveFailures = 0;
            return { success: true, count: downloadCount };

        } catch (error) {
            console.error('Download failed:', error);
            this.consecutiveFailures++;
            return { success: false, error: error.message };
        }
    }

    /**
     * Download vessels for a specific asset
     * @param {string} assetId - The asset ID
     * @param {object} localAsset - The local asset object
     * @param {boolean} skipScans - If true, skip downloading scan data to speed up initial sync
     */
    async downloadVessels(assetId, localAsset, skipScans = false) {
        try {
            console.log(`[SYNC-SERVICE] Fetching vessels for asset ${assetId}...`);
            const { data: vessels, error } = await supabase
                .from('vessels')
                .select('*')
                .eq('asset_id', assetId)
                .abortSignal(AbortSignal.timeout(30000)); // Increased to 30s

            if (error) {
                // If timeout, return 0 to avoid breaking the entire sync
                if (error.code === '57014' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
                    console.warn(`[SYNC-SERVICE] Vessels query timeout for asset ${assetId}, skipping`);
                    return { count: 0, skipped: true };
                }
                throw error;
            }

            if (!vessels || vessels.length === 0) {
                console.log(`[SYNC-SERVICE] No vessels found for asset ${assetId}`);
                return { success: true, count: 0 };
            }

            console.log(`[SYNC-SERVICE] Found ${vessels.length} vessels for asset ${assetId}`);

            let count = 0;

            for (const remoteVessel of vessels) {
                let localVessel = localAsset.vessels.find(v => v.id === remoteVessel.id);

                if (!localVessel) {
                    // New vessel
                    localVessel = {
                        id: remoteVessel.id,
                        name: remoteVessel.name,
                        model3d: null, // Will be downloaded separately
                        images: [],
                        scans: []
                    };

                    // Download 3D model if exists
                    if (remoteVessel.model_3d_url) {
                        const modelData = await this.downloadFile(remoteVessel.model_3d_url);
                        if (modelData) {
                            localVessel.model3d = modelData;
                        }
                    }

                    localAsset.vessels.push(localVessel);
                    count++;
                } else {
                    // Update existing vessel
                    localVessel.name = remoteVessel.name;

                    // Update 3D model if changed
                    if (remoteVessel.model_3d_url && !localVessel.model3d) {
                        const modelData = await this.downloadFile(remoteVessel.model_3d_url);
                        if (modelData) {
                            localVessel.model3d = modelData;
                            count++;
                        }
                    }
                }

                // Download vessel images
                const imagesResult = await this.downloadVesselImages(remoteVessel.id, localVessel);
                count += imagesResult.count;

                // Download strakes
                const strakesResult = await this.downloadStrakes(remoteVessel.id, localVessel);
                count += strakesResult.count;

                // Download scans (skip if requested for faster initial sync)
                if (!skipScans) {
                    const scansResult = await this.downloadScans(remoteVessel.id, localVessel);
                    count += scansResult.count;
                } else {
                    console.log(`[SYNC-SERVICE] Skipping scan data download for vessel ${remoteVessel.id} (fast sync mode)`);
                }
            }

            return { success: true, count };

        } catch (error) {
            console.error('Error downloading vessels:', error);
            return { success: false, error: error.message, count: 0 };
        }
    }

    /**
     * Download vessel images
     */
    async downloadVesselImages(vesselId, localVessel) {
        try {
            const { data: images, error } = await supabase
                .from('vessel_images')
                .select('*')
                .eq('vessel_id', vesselId);

            if (error) throw error;

            let count = 0;

            for (const remoteImage of images) {
                const existingImage = localVessel.images.find(img => img.id === remoteImage.id);

                if (!existingImage) {
                    // Download image data
                    const imageData = await this.downloadFile(remoteImage.image_url);
                    if (imageData) {
                        localVessel.images.push({
                            id: remoteImage.id,
                            name: remoteImage.name,
                            dataUrl: imageData,
                            timestamp: new Date(remoteImage.created_at).getTime()
                        });
                        count++;
                    }
                }
            }

            return { success: true, count };

        } catch (error) {
            console.error('Error downloading vessel images:', error);
            return { success: false, error: error.message, count: 0 };
        }
    }

    /**
     * Download strakes for a vessel
     */
    async downloadStrakes(vesselId, localVessel) {
        try {
            const { data: strakes, error } = await supabase
                .from('strakes')
                .select('*')
                .eq('vessel_id', vesselId)
                .abortSignal(AbortSignal.timeout(10000));

            if (error) {
                // If timeout, return 0 to avoid breaking the entire sync
                if (error.code === '57014' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
                    console.warn(`[SYNC-SERVICE] Strakes query timeout for vessel ${vesselId}, skipping`);
                    return { success: true, count: 0, skipped: true };
                }
                throw error;
            }

            // Initialize strakes array if it doesn't exist
            if (!localVessel.strakes) {
                localVessel.strakes = [];
            }

            let count = 0;

            for (const remoteStrake of strakes) {
                const existingStrake = localVessel.strakes.find(s => s.id === remoteStrake.id);

                if (!existingStrake) {
                    // Add new strake
                    localVessel.strakes.push({
                        id: remoteStrake.id,
                        name: remoteStrake.name,
                        totalArea: remoteStrake.total_area,
                        requiredCoverage: remoteStrake.required_coverage,
                        scans: [] // Will be populated when scans are downloaded
                    });
                    count++;
                } else {
                    // Update existing strake if data changed
                    let updated = false;
                    if (existingStrake.name !== remoteStrake.name) {
                        existingStrake.name = remoteStrake.name;
                        updated = true;
                    }
                    if (existingStrake.totalArea !== remoteStrake.total_area) {
                        existingStrake.totalArea = remoteStrake.total_area;
                        updated = true;
                    }
                    if (existingStrake.requiredCoverage !== remoteStrake.required_coverage) {
                        existingStrake.requiredCoverage = remoteStrake.required_coverage;
                        updated = true;
                    }
                    if (updated) {
                        count++;
                    }
                }
            }

            // Success - reset failure counter
            this.consecutiveFailures = 0;
            return { success: true, count };

        } catch (error) {
            console.error('Error downloading strakes:', error);
            this.consecutiveFailures++;
            return { success: false, error: error.message, count: 0 };
        }
    }

    /**
     * Download scans for a vessel (with pagination and retry)
     */
    async downloadScans(vesselId, localVessel) {
        try {
            // Use pagination to avoid timeout on large result sets
            const PAGE_SIZE = 10; // Download 10 scans at a time
            let allScans = [];
            let page = 0;
            let hasMore = true;

            console.log(`[SYNC-SERVICE] Fetching scans for vessel ${vesselId} (paginated)...`);

            while (hasMore) {
                const { data: scans, error, count: totalCount } = await supabase
                    .from('scans')
                    .select('*', { count: 'exact' })
                    .eq('vessel_id', vesselId)
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
                    .abortSignal(AbortSignal.timeout(60000)); // 60s timeout per page

                if (error) {
                    // If timeout or server error, try to continue with what we have
                    if (error.code === '57014' || error.message?.includes('timeout') || error.message?.includes('aborted') || error.message?.includes('500')) {
                        console.warn(`[SYNC-SERVICE] Scans query error on page ${page} for vessel ${vesselId}: ${error.message}`);
                        if (allScans.length === 0) {
                            // No scans fetched yet, return failure
                            return { success: true, count: 0, skipped: true };
                        }
                        // Stop pagination but use what we have
                        break;
                    }
                    throw error;
                }

                if (!scans || scans.length === 0) {
                    hasMore = false;
                    break;
                }

                allScans = allScans.concat(scans);
                console.log(`[SYNC-SERVICE] Fetched page ${page + 1}, got ${scans.length} scans (total so far: ${allScans.length})`);

                // Check if there are more pages
                if (scans.length < PAGE_SIZE || (totalCount && allScans.length >= totalCount)) {
                    hasMore = false;
                }
                page++;
            }

            if (allScans.length === 0) {
                console.log(`[SYNC-SERVICE] No scans found for vessel ${vesselId}`);
                return { success: true, count: 0 };
            }

            console.log(`[SYNC-SERVICE] Found ${allScans.length} total scans for vessel ${vesselId}, starting download...`);
            let count = 0;

            for (let i = 0; i < allScans.length; i++) {
                const remoteScan = allScans[i];
                const existingScan = localVessel.scans.find(s => s.id === remoteScan.id);

                if (!existingScan) {
                    console.log(`[SYNC-SERVICE] Downloading scan ${i + 1}/${allScans.length}: ${remoteScan.name}`);

                    const scanData = {
                        id: remoteScan.id,
                        name: remoteScan.name,
                        toolType: remoteScan.tool_type,
                        timestamp: new Date(remoteScan.created_at).getTime(),
                        data: remoteScan.data || null,
                        strakeId: remoteScan.strake_id || null // Include strake assignment
                    };

                    // Download files in parallel with timeout handling
                    try {
                        console.log(`[SYNC-SERVICE] Downloading files for ${remoteScan.name}...`);

                        const downloadPromises = [];

                        // Download thumbnail if exists
                        if (remoteScan.thumbnail_url) {
                            downloadPromises.push(
                                Promise.race([
                                    this.downloadFile(remoteScan.thumbnail_url),
                                    new Promise((_, reject) => setTimeout(() => reject(new Error('Thumbnail download timeout')), 30000))
                                ]).then(data => ({ type: 'thumbnail', data }))
                                .catch(err => {
                                    console.warn(`[SYNC-SERVICE] Failed to download thumbnail: ${err.message}`);
                                    return { type: 'thumbnail', data: null };
                                })
                            );
                        }

                        // Download heatmap if exists
                        if (remoteScan.heatmap_url) {
                            downloadPromises.push(
                                Promise.race([
                                    this.downloadFile(remoteScan.heatmap_url),
                                    new Promise((_, reject) => setTimeout(() => reject(new Error('Heatmap download timeout')), 30000))
                                ]).then(data => ({ type: 'heatmap', data }))
                                .catch(err => {
                                    console.warn(`[SYNC-SERVICE] Failed to download heatmap: ${err.message}`);
                                    return { type: 'heatmap', data: null };
                                })
                            );
                        }

                        // Download large data file if exists
                        if (remoteScan.data_url) {
                            downloadPromises.push(
                                Promise.race([
                                    this.downloadFile(remoteScan.data_url),
                                    new Promise((_, reject) => setTimeout(() => reject(new Error('Data file download timeout')), 30000))
                                ]).then(data => ({ type: 'data', data }))
                                .catch(err => {
                                    console.warn(`[SYNC-SERVICE] Failed to download data file: ${err.message}`);
                                    return { type: 'data', data: null };
                                })
                            );
                        }

                        // Wait for all downloads to complete in parallel
                        const results = await Promise.all(downloadPromises);

                        // Process results
                        for (const result of results) {
                            if (result.type === 'thumbnail') {
                                scanData.thumbnail = result.data;
                            } else if (result.type === 'heatmap') {
                                scanData.heatmapOnly = result.data;
                            } else if (result.type === 'data' && result.data) {
                                // Convert data URL to text before parsing
                                const textData = this.dataURLToText(result.data);
                                if (textData) {
                                    try {
                                        scanData.data = JSON.parse(textData);
                                    } catch (parseError) {
                                        console.error('Error parsing scan data JSON:', parseError);
                                        console.error('First 100 chars of data:', textData.substring(0, 100));
                                        scanData.data = null;
                                    }
                                }
                            }
                        }
                    } catch (fileError) {
                        console.error(`[SYNC-SERVICE] Error downloading scan files: ${fileError.message}`);
                        // Continue with scan metadata even if files fail
                    }

                    localVessel.scans.push(scanData);
                    count++;
                    console.log(`[SYNC-SERVICE] Scan ${remoteScan.name} downloaded (${count}/${allScans.length} completed)`);
                }
            }

            return { success: true, count };

        } catch (error) {
            console.error('Error downloading scans:', error);
            return { success: false, error: error.message, count: 0 };
        }
    }

    /**
     * Download a file from Supabase Storage
     */
    async downloadFile(storagePath) {
        try {
            // Extract bucket and path from storage URL
            const url = new URL(storagePath);
            const pathParts = url.pathname.split('/storage/v1/object/public/');
            if (pathParts.length < 2) {
                // Try authenticated path
                const authParts = url.pathname.split('/storage/v1/object/');
                if (authParts.length < 2) {
                    console.error('Invalid storage URL:', storagePath);
                    return null;
                }
                const [bucket, ...filePath] = authParts[1].split('/');

                const { data, error } = await supabase.storage
                    .from(bucket)
                    .download(filePath.join('/'));

                if (error) throw error;

                // Convert blob to data URL
                return await this.blobToDataURL(data);
            }

            const [bucket, ...filePath] = pathParts[1].split('/');

            const { data, error } = await supabase.storage
                .from(bucket)
                .download(filePath.join('/'));

            if (error) throw error;

            // Convert blob to data URL
            return await this.blobToDataURL(data);

        } catch (error) {
            console.error('Error downloading file:', error);
            return null;
        }
    }

    /**
     * Convert Blob to data URL
     */
    blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Decode data URL to text content
     */
    dataURLToText(dataUrl) {
        try {
            // Extract the base64 data from data URL
            const base64Index = dataUrl.indexOf('base64,');
            if (base64Index === -1) {
                // Not base64 encoded, try to extract directly
                const commaIndex = dataUrl.indexOf(',');
                if (commaIndex !== -1) {
                    return decodeURIComponent(dataUrl.substring(commaIndex + 1));
                }
                return dataUrl;
            }

            // Decode base64 to text
            const base64Data = dataUrl.substring(base64Index + 7);
            return atob(base64Data);
        } catch (error) {
            console.error('Error decoding data URL:', error);
            return null;
        }
    }

    /**
     * Upload all local data to Supabase
     */
    async uploadAllData() {
        const user = authManager.getCurrentUser();
        const orgId = authManager.getCurrentOrganizationId();

        if (!user || !orgId) {
            return { success: false, error: 'No user or organization' };
        }

        try {
            console.log('[UPLOAD] Starting upload process...');

            // Load local data
            const localData = await indexedDB.loadData();
            const orgData = localData[orgId];

            if (!orgData || !orgData.assets || orgData.assets.length === 0) {
                console.log('[UPLOAD] No local data to upload');
                return { success: true, count: 0 };
            }

            console.log(`[UPLOAD] Found ${orgData.assets.length} assets to upload`);
            let uploadCount = 0;
            let errors = [];

            // Upload each asset
            for (let i = 0; i < orgData.assets.length; i++) {
                const asset = orgData.assets[i];
                console.log(`[UPLOAD] Uploading asset ${i + 1}/${orgData.assets.length}: ${asset.name}`);

                try {
                    const result = await this.uploadAsset(asset, orgId, user.id);
                    if (result.success) {
                        uploadCount += result.count;
                        console.log(`[UPLOAD] Asset ${asset.name} uploaded successfully (${result.count} items)`);
                    } else {
                        const errorMsg = `Failed to upload asset ${asset.name}: ${result.error}`;
                        console.error(`[UPLOAD] ${errorMsg}`);
                        errors.push(errorMsg);
                    }
                } catch (error) {
                    const errorMsg = `Error uploading asset ${asset.name}: ${error.message}`;
                    console.error(`[UPLOAD] ${errorMsg}`);
                    errors.push(errorMsg);
                }
            }

            console.log(`[UPLOAD] Upload process completed. Total items uploaded: ${uploadCount}`);

            if (errors.length > 0) {
                console.warn(`[UPLOAD] Some uploads failed (${errors.length} errors)`);
                // Still consider it a success if at least some items were uploaded
                return {
                    success: uploadCount > 0,
                    count: uploadCount,
                    partialSuccess: true,
                    errors: errors
                };
            }

            return { success: true, count: uploadCount };

        } catch (error) {
            console.error('[UPLOAD] Upload failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload a single asset with all its data
     */
    async uploadAsset(asset, orgId, userId) {
        try {
            console.log(`[UPLOAD_ASSET] Starting upload for asset: ${asset.name} (ID: ${asset.id})`);
            let count = 0;

            // Check if asset exists in Supabase
            console.log(`[UPLOAD_ASSET] Checking if asset exists in Supabase...`);
            const { data: existingAsset, error: checkError } = await supabase
                .from('assets')
                .select('id, updated_at')
                .eq('id', asset.id)
                .single();

            if (checkError && checkError.code !== 'PGRST116') {
                console.error(`[UPLOAD_ASSET] Error checking asset existence:`, checkError);
                throw checkError;
            }

            if (!existingAsset) {
                // Upload new asset
                console.log(`[UPLOAD_ASSET] Creating new asset in Supabase...`);
                const { error } = await supabase
                    .from('assets')
                    .insert({
                        id: asset.id,
                        name: asset.name,
                        organization_id: orgId,
                        created_by: userId,
                        created_at: new Date(asset.createdAt).toISOString()
                    });

                if (error) throw error;
                count++;
                console.log(`[UPLOAD_ASSET] Asset created successfully`);
            } else {
                console.log(`[UPLOAD_ASSET] Asset already exists, skipping creation`);
            }

            // Upload vessels
            if (asset.vessels && asset.vessels.length > 0) {
                console.log(`[UPLOAD_ASSET] Uploading ${asset.vessels.length} vessels...`);
                for (let i = 0; i < asset.vessels.length; i++) {
                    const vessel = asset.vessels[i];
                    console.log(`[UPLOAD_ASSET] Uploading vessel ${i + 1}/${asset.vessels.length}: ${vessel.name}`);
                    const vesselResult = await this.uploadVessel(vessel, asset.id, orgId);
                    if (vesselResult.success) {
                        count += vesselResult.count;
                    } else {
                        console.warn(`[UPLOAD_ASSET] Failed to upload vessel ${vessel.name}:`, vesselResult.error);
                    }
                }
            } else {
                console.log(`[UPLOAD_ASSET] No vessels to upload`);
            }

            console.log(`[UPLOAD_ASSET] Asset upload complete. Total items: ${count}`);
            return { success: true, count };

        } catch (error) {
            console.error(`[UPLOAD_ASSET] Error uploading asset ${asset.name}:`, error);
            return { success: false, error: error.message, count: 0 };
        }
    }

    /**
     * Upload a single vessel with all its data
     */
    async uploadVessel(vessel, assetId, orgId) {
        try {
            console.log(`[UPLOAD_VESSEL] Starting upload for vessel: ${vessel.name} (ID: ${vessel.id})`);
            let count = 0;

            // Check if vessel exists
            console.log(`[UPLOAD_VESSEL] Checking if vessel exists...`);
            const { data: existingVessel, error: checkError } = await supabase
                .from('vessels')
                .select('id')
                .eq('id', vessel.id)
                .single();

            if (checkError && checkError.code !== 'PGRST116') {
                console.error(`[UPLOAD_VESSEL] Error checking vessel existence:`, checkError);
                throw checkError;
            }

            let model3dUrl = null;

            // Upload 3D model if exists
            if (vessel.model3d) {
                console.log(`[UPLOAD_VESSEL] Uploading 3D model...`);
                try {
                    model3dUrl = await this.uploadFile(
                        vessel.model3d,
                        '3d-models',
                        `${orgId}/${assetId}/${vessel.id}/model.obj`,
                        'model/obj'
                    );
                    if (model3dUrl) {
                        console.log(`[UPLOAD_VESSEL] 3D model uploaded successfully`);
                    } else {
                        console.warn(`[UPLOAD_VESSEL] 3D model upload failed (returned null)`);
                    }
                } catch (error) {
                    console.error(`[UPLOAD_VESSEL] 3D model upload error:`, error);
                    // Continue even if 3D model fails
                }
            }

            if (!existingVessel) {
                // Insert new vessel
                console.log(`[UPLOAD_VESSEL] Creating new vessel in Supabase...`);
                const { error } = await supabase
                    .from('vessels')
                    .insert({
                        id: vessel.id,
                        asset_id: assetId,
                        name: vessel.name,
                        model_3d_url: model3dUrl,
                        model_3d_filename: 'model.obj',
                        created_at: new Date().toISOString()
                    });

                if (error) throw error;
                count++;
                console.log(`[UPLOAD_VESSEL] Vessel created successfully`);
            } else {
                console.log(`[UPLOAD_VESSEL] Vessel already exists`);
                if (model3dUrl) {
                    // Update vessel with 3D model URL
                    console.log(`[UPLOAD_VESSEL] Updating vessel with 3D model URL...`);
                    const { error } = await supabase
                        .from('vessels')
                        .update({
                            model_3d_url: model3dUrl,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', vessel.id);

                    if (error) throw error;
                }
            }

            // Upload vessel images
            if (vessel.images && vessel.images.length > 0) {
                console.log(`[UPLOAD_VESSEL] Uploading ${vessel.images.length} images...`);
                for (let i = 0; i < vessel.images.length; i++) {
                    const image = vessel.images[i];
                    console.log(`[UPLOAD_VESSEL] Uploading image ${i + 1}/${vessel.images.length}: ${image.name}`);
                    try {
                        const imageResult = await this.uploadVesselImage(image, vessel.id, assetId, orgId);
                        if (imageResult.success) {
                            count++;
                            console.log(`[UPLOAD_VESSEL] Image uploaded successfully`);
                        } else {
                            console.warn(`[UPLOAD_VESSEL] Image upload failed:`, imageResult.error);
                        }
                    } catch (error) {
                        console.error(`[UPLOAD_VESSEL] Image upload error:`, error);
                    }
                }
            }

            // Upload strakes
            if (vessel.strakes && vessel.strakes.length > 0) {
                console.log(`[UPLOAD_VESSEL] Uploading ${vessel.strakes.length} strakes...`);
                for (let i = 0; i < vessel.strakes.length; i++) {
                    const strake = vessel.strakes[i];
                    console.log(`[UPLOAD_VESSEL] Uploading strake ${i + 1}/${vessel.strakes.length}: ${strake.name}`);
                    try {
                        const strakeResult = await this.uploadStrake(strake, vessel.id);
                        if (strakeResult.success) {
                            count++;
                            console.log(`[UPLOAD_VESSEL] Strake uploaded successfully`);
                        } else {
                            console.warn(`[UPLOAD_VESSEL] Strake upload failed:`, strakeResult.error);
                        }
                    } catch (error) {
                        console.error(`[UPLOAD_VESSEL] Strake upload error:`, error);
                    }
                }
            }

            // Upload scans
            if (vessel.scans && vessel.scans.length > 0) {
                console.log(`[UPLOAD_VESSEL] Uploading ${vessel.scans.length} scans...`);
                for (let i = 0; i < vessel.scans.length; i++) {
                    const scan = vessel.scans[i];
                    console.log(`[UPLOAD_VESSEL] Uploading scan ${i + 1}/${vessel.scans.length}: ${scan.name}`);
                    try {
                        const scanResult = await this.uploadScan(scan, vessel.id, assetId, orgId);
                        if (scanResult.success) {
                            count++;
                            console.log(`[UPLOAD_VESSEL] Scan uploaded successfully`);
                        } else {
                            console.warn(`[UPLOAD_VESSEL] Scan upload failed:`, scanResult.error);
                        }
                    } catch (error) {
                        console.error(`[UPLOAD_VESSEL] Scan upload error:`, error);
                    }
                }
            }

            console.log(`[UPLOAD_VESSEL] Vessel upload complete. Total items: ${count}`);
            return { success: true, count };

        } catch (error) {
            console.error(`[UPLOAD_VESSEL] Error uploading vessel ${vessel.name}:`, error);
            return { success: false, error: error.message, count: 0 };
        }
    }

    /**
     * Upload a vessel image
     */
    async uploadVesselImage(image, vesselId, assetId, orgId) {
        try {
            // Check if image already exists
            const { data: existing } = await supabase
                .from('vessel_images')
                .select('id')
                .eq('id', image.id)
                .single();

            if (existing) {
                return { success: true }; // Already uploaded
            }

            // Upload image file
            const extension = this.getImageExtension(image.dataUrl);
            const storagePath = `${orgId}/${assetId}/${vesselId}/${image.id}.${extension}`;

            const imageUrl = await this.uploadFile(
                image.dataUrl,
                'vessel-images',
                storagePath,
                `image/${extension}`
            );

            if (!imageUrl) {
                throw new Error('Failed to upload image file');
            }

            // Insert image record
            const { error } = await supabase
                .from('vessel_images')
                .insert({
                    id: image.id,
                    vessel_id: vesselId,
                    name: image.name,
                    image_url: imageUrl,
                    image_filename: `${image.id}.${extension}`,
                    created_at: new Date(image.timestamp).toISOString()
                });

            if (error) throw error;

            return { success: true };

        } catch (error) {
            console.error('Error uploading vessel image:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload a strake
     */
    async uploadStrake(strake, vesselId) {
        try {
            // Check if strake already exists
            const { data: existing, error: checkError } = await supabase
                .from('strakes')
                .select('id, updated_at')
                .eq('id', strake.id)
                .single();

            if (checkError && checkError.code !== 'PGRST116') {
                throw checkError;
            }

            if (!existing) {
                // Insert new strake
                const { error } = await supabase
                    .from('strakes')
                    .insert({
                        id: strake.id,
                        vessel_id: vesselId,
                        name: strake.name,
                        total_area: strake.totalArea,
                        required_coverage: strake.requiredCoverage,
                        created_at: new Date().toISOString()
                    });

                if (error) throw error;
            } else {
                // Update existing strake
                const { error } = await supabase
                    .from('strakes')
                    .update({
                        name: strake.name,
                        total_area: strake.totalArea,
                        required_coverage: strake.requiredCoverage,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', strake.id);

                if (error) throw error;
            }

            return { success: true };

        } catch (error) {
            console.error('Error uploading strake:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload a single scan directly (optimized for createScan operation)
     * This is much faster than uploadAsset() as it only uploads the new scan
     */
    async uploadSingleScan(scan, vesselId, assetId, orgId) {
        try {
            console.log(`[UPLOAD_SCAN] Starting upload for scan: ${scan.name}`);

            // Check if scan already exists with timeout
            const { data: existing, error: checkError } = await supabase
                .from('scans')
                .select('id')
                .eq('id', scan.id)
                .abortSignal(AbortSignal.timeout(10000))
                .single();

            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found (expected)
                // If timeout, skip this scan
                if (checkError.code === '57014' || checkError.message?.includes('timeout') || checkError.message?.includes('aborted')) {
                    console.warn(`[UPLOAD_SCAN] Scan check timeout for ${scan.id}, skipping upload`);
                    return { success: true, skipped: true };
                }
                // Other errors should be thrown
                throw checkError;
            }

            if (existing) {
                console.log(`[UPLOAD_SCAN] Scan already exists, skipping upload`);
                return { success: true }; // Already uploaded
            }

            let thumbnailUrl = null;
            let heatmapUrl = null;
            let dataUrl = null;

            // Upload thumbnail with progress logging
            if (scan.thumbnail) {
                console.log(`[UPLOAD_SCAN] Uploading thumbnail...`);
                const ext = this.getImageExtension(scan.thumbnail);
                thumbnailUrl = await this.uploadFile(
                    scan.thumbnail,
                    'scan-images',
                    `${orgId}/${assetId}/${vesselId}/${scan.id}_thumbnail.${ext}`,
                    `image/${ext}`
                );
                console.log(`[UPLOAD_SCAN] Thumbnail uploaded: ${thumbnailUrl ? 'success' : 'failed'}`);
            }

            // Upload heatmap with progress logging
            if (scan.heatmapOnly) {
                console.log(`[UPLOAD_SCAN] Uploading heatmap...`);
                const ext = this.getImageExtension(scan.heatmapOnly);
                heatmapUrl = await this.uploadFile(
                    scan.heatmapOnly,
                    'scan-images',
                    `${orgId}/${assetId}/${vesselId}/${scan.id}_heatmap.${ext}`,
                    `image/${ext}`
                );
                console.log(`[UPLOAD_SCAN] Heatmap uploaded: ${heatmapUrl ? 'success' : 'failed'}`);
            }

            // Determine if scan data should be inline or uploaded
            const scanDataSize = JSON.stringify(scan.data || {}).length;
            let scanDataInline = null;

            console.log(`[UPLOAD_SCAN] Scan data size: ${(scanDataSize / 1024).toFixed(2)} KB`);

            if (scanDataSize < 100000) { // Less than 100KB, store inline
                console.log(`[UPLOAD_SCAN] Storing scan data inline (< 100KB)`);
                scanDataInline = scan.data;
            } else {
                // Upload large scan data
                console.log(`[UPLOAD_SCAN] Uploading large scan data file...`);
                const dataBlob = new Blob([JSON.stringify(scan.data)], { type: 'application/json' });
                const dataDataUrl = await this.blobToDataURL(dataBlob);

                dataUrl = await this.uploadFile(
                    dataDataUrl,
                    'scan-data',
                    `${orgId}/${assetId}/${vesselId}/${scan.id}_data.json`,
                    'application/json'
                );
                console.log(`[UPLOAD_SCAN] Scan data file uploaded: ${dataUrl ? 'success' : 'failed'}`);
            }

            // Insert scan record
            console.log(`[UPLOAD_SCAN] Inserting scan record into database...`);
            const { error } = await supabase
                .from('scans')
                .insert({
                    id: scan.id,
                    vessel_id: vesselId,
                    name: scan.name,
                    tool_type: scan.toolType,
                    strake_id: scan.strakeId || null, // Include strake assignment
                    data: scanDataInline,
                    data_url: dataUrl,
                    thumbnail_url: thumbnailUrl,
                    heatmap_url: heatmapUrl,
                    created_at: new Date(scan.timestamp).toISOString()
                });

            if (error) throw error;

            console.log(`[UPLOAD_SCAN] Scan uploaded successfully: ${scan.name}`);
            return { success: true };

        } catch (error) {
            console.error('[UPLOAD_SCAN] Error uploading scan:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload a scan (used during full asset upload)
     */
    async uploadScan(scan, vesselId, assetId, orgId) {
        try {
            // Check if scan already exists with timeout
            const { data: existing, error: checkError } = await supabase
                .from('scans')
                .select('id')
                .eq('id', scan.id)
                .abortSignal(AbortSignal.timeout(10000))
                .single();

            if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found (expected)
                // If timeout, skip this scan
                if (checkError.code === '57014' || checkError.message?.includes('timeout') || checkError.message?.includes('aborted')) {
                    console.warn(`[SYNC-SERVICE] Scan check timeout for ${scan.id}, skipping upload`);
                    return { success: true, skipped: true };
                }
            }

            if (existing) {
                return { success: true }; // Already uploaded
            }

            let thumbnailUrl = null;
            let heatmapUrl = null;
            let dataUrl = null;

            // Upload thumbnail
            if (scan.thumbnail) {
                const ext = this.getImageExtension(scan.thumbnail);
                thumbnailUrl = await this.uploadFile(
                    scan.thumbnail,
                    'scan-images',
                    `${orgId}/${assetId}/${vesselId}/${scan.id}_thumbnail.${ext}`,
                    `image/${ext}`
                );
            }

            // Upload heatmap
            if (scan.heatmapOnly) {
                const ext = this.getImageExtension(scan.heatmapOnly);
                heatmapUrl = await this.uploadFile(
                    scan.heatmapOnly,
                    'scan-images',
                    `${orgId}/${assetId}/${vesselId}/${scan.id}_heatmap.${ext}`,
                    `image/${ext}`
                );
            }

            // Determine if scan data should be inline or uploaded
            const scanDataSize = JSON.stringify(scan.data || {}).length;
            let scanDataInline = null;

            if (scanDataSize < 100000) { // Less than 100KB, store inline
                scanDataInline = scan.data;
            } else {
                // Upload large scan data
                const dataBlob = new Blob([JSON.stringify(scan.data)], { type: 'application/json' });
                const dataDataUrl = await this.blobToDataURL(dataBlob);

                dataUrl = await this.uploadFile(
                    dataDataUrl,
                    'scan-data',
                    `${orgId}/${assetId}/${vesselId}/${scan.id}_data.json`,
                    'application/json'
                );
            }

            // Insert scan record
            const { error } = await supabase
                .from('scans')
                .insert({
                    id: scan.id,
                    vessel_id: vesselId,
                    name: scan.name,
                    tool_type: scan.toolType,
                    strake_id: scan.strakeId || null, // Include strake assignment
                    data: scanDataInline,
                    data_url: dataUrl,
                    thumbnail_url: thumbnailUrl,
                    heatmap_url: heatmapUrl,
                    created_at: new Date(scan.timestamp).toISOString()
                });

            if (error) throw error;

            return { success: true };

        } catch (error) {
            console.error('Error uploading scan:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Upload a file to Supabase Storage
     */
    async uploadFile(dataUrl, bucket, path, mimeType) {
        try {
            console.log(`[UPLOAD_FILE] Starting upload to bucket: ${bucket}, path: ${path}`);

            // Convert data URL to blob
            console.log(`[UPLOAD_FILE] Converting data URL to blob...`);
            const blob = await this.dataURLToBlob(dataUrl);
            console.log(`[UPLOAD_FILE] Blob created, size: ${blob.size} bytes`);

            // Check if file is too large
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (blob.size > maxSize) {
                console.warn(`[UPLOAD_FILE] File too large: ${blob.size} bytes (max: ${maxSize})`);
                return null;
            }

            // Upload to Supabase Storage with timeout
            console.log(`[UPLOAD_FILE] Uploading to Supabase Storage...`);
            const uploadPromise = supabase.storage
                .from(bucket)
                .upload(path, blob, {
                    contentType: mimeType,
                    upsert: true
                });

            // Add timeout of 60 seconds
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000)
            );

            const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);

            if (error) {
                console.error(`[UPLOAD_FILE] Upload error:`, error);
                throw error;
            }

            console.log(`[UPLOAD_FILE] File uploaded successfully`);

            // Get public URL
            const { data: urlData } = supabase.storage
                .from(bucket)
                .getPublicUrl(path);

            console.log(`[UPLOAD_FILE] Public URL generated: ${urlData.publicUrl}`);
            return urlData.publicUrl;

        } catch (error) {
            console.error(`[UPLOAD_FILE] Error uploading file to ${bucket}/${path}:`, error);
            return null;
        }
    }

    /**
     * Delete a scan from Supabase
     */
    async deleteScanFromSupabase(scanId) {
        try {
            console.log(`[DELETE_SCAN] Deleting scan from Supabase: ${scanId}`);

            // Delete scan record from database
            const { error: dbError } = await supabase
                .from('scans')
                .delete()
                .eq('id', scanId);

            if (dbError) {
                console.error('[DELETE_SCAN] Error deleting scan from database:', dbError);
                return { success: false, error: dbError.message };
            }

            console.log('[DELETE_SCAN] Scan deleted successfully from database');

            // Note: We're not deleting the storage files (thumbnail, heatmap, data.json)
            // as they might be referenced elsewhere or useful for audit trails.
            // If you want to delete them, you can add storage.from().remove() calls here.

            return { success: true };

        } catch (error) {
            console.error('[DELETE_SCAN] Error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Convert data URL to Blob (without using fetch to avoid CSP issues)
     */
    async dataURLToBlob(dataUrl) {
        // Split the data URL to get the content type and base64 data
        const parts = dataUrl.split(',');
        const contentType = parts[0].match(/:(.*?);/)[1];
        const base64Data = parts[1];

        // Convert base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Create and return blob
        return new Blob([bytes], { type: contentType });
    }

    /**
     * Get image extension from data URL
     */
    getImageExtension(dataUrl) {
        const match = dataUrl.match(/^data:image\/(\w+);/);
        return match ? match[1] : 'png';
    }

    /**
     * Sync a single asset (called after creating/updating locally)
     */
    async syncAsset(assetId) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;

        if (!orgId || !userId) return { success: false, error: 'Not logged in' };

        try {
            const localData = await indexedDB.loadData();
            const asset = localData[orgId]?.assets.find(a => a.id === assetId);

            if (!asset) {
                return { success: false, error: 'Asset not found' };
            }

            const result = await this.uploadAsset(asset, orgId, userId);
            return result;

        } catch (error) {
            console.error('Error syncing asset:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get sync status
     */
    getSyncStatus() {
        return {
            inProgress: this.syncInProgress,
            lastSync: this.lastSyncTime,
            lastAttempt: this.lastSyncAttempt,
            queueSize: this.syncQueue.length,
            autoSyncEnabled: this.autoSyncEnabled,
            pendingChanges: this.pendingChanges,
            consecutiveFailures: this.consecutiveFailures,
            backedOff: this.consecutiveFailures >= this.maxConsecutiveFailures
        };
    }

    /**
     * Reset backoff and cooldown (for manual retry)
     */
    resetBackoff() {
        console.log('[SYNC-SERVICE] Resetting backoff and cooldown');
        this.consecutiveFailures = 0;
        this.lastSyncAttempt = null;
    }

    /**
     * Start automatic sync
     */
    startAutoSync() {
        if (!authManager.isLoggedIn()) {
            console.log('Cannot start auto-sync: user not logged in');
            return;
        }

        if (this.autoSyncTimer) {
            console.log('Auto-sync already running');
            return;
        }

        console.log(`Starting auto-sync with ${this.autoSyncInterval / 1000}s interval`);
        this.autoSyncEnabled = true;

        // Start periodic sync
        this.autoSyncTimer = setInterval(async () => {
            if (!this.syncInProgress && this.pendingChanges && authManager.isLoggedIn()) {
                console.log('Auto-sync triggered');
                await this.fullSync();
            }
        }, this.autoSyncInterval);

        // Dispatch event
        window.dispatchEvent(new CustomEvent('autoSyncStarted'));
    }

    /**
     * Stop automatic sync
     */
    stopAutoSync() {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
            this.autoSyncEnabled = false;
            console.log('Auto-sync stopped');

            // Dispatch event
            window.dispatchEvent(new CustomEvent('autoSyncStopped'));
        }
    }

    /**
     * Mark that local data has changed and needs sync
     * NOTE: This is now primarily for UI feedback. Individual operations
     * are queued via syncQueue for background processing.
     */
    markPendingChanges() {
        this.pendingChanges = true;

        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('syncPending'));

        // Removed auto-sync trigger - operations are now queued individually
        // via syncQueue for better performance (write-through cache pattern)
    }

    /**
     * Set auto-sync interval
     */
    setAutoSyncInterval(milliseconds) {
        this.autoSyncInterval = milliseconds;

        // Restart timer if running
        if (this.autoSyncTimer) {
            this.stopAutoSync();
            this.startAutoSync();
        }
    }
}

// Create singleton instance
const syncService = new SyncService();
export default syncService;

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
        this.syncQueue = [];
        this.deviceId = this.getOrCreateDeviceId();
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
     * Full sync: Upload local data and download remote data
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

        console.log('Starting full sync...');
        this.syncInProgress = true;

        try {
            // Step 1: Download remote data first (to avoid overwriting newer data)
            console.log('Step 1: Downloading remote data...');
            const downloadResult = await this.downloadAllData();
            if (!downloadResult.success) {
                throw new Error(`Download failed: ${downloadResult.error}`);
            }

            // Step 2: Upload local data
            console.log('Step 2: Uploading local data...');
            const uploadResult = await this.uploadAllData();
            if (!uploadResult.success) {
                throw new Error(`Upload failed: ${uploadResult.error}`);
            }

            this.lastSyncTime = new Date();
            console.log('Full sync completed successfully');

            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('syncCompleted', {
                detail: {
                    success: true,
                    timestamp: this.lastSyncTime,
                    downloaded: downloadResult.count,
                    uploaded: uploadResult.count
                }
            }));

            return {
                success: true,
                downloaded: downloadResult.count,
                uploaded: uploadResult.count,
                timestamp: this.lastSyncTime
            };

        } catch (error) {
            console.error('Sync failed:', error);

            window.dispatchEvent(new CustomEvent('syncFailed', {
                detail: { error: error.message }
            }));

            return { success: false, error: error.message };
        } finally {
            this.syncInProgress = false;
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

        try {
            // Fetch all assets for the user's organization
            const { data: assets, error: assetsError } = await supabase
                .from('assets')
                .select('*')
                .eq('organization_id', orgId);

            if (assetsError) throw assetsError;

            if (!assets || assets.length === 0) {
                console.log('No remote assets found');
                return { success: true, count: 0 };
            }

            console.log(`Found ${assets.length} remote assets`);

            // Load current local data
            const localData = await indexedDB.loadData();
            if (!localData[orgId]) {
                localData[orgId] = { assets: [] };
            }

            let downloadCount = 0;

            // Process each asset
            for (const remoteAsset of assets) {
                // Check if asset exists locally
                let localAsset = localData[orgId].assets.find(a => a.id === remoteAsset.id);

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
                    localData[orgId].assets.push(localAsset);
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

                // Download vessels for this asset
                const vesselsResult = await this.downloadVessels(remoteAsset.id, localAsset);
                downloadCount += vesselsResult.count;
            }

            // Save updated data to IndexedDB
            await indexedDB.saveData(localData);
            console.log(`Downloaded ${downloadCount} items`);

            return { success: true, count: downloadCount };

        } catch (error) {
            console.error('Download failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Download vessels for a specific asset
     */
    async downloadVessels(assetId, localAsset) {
        try {
            const { data: vessels, error } = await supabase
                .from('vessels')
                .select('*')
                .eq('asset_id', assetId);

            if (error) throw error;

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

                // Download scans
                const scansResult = await this.downloadScans(remoteVessel.id, localVessel);
                count += scansResult.count;
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
     * Download scans for a vessel
     */
    async downloadScans(vesselId, localVessel) {
        try {
            const { data: scans, error } = await supabase
                .from('scans')
                .select('*')
                .eq('vessel_id', vesselId);

            if (error) throw error;

            let count = 0;

            for (const remoteScan of scans) {
                const existingScan = localVessel.scans.find(s => s.id === remoteScan.id);

                if (!existingScan) {
                    const scanData = {
                        id: remoteScan.id,
                        name: remoteScan.name,
                        toolType: remoteScan.tool_type,
                        timestamp: new Date(remoteScan.created_at).getTime(),
                        data: remoteScan.data || null
                    };

                    // Download thumbnail if exists
                    if (remoteScan.thumbnail_url) {
                        scanData.thumbnail = await this.downloadFile(remoteScan.thumbnail_url);
                    }

                    // Download heatmap if exists
                    if (remoteScan.heatmap_url) {
                        scanData.heatmapOnly = await this.downloadFile(remoteScan.heatmap_url);
                    }

                    // Download large data file if exists
                    if (remoteScan.data_url) {
                        const largeData = await this.downloadFile(remoteScan.data_url);
                        if (largeData) {
                            scanData.data = JSON.parse(largeData);
                        }
                    }

                    localVessel.scans.push(scanData);
                    count++;
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
     * Upload a scan
     */
    async uploadScan(scan, vesselId, assetId, orgId) {
        try {
            // Check if scan already exists
            const { data: existing } = await supabase
                .from('scans')
                .select('id')
                .eq('id', scan.id)
                .single();

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
     * Convert data URL to Blob
     */
    async dataURLToBlob(dataUrl) {
        const response = await fetch(dataUrl);
        return await response.blob();
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
            queueSize: this.syncQueue.length
        };
    }
}

// Create singleton instance
const syncService = new SyncService();
export default syncService;

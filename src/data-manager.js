// Data Manager Module - Handles asset/vessel/scan hierarchy and IndexedDB persistence
import indexedDB from './indexed-db.js';
import authManager from './auth-manager.js';
import syncService from './sync-service.js';
import syncQueue from './sync-queue.js';

const STORAGE_KEY = 'ndt_suite_data';

// Data structure in IndexedDB:
// {
//   assets: [{
//     id: string,
//     name: string,
//     vessels: [{
//       id: string,
//       name: string,
//       scans: [{
//         id: string,
//         name: string,
//         toolType: 'pec' | 'cscan' | '3dview',
//         timestamp: number,
//         data: any,
//         thumbnail: string (base64 image with axes/labels for display),
//         heatmapOnly: string (base64 image clean heatmap for 3D texturing)
//       }]
//     }]
//   }]
// }

class DataManager {
    constructor() {
        this.data = {};
        this.initPromise = this.initialize();
    }

    // Initialize and load data
    async initialize() {
        try {
            console.log('[DATA-MANAGER] Initializing...');

            // Ensure auth is ready first
            await authManager.ensureInitialized();

            // CLOUD-FIRST: Try to load from Supabase if configured and logged in
            if (authManager.useSupabase && authManager.isLoggedIn()) {
                console.log('[DATA-MANAGER] Loading data from Supabase...');
                try {
                    const downloadResult = await syncService.downloadAllData();

                    if (downloadResult.success) {
                        console.log(`[DATA-MANAGER] Loaded ${downloadResult.count} items from Supabase`);

                        // Load the freshly downloaded data from IndexedDB
                        const loadedData = await indexedDB.loadData();
                        this.data = loadedData;

                        console.log('[DATA-MANAGER] Data loaded from cloud successfully');
                        return;
                    } else {
                        console.warn('[DATA-MANAGER] Failed to load from Supabase, falling back to local cache:', downloadResult.error);
                    }
                } catch (error) {
                    console.error('[DATA-MANAGER] Error loading from Supabase:', error);
                    console.log('[DATA-MANAGER] Falling back to local cache');
                }
            }

            // FALLBACK: Load from local IndexedDB cache
            console.log('[DATA-MANAGER] Loading from local cache...');

            // Try to migrate from localStorage if it exists
            await indexedDB.migrateFromLocalStorage(STORAGE_KEY);

            // Load data from IndexedDB
            const loadedData = await indexedDB.loadData();

            // Migrate old format { assets: [] } to new format { orgId: { assets: [] } }
            if (loadedData.assets && Array.isArray(loadedData.assets)) {
                console.log('[DATA-MANAGER] Migrating data to organization-based format');
                const currentOrgId = authManager.getCurrentOrganizationId();

                // Preserve the old data under the current organization
                if (currentOrgId) {
                    this.data = {
                        [currentOrgId]: { assets: loadedData.assets }
                    };
                    // Save migrated data
                    await this.saveToStorage();
                    console.log('[DATA-MANAGER] Data migration completed');
                } else {
                    // No user logged in, preserve old format for now
                    this.data = loadedData;
                }
            } else {
                this.data = loadedData;
            }

            console.log('[DATA-MANAGER] Initialization complete (using local cache)');
        } catch (error) {
            console.error('[DATA-MANAGER] Error initializing data manager:', error);
            this.data = {};
        }
    }

    // Ensure initialization is complete before operations
    async ensureInitialized() {
        await this.initPromise;
    }

    // Storage operations
    async loadFromStorage() {
        try {
            const loadedData = await indexedDB.loadData();

            // Migrate old format { assets: [] } to new format { orgId: { assets: [] } }
            if (loadedData.assets && Array.isArray(loadedData.assets)) {
                await authManager.ensureInitialized();
                const currentOrgId = authManager.getCurrentOrganizationId();

                // Preserve the old data under the current organization
                if (currentOrgId) {
                    this.data = {
                        [currentOrgId]: { assets: loadedData.assets }
                    };
                    await this.saveToStorage();
                } else {
                    this.data = loadedData;
                }
            } else {
                this.data = loadedData;
            }

            return this.data;
        } catch (error) {
            console.error('Error loading data from storage:', error);
            return {};
        }
    }

    async saveToStorage() {
        try {
            await indexedDB.saveData(this.data);

            // Mark that data has changed and needs sync
            if (authManager.isLoggedIn()) {
                syncService.markPendingChanges();
            }

            return true;
        } catch (error) {
            console.error('Error saving data to storage:', error);
            return false;
        }
    }

    // Get current organization data
    getCurrentOrgData() {
        const orgId = authManager.getCurrentOrganizationId();
        if (!orgId) return { assets: [] };

        // Even ADMIN operates within their current organization context
        // (they can switch contexts but still work with one org at a time)
        if (!this.data[orgId]) {
            this.data[orgId] = { assets: [] };
        }

        return this.data[orgId];
    }

    // Set current organization data
    setCurrentOrgData(orgData) {
        const orgId = authManager.getCurrentOrganizationId();
        if (!orgId) return;

        this.data[orgId] = orgData;
    }

    // Get data for specific organization (ADMIN and SYSTEM org users)
    getOrgData(organizationId) {
        const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

        // SYSTEM org can access any organization's data
        // Regular admins can access any organization's data
        // Regular users can only access their own org
        if (!authManager.isAdmin() && !isSystemOrg && organizationId !== authManager.getCurrentOrganizationId()) {
            return { assets: [] };
        }

        if (!this.data[organizationId]) {
            this.data[organizationId] = { assets: [] };
        }

        return this.data[organizationId];
    }

    // Asset operations
    async createAsset(name) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;

        if (!orgId || !userId) {
            throw new Error('Must be logged in to create assets');
        }

        const asset = {
            id: this.generateId(),
            name: name,
            vessels: [],
            organizationId: orgId,
            createdBy: userId,
            createdAt: Date.now()
        };

        // WRITE-THROUGH CACHE: Save locally first (instant response)
        const orgData = this.getCurrentOrgData();
        orgData.assets.push(asset);
        this.setCurrentOrgData(orgData);
        await this.saveToStorage();

        console.log('[DATA-MANAGER] Asset created locally:', asset.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'insert',
                table: 'assets',
                data: {
                    id: asset.id,
                    name: asset.name,
                    organization_id: orgId,
                    created_by: userId,
                    created_at: new Date(asset.createdAt).toISOString()
                }
            });
            console.log('[DATA-MANAGER] Queued asset creation for background sync');
        }

        return asset;
    }

    getAssets() {
        // Check if user is in SYSTEM org
        const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

        if (isSystemOrg) {
            // SYSTEM org sees ALL assets from ALL organizations
            const allAssets = [];
            for (const orgId in this.data) {
                if (this.data[orgId].assets) {
                    allAssets.push(...this.data[orgId].assets);
                }
            }
            return allAssets;
        }

        // Regular orgs see only their own assets
        const orgData = this.getCurrentOrgData();
        return orgData.assets || [];
    }

    getAsset(assetId) {
        // Check if user is in SYSTEM org
        const isSystemOrg = authManager.currentProfile?.organizations?.name === 'SYSTEM';

        if (isSystemOrg) {
            // SYSTEM org can access any asset from any organization
            for (const orgId in this.data) {
                if (this.data[orgId].assets) {
                    const asset = this.data[orgId].assets.find(a => a.id === assetId);
                    if (asset) return asset;
                }
            }
            return null;
        }

        // Regular orgs can only access their own assets
        const orgData = this.getCurrentOrgData();
        return (orgData.assets || []).find(a => a.id === assetId);
    }

    async updateAsset(assetId, updates) {
        const asset = this.getAsset(assetId);

        if (!asset) {
            return null;
        }

        // WRITE-THROUGH CACHE: Update locally first (instant response)
        Object.assign(asset, updates);
        asset.updatedAt = Date.now();

        // Get the organization ID from the asset itself (not current user)
        const assetOrgId = asset.organizationId;
        const orgData = this.getOrgData(assetOrgId);

        await this.saveToStorage();

        console.log('[DATA-MANAGER] Asset updated locally:', asset.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'update',
                table: 'assets',
                id: assetId,
                data: {
                    name: asset.name,
                    updated_at: new Date(asset.updatedAt).toISOString()
                }
            });
            console.log('[DATA-MANAGER] Queued asset update for background sync');
        }

        return asset;
    }

    async deleteAsset(assetId) {
        const asset = this.getAsset(assetId);

        if (!asset) {
            return false;
        }

        // Get the organization ID from the asset itself (not current user)
        const assetOrgId = asset.organizationId;
        const orgData = this.getOrgData(assetOrgId);
        const index = (orgData.assets || []).findIndex(a => a.id === assetId);

        if (index === -1) {
            return false;
        }

        const deletedAsset = orgData.assets[index];

        // WRITE-THROUGH CACHE: Update local immediately
        orgData.assets.splice(index, 1);
        await this.saveToStorage();

        console.log('[DATA-MANAGER] Asset deleted locally:', deletedAsset.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'delete',
                table: 'assets',
                id: assetId
            });
            console.log('[DATA-MANAGER] Queued asset deletion for background sync');
        }

        return true;
    }

    // Vessel operations
    async createVessel(assetId, name) {
        const orgId = authManager.getCurrentOrganizationId();
        const asset = this.getAsset(assetId);

        if (!asset) return null;

        const vessel = {
            id: this.generateId(),
            name: name,
            scans: [],
            strakes: [], // Array of { id, name, totalArea, requiredCoverage, scans: [] }
            model3d: null, // Will store .obj file as data URL
            images: [], // Array of { id, name, dataUrl, timestamp }
            locationDrawing: null, // { imageDataUrl, annotations: [] }
            gaDrawing: null // { imageDataUrl, annotations: [] }
        };

        // WRITE-THROUGH CACHE: Save locally first (instant response)
        asset.vessels.push(vessel);
        await this.saveToStorage();

        console.log('[DATA-MANAGER] Vessel created locally:', vessel.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'insert',
                table: 'vessels',
                data: {
                    id: vessel.id,
                    asset_id: assetId,
                    name: vessel.name,
                    created_at: new Date().toISOString()
                }
            });
            console.log('[DATA-MANAGER] Queued vessel creation for background sync');
        }

        return vessel;
    }

    getVessel(assetId, vesselId) {
        const asset = this.getAsset(assetId);
        if (!asset) return null;
        return asset.vessels.find(v => v.id === vesselId);
    }

    async updateVessel(assetId, vesselId, updates) {
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel) {
            return null;
        }

        // WRITE-THROUGH CACHE: Update locally first (instant response)
        Object.assign(vessel, updates);
        await this.saveToStorage();

        console.log('[DATA-MANAGER] Vessel updated locally:', vessel.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'update',
                table: 'vessels',
                id: vesselId,
                data: {
                    name: vessel.name,
                    updated_at: new Date().toISOString()
                }
            });
            console.log('[DATA-MANAGER] Queued vessel update for background sync');
        }

        return vessel;
    }

    async deleteVessel(assetId, vesselId) {
        const asset = this.getAsset(assetId);

        if (!asset) return false;

        const index = asset.vessels.findIndex(v => v.id === vesselId);

        if (index === -1) {
            return false;
        }

        const deletedVessel = asset.vessels[index];

        // WRITE-THROUGH CACHE: Update locally first (instant response)
        asset.vessels.splice(index, 1);
        await this.saveToStorage();

        console.log('[DATA-MANAGER] Vessel deleted locally:', deletedVessel.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'delete',
                table: 'vessels',
                id: vesselId
            });
            console.log('[DATA-MANAGER] Queued vessel deletion for background sync');
        }

        return true;
    }

    // Vessel image operations
    async addVesselImage(assetId, vesselId, imageData) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel) return null;

        // Initialize images array if it doesn't exist (for backward compatibility)
        if (!vessel.images) {
            vessel.images = [];
        }

        const image = {
            id: this.generateId(),
            name: imageData.name || 'Untitled Image',
            dataUrl: imageData.dataUrl,
            timestamp: Date.now()
        };

        vessel.images.push(image);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Adding vessel image to Supabase:', image.name);
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to add vessel image to Supabase:', result.error);
                // Rollback local change
                vessel.images.pop();
                throw new Error(`Failed to save vessel image to cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Vessel image added to Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return image;
    }

    // Scanning log operations
    async addScanningLogEntry(assetId, vesselId, logEntry) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel) return null;

        // Initialize scanningLog array if it doesn't exist
        if (!vessel.scanningLog) {
            vessel.scanningLog = [];
        }

        const entry = {
            id: this.generateId(),
            dateTime: logEntry.dateTime || new Date().toISOString(),
            operator: logEntry.operator || '',
            equipment: logEntry.equipment || '',
            settings: logEntry.settings || '',
            temperature: logEntry.temperature || '',
            humidity: logEntry.humidity || '',
            notes: logEntry.notes || '',
            timestamp: Date.now()
        };

        vessel.scanningLog.push(entry);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Adding scanning log entry to Supabase');
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to add scanning log entry to Supabase:', result.error);
                // Rollback local change
                vessel.scanningLog.pop();
                throw new Error(`Failed to save scanning log to cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Scanning log entry added to Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return entry;
    }

    async updateScanningLogEntry(assetId, vesselId, logEntryId, updates) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel || !vessel.scanningLog) return null;

        const entry = vessel.scanningLog.find(e => e.id === logEntryId);

        if (!entry) {
            return null;
        }

        Object.assign(entry, updates);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Updating scanning log entry in Supabase');
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to update scanning log entry in Supabase:', result.error);
                throw new Error(`Failed to update scanning log in cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Scanning log entry updated in Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return entry;
    }

    async deleteScanningLogEntry(assetId, vesselId, logEntryId) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel || !vessel.scanningLog) return false;

        const index = vessel.scanningLog.findIndex(e => e.id === logEntryId);

        if (index === -1) {
            return false;
        }

        const deletedEntry = vessel.scanningLog[index];
        vessel.scanningLog.splice(index, 1);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Deleting scanning log entry from Supabase');
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to delete scanning log entry from Supabase:', result.error);
                // Rollback local change
                vessel.scanningLog.splice(index, 0, deletedEntry);
                throw new Error(`Failed to delete scanning log from cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Scanning log entry deleted from Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return true;
    }

    // Vessel report operations
    async addVesselReport(assetId, vesselId, reportData) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel) return null;

        // Initialize reports array if it doesn't exist
        if (!vessel.reports) {
            vessel.reports = [];
        }

        const report = {
            id: this.generateId(),
            reportNumber: reportData.reportNumber || 'Untitled Report',
            metadata: reportData.metadata || {},
            formats: reportData.formats || [],
            timestamp: Date.now(),
            generatedBy: authManager.getCurrentUser()?.email || 'Unknown'
        };

        vessel.reports.push(report);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Adding vessel report to Supabase:', report.reportNumber);
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to add vessel report to Supabase:', result.error);
                // Rollback local change
                vessel.reports.pop();
                throw new Error(`Failed to save vessel report to cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Vessel report added to Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return report;
    }

    async deleteVesselReport(assetId, vesselId, reportId) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel || !vessel.reports) return false;

        const index = vessel.reports.findIndex(rep => rep.id === reportId);

        if (index === -1) {
            return false;
        }

        const deletedReport = vessel.reports[index];
        vessel.reports.splice(index, 1);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Deleting vessel report from Supabase');
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to delete vessel report from Supabase:', result.error);
                // Rollback local change
                vessel.reports.splice(index, 0, deletedReport);
                throw new Error(`Failed to delete vessel report from cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Vessel report deleted from Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return true;
    }

    async deleteVesselImage(assetId, vesselId, imageId) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel || !vessel.images) return false;

        const index = vessel.images.findIndex(img => img.id === imageId);

        if (index === -1) {
            return false;
        }

        const deletedImage = vessel.images[index];
        vessel.images.splice(index, 1);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Deleting vessel image from Supabase');
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to delete vessel image from Supabase:', result.error);
                // Rollback local change
                vessel.images.splice(index, 0, deletedImage);
                throw new Error(`Failed to delete vessel image from cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Vessel image deleted from Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return true;
    }

    async renameVesselImage(assetId, vesselId, imageId, newName) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel || !vessel.images) return false;

        const image = vessel.images.find(img => img.id === imageId);

        if (!image) {
            return false;
        }

        const oldName = image.name;
        image.name = newName;

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Renaming vessel image in Supabase:', newName);
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to rename vessel image in Supabase:', result.error);
                // Rollback local change
                image.name = oldName;
                throw new Error(`Failed to rename vessel image in cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Vessel image renamed in Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return true;
    }

    // Strake operations
    async createStrake(assetId, vesselId, strakeData) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel) return null;

        // Initialize strakes array if it doesn't exist (for backward compatibility)
        if (!vessel.strakes) {
            vessel.strakes = [];
        }

        const strake = {
            id: this.generateId(),
            name: strakeData.name || 'Untitled Strake',
            totalArea: strakeData.totalArea || 0, // in m²
            requiredCoverage: strakeData.requiredCoverage || 100, // percentage
            scans: [] // Array of scan IDs assigned to this strake
        };

        vessel.strakes.push(strake);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Creating strake in Supabase:', strake.name);
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to create strake in Supabase:', result.error);
                // Rollback local change
                vessel.strakes.pop();
                throw new Error(`Failed to save strake to cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Strake created in Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return strake;
    }

    getStrake(assetId, vesselId, strakeId) {
        const vessel = this.getVessel(assetId, vesselId);
        if (!vessel || !vessel.strakes) return null;
        return vessel.strakes.find(s => s.id === strakeId);
    }

    async updateStrake(assetId, vesselId, strakeId, updates) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);
        const strake = this.getStrake(assetId, vesselId, strakeId);

        if (!strake) return null;

        Object.assign(strake, updates);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Updating strake in Supabase:', strake.name);
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to update strake in Supabase:', result.error);
                throw new Error(`Failed to update strake in cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Strake updated in Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return strake;
    }

    async deleteStrake(assetId, vesselId, strakeId) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel || !vessel.strakes) return false;

        const index = vessel.strakes.findIndex(s => s.id === strakeId);

        if (index === -1) return false;

        const deletedStrake = vessel.strakes[index];

        // Remove strake reference from all scans
        vessel.scans.forEach(scan => {
            if (scan.strakeId === strakeId) {
                delete scan.strakeId;
            }
        });

        vessel.strakes.splice(index, 1);

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Deleting strake from Supabase:', deletedStrake.name);
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to delete strake from Supabase:', result.error);
                // Rollback local change
                vessel.strakes.splice(index, 0, deletedStrake);
                throw new Error(`Failed to delete strake from cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Strake deleted from Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return true;
    }

    async assignScanToStrake(assetId, vesselId, scanId, strakeId) {
        const orgId = authManager.getCurrentOrganizationId();
        const userId = authManager.getCurrentUser()?.id;
        const asset = this.getAsset(assetId);
        const scan = this.getScan(assetId, vesselId, scanId);

        if (!scan) return false;

        // Remove from old strake if exists
        if (scan.strakeId) {
            await this.removeScanFromStrake(assetId, vesselId, scanId, scan.strakeId);
        }

        // Assign to new strake (null means unassigned)
        scan.strakeId = strakeId || null;

        // CLOUD-FIRST: Save to Supabase immediately
        if (authManager.useSupabase) {
            console.log('[DATA-MANAGER] Assigning scan to strake in Supabase');
            const result = await syncService.uploadAsset(asset, orgId, userId);

            if (!result.success) {
                console.error('[DATA-MANAGER] Failed to assign scan to strake in Supabase:', result.error);
                throw new Error(`Failed to assign scan to strake in cloud: ${result.error}`);
            }

            console.log('[DATA-MANAGER] Scan assigned to strake in Supabase successfully');
        }

        // Update local cache
        await this.saveToStorage();

        return true;
    }

    async removeScanFromStrake(assetId, vesselId, scanId, strakeId) {
        const scan = this.getScan(assetId, vesselId, scanId);

        if (!scan) return false;

        if (scan.strakeId === strakeId) {
            delete scan.strakeId;
        }

        return true;
    }

    getStrakeScans(assetId, vesselId, strakeId) {
        const vessel = this.getVessel(assetId, vesselId);
        if (!vessel) return [];

        return vessel.scans.filter(scan => scan.strakeId === strakeId);
    }

    // Calculate strake coverage considering overlaps
    calculateStrakeCoverage(assetId, vesselId, strakeId) {
        const scans = this.getStrakeScans(assetId, vesselId, strakeId);
        const strake = this.getStrake(assetId, vesselId, strakeId);

        if (!strake || scans.length === 0) {
            return {
                totalScannedArea: 0,
                targetArea: strake ? (strake.totalArea * strake.requiredCoverage / 100) : 0,
                coveragePercentage: 0,
                isComplete: false
            };
        }

        // Extract all scan areas and calculate union (accounting for overlaps)
        let totalScannedArea = 0;

        // Simple approach: sum all valid areas (overlap detection will be added later)
        // TODO: Implement spatial overlap detection for accurate coverage
        scans.forEach(scan => {
            if (scan.data && scan.data.stats && scan.data.stats.validArea) {
                // validArea is in mm², convert to m² (1 m² = 1,000,000 mm²)
                totalScannedArea += scan.data.stats.validArea / 1000000;
            }
        });

        const targetArea = strake.totalArea * (strake.requiredCoverage / 100);
        const coveragePercentage = strake.totalArea > 0 ? (totalScannedArea / targetArea) * 100 : 0;

        return {
            totalScannedArea,
            targetArea,
            coveragePercentage: Math.min(coveragePercentage, 100), // Cap at 100%
            isComplete: coveragePercentage >= 100,
            scanCount: scans.length
        };
    }

    // Scan operations
    async createScan(assetId, vesselId, scanData) {
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel) return null;

        const scan = {
            id: this.generateId(),
            name: scanData.name || 'Untitled Scan',
            toolType: scanData.toolType,
            timestamp: Date.now(),
            data: scanData.data,
            thumbnail: scanData.thumbnail || null,
            heatmapOnly: scanData.heatmapOnly || null
        };

        // WRITE-THROUGH CACHE: Save locally first (instant response)
        vessel.scans.push(scan);
        await this.saveToStorage();

        console.log('[DATA-MANAGER] Scan created locally:', scan.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'insert',
                table: 'scans',
                data: {
                    id: scan.id,
                    vessel_id: vesselId,
                    name: scan.name,
                    tool_type: scan.toolType,
                    strake_id: scan.strakeId || null,
                    data: scan.data,
                    created_at: new Date(scan.timestamp).toISOString()
                }
            });
            console.log('[DATA-MANAGER] Queued scan creation for background sync');
        }

        return scan;
    }

    getScan(assetId, vesselId, scanId) {
        const vessel = this.getVessel(assetId, vesselId);
        if (!vessel) return null;
        return vessel.scans.find(s => s.id === scanId);
    }

    async updateScan(assetId, vesselId, scanId, updates) {
        const scan = this.getScan(assetId, vesselId, scanId);

        if (!scan) {
            return null;
        }

        // WRITE-THROUGH CACHE: Update locally first (instant response)
        Object.assign(scan, updates);
        await this.saveToStorage();

        console.log('[DATA-MANAGER] Scan updated locally:', scan.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'update',
                table: 'scans',
                id: scanId,
                data: {
                    name: scan.name,
                    strake_id: scan.strakeId || null,
                    updated_at: new Date().toISOString()
                }
            });
            console.log('[DATA-MANAGER] Queued scan update for background sync');
        }

        return scan;
    }

    async deleteScan(assetId, vesselId, scanId) {
        const vessel = this.getVessel(assetId, vesselId);

        if (!vessel) return false;

        const index = vessel.scans.findIndex(s => s.id === scanId);

        if (index === -1) {
            return false;
        }

        const deletedScan = vessel.scans[index];

        // WRITE-THROUGH CACHE: Delete locally first (instant response)
        vessel.scans.splice(index, 1);
        await this.saveToStorage();

        console.log('[DATA-MANAGER] Scan deleted locally:', deletedScan.name);

        // Queue background sync to Supabase (non-blocking)
        if (authManager.useSupabase) {
            syncQueue.add({
                type: 'delete',
                table: 'scans',
                id: scanId
            });
            console.log('[DATA-MANAGER] Queued scan deletion for background sync');
        }

        return true;
    }

    // Search and filter operations
    searchScans(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        const orgData = this.getCurrentOrgData();

        for (const asset of (orgData.assets || [])) {
            for (const vessel of asset.vessels) {
                for (const scan of vessel.scans) {
                    if (scan.name.toLowerCase().includes(lowerQuery) ||
                        asset.name.toLowerCase().includes(lowerQuery) ||
                        vessel.name.toLowerCase().includes(lowerQuery)) {
                        results.push({
                            scan,
                            vessel,
                            asset
                        });
                    }
                }
            }
        }
        return results;
    }

    getAllScans() {
        const scans = [];
        const orgData = this.getCurrentOrgData();

        for (const asset of (orgData.assets || [])) {
            for (const vessel of asset.vessels) {
                for (const scan of vessel.scans) {
                    scans.push({
                        scan,
                        vessel,
                        asset
                    });
                }
            }
        }
        return scans;
    }

    getScansByToolType(toolType) {
        return this.getAllScans().filter(item => item.scan.toolType === toolType);
    }

    // Utility
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Export/Import
    exportData() {
        return JSON.stringify(this.data, null, 2);
    }

    async importData(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            if (imported && imported.assets) {
                this.data = imported;
                await this.saveToStorage();
                return true;
            }
        } catch (error) {
            console.error('Error importing data:', error);
        }
        return false;
    }

    async clearAllData() {
        this.data = {};
        await indexedDB.clearData();
    }

    // Get storage usage info
    async getStorageInfo() {
        return await indexedDB.getStorageEstimate();
    }

    getStats() {
        const orgData = this.getCurrentOrgData();
        let totalScans = 0;
        let totalVessels = 0;
        const scansByType = { pec: 0, cscan: 0, '3dview': 0 };

        for (const asset of (orgData.assets || [])) {
            totalVessels += asset.vessels.length;
            for (const vessel of asset.vessels) {
                totalScans += vessel.scans.length;
                for (const scan of vessel.scans) {
                    scansByType[scan.toolType] = (scansByType[scan.toolType] || 0) + 1;
                }
            }
        }

        return {
            totalAssets: (orgData.assets || []).length,
            totalVessels,
            totalScans,
            scansByType
        };
    }

    // Get all organizations and their stats (ADMIN only)
    async getAllOrganizationStats() {
        if (!authManager.isAdmin()) {
            return [];
        }

        const organizations = await authManager.getOrganizations();
        return organizations.map(org => {
            const orgData = this.getOrgData(org.id);
            let totalScans = 0;
            let totalVessels = 0;

            for (const asset of (orgData.assets || [])) {
                totalVessels += asset.vessels.length;
                for (const vessel of asset.vessels) {
                    totalScans += vessel.scans.length;
                }
            }

            return {
                organizationId: org.id,
                organizationName: org.name,
                totalAssets: (orgData.assets || []).length,
                totalVessels,
                totalScans
            };
        });
    }
}

// Create singleton instance
const dataManager = new DataManager();

export default dataManager;


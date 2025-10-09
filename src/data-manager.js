// Data Manager Module - Handles asset/vessel/scan hierarchy and IndexedDB persistence
import indexedDB from './indexed-db.js';
import authManager from './auth-manager.js';

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
            // Try to migrate from localStorage if it exists
            await indexedDB.migrateFromLocalStorage(STORAGE_KEY);

            // Load data from IndexedDB
            const loadedData = await indexedDB.loadData();

            // Migrate old format { assets: [] } to new format { orgId: { assets: [] } }
            if (loadedData.assets && Array.isArray(loadedData.assets)) {
                console.log('Migrating data to organization-based format');
                await authManager.ensureInitialized();
                const currentOrgId = authManager.getCurrentOrganizationId();

                // Preserve the old data under the current organization
                if (currentOrgId) {
                    this.data = {
                        [currentOrgId]: { assets: loadedData.assets }
                    };
                    // Save migrated data
                    await this.saveToStorage();
                    console.log('Data migration completed');
                } else {
                    // No user logged in, preserve old format for now
                    this.data = loadedData;
                }
            } else {
                this.data = loadedData;
            }

            console.log('Data loaded from IndexedDB');
        } catch (error) {
            console.error('Error initializing data manager:', error);
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

    // Get data for specific organization (ADMIN only)
    getOrgData(organizationId) {
        if (!authManager.isAdmin() && organizationId !== authManager.getCurrentOrganizationId()) {
            return { assets: [] };
        }

        if (!this.data[organizationId]) {
            this.data[organizationId] = { assets: [] };
        }

        return this.data[organizationId];
    }

    // Asset operations
    async createAsset(name) {
        const orgData = this.getCurrentOrgData();

        const asset = {
            id: this.generateId(),
            name: name,
            vessels: [],
            organizationId: authManager.getCurrentOrganizationId(),
            createdBy: authManager.getCurrentUser()?.id,
            createdAt: Date.now()
        };

        orgData.assets.push(asset);
        this.setCurrentOrgData(orgData);
        await this.saveToStorage();
        return asset;
    }

    getAssets() {
        const orgData = this.getCurrentOrgData();
        return orgData.assets || [];
    }

    getAsset(assetId) {
        const orgData = this.getCurrentOrgData();
        return (orgData.assets || []).find(a => a.id === assetId);
    }

    async updateAsset(assetId, updates) {
        const orgData = this.getCurrentOrgData();
        const asset = (orgData.assets || []).find(a => a.id === assetId);
        if (asset) {
            Object.assign(asset, updates);
            this.setCurrentOrgData(orgData);
            await this.saveToStorage();
            return asset;
        }
        return null;
    }

    async deleteAsset(assetId) {
        const orgData = this.getCurrentOrgData();
        const index = (orgData.assets || []).findIndex(a => a.id === assetId);
        if (index !== -1) {
            orgData.assets.splice(index, 1);
            this.setCurrentOrgData(orgData);
            await this.saveToStorage();
            return true;
        }
        return false;
    }

    // Vessel operations
    async createVessel(assetId, name) {
        const asset = this.getAsset(assetId);
        if (!asset) return null;

        const vessel = {
            id: this.generateId(),
            name: name,
            scans: [],
            model3d: null, // Will store .obj file as data URL
            images: [] // Array of { id, name, dataUrl, timestamp }
        };
        asset.vessels.push(vessel);
        await this.saveToStorage();
        return vessel;
    }

    getVessel(assetId, vesselId) {
        const asset = this.getAsset(assetId);
        if (!asset) return null;
        return asset.vessels.find(v => v.id === vesselId);
    }

    async updateVessel(assetId, vesselId, updates) {
        const vessel = this.getVessel(assetId, vesselId);
        if (vessel) {
            Object.assign(vessel, updates);
            await this.saveToStorage();
            return vessel;
        }
        return null;
    }

    async deleteVessel(assetId, vesselId) {
        const asset = this.getAsset(assetId);
        if (!asset) return false;

        const index = asset.vessels.findIndex(v => v.id === vesselId);
        if (index !== -1) {
            asset.vessels.splice(index, 1);
            await this.saveToStorage();
            return true;
        }
        return false;
    }

    // Vessel image operations
    async addVesselImage(assetId, vesselId, imageData) {
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
        await this.saveToStorage();
        return image;
    }

    async deleteVesselImage(assetId, vesselId, imageId) {
        const vessel = this.getVessel(assetId, vesselId);
        if (!vessel || !vessel.images) return false;

        const index = vessel.images.findIndex(img => img.id === imageId);
        if (index !== -1) {
            vessel.images.splice(index, 1);
            await this.saveToStorage();
            return true;
        }
        return false;
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
        vessel.scans.push(scan);
        await this.saveToStorage();
        return scan;
    }

    getScan(assetId, vesselId, scanId) {
        const vessel = this.getVessel(assetId, vesselId);
        if (!vessel) return null;
        return vessel.scans.find(s => s.id === scanId);
    }

    async updateScan(assetId, vesselId, scanId, updates) {
        const scan = this.getScan(assetId, vesselId, scanId);
        if (scan) {
            Object.assign(scan, updates);
            await this.saveToStorage();
            return scan;
        }
        return null;
    }

    async deleteScan(assetId, vesselId, scanId) {
        const vessel = this.getVessel(assetId, vesselId);
        if (!vessel) return false;

        const index = vessel.scans.findIndex(s => s.id === scanId);
        if (index !== -1) {
            vessel.scans.splice(index, 1);
            await this.saveToStorage();
            return true;
        }
        return false;
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

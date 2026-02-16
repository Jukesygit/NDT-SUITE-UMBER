// Admin Configuration Module - Manages configurable lists for report fields
import indexedDB from './indexed-db.js';
import authManager from './auth-manager.js';

const CONFIG_KEY = 'admin_configuration';

// Default values for common NDT equipment and materials
const DEFAULT_CONFIG = {
    procedureNumbers: [
        'MAI-P-NDT-009-PAUT-R03',
        'MAI-P-NDT-010-UT-R02',
        'MAI-P-NDT-007-MT-R01',
        'MAI-P-NDT-008-PT-R01',
        'MAI-P-NDT-011-RT-R02'
    ],
    equipmentModels: [
        'Olympus OmniScan X3',
        'Olympus OmniScan MX2',
        'Olympus EPOCH 650',
        'Olympus EPOCH 1000',
        'Sonatest Veo+',
        'Sonatest Sitescan D-50',
        'Eddyfi Lyft',
        'GE Phasor XS',
        'Evident OmniScan SX'
    ],
    probes: [
        '5L64-A32',
        '5L64-NW1',
        '3.5L64',
        '5L128-A32',
        '10L64-A32',
        '7.5L64-A32',
        '10MHz 6mm Dual',
        '5MHz 10mm Dual',
        'SA-2.25-IHC'
    ],
    calibrationBlocks: [
        'IIW Type 1',
        'IIW Type 2',
        'V1 Block',
        'V2 Block',
        'AWS Block',
        'Mini V1',
        'Mini V2',
        'DSC Block',
        'Step Wedge'
    ],
    couplants: [
        'Aquasonic 100 Ultrasound Gel',
        'Sonotech Ultragel II',
        'Echo Ultrasonic Couplant',
        'Magnaflux Ultragel II',
        'Glycerin',
        'Water',
        'Propylene Glycol'
    ],
    scannerFrames: [
        'Olympus HydroFORM',
        'Olympus MagnaFORM',
        'Eddyfi Scarabee',
        'Phoenix ISL Scanner',
        'Waygate Handy Scanner',
        'Manual Scanning',
        'Raster Scanner Type A'
    ],
    coatingTypes: [
        'Epoxy',
        'Polyurethane',
        'Acrylic',
        'Coal Tar Epoxy',
        'Zinc Rich Primer',
        'Marine Grade Coating',
        'Thermal Spray Aluminum',
        'None/Bare Metal'
    ],
    materials: [
        'Carbon Steel',
        'Stainless Steel 304',
        'Stainless Steel 316L',
        'Duplex Stainless Steel',
        'Low Alloy Steel',
        'P91 Chrome Moly',
        'Inconel 625',
        'Aluminum 6061',
        'Copper Nickel'
    ],
    acceptanceCriteria: [
        'ASME Section V',
        'ASME Section VIII Div 1',
        'ASME B31.3',
        'ASME B31.1',
        'BS EN ISO 16809:2019',
        'BS EN ISO 17640:2018',
        'API 570',
        'API 510',
        'AWS D1.1',
        'Client Specification'
    ],
    clients: [
        'BP',
        'Shell',
        'ExxonMobil',
        'Chevron',
        'TotalEnergies',
        'Equinor',
        'Saudi Aramco',
        'ConocoPhillips',
        'Petrobras'
    ],
    locations: [
        'North Sea, UK',
        'Gulf of Mexico, USA',
        'Persian Gulf, UAE',
        'Santos Basin, Brazil',
        'Barents Sea, Norway',
        'West Africa',
        'Southeast Asia',
        'Mediterranean Sea'
    ]
};

class AdminConfig {
    constructor() {
        this.config = null;
        this.initPromise = this.initialize();
    }

    async initialize() {
        try {
            await indexedDB.ensureInitialized();
            const data = await indexedDB.loadData();

            // Load config from IndexedDB or use defaults
            if (data[CONFIG_KEY]) {
                this.config = data[CONFIG_KEY];
            } else {
                // Initialize with defaults
                this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
                await this.saveConfig();
            }
        } catch (error) {
            this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }
    }

    async ensureInitialized() {
        await this.initPromise;
    }

    async saveConfig() {
        try {
            const data = await indexedDB.loadData();
            data[CONFIG_KEY] = this.config;
            await indexedDB.saveData(data);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Get all configuration
    getAllConfig() {
        return JSON.parse(JSON.stringify(this.config));
    }

    // Get specific list
    getList(listName) {
        return this.config[listName] ? [...this.config[listName]] : [];
    }

    // Add item to list
    async addItem(listName, item) {
        if (!this.config[listName]) {
            return { success: false, error: 'Invalid list name' };
        }

        const trimmedItem = item.trim();
        if (!trimmedItem) {
            return { success: false, error: 'Item cannot be empty' };
        }

        if (this.config[listName].includes(trimmedItem)) {
            return { success: false, error: 'Item already exists' };
        }

        this.config[listName].push(trimmedItem);
        await this.saveConfig();
        return { success: true };
    }

    // Update item in list
    async updateItem(listName, oldItem, newItem) {
        if (!this.config[listName]) {
            return { success: false, error: 'Invalid list name' };
        }

        const trimmedNewItem = newItem.trim();
        if (!trimmedNewItem) {
            return { success: false, error: 'Item cannot be empty' };
        }

        const index = this.config[listName].indexOf(oldItem);
        if (index === -1) {
            return { success: false, error: 'Item not found' };
        }

        // Check if new item already exists (but not if it's the same as old item)
        if (trimmedNewItem !== oldItem && this.config[listName].includes(trimmedNewItem)) {
            return { success: false, error: 'An item with this name already exists' };
        }

        this.config[listName][index] = trimmedNewItem;
        await this.saveConfig();
        return { success: true };
    }

    // Remove item from list
    async removeItem(listName, item) {
        if (!this.config[listName]) {
            return { success: false, error: 'Invalid list name' };
        }

        const index = this.config[listName].indexOf(item);
        if (index === -1) {
            return { success: false, error: 'Item not found' };
        }

        this.config[listName].splice(index, 1);
        await this.saveConfig();
        return { success: true };
    }

    // Reset list to defaults
    async resetList(listName) {
        if (!DEFAULT_CONFIG[listName]) {
            return { success: false, error: 'Invalid list name' };
        }

        this.config[listName] = [...DEFAULT_CONFIG[listName]];
        await this.saveConfig();
        return { success: true };
    }

    // Reset all to defaults
    async resetAllToDefaults() {
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        await this.saveConfig();
        return { success: true };
    }

    // Export configuration
    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }

    // Import configuration
    async importConfig(jsonString) {
        try {
            const imported = JSON.parse(jsonString);

            // Validate that imported data has the expected structure
            const requiredKeys = Object.keys(DEFAULT_CONFIG);
            const hasAllKeys = requiredKeys.every(key =>
                Object.hasOwn(imported, key) && Array.isArray(imported[key])
            );

            if (!hasAllKeys) {
                return { success: false, error: 'Invalid configuration format' };
            }

            this.config = imported;
            await this.saveConfig();
            return { success: true };
        } catch (error) {
            return { success: false, error: 'Failed to parse JSON' };
        }
    }

    // Get list metadata
    getListMetadata() {
        return {
            procedureNumbers: { label: 'Procedure Numbers', icon: '📋' },
            equipmentModels: { label: 'Equipment Models', icon: '🔧' },
            probes: { label: 'Probes', icon: '📡' },
            calibrationBlocks: { label: 'Calibration Blocks', icon: '📦' },
            couplants: { label: 'Couplants', icon: '💧' },
            scannerFrames: { label: 'Scanner Frames', icon: '🖼️' },
            coatingTypes: { label: 'Coating Types', icon: '🎨' },
            materials: { label: 'Materials', icon: '⚙️' },
            acceptanceCriteria: { label: 'Acceptance Criteria', icon: '✓' },
            clients: { label: 'Clients', icon: '🏢' },
            locations: { label: 'Locations', icon: '📍' }
        };
    }
}

// Create singleton instance
const adminConfig = new AdminConfig();

export default adminConfig;

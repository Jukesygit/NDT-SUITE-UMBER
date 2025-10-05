// IndexedDB Wrapper - Handles persistent storage for NDT Suite data
// Provides async API for storing assets, vessels, and scan data

const DB_NAME = 'NDTSuiteDB';
const DB_VERSION = 1;
const STORE_NAME = 'ndtData';

class IndexedDBWrapper {
    constructor() {
        this.db = null;
        this.initPromise = this.init();
    }

    // Initialize the database
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('Object store created');
                }
            };
        });
    }

    // Ensure DB is initialized before operations
    async ensureInitialized() {
        if (!this.db) {
            await this.initPromise;
        }
    }

    // Save entire data structure
    async saveData(data) {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);

            // Store with a fixed key for the main data structure
            const request = objectStore.put({
                id: 'main_data',
                timestamp: Date.now(),
                data: data
            });

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // Load entire data structure
    async loadData() {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.get('main_data');

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.data : {});
            };

            request.onerror = () => reject(request.error);
        });
    }

    // Clear all data
    async clearData() {
        await this.ensureInitialized();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // Get database size estimate (useful for monitoring storage usage)
    async getStorageEstimate() {
        if (navigator.storage && navigator.storage.estimate) {
            return await navigator.storage.estimate();
        }
        return null;
    }

    // Export data as JSON string
    async exportData() {
        const data = await this.loadData();
        return JSON.stringify(data, null, 2);
    }

    // Import data from JSON string
    async importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data && typeof data === 'object') {
                await this.saveData(data);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    }

    // Migrate data from localStorage to IndexedDB
    async migrateFromLocalStorage(storageKey) {
        try {
            const localData = localStorage.getItem(storageKey);
            if (localData) {
                const parsed = JSON.parse(localData);
                await this.saveData(parsed);
                console.log('Data migrated from localStorage to IndexedDB');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error migrating from localStorage:', error);
            return false;
        }
    }
}

// Create singleton instance
const indexedDB_wrapper = new IndexedDBWrapper();

export default indexedDB_wrapper;

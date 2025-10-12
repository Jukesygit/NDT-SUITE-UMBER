/**
 * Migration Tool - One-time migration of existing IndexedDB data to Supabase
 *
 * This tool helps users migrate their existing local data to Supabase cloud storage
 */

import syncService from './sync-service.js';
import authManager from './auth-manager.js';
import indexedDB from './indexed-db.js';

class MigrationTool {
    constructor() {
        this.migrationInProgress = false;
        this.migrationProgress = {
            total: 0,
            completed: 0,
            failed: 0,
            currentItem: ''
        };
    }

    /**
     * Check if user has local data that needs migration
     */
    async needsMigration() {
        if (!authManager.isLoggedIn()) {
            return { needsMigration: false, reason: 'Not logged in' };
        }

        try {
            const localData = await indexedDB.loadData();
            const orgId = authManager.getCurrentOrganizationId();

            if (!localData[orgId] || !localData[orgId].assets || localData[orgId].assets.length === 0) {
                return { needsMigration: false, reason: 'No local data found' };
            }

            // Check if migration flag exists
            const migrationStatus = localStorage.getItem(`migration_status_${orgId}`);
            if (migrationStatus === 'completed') {
                return { needsMigration: false, reason: 'Migration already completed' };
            }

            // Count items
            let assetCount = 0;
            let vesselCount = 0;
            let scanCount = 0;
            let imageCount = 0;

            for (const asset of localData[orgId].assets) {
                assetCount++;
                for (const vessel of asset.vessels || []) {
                    vesselCount++;
                    scanCount += (vessel.scans || []).length;
                    imageCount += (vessel.images || []).length;
                }
            }

            return {
                needsMigration: true,
                stats: {
                    assets: assetCount,
                    vessels: vesselCount,
                    scans: scanCount,
                    images: imageCount,
                    total: assetCount + vesselCount + scanCount + imageCount
                }
            };

        } catch (error) {
            console.error('Error checking migration status:', error);
            return { needsMigration: false, reason: error.message };
        }
    }

    /**
     * Perform migration
     */
    async migrate(onProgress) {
        if (this.migrationInProgress) {
            return { success: false, error: 'Migration already in progress' };
        }

        if (!authManager.isLoggedIn()) {
            return { success: false, error: 'User not logged in' };
        }

        this.migrationInProgress = true;

        try {
            console.log('Starting migration...');

            // Check what needs to be migrated
            const migrationCheck = await this.needsMigration();
            if (!migrationCheck.needsMigration) {
                return { success: true, message: migrationCheck.reason };
            }

            const stats = migrationCheck.stats;
            this.migrationProgress = {
                total: stats.total,
                completed: 0,
                failed: 0,
                currentItem: 'Starting migration...'
            };

            if (onProgress) onProgress(this.migrationProgress);

            // Perform the actual migration by uploading all data
            console.log(`Migrating ${stats.assets} assets...`);
            this.migrationProgress.currentItem = 'Uploading data to Supabase...';
            if (onProgress) onProgress(this.migrationProgress);

            const uploadResult = await syncService.uploadAllData();

            if (!uploadResult.success) {
                throw new Error(`Upload failed: ${uploadResult.error}`);
            }

            this.migrationProgress.completed = uploadResult.count || stats.total;
            this.migrationProgress.currentItem = 'Migration completed!';
            if (onProgress) onProgress(this.migrationProgress);

            // Mark migration as complete
            const orgId = authManager.getCurrentOrganizationId();
            localStorage.setItem(`migration_status_${orgId}`, 'completed');
            localStorage.setItem(`migration_date_${orgId}`, new Date().toISOString());

            console.log('Migration completed successfully');

            return {
                success: true,
                stats: {
                    ...stats,
                    uploaded: uploadResult.count
                }
            };

        } catch (error) {
            console.error('Migration failed:', error);
            this.migrationProgress.currentItem = `Migration failed: ${error.message}`;
            if (onProgress) onProgress(this.migrationProgress);

            return { success: false, error: error.message };
        } finally {
            this.migrationInProgress = false;
        }
    }

    /**
     * Get migration progress
     */
    getProgress() {
        return { ...this.migrationProgress };
    }

    /**
     * Reset migration status (for testing or re-migration)
     */
    resetMigrationStatus() {
        const orgId = authManager.getCurrentOrganizationId();
        if (orgId) {
            localStorage.removeItem(`migration_status_${orgId}`);
            localStorage.removeItem(`migration_date_${orgId}`);
            console.log('Migration status reset');
        }
    }

    /**
     * Get migration history
     */
    getMigrationHistory() {
        const orgId = authManager.getCurrentOrganizationId();
        if (!orgId) return null;

        const status = localStorage.getItem(`migration_status_${orgId}`);
        const date = localStorage.getItem(`migration_date_${orgId}`);

        if (status === 'completed') {
            return {
                completed: true,
                date: new Date(date)
            };
        }

        return { completed: false };
    }

    /**
     * Show migration prompt UI
     */
    async showMigrationPrompt() {
        const check = await this.needsMigration();

        if (!check.needsMigration) {
            return null;
        }

        // Create modal dialog
        const modal = document.createElement('div');
        modal.className = 'migration-modal';
        modal.innerHTML = `
            <div class="migration-modal-content">
                <h2>Migrate Your Data to Cloud</h2>
                <p>We detected ${check.stats.total} items stored locally on this device:</p>
                <ul>
                    <li>${check.stats.assets} Assets</li>
                    <li>${check.stats.vessels} Vessels</li>
                    <li>${check.stats.scans} Scans</li>
                    <li>${check.stats.images} Images</li>
                </ul>
                <p>Would you like to sync this data to the cloud? This will allow you to access it from any device.</p>

                <div class="migration-progress" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%"></div>
                    </div>
                    <p class="progress-text">Starting...</p>
                </div>

                <div class="migration-buttons">
                    <button class="btn btn-primary" id="migrate-now">Migrate Now</button>
                    <button class="btn btn-secondary" id="migrate-later">Later</button>
                    <button class="btn btn-text" id="migrate-never">Don't Ask Again</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle button clicks
        return new Promise((resolve) => {
            modal.querySelector('#migrate-now').addEventListener('click', async () => {
                // Show progress
                modal.querySelector('.migration-buttons').style.display = 'none';
                modal.querySelector('.migration-progress').style.display = 'block';

                // Perform migration
                const result = await this.migrate((progress) => {
                    const percent = (progress.completed / progress.total) * 100;
                    modal.querySelector('.progress-fill').style.width = `${percent}%`;
                    modal.querySelector('.progress-text').textContent = progress.currentItem;
                });

                // Show result
                if (result.success) {
                    modal.querySelector('.progress-text').textContent = '✓ Migration completed successfully!';
                    setTimeout(() => {
                        modal.remove();
                        resolve('completed');
                    }, 2000);
                } else {
                    modal.querySelector('.progress-text').textContent = `✗ Migration failed: ${result.error}`;
                    setTimeout(() => {
                        modal.remove();
                        resolve('failed');
                    }, 3000);
                }
            });

            modal.querySelector('#migrate-later').addEventListener('click', () => {
                modal.remove();
                resolve('later');
            });

            modal.querySelector('#migrate-never').addEventListener('click', () => {
                const orgId = authManager.getCurrentOrganizationId();
                localStorage.setItem(`migration_dismissed_${orgId}`, 'true');
                modal.remove();
                resolve('never');
            });
        });
    }

    /**
     * Check if user has dismissed migration prompt
     */
    hasDismissedPrompt() {
        const orgId = authManager.getCurrentOrganizationId();
        return localStorage.getItem(`migration_dismissed_${orgId}`) === 'true';
    }
}

// Create singleton instance
const migrationTool = new MigrationTool();
export default migrationTool;

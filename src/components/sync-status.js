/**
 * Sync Status Component - Shows synchronization status and progress
 */

import syncService from '../sync-service.js';
import authManager from '../auth-manager.js';

class SyncStatus {
    constructor() {
        this.container = null;
        this.statusIcon = null;
        this.statusText = null;
        this.progressBar = null;
        this.setupEventListeners();
    }

    /**
     * Create and inject sync status UI
     */
    create() {
        // If container already exists, don't create a duplicate
        if (this.container && document.body.contains(this.container)) {
            return this.container;
        }

        // Create container
        this.container = document.createElement('div');
        this.container.className = 'sync-status';
        this.container.innerHTML = `
            <div class="sync-status-content">
                <div class="sync-icon">
                    <svg class="sync-icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                </div>
                <span class="sync-text">Synced</span>
                <div class="sync-progress" style="display: none;">
                    <div class="sync-progress-bar"></div>
                </div>
            </div>
        `;

        this.statusIcon = this.container.querySelector('.sync-icon');
        this.statusText = this.container.querySelector('.sync-text');
        this.progressBar = this.container.querySelector('.sync-progress');

        // Add click handler for manual sync
        this.container.addEventListener('click', () => this.handleClick());

        // Add to page
        document.body.appendChild(this.container);

        // Update initial status
        this.updateStatus();

        return this.container;
    }

    /**
     * Setup event listeners for sync events
     */
    setupEventListeners() {
        // Listen for sync events
        window.addEventListener('syncStarted', () => {
            this.showSyncing();
        });

        window.addEventListener('syncCompleted', (e) => {
            this.showSuccess(e.detail);
        });

        window.addEventListener('syncFailed', (e) => {
            this.showError(e.detail.error);
        });

        window.addEventListener('syncPending', () => {
            this.showPending();
        });

        // Listen for auth changes
        window.addEventListener('userLoggedIn', () => {
            this.updateStatus();
        });

        window.addEventListener('userLoggedOut', () => {
            // Stop auto-sync
            syncService.stopAutoSync();
            this.updateStatus();
        });
    }

    /**
     * Handle click on sync status
     */
    async handleClick() {
        if (!authManager.isLoggedIn()) {
            this.showMessage('Please log in to sync');
            return;
        }

        const status = syncService.getSyncStatus();
        if (status.inProgress) {
            this.showMessage('Sync already in progress');
            return;
        }

        // Trigger manual sync
        this.showSyncing();
        window.dispatchEvent(new CustomEvent('syncStarted'));

        const result = await syncService.fullSync();

        if (result.success) {
            this.showSuccess({
                downloaded: result.downloaded,
                uploaded: result.uploaded
            });
        } else {
            this.showError(result.error);
        }
    }

    /**
     * Update status based on current state
     */
    updateStatus() {
        if (!authManager.isLoggedIn()) {
            this.container?.classList.remove('syncing', 'error', 'success');
            this.container?.classList.add('offline');
            if (this.statusText) this.statusText.textContent = 'Offline Mode';
            return;
        }

        const status = syncService.getSyncStatus();

        if (status.inProgress) {
            this.showSyncing();
        } else if (status.lastSync) {
            this.showSynced(status.lastSync);
        } else {
            this.showNeedsSync();
        }
    }

    /**
     * Show syncing state
     */
    showSyncing() {
        if (!this.container) return;

        this.container.classList.remove('error', 'success', 'offline', 'needs-sync');
        this.container.classList.add('syncing');
        this.statusText.textContent = 'Syncing...';
        this.statusIcon.classList.add('spinning');
        this.progressBar.style.display = 'block';
    }

    /**
     * Show success state
     */
    showSuccess(detail) {
        if (!this.container) return;

        this.container.classList.remove('error', 'syncing', 'offline', 'needs-sync');
        this.container.classList.add('success');
        this.statusIcon.classList.remove('spinning');
        this.progressBar.style.display = 'none';

        let message = 'Synced';
        if (detail?.downloaded || detail?.uploaded) {
            const items = [];
            if (detail.downloaded > 0) items.push(`↓${detail.downloaded}`);
            if (detail.uploaded > 0) items.push(`↑${detail.uploaded}`);
            message = items.join(' ');
        }

        this.statusText.textContent = message;

        // Reset to "Synced" after 3 seconds
        setTimeout(() => {
            if (this.statusText && this.container?.classList.contains('success')) {
                this.statusText.textContent = 'Synced';
            }
        }, 3000);
    }

    /**
     * Show error state
     */
    showError(error) {
        if (!this.container) return;

        this.container.classList.remove('success', 'syncing', 'offline', 'needs-sync');
        this.container.classList.add('error');
        this.statusIcon.classList.remove('spinning');
        this.progressBar.style.display = 'none';
        this.statusText.textContent = 'Sync failed';

        console.error('Sync error:', error);

        // Show full error on hover
        this.container.title = `Sync failed: ${error}`;

        // Reset after 5 seconds
        setTimeout(() => {
            if (this.container?.classList.contains('error')) {
                this.updateStatus();
            }
        }, 5000);
    }

    /**
     * Show synced state with last sync time
     */
    showSynced(lastSyncTime) {
        if (!this.container) return;

        this.container.classList.remove('error', 'syncing', 'offline', 'needs-sync');
        this.container.classList.add('success');
        this.statusIcon.classList.remove('spinning');
        this.progressBar.style.display = 'none';

        const timeAgo = this.getTimeAgo(lastSyncTime);
        this.statusText.textContent = 'Synced';
        this.container.title = `Last synced ${timeAgo}`;
    }

    /**
     * Show needs sync state
     */
    showNeedsSync() {
        if (!this.container) return;

        this.container.classList.remove('error', 'syncing', 'offline', 'success');
        this.container.classList.add('needs-sync');
        this.statusIcon.classList.remove('spinning');
        this.progressBar.style.display = 'none';
        this.statusText.textContent = 'Click to sync';
    }

    /**
     * Show pending state (waiting to auto-sync)
     */
    showPending() {
        if (!this.container) return;

        this.container.classList.remove('error', 'syncing', 'offline', 'success');
        this.container.classList.add('pending');
        this.statusIcon.classList.remove('spinning');
        this.progressBar.style.display = 'none';
        this.statusText.textContent = 'Auto-syncing...';
        this.container.title = 'Changes will sync automatically';
    }

    /**
     * Show temporary message
     */
    showMessage(message) {
        if (!this.statusText) return;

        const originalText = this.statusText.textContent;
        this.statusText.textContent = message;

        setTimeout(() => {
            if (this.statusText) {
                this.statusText.textContent = originalText;
            }
        }, 2000);
    }

    /**
     * Get human-readable time ago string
     */
    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        return `${Math.floor(seconds / 86400)} days ago`;
    }

    /**
     * Remove sync status UI
     */
    remove() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }
}

// Add CSS styles
const style = document.createElement('style');
style.textContent = `
    .sync-status {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.3s ease;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .sync-status:hover {
        background: rgba(0, 0, 0, 0.9);
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    }

    .sync-status-content {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .sync-icon {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .sync-icon-svg {
        color: white;
    }

    .sync-status.syncing .sync-icon-svg {
        animation: spin 1s linear infinite;
    }

    .sync-status.success .sync-icon-svg {
        color: #4caf50;
    }

    .sync-status.error .sync-icon-svg {
        color: #f44336;
    }

    .sync-status.offline .sync-icon-svg {
        color: #999;
    }

    .sync-status.needs-sync .sync-icon-svg {
        color: #ff9800;
    }

    .sync-status.pending .sync-icon-svg {
        color: #2196f3;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .sync-text {
        white-space: nowrap;
    }

    .sync-progress {
        width: 100px;
        height: 4px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        overflow: hidden;
    }

    .sync-progress-bar {
        height: 100%;
        background: #4caf50;
        width: 0%;
        transition: width 0.3s ease;
        animation: progress 1.5s ease-in-out infinite;
    }

    @keyframes progress {
        0% { width: 0%; }
        50% { width: 100%; }
        100% { width: 0%; }
    }

    .migration-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        backdrop-filter: blur(4px);
    }

    .migration-modal-content {
        background: #1e1e1e;
        color: white;
        padding: 32px;
        border-radius: 12px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .migration-modal-content h2 {
        margin: 0 0 16px 0;
        font-size: 24px;
    }

    .migration-modal-content p {
        margin: 12px 0;
        line-height: 1.6;
    }

    .migration-modal-content ul {
        margin: 16px 0;
        padding-left: 24px;
    }

    .migration-modal-content li {
        margin: 8px 0;
    }

    .migration-progress {
        margin: 24px 0;
    }

    .progress-bar {
        width: 100%;
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 12px;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4caf50, #8bc34a);
        transition: width 0.3s ease;
    }

    .progress-text {
        text-align: center;
        font-size: 14px;
        color: #aaa;
    }

    .migration-buttons {
        display: flex;
        gap: 12px;
        margin-top: 24px;
    }

    .migration-buttons .btn {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
    }

    .migration-buttons .btn-primary {
        background: #4caf50;
        color: white;
    }

    .migration-buttons .btn-primary:hover {
        background: #45a049;
    }

    .migration-buttons .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: white;
    }

    .migration-buttons .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .migration-buttons .btn-text {
        background: transparent;
        color: #999;
    }

    .migration-buttons .btn-text:hover {
        color: white;
    }
`;
document.head.appendChild(style);

// Create singleton instance
const syncStatus = new SyncStatus();
export default syncStatus;

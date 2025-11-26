/**
 * Sync Status Component - Shows synchronization status and progress
 */

import syncService from '../sync-service.js';
import syncQueue from '../sync-queue.js';
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
                    <svg class="sync-icon-svg sync-icon-default" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    <svg class="sync-logo-svg" width="40" height="22" viewBox="0 0 2256 1202" fill="none" style="display: none;">
                        <path class="sync-logo-bg" d="M36 1199.2 c-17.1 -4.5 -30.8 -18.8 -34 -35.7 -0.8 -4.4 -1 -75 -0.8 -266 l0.3 -260 3.3 -9.5 c4 -11.5 10.6 -22.3 18.1 -29.9 5.6 -5.6 778.3 -585.2 787.1 -590.3 7 -4.1 16.1 -6.1 25 -5.5 19 1.3 34.9 13.6 41.1 31.7 l2.2 6.5 0.8 239.5 c0.5 140.3 1.3 241.8 1.8 245.2 2.3 13.5 12.2 26.1 25.7 32.5 7.8 3.7 8.1 3.8 19.9 3.8 11.4 0 12.3 -0.2 18.5 -3.1 3.8 -1.8 30.2 -20.7 64.5 -46.1 31.9 -23.6 197.5 -146.4 368 -272.9 181 -134.2 312.7 -231.2 316.5 -233.1 14.7 -7.4 31.1 -6.1 45.8 3.5 7 4.6 11.7 10.2 16.1 19.2 l3.6 7.5 0.6 56 c0.4 30.8 1 146 1.3 256 0.5 129.9 1.1 201.9 1.8 205.5 2.4 12.9 12.6 27.8 23.9 35.1 2.8 1.7 8 4.4 11.7 5.8 l6.7 2.6 193 0.5 c182.3 0.5 193.3 0.7 199 2.4 27.8 8.4 47.4 28.1 55.2 55.7 1.7 6.1 1.8 16.8 1.8 241.9 0 264.2 0.7 239.6 -7.4 256.5 -9.3 19.4 -24.4 32.7 -45.6 40.2 l-8 2.8 -186 0 -186 0 -8.8 -3.1 c-28.6 -10.3 -48 -34.1 -51.7 -63.8 -1.6 -12.8 -1.4 -382.3 0.3 -382.9 0.9 -0.4 0.9 -0.6 0 -0.6 -1 -0.1 -1.3 -6.6 -1.3 -28.9 0 -31.8 -0.5 -35.7 -6.2 -46.6 -4.1 -7.7 -14.5 -18.2 -22.3 -22.3 -17 -8.9 -37 -9.1 -53 -0.4 -2.7 1.5 -166.1 124.2 -363 272.6 -196.9 148.5 -360.4 271.4 -363.4 273.2 -7.8 4.7 -18.6 6.9 -27.8 5.6 -20 -2.9 -36.8 -18.3 -40.3 -37.2 -0.7 -3.5 -1 -90 -1 -249 0 -266.9 0.4 -249.6 -5.7 -260.1 -12.5 -21.4 -39.4 -29.9 -60.8 -19.3 -10.9 5.5 -98.7 71.1 -414.5 309.8 -181.2 136.9 -332 250.2 -335 251.7 -9.8 4.9 -19.9 5.9 -31 3z" stroke="#10b98150" stroke-width="50" fill="none"/>
                        <path class="sync-logo-light" d="M36 1199.2 c-17.1 -4.5 -30.8 -18.8 -34 -35.7 -0.8 -4.4 -1 -75 -0.8 -266 l0.3 -260 3.3 -9.5 c4 -11.5 10.6 -22.3 18.1 -29.9 5.6 -5.6 778.3 -585.2 787.1 -590.3 7 -4.1 16.1 -6.1 25 -5.5 19 1.3 34.9 13.6 41.1 31.7 l2.2 6.5 0.8 239.5 c0.5 140.3 1.3 241.8 1.8 245.2 2.3 13.5 12.2 26.1 25.7 32.5 7.8 3.7 8.1 3.8 19.9 3.8 11.4 0 12.3 -0.2 18.5 -3.1 3.8 -1.8 30.2 -20.7 64.5 -46.1 31.9 -23.6 197.5 -146.4 368 -272.9 181 -134.2 312.7 -231.2 316.5 -233.1 14.7 -7.4 31.1 -6.1 45.8 3.5 7 4.6 11.7 10.2 16.1 19.2 l3.6 7.5 0.6 56 c0.4 30.8 1 146 1.3 256 0.5 129.9 1.1 201.9 1.8 205.5 2.4 12.9 12.6 27.8 23.9 35.1 2.8 1.7 8 4.4 11.7 5.8 l6.7 2.6 193 0.5 c182.3 0.5 193.3 0.7 199 2.4 27.8 8.4 47.4 28.1 55.2 55.7 1.7 6.1 1.8 16.8 1.8 241.9 0 264.2 0.7 239.6 -7.4 256.5 -9.3 19.4 -24.4 32.7 -45.6 40.2 l-8 2.8 -186 0 -186 0 -8.8 -3.1 c-28.6 -10.3 -48 -34.1 -51.7 -63.8 -1.6 -12.8 -1.4 -382.3 0.3 -382.9 0.9 -0.4 0.9 -0.6 0 -0.6 -1 -0.1 -1.3 -6.6 -1.3 -28.9 0 -31.8 -0.5 -35.7 -6.2 -46.6 -4.1 -7.7 -14.5 -18.2 -22.3 -22.3 -17 -8.9 -37 -9.1 -53 -0.4 -2.7 1.5 -166.1 124.2 -363 272.6 -196.9 148.5 -360.4 271.4 -363.4 273.2 -7.8 4.7 -18.6 6.9 -27.8 5.6 -20 -2.9 -36.8 -18.3 -40.3 -37.2 -0.7 -3.5 -1 -90 -1 -249 0 -266.9 0.4 -249.6 -5.7 -260.1 -12.5 -21.4 -39.4 -29.9 -60.8 -19.3 -10.9 5.5 -98.7 71.1 -414.5 309.8 -181.2 136.9 -332 250.2 -335 251.7 -9.8 4.9 -19.9 5.9 -31 3z" stroke="#10b981" stroke-width="50" fill="none" stroke-dasharray="4000 6000"/>
                        <circle class="sync-logo-circle1-bg" cx="1558" cy="1065" r="130" stroke="#10b98150" stroke-width="50" fill="none"/>
                        <circle class="sync-logo-circle1" cx="1558" cy="1065" r="130" stroke="#10b981" stroke-width="50" fill="none" stroke-dasharray="600 600"/>
                        <circle class="sync-logo-circle2-bg" cx="2020" cy="380" r="130" stroke="#10b98150" stroke-width="50" fill="none"/>
                        <circle class="sync-logo-circle2" cx="2020" cy="380" r="130" stroke="#10b981" stroke-width="50" fill="none" stroke-dasharray="600 600"/>
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

        // Listen for sync queue events
        window.addEventListener('syncQueueChanged', (e) => {
            this.updateQueueStatus(e.detail);
        });

        window.addEventListener('syncQueueEmpty', () => {
            this.showQueueEmpty();
        });

        window.addEventListener('syncOperationSuccess', () => {
            this.updateStatus();
        });

        window.addEventListener('syncOperationFailed', (e) => {
            if (e.detail.permanent) {
                this.showError(`Operation failed: ${e.detail.error}`);
            }
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

        const queueStatus = syncQueue.getStatus();
        const syncStatus = syncService.getSyncStatus();

        // Show queue status if there are pending operations
        if (queueStatus.queueSize > 0) {
            this.showQueueProcessing(queueStatus.queueSize);
        } else if (syncStatus.inProgress) {
            this.showSyncing();
        } else {
            this.showSynced();
        }
    }

    /**
     * Update queue status
     */
    updateQueueStatus(detail) {
        if (detail.queueSize > 0) {
            this.showQueueProcessing(detail.queueSize);
        } else {
            this.showQueueEmpty();
        }
    }

    /**
     * Show queue processing state
     */
    showQueueProcessing(queueSize) {
        if (!this.container) return;

        this.container.classList.remove('error', 'success', 'offline', 'needs-sync');
        this.container.classList.add('syncing');
        this.statusText.textContent = `Syncing (${queueSize})`;
        this.showLogoAnimation(true);
        this.progressBar.style.display = 'none';
        this.container.title = `${queueSize} operation${queueSize === 1 ? '' : 's'} pending`;
    }

    /**
     * Show queue empty state
     */
    showQueueEmpty() {
        if (!this.container) return;

        this.container.classList.remove('error', 'syncing', 'offline', 'needs-sync');
        this.container.classList.add('success');
        this.showLogoAnimation(false);
        this.progressBar.style.display = 'none';
        this.statusText.textContent = 'Synced';
        this.container.title = 'All changes synced';
    }

    /**
     * Show syncing state
     */
    showSyncing() {
        if (!this.container) return;

        this.container.classList.remove('error', 'success', 'offline', 'needs-sync');
        this.container.classList.add('syncing');
        this.statusText.textContent = 'Syncing...';
        this.showLogoAnimation(true);
        this.progressBar.style.display = 'block';
    }

    /**
     * Show success state
     */
    showSuccess(detail) {
        if (!this.container) return;

        this.container.classList.remove('error', 'syncing', 'offline', 'needs-sync');
        this.container.classList.add('success');
        this.showLogoAnimation(false);
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
        this.showLogoAnimation(false);
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
        this.showLogoAnimation(false);
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
        this.showLogoAnimation(false);
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
        this.showLogoAnimation(false);
        this.progressBar.style.display = 'none';
        this.statusText.textContent = 'Auto-syncing...';
        this.container.title = 'Changes will sync automatically';
    }

    /**
     * Toggle between default icon and animated logo
     */
    showLogoAnimation(show) {
        if (!this.container) return;

        const defaultIcon = this.container.querySelector('.sync-icon-default');
        const logoSvg = this.container.querySelector('.sync-logo-svg');

        if (defaultIcon && logoSvg) {
            if (show) {
                defaultIcon.style.display = 'none';
                logoSvg.style.display = 'block';
            } else {
                defaultIcon.style.display = 'block';
                logoSvg.style.display = 'none';
            }
        }
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
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        pointer-events: auto;
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

    .sync-status.syncing .sync-icon-svg.sync-icon-default {
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

    /* Matrix logo animation for syncing */
    .sync-logo-svg {
        filter: drop-shadow(0 0 4px #10b98180);
    }

    .sync-logo-light {
        animation: syncLogoRace 3s linear infinite;
    }

    .sync-logo-circle1 {
        animation: syncCircleRace 1.5s linear infinite;
    }

    .sync-logo-circle2 {
        animation: syncCircleRace 1.5s linear infinite;
        animation-delay: 0.75s;
    }

    @keyframes syncLogoRace {
        0% { stroke-dashoffset: 0; }
        100% { stroke-dashoffset: -9500; }
    }

    @keyframes syncCircleRace {
        0% { stroke-dashoffset: 0; }
        100% { stroke-dashoffset: -1200; }
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

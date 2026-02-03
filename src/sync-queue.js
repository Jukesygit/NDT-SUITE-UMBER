/**
 * Sync Queue Manager - Handles background synchronization operations
 *
 * Implements a write-through cache pattern where:
 * 1. Local changes are applied immediately to IndexedDB
 * 2. Supabase operations are queued and processed in background
 * 3. Failed operations are retried with exponential backoff
 * 4. UI is notified of sync status changes
 */

import { supabase } from './supabase-client.js';
import authManager from './auth-manager.js';

class SyncQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.retryDelay = 1000; // Start with 1 second
        this.maxRetryDelay = 30000; // Max 30 seconds
        this.maxRetries = 5;
        this.processingTimer = null;

        // Load pending operations from localStorage
        this.loadQueue();

        // Start processing queue
        this.startProcessing();
    }

    /**
     * Load queue from localStorage (persist across page reloads)
     */
    loadQueue() {
        try {
            const saved = localStorage.getItem('ndt_sync_queue');
            if (saved) {
                const loadedQueue = JSON.parse(saved);
                // Filter out scan operations (they use cloud-first now, not queue)
                this.queue = loadedQueue.filter(item => item.operation.table !== 'scans');
                console.log(`[SYNC-QUEUE] Loaded ${this.queue.length} pending operations (filtered out scans)`);
            }
        } catch (error) {
            console.error('[SYNC-QUEUE] Error loading queue:', error);
            // Clear corrupted queue
            try {
                localStorage.removeItem('ndt_sync_queue');
                console.warn('[SYNC-QUEUE] Cleared corrupted queue');
            } catch (e) {
                // Ignore
            }
            this.queue = [];
        }
    }

    /**
     * Save queue to localStorage
     */
    saveQueue() {
        try {
            // Don't save large scan data to localStorage to avoid quota errors
            // Scans are handled by syncService separately
            const queueToSave = this.queue.filter(item => item.operation.table !== 'scans');
            
            // Check approximate size before saving to avoid blocking main thread with huge stringify
            // or hitting quota limits
            if (queueToSave.length > 100) {
                 console.warn('[SYNC-QUEUE] Queue too large, truncating oldest operations for storage safety');
                 // Keep only the newest 100 operations to prevent storage issues
                 queueToSave.splice(0, queueToSave.length - 100);
            }

            localStorage.setItem('ndt_sync_queue', JSON.stringify(queueToSave));
        } catch (error) {
            console.error('[SYNC-QUEUE] Error saving queue:', error);
            // If still fails, clear the queue to prevent app from breaking
            try {
                // If quota exceeded, we might need to clear it
                if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
                    localStorage.removeItem('ndt_sync_queue');
                    console.warn('[SYNC-QUEUE] Cleared queue due to storage quota');
                }
            } catch (e) {
                // Ignore
            }
        }
    }

    /**
     * Add an operation to the queue
     */
    add(operation) {
        const queueItem = {
            id: this.generateId(),
            operation,
            timestamp: Date.now(),
            retries: 0,
            status: 'pending'
        };

        this.queue.push(queueItem);
        this.saveQueue();

        console.log(`[SYNC-QUEUE] Added operation:`, operation);

        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('syncQueueChanged', {
            detail: { queueSize: this.queue.length }
        }));

        // Trigger immediate processing
        this.processQueue();

        return queueItem.id;
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Start periodic queue processing
     */
    startProcessing() {
        if (this.processingTimer) {
            return;
        }

        // Process queue every 5 seconds
        this.processingTimer = setInterval(() => {
            if (authManager.isLoggedIn() && !this.processing) {
                this.processQueue();
            }
        }, 5000);

        console.log('[SYNC-QUEUE] Started processing timer');
    }

    /**
     * Stop queue processing
     */
    stopProcessing() {
        if (this.processingTimer) {
            clearInterval(this.processingTimer);
            this.processingTimer = null;
            console.log('[SYNC-QUEUE] Stopped processing timer');
        }
    }

    /**
     * Process all pending operations in queue
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        if (!authManager.isLoggedIn()) {
            console.log('[SYNC-QUEUE] User not logged in, skipping queue processing');
            return;
        }

        this.processing = true;
        console.log(`[SYNC-QUEUE] Processing ${this.queue.length} operations...`);

        // Process operations one at a time
        while (this.queue.length > 0) {
            const item = this.queue[0];

            try {
                item.status = 'processing';
                await this.executeOperation(item.operation);

                // Success - remove from queue
                this.queue.shift();
                this.saveQueue();

                console.log('[SYNC-QUEUE] Operation completed:', item.operation.type);

                // Dispatch success event
                window.dispatchEvent(new CustomEvent('syncOperationSuccess', {
                    detail: { operation: item.operation }
                }));

            } catch (error) {
                console.error('[SYNC-QUEUE] Operation failed:', error);
                console.error('[SYNC-QUEUE] Failed operation details:', {
                    type: item.operation.type,
                    table: item.operation.table,
                    id: item.operation.id,
                    errorCode: error.code,
                    errorMessage: error.message
                });

                item.retries++;
                item.lastError = error.message;
                item.status = 'failed';

                if (item.retries >= this.maxRetries) {
                    // Max retries exceeded - move to failed queue
                    console.error(`[SYNC-QUEUE] Max retries exceeded for operation:`, item.operation);

                    this.queue.shift();
                    this.saveQueue();

                    // Dispatch permanent failure event
                    window.dispatchEvent(new CustomEvent('syncOperationFailed', {
                        detail: {
                            operation: item.operation,
                            error: error.message,
                            permanent: true
                        }
                    }));
                } else {
                    // Retry with exponential backoff
                    const delay = Math.min(
                        this.retryDelay * Math.pow(2, item.retries - 1),
                        this.maxRetryDelay
                    );

                    console.log(`[SYNC-QUEUE] Will retry in ${delay}ms (attempt ${item.retries}/${this.maxRetries})`);

                    item.status = 'pending';
                    this.saveQueue();

                    // Dispatch retry event
                    window.dispatchEvent(new CustomEvent('syncOperationRetrying', {
                        detail: {
                            operation: item.operation,
                            retries: item.retries,
                            delay
                        }
                    }));

                    // Wait before next retry
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        this.processing = false;
        console.log('[SYNC-QUEUE] Queue processing complete');

        // Dispatch queue empty event
        window.dispatchEvent(new CustomEvent('syncQueueEmpty'));
    }

    /**
     * Execute a single operation
     */
    async executeOperation(operation) {
        const { type, table, data, id } = operation;

        console.log(`[SYNC-QUEUE] Executing ${type} on ${table}:`, id || data?.id);

        switch (type) {
            case 'insert':
                return await this.executeInsert(table, data);

            case 'update':
                return await this.executeUpdate(table, id, data);

            case 'delete':
                return await this.executeDelete(table, id);

            case 'upload_file':
                return await this.executeFileUpload(operation);

            default:
                throw new Error(`Unknown operation type: ${type}`);
        }
    }

    /**
     * Execute insert operation
     */
    async executeInsert(table, data) {
        const { error } = await supabase
            .from(table)
            .insert(data);

        if (error) throw error;
    }

    /**
     * Execute update operation
     */
    async executeUpdate(table, id, data) {
        const { error } = await supabase
            .from(table)
            .update(data)
            .eq('id', id)
            .select(); // Add select to ensure proper response format

        if (error) throw error;
    }

    /**
     * Execute delete operation
     */
    async executeDelete(table, id) {
        const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    /**
     * Execute file upload operation
     */
    async executeFileUpload(operation) {
        const { bucket, path, dataUrl, mimeType } = operation;

        // Convert data URL to blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        // Upload to Supabase Storage
        const { error } = await supabase.storage
            .from(bucket)
            .upload(path, blob, {
                contentType: mimeType,
                upsert: true
            });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);

        return urlData.publicUrl;
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            queueSize: this.queue.length,
            processing: this.processing,
            hasPendingOperations: this.queue.length > 0
        };
    }

    /**
     * Clear the queue (use with caution)
     */
    clear() {
        this.queue = [];
        this.saveQueue();

        window.dispatchEvent(new CustomEvent('syncQueueCleared'));
        console.log('[SYNC-QUEUE] Queue cleared');
    }

    /**
     * Retry all failed operations
     */
    retryAll() {
        this.queue.forEach(item => {
            item.retries = 0;
            item.status = 'pending';
        });

        this.saveQueue();
        this.processQueue();

        console.log('[SYNC-QUEUE] Retrying all operations');
    }
}

// Create singleton instance
const syncQueue = new SyncQueue();
export default syncQueue;

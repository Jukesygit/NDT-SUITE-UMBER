/**
 * Sync Service Redux Slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SyncStatus, SyncResult, SyncConflict } from '../../types/data.types';

interface SyncState extends SyncStatus {
  currentOperation: string | null;
  progress: number;
  conflicts: SyncConflict[];
  lastResult: SyncResult | null;
}

const initialState: SyncState = {
  inProgress: false,
  lastSync: null,
  lastAttempt: null,
  queueSize: 0,
  autoSyncEnabled: true,
  pendingChanges: false,
  consecutiveFailures: 0,
  backedOff: false,
  currentOperation: null,
  progress: 0,
  conflicts: [],
  lastResult: null,
};

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    startSync: (state, action: PayloadAction<string>) => {
      state.inProgress = true;
      state.currentOperation = action.payload;
      state.lastAttempt = new Date();
      state.progress = 0;
    },
    updateProgress: (state, action: PayloadAction<number>) => {
      state.progress = action.payload;
    },
    syncSuccess: (state, action: PayloadAction<SyncResult>) => {
      state.inProgress = false;
      state.currentOperation = null;
      state.progress = 100;
      state.lastSync = new Date();
      state.lastResult = action.payload;
      state.pendingChanges = false;
      state.consecutiveFailures = 0;
      state.backedOff = false;
    },
    syncFailure: (state, action: PayloadAction<{ error: string }>) => {
      state.inProgress = false;
      state.currentOperation = null;
      state.progress = 0;
      state.consecutiveFailures += 1;
      state.backedOff = state.consecutiveFailures >= 3;
      state.lastResult = {
        success: false,
        errors: [action.payload.error],
      };
    },
    addConflict: (state, action: PayloadAction<SyncConflict>) => {
      state.conflicts.push(action.payload);
    },
    resolveConflict: (state, action: PayloadAction<{ id: string; resolution: 'local' | 'remote' | 'merged' }>) => {
      const conflict = state.conflicts.find((c) => c.itemId === action.payload.id);
      if (conflict) {
        conflict.resolution = action.payload.resolution;
      }
    },
    clearConflicts: (state) => {
      state.conflicts = [];
    },
    setPendingChanges: (state, action: PayloadAction<boolean>) => {
      state.pendingChanges = action.payload;
    },
    setAutoSync: (state, action: PayloadAction<boolean>) => {
      state.autoSyncEnabled = action.payload;
    },
    updateQueueSize: (state, action: PayloadAction<number>) => {
      state.queueSize = action.payload;
    },
    resetBackoff: (state) => {
      state.consecutiveFailures = 0;
      state.backedOff = false;
    },
  },
});

export const {
  startSync,
  updateProgress,
  syncSuccess,
  syncFailure,
  addConflict,
  resolveConflict,
  clearConflicts,
  setPendingChanges,
  setAutoSync,
  updateQueueSize,
  resetBackoff,
} = syncSlice.actions;

export default syncSlice.reducer;

// Selectors
export const selectSyncStatus = (state: { sync: SyncState }) => state.sync;
export const selectIsSyncing = (state: { sync: SyncState }) => state.sync.inProgress;
export const selectSyncProgress = (state: { sync: SyncState }) => state.sync.progress;
export const selectHasConflicts = (state: { sync: SyncState }) => state.sync.conflicts.length > 0;
/**
 * Data Management Redux Slice
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Asset, Vessel, Scan, DataQuery } from '../../types/data.types';

interface DataState {
  assets: Asset[];
  selectedAsset: Asset | null;
  selectedVessel: Vessel | null;
  selectedScan: Scan | null;
  isLoading: boolean;
  error: string | null;
  filters: DataQuery;
}

const initialState: DataState = {
  assets: [],
  selectedAsset: null,
  selectedVessel: null,
  selectedScan: null,
  isLoading: false,
  error: null,
  filters: {},
};

// Async thunks would go here for API calls
// For now, we'll just have the basic structure

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    setAssets: (state, action: PayloadAction<Asset[]>) => {
      state.assets = action.payload;
    },
    addAsset: (state, action: PayloadAction<Asset>) => {
      state.assets.push(action.payload);
    },
    updateAsset: (state, action: PayloadAction<{ id: string; updates: Partial<Asset> }>) => {
      const index = state.assets.findIndex((a) => a.id === action.payload.id);
      if (index !== -1) {
        state.assets[index] = { ...state.assets[index], ...action.payload.updates };
      }
    },
    deleteAsset: (state, action: PayloadAction<string>) => {
      state.assets = state.assets.filter((a) => a.id !== action.payload);
      if (state.selectedAsset?.id === action.payload) {
        state.selectedAsset = null;
      }
    },
    selectAsset: (state, action: PayloadAction<Asset | null>) => {
      state.selectedAsset = action.payload;
      state.selectedVessel = null;
      state.selectedScan = null;
    },
    selectVessel: (state, action: PayloadAction<Vessel | null>) => {
      state.selectedVessel = action.payload;
      state.selectedScan = null;
    },
    selectScan: (state, action: PayloadAction<Scan | null>) => {
      state.selectedScan = action.payload;
    },
    setFilters: (state, action: PayloadAction<DataQuery>) => {
      state.filters = action.payload;
    },
    clearData: (state) => {
      state.assets = [];
      state.selectedAsset = null;
      state.selectedVessel = null;
      state.selectedScan = null;
      state.filters = {};
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
});

export const {
  setAssets,
  addAsset,
  updateAsset,
  deleteAsset,
  selectAsset,
  selectVessel,
  selectScan,
  setFilters,
  clearData,
  setError,
  setLoading,
} = dataSlice.actions;

export default dataSlice.reducer;

// Selectors
export const selectAssets = (state: { data: DataState }) => state.data.assets;
export const selectSelectedAsset = (state: { data: DataState }) => state.data.selectedAsset;
export const selectSelectedVessel = (state: { data: DataState }) => state.data.selectedVessel;
export const selectSelectedScan = (state: { data: DataState }) => state.data.selectedScan;
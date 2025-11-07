/**
 * UI State Redux Slice
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
  timestamp: Date;
}

interface Modal {
  id: string;
  type: string;
  props?: Record<string, any>;
}

interface UIState {
  theme: 'light' | 'dark' | 'auto';
  sidebarOpen: boolean;
  notifications: Notification[];
  modals: Modal[];
  loading: {
    global: boolean;
    [key: string]: boolean;
  };
  errors: {
    [key: string]: string | null;
  };
}

const initialState: UIState = {
  theme: 'auto',
  sidebarOpen: true,
  notifications: [],
  modals: [],
  loading: {
    global: false,
  },
  errors: {},
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'auto'>) => {
      state.theme = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    showNotification: (state, action: PayloadAction<Omit<Notification, 'id' | 'timestamp'>>) => {
      const notification: Notification = {
        ...action.payload,
        id: Date.now().toString(),
        timestamp: new Date(),
      };
      state.notifications.push(notification);
    },
    dismissNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter((n) => n.id !== action.payload);
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    openModal: (state, action: PayloadAction<Omit<Modal, 'id'>>) => {
      const modal: Modal = {
        ...action.payload,
        id: Date.now().toString(),
      };
      state.modals.push(modal);
    },
    closeModal: (state, action: PayloadAction<string>) => {
      state.modals = state.modals.filter((m) => m.id !== action.payload);
    },
    closeAllModals: (state) => {
      state.modals = [];
    },
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.loading.global = action.payload;
    },
    setLoading: (state, action: PayloadAction<{ key: string; value: boolean }>) => {
      state.loading[action.payload.key] = action.payload.value;
    },
    setError: (state, action: PayloadAction<{ key: string; error: string | null }>) => {
      if (action.payload.error === null) {
        delete state.errors[action.payload.key];
      } else {
        state.errors[action.payload.key] = action.payload.error;
      }
    },
    clearErrors: (state) => {
      state.errors = {};
    },
  },
});

export const {
  setTheme,
  toggleSidebar,
  setSidebarOpen,
  showNotification,
  dismissNotification,
  clearNotifications,
  openModal,
  closeModal,
  closeAllModals,
  setGlobalLoading,
  setLoading,
  setError,
  clearErrors,
} = uiSlice.actions;

export default uiSlice.reducer;

// Selectors
export const selectTheme = (state: { ui: UIState }) => state.ui.theme;
export const selectSidebarOpen = (state: { ui: UIState }) => state.ui.sidebarOpen;
export const selectNotifications = (state: { ui: UIState }) => state.ui.notifications;
export const selectModals = (state: { ui: UIState }) => state.ui.modals;
export const selectIsGlobalLoading = (state: { ui: UIState }) => state.ui.loading.global;
export const selectLoadingState = (key: string) => (state: { ui: UIState }) => state.ui.loading[key] || false;
export const selectError = (key: string) => (state: { ui: UIState }) => state.ui.errors[key] || null;
/**
 * Authentication Redux Slice
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { User, Session, LoginCredentials, AuthState, AuthResponse } from '../../types/auth.types';
import authManager from '../../auth-manager';

// Initial state
const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  session: null,
  error: null,
};

// Async thunks
export const login = createAsyncThunk<
  AuthResponse<{ user: User; session: Session }>,
  LoginCredentials,
  { rejectValue: string }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const result = await authManager.login(
      credentials.email,
      credentials.password,
      credentials.rememberMe
    );

    if (!result.success) {
      return rejectWithValue(result.error || 'Login failed');
    }

    return {
      success: true,
      data: {
        user: result.user,
        session: {
          user: result.user,
          token: 'mock-token', // Will be replaced with real token
          expiresAt: new Date(Date.now() + 3600000), // 1 hour
        },
      },
    };
  } catch (error: any) {
    return rejectWithValue(error.message || 'Login failed');
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await authManager.logout();
  return null;
});

export const checkSession = createAsyncThunk<
  { user: User | null; session: Session | null },
  void,
  { rejectValue: string }
>('auth/checkSession', async (_, { rejectWithValue }) => {
  try {
    const session = await authManager.getSession();
    if (session) {
      const user = authManager.getCurrentUser();
      return {
        user,
        session: {
          user,
          token: 'mock-token',
          expiresAt: new Date(Date.now() + 3600000),
        },
      };
    }
    return { user: null, session: null };
  } catch (error: any) {
    return rejectWithValue(error.message);
  }
});

// Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.data?.user || null;
        state.session = action.payload.data?.session || null;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.session = null;
        state.error = action.payload || 'Login failed';
      });

    // Logout
    builder
      .addCase(logout.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.session = null;
        state.error = null;
      })
      .addCase(logout.rejected, (state) => {
        // Even if logout fails, clear the state
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.session = null;
        state.error = null;
      });

    // Check session
    builder
      .addCase(checkSession.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(checkSession.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.user && action.payload.session) {
          state.isAuthenticated = true;
          state.user = action.payload.user;
          state.session = action.payload.session;
        } else {
          state.isAuthenticated = false;
          state.user = null;
          state.session = null;
        }
      })
      .addCase(checkSession.rejected, (state) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.session = null;
      });
  },
});

// Export actions
export const { clearError, updateUser, setLoading } = authSlice.actions;

// Export reducer
export default authSlice.reducer;

// Selectors
export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectIsAuthenticated = (state: { auth: AuthState }) => state.auth.isAuthenticated;
export const selectIsAdmin = (state: { auth: AuthState }) =>
  state.auth.user?.role === 'admin';
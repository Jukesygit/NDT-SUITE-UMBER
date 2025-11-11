/**
 * Common Type Definitions
 * Shared across the NDT Suite application
 */

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  data?: T;
  error?: ApiError;
  success: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// UI State Types
// ============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T = any> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

// ============================================================================
// Form Types
// ============================================================================

export interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
}

export interface ValidationRule<T = any> {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: T) => boolean | string;
}

// ============================================================================
// Date & Time Types
// ============================================================================

export interface DateRange {
  start: Date | string;
  end: Date | string;
}

export type DateFormat = 'ISO' | 'US' | 'UK' | 'short' | 'long';

// ============================================================================
// Filter & Sort Types
// ============================================================================

export type SortDirection = 'asc' | 'desc';

export interface SortConfig<T = string> {
  field: T;
  direction: SortDirection;
}

export interface FilterConfig<T = any> {
  field: keyof T;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: any;
}

// ============================================================================
// File Upload Types
// ============================================================================

export interface FileUpload {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  url?: string;
  error?: string;
}

export interface DocumentInfo {
  url: string;
  name: string;
  size?: number;
  type?: string;
  uploadedAt?: string;
  uploadedBy?: string;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  action?: NotificationAction;
}

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

// ============================================================================
// Modal/Dialog Types
// ============================================================================

export interface ModalState {
  isOpen: boolean;
  data?: any;
}

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  destructive?: boolean;
}

// ============================================================================
// Permission Types
// ============================================================================

export type Permission =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'export'
  | 'manage_users';

export interface PermissionSet {
  resource: string;
  permissions: Permission[];
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make all properties required recursively
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Extract keys of a type that are of a specific type
 */
export type KeysOfType<T, TProp> = {
  [P in keyof T]: T[P] extends TProp ? P : never;
}[keyof T];

/**
 * Type-safe key-value pair
 */
export type KeyValuePair<T> = {
  [K in keyof T]: {
    key: K;
    value: T[K];
  };
}[keyof T];

/**
 * Awaited type for promises (for TypeScript < 4.5)
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

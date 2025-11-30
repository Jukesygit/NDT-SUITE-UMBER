/**
 * Authentication Type Definitions
 */

export enum UserRole {
  ADMIN = 'admin',
  ORG_ADMIN = 'org_admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export enum Permission {
  VIEW = 'view',
  CREATE = 'create',
  EDIT = 'edit',
  DELETE = 'delete',
  EXPORT = 'export',
  MANAGE_USERS = 'manage_users',
}

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  organizationId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastLogin?: Date;
  metadata?: Record<string, any>;
}

export interface Organization {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt?: Date;
  settings?: OrganizationSettings;
}

export interface OrganizationSettings {
  maxUsers?: number;
  features?: string[];
  customFields?: Record<string, any>;
}

export interface Profile extends User {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  avatar?: string;
  bio?: string;
  organization?: Organization;
}

export interface Session {
  user: User;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  session: Session | null;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  organizationId?: string;
  role?: UserRole;
}

export interface AccountRequest {
  id: string;
  email: string;
  username: string;
  organizationId: string;
  requestedRole: UserRole;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface AuthResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TokenPayload {
  sub: string; // User ID
  email: string;
  role: UserRole;
  org?: string; // Organization ID
  permissions: Permission[];
  iat: number; // Issued at
  exp: number; // Expiration
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
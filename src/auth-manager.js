/**
 * Re-export shim for backward compatibility.
 *
 * All logic has moved to src/auth/auth-manager.ts and its sub-modules.
 * This file ensures every existing import path continues to work:
 *   import authManager from '../auth-manager.js'
 *   import { ROLES, PERMISSIONS } from '../auth-manager.js'
 */

export { default, ROLES, PERMISSIONS, ROLE_PERMISSIONS } from './auth/auth-manager.ts';

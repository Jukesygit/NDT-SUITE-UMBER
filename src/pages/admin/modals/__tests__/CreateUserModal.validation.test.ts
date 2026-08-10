/**
 * Tests for CreateUserModal's validateForm password checks.
 *
 * Regression: the modal previously hand-rolled only length/case/number/special
 * checks, so server-only rejections (common passwords, password containing the
 * username or email local-part) produced an opaque 400. validateForm now defers
 * to the shared validatePasswordStrength validator, which covers those cases.
 */

import { describe, it, expect } from 'vitest';
import { validateForm } from '../CreateUserModal';

const baseData = {
  username: 'johnsmith',
  email: 'john@example.com',
  organizationId: 'org-1',
  role: 'viewer' as const,
};

describe('CreateUserModal validateForm — password', () => {
  it('rejects a strong password that contains the username', () => {
    const errors = validateForm({ ...baseData, password: 'Johnsmith2026!X' });
    expect(errors.password).toBeTruthy();
  });

  it('accepts a strong, unrelated password', () => {
    const errors = validateForm({ ...baseData, password: 'Xk9#mQ2$vLp7Wz' });
    expect(errors.password).toBeUndefined();
  });
});

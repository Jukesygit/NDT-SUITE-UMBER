import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    validatePasswordStrength,
    generateSecurePassword,
    hashPassword,
    RateLimiter,
    loginRateLimiter,
    PASSWORD_POLICY,
    RATE_LIMITS
} from './security.js';

describe('Security Module', () => {
    describe('validatePasswordStrength', () => {
        it('should reject empty passwords', () => {
            const result = validatePasswordStrength('');
            expect(result.isValid).toBe(false);
            expect(result.score).toBe(0);
            expect(result.feedback).toContain('Password is required');
        });

        it('should reject short passwords', () => {
            const result = validatePasswordStrength('Test123!');
            expect(result.isValid).toBe(false);
            expect(result.requirements.length).toBe(false);
            expect(result.feedback).toContain(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
        });

        it('should reject passwords without uppercase letters', () => {
            const result = validatePasswordStrength('testpassword123!');
            expect(result.requirements.uppercase).toBe(false);
            expect(result.feedback).toContain('Password must contain at least one uppercase letter');
        });

        it('should reject passwords without lowercase letters', () => {
            const result = validatePasswordStrength('TESTPASSWORD123!');
            expect(result.requirements.lowercase).toBe(false);
            expect(result.feedback).toContain('Password must contain at least one lowercase letter');
        });

        it('should reject passwords without numbers', () => {
            const result = validatePasswordStrength('TestPassword!');
            expect(result.requirements.numbers).toBe(false);
            expect(result.feedback).toContain('Password must contain at least one number');
        });

        it('should reject passwords without special characters', () => {
            const result = validatePasswordStrength('TestPassword123');
            expect(result.requirements.special).toBe(false);
            expect(result.feedback).toContain('Password must contain at least one special character');
        });

        it('should reject common passwords', () => {
            const result = validatePasswordStrength('Password123!');
            expect(result.requirements.notCommon).toBe(false);
            expect(result.feedback).toContain('This password is too common');
        });

        it('should reject passwords containing user info', () => {
            const userInfo = { username: 'john', email: 'john@example.com' };
            const result = validatePasswordStrength('John123!@#$%', userInfo);
            expect(result.requirements.noUserInfo).toBe(false);
            expect(result.feedback).toContain('Password should not contain your personal information');
        });

        it('should reject passwords with excessive consecutive characters', () => {
            const result = validatePasswordStrength('Testttt123!@#');
            expect(result.requirements.noConsecutive).toBe(false);
            expect(result.feedback).toContain('consecutive identical characters');
        });

        it('should accept strong passwords', () => {
            const result = validatePasswordStrength('MyStr0ng!Pass#2024');
            expect(result.isValid).toBe(true);
            expect(result.score).toBeGreaterThanOrEqual(PASSWORD_POLICY.minStrengthScore);
            expect(result.requirements.length).toBe(true);
            expect(result.requirements.uppercase).toBe(true);
            expect(result.requirements.lowercase).toBe(true);
            expect(result.requirements.numbers).toBe(true);
            expect(result.requirements.special).toBe(true);
            expect(result.requirements.notCommon).toBe(true);
        });

        it('should provide appropriate strength labels', () => {
            const passwords = [
                { pass: 'a', expected: 'Very Weak' },
                { pass: 'Test1!', expected: 'Very Weak' },
                { pass: 'TestPass123!', expected: 'Strong' },
                { pass: 'MyV3ry$tr0ng!P@ssw0rd', expected: 'Very Strong' }
            ];

            passwords.forEach(({ pass, expected }) => {
                const result = validatePasswordStrength(pass);
                expect(result.strength).toBe(expected);
            });
        });
    });

    describe('generateSecurePassword', () => {
        it('should generate password of specified length', () => {
            const password = generateSecurePassword(20);
            expect(password).toHaveLength(20);
        });

        it('should generate password with default length', () => {
            const password = generateSecurePassword();
            expect(password).toHaveLength(16);
        });

        it('should generate passwords that pass validation', () => {
            const password = generateSecurePassword(16);
            const result = validatePasswordStrength(password);
            expect(result.isValid).toBe(true);
        });

        it('should generate unique passwords', () => {
            const passwords = new Set();
            for (let i = 0; i < 100; i++) {
                passwords.add(generateSecurePassword());
            }
            expect(passwords.size).toBe(100);
        });

        it('should include all required character types', () => {
            const password = generateSecurePassword();
            expect(/[A-Z]/.test(password)).toBe(true); // uppercase
            expect(/[a-z]/.test(password)).toBe(true); // lowercase
            expect(/\d/.test(password)).toBe(true); // numbers
            // eslint-disable-next-line no-useless-escape
            expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true); // special
        });
    });

    describe('hashPassword', () => {
        it('should hash password with salt', async () => {
            const password = 'TestPassword123';
            const salt = 'randomsalt';
            const hash = await hashPassword(password, salt);

            expect(hash).toBeDefined();
            expect(typeof hash).toBe('string');
            expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
        });

        it('should produce consistent hashes for same input', async () => {
            const password = 'TestPassword123';
            const salt = 'randomsalt';

            const hash1 = await hashPassword(password, salt);
            const hash2 = await hashPassword(password, salt);

            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different passwords', async () => {
            const salt = 'randomsalt';
            const hash1 = await hashPassword('Password1', salt);
            const hash2 = await hashPassword('Password2', salt);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes for different salts', async () => {
            const password = 'TestPassword123';
            const hash1 = await hashPassword(password, 'salt1');
            const hash2 = await hashPassword(password, 'salt2');

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('RateLimiter', () => {
        let rateLimiter;
        const testConfig = {
            attempts: 3,
            windowMs: 1000, // 1 second
            blockDurationMs: 2000 // 2 seconds
        };

        beforeEach(() => {
            rateLimiter = new RateLimiter(testConfig);
        });

        it('should allow initial attempts', () => {
            const result = rateLimiter.isAllowed('test-key');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(2);
        });

        it('should track multiple attempts', () => {
            const key = 'test-key';

            let result = rateLimiter.isAllowed(key);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(2);

            result = rateLimiter.isAllowed(key);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(1);

            result = rateLimiter.isAllowed(key);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(0);
        });

        it('should block after exceeding attempts', () => {
            const key = 'test-key';

            // Use up all attempts
            for (let i = 0; i < testConfig.attempts; i++) {
                rateLimiter.isAllowed(key);
            }

            // Next attempt should be blocked
            const result = rateLimiter.isAllowed(key);
            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.blockedUntil).toBeDefined();
            expect(result.retryAfter).toBe(testConfig.blockDurationMs);
        });

        it('should reset attempts for different keys', () => {
            const result1 = rateLimiter.isAllowed('key1');
            expect(result1.allowed).toBe(true);
            expect(result1.remaining).toBe(2);

            const result2 = rateLimiter.isAllowed('key2');
            expect(result2.allowed).toBe(true);
            expect(result2.remaining).toBe(2);
        });

        it('should reset attempts after window expires', async () => {
            const key = 'test-key';

            // Use up all attempts
            for (let i = 0; i < testConfig.attempts; i++) {
                rateLimiter.isAllowed(key);
            }

            // Wait for window to expire
            await new Promise(resolve => setTimeout(resolve, testConfig.windowMs + 100));

            // Should be allowed again
            const result = rateLimiter.isAllowed(key);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(2);
        });

        it('should manually reset attempts', () => {
            const key = 'test-key';

            // Use some attempts
            rateLimiter.isAllowed(key);
            rateLimiter.isAllowed(key);

            // Reset
            rateLimiter.reset(key);

            // Should start fresh
            const result = rateLimiter.isAllowed(key);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(2);
        });

        it('should cleanup old entries', () => {
            const key = 'test-key';
            rateLimiter.isAllowed(key);

            // Cleanup should not affect recent entries
            rateLimiter.cleanup();
            const result = rateLimiter.isAllowed(key);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(1);
        });
    });

    describe('Global Rate Limiters', () => {
        it('should have login rate limiter configured', () => {
            expect(loginRateLimiter).toBeDefined();
            expect(loginRateLimiter.config).toEqual(RATE_LIMITS.login);
        });

        it('login rate limiter should work correctly', () => {
            const email = 'test@example.com';
            const result = loginRateLimiter.isAllowed(email);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBeLessThan(RATE_LIMITS.login.attempts);
        });
    });
});
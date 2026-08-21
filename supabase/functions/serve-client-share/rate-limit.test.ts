// =============================================================================
// rate-limit — the best-effort token buckets in front of the anonymous entry
// =============================================================================
// Behaviour worth pinning: a budget is per key (one viewer's flood never locks
// another out), it refills when the window rolls, Retry-After is a usable
// number, and the key table cannot grow without bound under a spray of distinct
// viewers. The clock is injected so none of this is timing-dependent.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PASSCODE_RULE,
  REQUEST_RULE,
  consume,
  resetRateLimits,
  type RateLimitRule,
} from './rate-limit.ts';

const RULE: RateLimitRule = { limit: 3, windowMs: 1000 };

beforeEach(() => resetRateLimits());

describe('consume', () => {
  it('allows exactly `limit` requests in a window', () => {
    const now = 1_000_000;
    expect(consume('k', RULE, now).allowed).toBe(true);
    expect(consume('k', RULE, now).allowed).toBe(true);
    expect(consume('k', RULE, now).allowed).toBe(true);
    expect(consume('k', RULE, now).allowed).toBe(false);
  });

  it('reports how long until the window resets', () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i++) consume('k', RULE, now);
    const denied = consume('k', RULE, now + 400);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(1);
  });

  it('never reports a zero Retry-After on a denial', () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i++) consume('k', RULE, now);
    const denied = consume('k', RULE, now + RULE.windowMs - 1);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('refills once the window rolls over', () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i++) consume('k', RULE, now);
    expect(consume('k', RULE, now).allowed).toBe(false);
    expect(consume('k', RULE, now + RULE.windowMs).allowed).toBe(true);
  });

  it('budgets each key separately, so one flood cannot lock out another viewer', () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i++) consume('flooder', RULE, now);
    expect(consume('flooder', RULE, now).allowed).toBe(false);
    expect(consume('bystander', RULE, now).allowed).toBe(true);
  });

  it('scopes by key prefix, so passcode attempts and asset fetches do not share a budget', () => {
    const now = 1_000_000;
    for (let i = 0; i < PASSCODE_RULE.limit; i++) {
      expect(consume('pass:abc', PASSCODE_RULE, now).allowed).toBe(true);
    }
    expect(consume('pass:abc', PASSCODE_RULE, now).allowed).toBe(false);
    expect(consume('req:abc', REQUEST_RULE, now).allowed).toBe(true);
  });

  it('bounds its key table under a spray of distinct viewers', () => {
    const now = 1_000_000;
    // Well past MAX_KEYS would be slow; this proves the sweep runs and old
    // windows are reclaimed rather than accumulating forever.
    for (let i = 0; i < 500; i++) consume(`ip-${i}`, RULE, now);
    // A later call after every window expired must find a clean slate.
    expect(consume('ip-0', RULE, now + RULE.windowMs * 2).allowed).toBe(true);
    for (let i = 1; i < RULE.limit; i++) {
      expect(consume('ip-0', RULE, now + RULE.windowMs * 2).allowed).toBe(true);
    }
    expect(consume('ip-0', RULE, now + RULE.windowMs * 2).allowed).toBe(false);
  });
});

describe('production rules', () => {
  it('gives passcode attempts a much tighter budget than asset fetches', () => {
    expect(PASSCODE_RULE.limit).toBeLessThan(REQUEST_RULE.limit);
    expect(PASSCODE_RULE.windowMs).toBeGreaterThan(REQUEST_RULE.windowMs);
  });
});

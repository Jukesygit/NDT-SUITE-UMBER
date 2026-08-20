/**
 * Best-effort rate limiting for the one anonymous entry point.
 *
 * In-isolate token buckets. Honest about what that is: Supabase runs a small
 * number of edge isolates per region and recycles them, so this bounds a single
 * attacker's throughput by a large factor but is NOT a distributed guarantee —
 * a burst spread across cold isolates sees a fresh budget. It is deliberately
 * not backed by a table: a durable limiter would need an anonymous-triggered
 * write path, and the thing it protects (a 128-bit token, plus a PBKDF2 passcode
 * at 210k iterations) is already expensive to guess and expensive to test.
 *
 * If abuse ever shows up in the view audit, the upgrade is a service-role-written
 * counter table keyed by ip_hash — the same hash the audit already stores.
 *
 * Keys are the SALTED IP HASH, never the address: nothing in this module can
 * become a log of who visited.
 */

interface Bucket {
  /** Tokens remaining in the current window. */
  tokens: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
}

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in ms. */
  windowMs: number;
}

/** Overall requests from one viewer — generous: a bundle is many assets. */
export const REQUEST_RULE: RateLimitRule = { limit: 240, windowMs: 60_000 };

/** Passcode attempts from one viewer — tight: this is the guessable secret. */
export const PASSCODE_RULE: RateLimitRule = { limit: 10, windowMs: 10 * 60_000 };

/** Hard cap on tracked keys, so a spray of distinct IPs cannot grow the heap. */
const MAX_KEYS = 10_000;

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still oversized after expiry (a live flood): drop the oldest windows. The
  // cost of being wrong here is a viewer getting a fresh budget, not a leak.
  if (buckets.size > MAX_KEYS) {
    const ordered = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of ordered.slice(0, buckets.size - MAX_KEYS)) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets — fed to the Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Consume one token for `key` under `rule`.
 *
 * @param key  A salted IP hash (never a raw address) plus a scope prefix.
 * @param now  Injectable clock, so the behaviour is testable.
 */
export function consume(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { tokens: rule.limit - 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.tokens <= 0) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.tokens -= 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test seam — drops all tracked windows. */
export function resetRateLimits(): void {
  buckets.clear();
}

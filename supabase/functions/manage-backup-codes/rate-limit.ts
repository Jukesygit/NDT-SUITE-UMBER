/**
 * Best-effort throttling for backup-code operations.
 *
 * In-isolate token buckets, and honest about the limits of that: Supabase runs
 * several edge isolates per region and recycles them, so this bounds one
 * attacker's throughput by a large factor but is NOT a distributed guarantee — a
 * burst spread across cold isolates sees a fresh budget. It is deliberately not
 * table-backed: the durable version would need a write path on an unauthenticated-
 * ish hot path, and the thing being protected already costs 40 bits of entropy
 * plus a PBKDF2 pass per attempt.
 *
 * Keys are the caller's user id, which this function already knows from the
 * verified JWT. Nothing here records an IP address.
 *
 * This mirrors serve-client-share/rate-limit.ts rather than importing it: edge
 * functions bundle per directory, and reaching sideways into another function's
 * folder would couple two independently deployed units.
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

/**
 * Redemption attempts. Tight, because this is the guessable secret — though a
 * legitimate user fumbling a transcription needs a few tries.
 */
export const REDEEM_RULE: RateLimitRule = { limit: 10, windowMs: 10 * 60_000 };

/**
 * Minting attempts. Nobody needs to reissue their codes often, and each attempt
 * costs ten PBKDF2 derivations, so this is both an abuse and a CPU guard.
 */
export const MINT_RULE: RateLimitRule = { limit: 5, windowMs: 10 * 60_000 };

/** Hard cap on tracked keys, so a spray of distinct callers cannot grow the heap. */
const MAX_KEYS = 10_000;

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Still oversized after expiry (a live flood): drop the oldest windows. The
  // cost of being wrong here is someone getting a fresh budget, not a leak.
  if (buckets.size > MAX_KEYS) {
    const ordered = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of ordered.slice(0, buckets.size - MAX_KEYS)) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

/**
 * Consume one token for `key` under `rule`.
 *
 * @param key A scope prefix plus the verified user id.
 * @param now Injectable clock, so the behaviour is testable.
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

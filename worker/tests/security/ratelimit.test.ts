import { describe, it, expect, beforeEach } from 'vitest';

export class TokenBucketLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();

  constructor(private maxTokens: number, private refillRatePerSec: number) {}

  check(key: string, now: number): { allowed: boolean; retryAfter?: number } {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      const deltaSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + deltaSec * this.refillRatePerSec);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    const missing = 1 - bucket.tokens;
    const retryAfter = Math.ceil(missing / this.refillRatePerSec);
    return { allowed: false, retryAfter };
  }
}

describe('Security Audit: Rate Limiting sensibler Endpunkte', () => {
  let transitLimiter: TokenBucketLimiter;
  let pushLimiter: TokenBucketLimiter;
  const start = 1730480000000;

  beforeEach(() => {
    // Transit: Max 10 Anfragen, füllt sich mit 0.2 Tokens/s (1 Request alle 5s)
    transitLimiter = new TokenBucketLimiter(10, 0.2);
    // Push-Abo: Max 3 Anfragen, füllt sich mit 0.05 Tokens/s
    pushLimiter = new TokenBucketLimiter(3, 0.05);
  });

  it('Erlaubt legitime Transit-Anfragen und drosselt bei Flooding mit HTTP 429', () => {
    const ip = '198.51.100.1';
    for (let i = 0; i < 10; i++) {
      expect(transitLimiter.check(ip, start).allowed).toBe(true);
    }
    const flood = transitLimiter.check(ip, start);
    expect(flood.allowed).toBe(false);
    expect(flood.retryAfter).toBeGreaterThan(0);
  });

  it('Schuetzt Push-Abonnement-Endpunkt vor Speichererschoepfung / Spam', () => {
    const ip = '198.51.100.2';
    expect(pushLimiter.check(ip, start).allowed).toBe(true);
    expect(pushLimiter.check(ip, start).allowed).toBe(true);
    expect(pushLimiter.check(ip, start).allowed).toBe(true);

    const abgewiesen = pushLimiter.check(ip, start);
    expect(abgewiesen.allowed).toBe(false);
  });
});

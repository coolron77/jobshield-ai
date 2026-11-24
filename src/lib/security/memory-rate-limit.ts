/**
 * In-process sliding-window limiter. Used only for the public, rules-only
 * demo endpoint (no AI cost) and in tests. Authenticated, expensive routes use
 * the database-backed limiter (check_rate_limit RPC), which is shared across
 * serverless instances.
 */
export class MemoryRateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly maxKeys = 10_000,
  ) {}

  /** Returns 0 if allowed, otherwise the number of seconds to wait. */
  check(key: string): number {
    const t = this.now();
    this.sweep(t);
    const recent = (this.hits.get(key) ?? []).filter((ts) => t - ts < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] as number;
      return Math.max(1, Math.ceil((this.windowMs - (t - oldest)) / 1000));
    }
    recent.push(t);
    this.hits.set(key, recent);
    return 0;
  }

  private sweep(t: number) {
    if (t - this.lastSweep < this.windowMs && this.hits.size < this.maxKeys) return;
    this.lastSweep = t;
    for (const [k, v] of this.hits) {
      if (v.every((ts) => t - ts >= this.windowMs)) this.hits.delete(k);
    }
    // Hard cap on memory: drop oldest keys if still too many
    if (this.hits.size >= this.maxKeys) {
      const excess = this.hits.size - Math.floor(this.maxKeys * 0.9);
      let i = 0;
      for (const k of this.hits.keys()) {
        if (i++ >= excess) break;
        this.hits.delete(k);
      }
    }
  }
}

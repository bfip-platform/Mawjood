// ── exponential backoff (F-SEC-08) ─────────────────────────────────────────
// Replaces the single fixed 1.5s retry on provider 429/503s: delays grow
// exponentially (base × 2^attempt) with a small jitter so concurrent
// clients don't retry in lockstep, capped so a request never waits forever.

/** Delay before retry number `attempt` (0-based). Pure with injectable rand. */
export function retryDelayMs(
  attempt: number,
  baseMs = 600,
  capMs = 8000,
  rand: () => number = Math.random,
): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  return exp + Math.floor(rand() * 250);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

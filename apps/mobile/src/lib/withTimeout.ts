/**
 * Race a promise against a deadline. Resolves `null` on timeout — the
 * underlying promise keeps running in the background (callers treat null
 * as "not ready yet; use the fallback and let any late completion
 * self-heal"). Rejects if the promise itself rejects first.
 *
 * Boot-path network calls go through this so a stalled connection can
 * never wedge the first paint indefinitely: React Native fetches have
 * no default timeout, so an unresponsive network can hang an awaited
 * getSession()/query effectively forever (the app sits on its loading
 * screen — the "freezes on startup, sometimes" report).
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}


/** Outcome of a bounded list/page load (Product Foundation wave). */
export type BoundedLoad<T> =
  | { status: 'ok'; value: T }
  | { status: 'timeout' }
  | { status: 'error'; error: unknown };

/**
 * Run a load promise under a deadline and classify the outcome instead of
 * throwing: 'ok' with the value, 'timeout' when the deadline wins, or
 * 'error' with the rejection. List loaders use this so a stalled network
 * becomes a visible, retryable error state — never an eternal spinner and
 * never a silent empty list. The underlying promise keeps running in the
 * background; callers guard against stale completions (sequence guards).
 */
export async function boundedLoad<T>(p: Promise<T>, ms: number): Promise<BoundedLoad<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.then(
        (value) => ({ status: 'ok' as const, value }),
        (error: unknown) => ({ status: 'error' as const, error }),
      ),
      new Promise<BoundedLoad<T>>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'timeout' }), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Like withTimeout, but preserves the distinction between a real null result
 * and a deadline. This is useful for chat, where null means "use the legacy
 * fallback" while a timeout must surface an error instead.
 */
export async function withTimeoutResult<T>(
  p: Promise<T>,
  ms: number,
): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

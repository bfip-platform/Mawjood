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

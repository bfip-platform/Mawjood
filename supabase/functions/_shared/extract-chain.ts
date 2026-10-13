// Retried fire-and-forget chaining to the extract function
// (F-INT-07 closure). transcribe and chat both hand notes to extract;
// the original one-shot fetch with a swallowed .catch(() => {}) could
// strand a note unextracted forever with no trace. This helper keeps
// the fire-and-forget shape (callers do not await it) but retries the
// POST with backoff and reports FINAL failure through the caller's
// ops logger, so a stranded note is visible and re-runnable (the
// transcript itself is never at risk).

import { internalHeaders } from './edge-auth.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST { note_id } to extract, up to 3 attempts (0.5s, 1.5s backoff).
 * Resolves true on the first 2xx; on final failure calls onFailure
 * (if given) and resolves false. Never throws.
 */
export async function chainToExtract(
  noteId: string,
  onFailure?: (noteId: string) => void | Promise<void>,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const base = Deno.env.get('SUPABASE_URL');
  if (!base || !noteId) {
    if (onFailure) { try { await onFailure(noteId); } catch { /* ignore */ } }
    return false;
  }
  const delays = [0, 500, 1500];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);
    try {
      const res = await fetchFn(`${base}/functions/v1/extract`, {
        method: 'POST',
        headers: internalHeaders(),
        body: JSON.stringify({ note_id: noteId }),
      });
      if (res.ok) return true;
    } catch { /* retry below */ }
  }
  if (onFailure) { try { await onFailure(noteId); } catch { /* ignore */ } }
  return false;
}

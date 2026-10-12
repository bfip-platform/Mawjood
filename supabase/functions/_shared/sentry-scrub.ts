/**
 * Sentry event scrubber (D3 T-D3-3) — the single choke point every
 * error report passes through before it may leave the device/server.
 *
 * Rules (design: docs/autonomous/d3/OBSERVABILITY.md):
 *  - NEVER send user content: note text, transcripts, photo URLs, chat
 *    messages. Error reports carry the error CLASS + stack shape, not
 *    payloads. String values are therefore hard-capped and stripped of
 *    credential-shaped substrings (Bearer tokens, JWTs, emails).
 *  - Keys matching credential patterns are redacted wholesale, at any
 *    depth (extra, contexts, breadcrumbs, tags, request headers).
 *  - URLs keep scheme+host+path; query strings (signed URLs carry
 *    tokens) are dropped.
 *
 * Pure and dependency-free so the mobile client, edge functions, and
 * tests all run the identical code.
 */

const SENSITIVE_KEY = /(token|secret|password|passwd|authorization|auth_key|apikey|api_key|cookie|session|bearer|credential|private_key|service_role|anon_key)/i;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MAX_STRING = 300;
const MAX_DEPTH = 5;

export function scrubString(s: string): string {
  return s
    .replace(BEARER_RE, 'Bearer [redacted]')
    .replace(JWT_RE, '[jwt]')
    .replace(EMAIL_RE, '[email]')
    .slice(0, MAX_STRING);
}

export function scrubUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return scrubString(u);
  }
}

// deno-lint-ignore no-explicit-any
export function scrubValue(value: any, keyHint = '', depth = 0): any {
  if (SENSITIVE_KEY.test(keyHint)) return '[redacted]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return /url/i.test(keyHint) ? scrubUrl(value) : scrubString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrubValue(v, keyHint, depth + 1));
  if (typeof value === 'object') {
    // deno-lint-ignore no-explicit-any
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v, k, depth + 1);
    return out;
  }
  return undefined;
}

/**
 * Sentry `beforeSend` hook shape (works for the JS SDK on mobile/web
 * and for a manual edge-function reporter): returns the scrubbed event.
 * Also drops the request body and any user identity beyond an opaque id
 * hash the caller provides — by default the user object is removed.
 */
// deno-lint-ignore no-explicit-any
export function scrubSentryEvent(event: any): any {
  const scrubbed = scrubValue(event);
  if (scrubbed && typeof scrubbed === 'object') {
    delete scrubbed.user;
    if (scrubbed.request) {
      delete scrubbed.request.data;
      delete scrubbed.request.cookies;
    }
  }
  return scrubbed;
}

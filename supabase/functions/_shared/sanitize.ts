// ── telemetry text sanitizer (F-SEC-07) ────────────────────────────────────
// report-error's own contract is "error CLASS only, never user content",
// but it stored the client's raw message/stack/context verbatim — and
// client error strings routinely embed user content (note text in error
// messages, data in URLs) and occasionally credentials (a URL or header
// echoed into an error). This sanitizer keeps the diagnostic shape while
// stripping what must never land in ops_events:
//   · control / bidi / zero-width characters (log injection, spoofing)
//   · bearer tokens, JWTs, email addresses, long hex secrets
//   · URL query values (a classic place for tokens + user data to ride)
// then collapses whitespace and caps the length. Pure + unit-tested.

export function sanitizeTelemetryText(raw: unknown, maxLen: number): string {
  let s = typeof raw === 'string' ? raw : String(raw ?? '');
  // deno-lint-ignore no-control-regex
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ');
  s = s.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
  s = s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[jwt]');
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  s = s.replace(/([?&])[A-Za-z0-9_-]+=[^&\s]+/g, '$1[redacted]');
  s = s.replace(/\b[0-9a-f]{32,}\b/gi, '[hex]');
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, maxLen);
}

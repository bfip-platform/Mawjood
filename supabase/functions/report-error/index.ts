// report-error — Phase E P2-1: client crash/error telemetry.
//
// The app's global error handler POSTs here (fire-and-forget).
// Stored in ops_events as kind='client.error'. F-SEC-07: the text is
// SANITIZED before storage (credentials, emails, URL query values and
// control characters stripped — see _shared/sanitize.ts), but it is
// still free text at its core, not an error-class enum; treat stored
// rows as untrusted content in any viewer. Tight-ish rate limits: a
// crash loop must not spam the table.

import { adminClient, authUserId, json401 } from '../_shared/edge-auth.ts';
import { checkRateLimit, rateLimitMessage } from '../_shared/rate-limit.ts';
import { logOps, newRequestId } from '../_shared/log.ts';
import { sanitizeTelemetryText } from '../_shared/sanitize.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = adminClient();

  try {
    const userId = await authUserId(req);
    if (!userId) return json401();

    const rl = await checkRateLimit(supabase, userId, 'report-error');
    if (!rl.allowed) {
      return new Response(JSON.stringify({ ok: false, error: rateLimitMessage(true) }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    let message = '';
    let stack: string | null = null;
    let context: string | null = null;
    try {
      const b = await req.json();
      // F-SEC-07: the header contract is "error class only, never user
      // content" — sanitize before storage (control chars, tokens,
      // emails, URL query values) and cap tighter than the raw slices.
      message = sanitizeTelemetryText(b?.message ?? '', 200);
      stack = b?.stack ? sanitizeTelemetryText(b.stack, 500) : null;
      context = b?.context ? sanitizeTelemetryText(b.context, 100) : null;
    } catch { /* empty body */ }
    if (!message) {
      return new Response(JSON.stringify({ ok: false, error: 'message required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    await logOps(supabase, {
      user_id: userId, request_id: newRequestId(),
      kind: 'client.error', ok: false, detail: message,
      meta: { stack, context },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

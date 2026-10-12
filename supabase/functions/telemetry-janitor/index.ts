// telemetry-janitor — D3 T-D3-2: retention sweeps for OPERATIONAL
// telemetry tables ONLY (rate_limits / ai_events / ops_events — the
// allowlist lives in ../_shared/janitor.ts and is test-pinned; user
// data tables are structurally unreachable from here).
//
// Auth: service_role Bearer or x-cron-secret (same posture as
// memory-consolidate). NEVER callable from the client.
// Modes: default = dry-run (counts only, still reported to ops_events).
// Real deletion requires BOTH ?execute=1 AND env JANITOR_ENABLED=1 —
// disabled by default (roadmap D3 recovery rule).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runJanitor } from '../_shared/janitor.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const auth = req.headers.get('Authorization') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const cronHeader = req.headers.get('x-cron-secret') ?? '';
    const okService = !!key && auth === `Bearer ${key}`;
    const okCron = !!cronSecret && cronHeader === cronSecret;
    if (!okService && !okCron) throw new Error('forbidden');

    const url = new URL(req.url);
    const wantExecute = url.searchParams.get('execute') === '1';
    const enabled = Deno.env.get('JANITOR_ENABLED') === '1';
    const execute = wantExecute && enabled;

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, key);
    const results = await runJanitor(supa, { execute });
    const report = { execute, enabled, results };

    try {
      await supa.from('ops_events').insert({
        kind: execute ? 'telemetry.janitor' : 'telemetry.janitor.dry_run',
        ok: true,
        meta: report,
      });
    } catch { /* the report still returns to the caller */ }

    return new Response(JSON.stringify(report), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === 'forbidden' ? 403 : 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

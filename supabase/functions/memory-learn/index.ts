// ── 🧠 memory-learn: implicit learning ("التطبيق بيتعلم زي Muse") ──────────
// Called fire-and-forget after EVERY chat turn with:
//   { user_text, assistant_text, ui_lang }
// One cheap model call extracts DURABLE facts → upserts them into the user's
// private memory store (same items kind='memory' + mkey dedupe as the
// client's explicit "ناديني X" parser). Never blocks the reply; never throws
// to the caller (best-effort by design).
//
// Privacy: owner-only (user JWT, private space). The extraction prompt has a
// hard rule — secrets/codes/passwords are NEVER memorized.

import { aiConfig, chatBody } from '../_shared/ai.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminClient } from '../_shared/edge-auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { chargeModelCall, byteLen } from '../_shared/spend.ts';
import { logAi, logOps, newRequestId } from '../_shared/log.ts';
import {
  learnSystem,
  parseLearned,
  upsertFacts,
  loadFacts,
  privateSpaceId,
} from '../_shared/memory.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callModel(ai: any, system: string, user: string, gate?: { supa: any; userId: string }): Promise<string> {
  // 💸 atomic per-attempt charge (0044), measured on the assembled
  // system + user payload. Denial throws __SPEND_CAP__ — the caller
  // treats it as a silent skip (learning is best-effort by design).
  if (gate) {
    const g = await chargeModelCall(gate.supa, gate.userId, {
      inputBytes: byteLen(system) + byteLen(user), maxOutTokens: 500,
    });
    if (!g.allowed) throw new Error('__SPEND_CAP__');
  }
  const r = await fetch(`${ai.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(chatBody(ai, {
      max_tokens: 500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })),
  });
  if (!r.ok) throw new Error(`model ${r.status}`);
  const j = await r.json();
  return (j.choices?.[0]?.message?.content ?? '').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { user_text, assistant_text, ui_lang, vault_mode } = await req.json();
    // 🧠 governance invariant: NOTHING is ever learned from vault sessions.
    if (vault_mode) return new Response(JSON.stringify({ learned: 0, skipped: 'vault' }), { headers: cors });
    const t = String(user_text ?? '').slice(0, 800).trim();
    const a = String(assistant_text ?? '').slice(0, 800).trim();
    if (!t || !a) return new Response(JSON.stringify({ learned: 0 }), { headers: cors });

    const auth = req.headers.get('Authorization') ?? '';
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await supa.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) throw new Error('not authenticated');

    const pid = await privateSpaceId(supa);
    if (!pid) throw new Error('no private space');

    const admin = adminClient();
    const requestId = newRequestId();

    // Phase E P2-2: idempotency — the client fires this after EVERY turn and
    // retries are cheap, so dedupe identical (user, assistant) pairs within
    // 24h. The content hash lives in ops_events.detail (never the content).
    const hashBuf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${userId}\n${t}\n${a}`),
    );
    const hash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const { data: seen } = await admin
      .from('ops_events')
      .select('id')
      .eq('kind', 'memory_learned')
      .eq('detail', hash)
      .gt('created_at', new Date(Date.now() - 24 * 3600000).toISOString())
      .limit(1)
      .maybeSingle();
    if (seen) {
      await logOps(admin, { user_id: userId, request_id: requestId, kind: 'memory_learn.deduped', ok: true });
      return new Response(JSON.stringify({ learned: 0, deduped: true }), { headers: cors });
    }

    // Phase E P1-10: learning is an AI call too — quota it.
    const rl = await checkRateLimit(admin, userId, 'memory-learn');
    if (!rl.allowed) {
      return new Response(JSON.stringify({ learned: 0, error: 'rate_limited' }), {
        status: 429,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const existing = await loadFacts(supa, pid);
    const ai = aiConfig();
    const t0 = Date.now();
    const raw = await callModel(
      ai,
      learnSystem(existing, ui_lang !== 'en'),
      `user: ${t}\nassistant: ${a}`,
      { supa: admin, userId },
    );
    await logAi(admin, {
      user_id: userId, request_id: requestId, fn: 'memory-learn',
      provider: ai.provider, model: ai.chatModel, latency_ms: Date.now() - t0,
    });
    const facts = parseLearned(raw);
    if (facts.length === 0) {
      return new Response(JSON.stringify({ learned: 0 }), { headers: cors });
    }
    // D1 (spec §4): no pruneFacts — overflow NEVER deletes. When an owner-set
    // cap exists, upsertFacts blocks new saves and reports `blocked`; with no
    // cap configured (OD-01/02 open) behavior is unchanged.
    const { saved, updated, blocked } = await upsertFacts(supa, pid, userId, facts, 'learned');
    await logOps(admin, {
      user_id: userId, request_id: requestId,
      kind: 'memory_learned', ok: true, detail: hash,
      meta: { saved, updated, blocked },
    });
    return new Response(JSON.stringify({ learned: saved + updated, saved, updated, blocked }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    // best-effort: the chat reply already went out; learning must never fail it
    return new Response(JSON.stringify({ learned: 0, error: e instanceof Error ? e.message : 'unknown' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

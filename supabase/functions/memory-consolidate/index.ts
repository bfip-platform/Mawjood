// ── 🧠 memory-consolidate: nightly memory GARDENER (D1 redesign) ────────────
// Runs once a day (cron, service_role). For every user active in the last
// 24h it:
//   1. writes a daily EPISODE ("ملخص ٢٧ سبتمبر: ...") from today's notes —
//      the "what happened today" layer, like Muse's daily logs
//   2. surfaces near-duplicate facts as review candidates (spec §6) — the
//      only auto-action is trashing byte-identical RETRY duplicates
//      (same mkey + same text + created within 24h), which is recoverable
//   3. applies VISIBILITY decay (spec §3): stale low-importance facts get a
//      retrieval penalty + review-queue flag — metadata only
//   4. purges memory trash whose 30-day window expired (decision #6) — the
//      only hard delete, and only of rows the user already trashed
//
// DURABILITY CONTRACT (decision #1/#7): this job NEVER hard-deletes a live
// memory. The old 90-day decay delete and the 200-fact cap prune are gone;
// quota is enforced at the write path by blocking new saves (spec §4).
//
// Auth: service_role Bearer, or x-cron-secret == CRON_SECRET env (nightly
// cron). Never callable from the client. Trigger: POST with empty body.

import { aiConfig, chatBody } from '../_shared/ai.ts';
import { timingSafeEqual } from '../_shared/edge-auth.ts';
import { chargeModelCall } from '../_shared/spend.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  loadFacts,
  upsertFacts,
  applyMemoryMaintenance,
  planMemoryMaintenance,
  listTrashedFacts,
  trashFact,
  purgeExpiredTrashedFacts,
  normAr,
  factLine,
} from '../_shared/memory.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callModel(ai: any, system: string, user: string, gate?: { supa: any; userId: string }): Promise<string> {
  // 💸 atomic charge (0044) per user — the nightly episode summary is
  // real per-user AI spend. Denial throws __SPEND_CAP__; the per-user
  // try/catch treats it as a best-effort skip, like any model failure.
  if (gate) {
    const g = await chargeModelCall(gate.supa, gate.userId, {
      inputChars: system.length + user.length, maxOutTokens: 400,
    });
    if (!g.allowed) throw new Error('__SPEND_CAP__');
  }
  const r = await fetch(`${ai.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(chatBody(ai, {
      max_tokens: 400,
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

const EPISODE_SYSTEM = `You write a ONE-paragraph daily diary summary (2-4 sentences) of what the user did today, in Levantine Arabic. Only durable, meaningful events: appointments kept, things bought, people met, decisions made. Skip trivia. Reply with ONLY the paragraph, no title, no bullets. If there is nothing meaningful, reply with exactly: NOTHING`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const auth = req.headers.get('Authorization') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const cronHeader = req.headers.get('x-cron-secret') ?? '';
    const okService = !!key && timingSafeEqual(auth, `Bearer ${key}`);
    const okCron = !!cronSecret && timingSafeEqual(cronHeader, cronSecret);
    if (!okService && !okCron) throw new Error('forbidden');

    const supa = createClient(Deno.env.get('SUPABASE_URL')!, key);
    const ai = aiConfig();
    // D2 (spec §6.3): ?dry_run=1 computes the full report — including
    // the would-flag / would-merge / would-purge sets — without a
    // single write (no model call, no trash, no purge).
    const dryRun = new URL(req.url).searchParams.get('dry_run') === '1';
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const todayStr = new Date().toISOString().slice(0, 10);

    // users active in the last 24h (note authors)
    // NOTE: notes.deleted_at was dropped in migration 0019 (trash moved to
    // trash_bin) — filtering on it made PostgREST error and this job
    // silently process ZERO users on main. All rows in notes are live.
    const { data: recent } = await supa
      .from('notes')
      .select('created_by')
      .gte('created_at', since)
      .limit(2000);
    const userIds = [...new Set((recent ?? []).map((r: any) => r.created_by).filter(Boolean))];

    const report: Record<string, any> = { users: userIds.length, episodes: 0, merged: 0, duplicate_candidates: 0, rescored: 0, review_flagged: 0, trash_purged: 0, dry_run: dryRun };

    for (const uid of userIds) {
      // private space of this user
      const { data: sp } = await supa.from('spaces').select('id').eq('type', 'private').eq('owner_id', uid).limit(1).maybeSingle();
      const pid = (sp as any)?.id;
      if (!pid) continue;

      // 1) daily episode from today's notes
      const { data: notes } = await supa
        .from('notes')
        .select('transcript, created_at')
        .eq('created_by', uid)
        .gte('created_at', since)
        .order('created_at')
        .limit(40);
      const texts = (notes ?? []).map((n: any) => String(n.transcript ?? '').slice(0, 200)).filter((s: string) => s.trim());
      if (texts.length > 0 && !dryRun) {
        try {
          const summary = await callModel(ai, EPISODE_SYSTEM, texts.join('\n'), { supa, userId: uid });
          if (summary && summary !== 'NOTHING' && summary.length > 20) {
            const { saved } = await upsertFacts(supa, pid, uid, [{
              content: summary.slice(0, 500),
              mkey: `episode:${todayStr}`,
              mcat: 'episode',
              importance: 3,
            }], 'episode');
            report.episodes += saved;
          }
        } catch { /* best effort per user */ }
      }

      // 2) near-duplicates (same normalized content): SURFACE as review
      // candidates — never auto-merge/delete (spec §6.1). Sole exception:
      // byte-identical retry duplicates (same mkey, created within 24h) go
      // to TRASH (recoverable, auditable) — still never hard-deleted.
      const facts = await loadFacts(supa, pid);
      const seen = new Map<string, any>();
      for (const f of facts) {
        if (f.meta?.mcat === 'episode') continue;
        if (f.meta?.mcat === 'route') continue; // routing rules only change via corrections
        const k = normAr(factLine(f));
        const prev = seen.get(k);
        if (prev) {
          const keepNewer = new Date(f.updated_at) >= new Date(prev.updated_at);
          const keep = keepNewer ? f : prev;
          const drop = keepNewer ? prev : f;
          const sameKey = String(drop.meta?.mkey ?? '') !== '' && drop.meta?.mkey === keep.meta?.mkey;
          const within24h = Math.abs(new Date(keep.created_at).getTime() - new Date(drop.created_at).getTime()) <= 24 * 3600 * 1000;
          if (sameKey && within24h) {
            if (dryRun) report.merged++;
            else if (await trashFact(supa, drop, 'duplicate_retry')) report.merged++;
          } else {
            report.duplicate_candidates++;
          }
          seen.set(k, keep);
        } else {
          seen.set(k, f);
        }
      }

      // 3) visibility decay + review flagging (spec §3): metadata only.
      if (dryRun) {
        const plan = planMemoryMaintenance(facts, new Date());
        report.rescored += plan.rescore.length;
        report.review_flagged += plan.flagReview.length;
      } else {
        const m = await applyMemoryMaintenance(supa, pid);
        report.rescored += m.rescored;
        report.review_flagged += m.review_flagged;
      }

      // 4) trash auto-purge (decision #6): ONLY memory rows the user already
      // trashed whose 30-day recovery window expired. The engine's single
      // sanctioned delete; live memories are never touched.
      if (dryRun) {
        const trashedRows = await listTrashedFacts(supa, pid);
        const cutoff = Date.now() - 30 * 86400000;
        report.trash_purged += trashedRows.filter((t: any) => {
          const at = Date.parse(String(t.meta?.trashed_at ?? ''));
          return Number.isFinite(at) && at < cutoff;
        }).length;
      } else {
        report.trash_purged += await purgeExpiredTrashedFacts(supa, pid);
      }
    }

    // D2 (spec §6.3): every run's report lands in ops_events so the
    // admin dashboard can show last-run counts. Best-effort.
    try {
      await supa.from('ops_events').insert({
        kind: dryRun ? 'memory.consolidate.dry_run' : 'memory.consolidate',
        ok: true,
        meta: report,
      });
    } catch { /* the report still returns to the caller */ }

    return new Response(JSON.stringify(report), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return new Response(JSON.stringify({ error: msg }), {
      status: msg === 'forbidden' ? 403 : 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

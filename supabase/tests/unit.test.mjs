// Unit tests for the zero-dependency shared engines.
// Run: node --import ./supabase/tests/deno-shim.mjs --test supabase/tests/unit.test.mjs
// (node >= 22 strips types natively; no build step, no extra deps)
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import {
  verifyRouting,
  LEARNED_FIXTURE,
  LEARNED_SCENARIOS,
  SCENARIO_TABS,
} from '../functions/_shared/routing.scenarios.ts';
import { routeText } from '../functions/_shared/routing.ts';
import { resolveTabName, listTabs, getTabNotes } from '../functions/_shared/tabs.ts';
import {
  normAr,
  scoreFact,
  parseLearned,
  factLine,
  planMemoryMaintenance,
  applyMemoryMaintenance,
  quotaGate,
  countFactsForQuota,
  oldestWeakestForReview,
  upsertFacts,
  matchForget,
  loadFacts,
  createForgetPreview,
  parseForgetConfirmation,
  validateForgetConfirmation,
  claimForgetPreview,
  releaseForgetClaim,
  executeConfirmedForget,
  trashFact,
  restoreFact,
  listTrashedFacts,
  purgeExpiredTrashedFacts,
} from '../functions/_shared/memory.ts';
import * as memoryEngine from '../functions/_shared/memory.ts';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// edge-auth.ts imports supabase-js from esm.sh — resolve it to our stub
// BEFORE the dynamic import below.
register('./resolve-hook.mjs', import.meta.url);
const edgeAuth = await import('../functions/_shared/edge-auth.ts');
// G1 (P0-1): the pure Supabase config validator lives in the mobile app
// tree; it has no RN imports, so the suite imports it directly.
const { resolveSupabaseConfig } = await import('../../apps/mobile/src/lib/supabase-config.ts');

describe('routing engine — scenario suite', () => {
  it('passes all 23 scenarios (no regressions)', () => {
    const r = verifyRouting(LEARNED_FIXTURE);
    const fails = r.results.filter((x) => !x.passed);
    assert.equal(r.failed, 0, `failing scenarios:\n${fails.map((f) => `  "${f.scenario.text}" got ${JSON.stringify(f.got)} (why: ${f.scenario.why})`).join('\n')}`);
    assert.equal(r.passed, 23);
  });

  it('layer 2: learned corrections beat rules', () => {
    for (const s of LEARNED_SCENARIOS) {
      const d = routeText(s.text, { tabs: SCENARIO_TABS, learned: LEARNED_FIXTURE });
      assert.ok(d, `expected a decision for "${s.text}"`);
      assert.equal(d.space, s.expectSpace, `"${s.text}"`);
    }
  });
});

describe('memory engine — pure functions', () => {
  it('normAr normalizes Arabic variants', () => {
    assert.equal(normAr('أحمد'), 'احمد'); // hamza forms → ا
    assert.equal(normAr('السيّارة'), 'السياره'); // shadda stripped, ة → ه
    assert.equal(normAr('Hello, World!'), 'hello world');
    assert.equal(normAr('  في   البيت  '), 'في البيت');
  });

  it('scoreFact ranks relevant facts above irrelevant ones', () => {
    const now = new Date().toISOString();
    const relevant = { title: 'مفتاح السيارة', details: 'في درج المطبخ', meta: { importance: 3 }, created_at: now, updated_at: now };
    const irrelevant = { title: 'موعد دكتور الأسنان', details: 'يوم الخميس', meta: { importance: 3 }, created_at: now, updated_at: now };
    const rel = scoreFact(relevant, ['مفتاح']);
    const irr = scoreFact(irrelevant, ['مفتاح']);
    assert.ok(rel > irr, `relevant=${rel} should beat irrelevant=${irr}`);
    assert.equal(scoreFact(relevant, []), 0, 'empty query → 0');
  });

  it('parseLearned never throws and strips code fences', () => {
    const fenced = '```json\n{"facts":[{"content":"يحب القهوة","mkey":"preference:coffee","mcat":"preference","importance":4}]}\n```';
    const out = parseLearned(fenced);
    assert.equal(out.length, 1);
    assert.equal(out[0].mkey, 'preference:coffee');

    assert.deepEqual(parseLearned('not json at all {{{'), []);
    assert.deepEqual(parseLearned('{"facts":[]}'), []);
  });

  it('factLine truncates long details', () => {
    const line = factLine({ title: 'x', details: 'y'.repeat(200) });
    assert.ok(line.length <= 140);
  });
});

describe('edge-auth — internal secret check', () => {
  const mkReq = (secret) =>
    new Request('http://x/', { headers: secret === undefined ? {} : { 'x-internal-secret': secret } });

  it('accepts the correct secret', () => {
    process.env.INTERNAL_FN_SECRET = 's3cr3t-abc-123';
    assert.equal(edgeAuth.isInternal(mkReq('s3cr3t-abc-123')), true);
  });

  it('rejects wrong / missing / wrong-length secrets', () => {
    process.env.INTERNAL_FN_SECRET = 's3cr3t-abc-123';
    assert.equal(edgeAuth.isInternal(mkReq('wrong')), false);
    assert.equal(edgeAuth.isInternal(mkReq('s3cr3t-abc-124')), false); // same length, 1 char off
    assert.equal(edgeAuth.isInternal(mkReq(undefined)), false);
  });

  it('rejects everything when no secret is configured', () => {
    delete process.env.INTERNAL_FN_SECRET;
    assert.equal(edgeAuth.isInternal(mkReq('anything')), false);
  });

  it('internalHeaders carries the secret header name', () => {
    process.env.INTERNAL_FN_SECRET = 'zz';
    const h = edgeAuth.internalHeaders();
    assert.equal(h['x-internal-secret'], 'zz');
  });
});

describe('ai engine — chatBody token parameter (GPT-5 400 regression)', () => {
  const openaiLike = { supportsMaxTokens: false };
  const groqLike = { supportsMaxTokens: true };

  it('sends max_completion_tokens (not max_tokens) on the OpenAI path', async () => {
    const { chatBody } = await import('../functions/_shared/ai.ts');
    const b = chatBody(openaiLike, { max_tokens: 450, messages: [] });
    assert.equal(b.max_completion_tokens, 450);
    assert.ok(!('max_tokens' in b), 'max_tokens must not be sent to GPT-5');
  });

  it('keeps max_tokens on the Groq path', async () => {
    const { chatBody } = await import('../functions/_shared/ai.ts');
    const b = chatBody(groqLike, { max_tokens: 450, messages: [] });
    assert.equal(b.max_tokens, 450);
    assert.ok(!('max_completion_tokens' in b));
  });
});

describe('rate limiting — window math', () => {
  it('truncates to minute and hour boundaries', async () => {
    const { windowStarts } = await import('../functions/_shared/rate-limit.ts');
    // 2026-09-28T00:37:42.123Z
    const t = Date.UTC(2026, 8, 28, 0, 37, 42, 123);
    const w = windowStarts(t);
    assert.equal(w.minute, '2026-09-28T00:37:00.000Z');
    assert.equal(w.hour, '2026-09-28T00:00:00.000Z');
  });

  it('limits table covers the four AI functions', async () => {
    const { AI_LIMITS, DEFAULT_LIMIT } = await import('../functions/_shared/rate-limit.ts');
    for (const fn of ['chat', 'ask', 'extract', 'transcribe']) {
      assert.ok(AI_LIMITS[fn], `missing limit for ${fn}`);
      assert.ok(AI_LIMITS[fn].perMinute > 0 && AI_LIMITS[fn].perHour > AI_LIMITS[fn].perMinute);
    }
    assert.ok(DEFAULT_LIMIT.perHour > DEFAULT_LIMIT.perMinute);
  });
});

describe('timezone model (P2-3)', () => {
  it('accepts valid IANA zones, rejects garbage', async () => {
    const { sanitizeTimezone, isValidTimezone } = await import('../functions/_shared/time.ts');
    assert.ok(isValidTimezone('America/New_York'));
    assert.ok(isValidTimezone('Asia/Dubai'));
    assert.equal(sanitizeTimezone('Europe/Paris'), 'Europe/Paris');
    assert.equal(sanitizeTimezone('not-a-zone'), 'America/New_York');
    assert.equal(sanitizeTimezone(''), 'America/New_York');
    assert.equal(sanitizeTimezone(null), 'America/New_York');
    assert.equal(sanitizeTimezone(undefined), 'America/New_York');
    assert.equal(sanitizeTimezone('../../etc/passwd'), 'America/New_York');
    assert.equal(sanitizeTimezone('America/New_York; DROP TABLE'), 'America/New_York');
  });

  it('IANA zones carry DST: New York offset shifts across the 2026 spring transition', () => {
    // US DST starts 2026-03-08 07:00 UTC — the audit asks for DST coverage.
    // This pins the platform behavior our relative-date resolution relies on.
    const fmt = (ms) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        timeZoneName: 'shortOffset',
        hour: 'numeric',
      }).format(new Date(ms));
    const before = fmt(Date.UTC(2026, 2, 8, 6, 0)); // 01:00 EST
    const after = fmt(Date.UTC(2026, 2, 8, 8, 0)); // 04:00 EDT
    assert.match(before, /GMT-5/);
    assert.match(after, /GMT-4/);
  });
});

describe('tab-aware AI — resolveTabName (fuzzy Arabic tab matching)', () => {
  const TABS = [
    { id: 'papers', title: 'اوراقي الخاصة' },
    { id: 't1', title: 'أشياء أحمد' },
    { id: 't2', title: '🛒 مشتريات' },
  ];

  it('matches possessive/short forms of the papers tab', () => {
    assert.equal(resolveTabName(TABS, 'الاوراق الخاصة')?.id, 'papers');
    assert.equal(resolveTabName(TABS, 'اوراق خاصه')?.id, 'papers');
    assert.equal(resolveTabName(TABS, 'تبويب الاوراق')?.id, 'papers');
    assert.equal(resolveTabName(TABS, 'اوراقي')?.id, 'papers');
  });

  it('matches member-name tabs through normalization', () => {
    assert.equal(resolveTabName(TABS, 'اشياء احمد')?.id, 't1');
    assert.equal(resolveTabName(TABS, 'أشياء أحمد')?.id, 't1');
    assert.equal(resolveTabName(TABS, 'تبويب اشياء احمد')?.id, 't1');
  });

  it('matches emoji-prefixed titles and partial queries', () => {
    assert.equal(resolveTabName(TABS, 'المشتريات')?.id, 't2');
    assert.equal(resolveTabName(TABS, 'مشتريات')?.id, 't2');
  });

  it('returns null on no match or empty query', () => {
    assert.equal(resolveTabName(TABS, 'السيارة'), null);
    assert.equal(resolveTabName(TABS, ''), null);
    assert.equal(resolveTabName([], 'الاوراق'), null);
  });
});

describe('shopping fast path — detection + parsing (pure)', () => {
  let shop;
  before(async () => {
    shop = await import('../functions/_shared/shopping.ts');
  });

  it('detects clear shopping-list intent', () => {
    assert.ok(shop.looksLikeShoppingList('بدنا نشتري: حليب، خبز، بيض'));
    assert.ok(shop.looksLikeShoppingList('قائمة تسوق: حليب وخبز'));
    assert.ok(shop.looksLikeShoppingList('grocery list: milk, bread'));
    assert.ok(shop.looksLikeShoppingList('جيب حليب، خبز، بيض'));
    assert.ok(shop.looksLikeShoppingList('ناقصنا: سكر، رز'));
  });

  it('rejects non-shopping statements', () => {
    assert.ok(!shop.looksLikeShoppingList('المفاتيح بدرج المطبخ'));
    assert.ok(!shop.looksLikeShoppingList('صباح الخير'));
    assert.ok(!shop.looksLikeShoppingList('حليب'));
    assert.ok(!shop.looksLikeShoppingList('اشتريت حليب مبارح'));
  });

  it('parses the user\'s real list: 14 items, qualifiers kept', () => {
    const items = shop.parseShoppingItems(
      'بدنا نشتري: كلن كلور، كلور وايبس، سائل جلي، صابون إيدين نوع نضيف، صحون بلاستيك، قصدير، قلفز مطبخ نوع للتنظيف ونوع للأكل، خيار، بصل، عنب، بطاطا حلوة، خبز توست أصفر، لحمة، جاج'
    );
    assert.equal(items.length, 14);
    assert.equal(items[0], 'كلن كلور');
    assert.ok(items.includes('صابون إيدين نوع نضيف'));
    assert.ok(items.includes('قلفز مطبخ نوع للتنظيف ونوع للأكل'));
    assert.equal(items[13], 'جاج');
  });

  it('strips intent prefixes and lead verbs, dedupes', () => {
    assert.deepEqual(shop.parseShoppingItems('جيب حليب، خبز، حليب'), ['حليب', 'خبز']);
    assert.deepEqual(shop.parseShoppingItems('shopping list: milk, bread'), ['milk', 'bread']);
  });
});

// ── 🧠 governance engine ──
const gov = await import('../functions/_shared/governance.ts');

describe('governance — forbidden topics (deterministic, pre-model)', () => {
  const topics = [
    { id: 'politics', label_ar: 'سياسة', patterns: ['انتخابات', 'حزب', 'رئيس'], enabled: true },
    { id: 'off', label_ar: 'مطفي', patterns: ['ممنوع'], enabled: false },
  ];

  it('matches normalized Arabic substrings', () => {
    const hit = gov.matchForbidden('شو رأيك بالانتخابات؟', topics);
    assert.ok(hit && hit.id === 'politics');
  });

  it('normalizes alef/hamza/ta-marbuta before matching', () => {
    const hit = gov.matchForbidden('أخبرني عن الإنتخابات', topics);
    assert.ok(hit && hit.id === 'politics');
  });

  it('ignores disabled topics', () => {
    assert.equal(gov.matchForbidden('هاد ممنوع', topics), null);
  });

  it('supports /regex/ patterns', () => {
    const rx = [{ id: 'rx', label_ar: 'x', patterns: ['/سعر .{1,20} دولار/'], enabled: true }];
    assert.ok(gov.matchForbidden('شو سعر التفاح دولار', rx));
    assert.equal(gov.matchForbidden('شو سعر التفاح', rx), null);
  });

  it('never matches empty text and never throws on bad patterns', () => {
    assert.equal(gov.matchForbidden('', topics), null);
    const bad = [{ id: 'bad', label_ar: 'x', patterns: ['/([/'], enabled: true }];
    assert.equal(gov.matchForbidden('anything', bad), null);
  });
});

describe('governance — prompt building', () => {
  const base = {
    id: 'g1', persona_ar: 'أنت موجود.', persona_en: 'You are Mawjood.',
    hard_rules: [{ id: 'r1', text_ar: 'لا تخترع', text_en: 'do not invent', enabled: true }],
    forbidden_topics: [], refusal_ar: 'مرفوض', refusal_en: 'refused',
    capabilities: { can_add_tabs: true, can_delete_tabs: false, can_add_spaces: false, can_delete_spaces: false, approvals_required: 2, require_paid_for_extra: true },
    vault_policy: {}, version: 1,
  };

  it('injects persona + rules + vault isolation in normal mode', () => {
    const p = gov.buildGovernancePrompt(base, true, 'normal');
    assert.ok(p.includes('أنت موجود.'));
    assert.ok(p.includes('لا تخترع'));
    assert.ok(p.includes('VAULT ISOLATION'));
    assert.ok(p.includes('ZERO visibility into the secret vault'));
  });

  it('restates the vault boundary for secret and decoy sessions', () => {
    const s = gov.buildGovernancePrompt(base, true, 'secret');
    assert.ok(s.includes('VAULT SESSION (secret)'));
    assert.ok(s.includes('ONLY from this vault'));
    const d = gov.buildGovernancePrompt(base, true, 'decoy');
    assert.ok(d.includes('VAULT SESSION (decoy)'));
    assert.ok(d.includes('Never hint that anything else exists'));
  });

  it('falls back to a minimal guard when no governance row exists', () => {
    const p = gov.buildGovernancePrompt(null, true, 'normal');
    assert.ok(p.includes('secret vault'));
    assert.equal(gov.buildGovernancePrompt(null, true, 'secret'), '');
  });

  it('summarizes governed powers with approval count', () => {
    const line = gov.capabilitiesLine(base, true);
    assert.ok(line.includes('إنشاء تبويبات'));
    assert.ok(line.includes('2'));
    assert.ok(!line.includes('حذف تبويبات'));
    assert.equal(gov.capabilitiesLine({ ...base, capabilities: { ...base.capabilities, can_add_tabs: false } }, true), '');
  });
});

// ── D1 data protection (failing-first suites for B1/B2) ─────────────────────
// In-memory PostgREST fake: just enough of the supabase-js builder surface
// for the memory engine (select/eq/order/limit/maybeSingle/insert/update/delete).
function fakeSupa(rows) {
  const db = { items: rows.map((r) => ({ ...r, meta: { ...(r.meta ?? {}) } })), pending_actions: [] };
  function builder(table) {
    const filters = [];
    let op = { type: 'select' };
    let sortSpec = null;
    const match = () => {
      const out = db[table].filter((r) => filters.every(([col, val]) => {
        if (col.includes('->>')) { const [f, k] = col.split('->>'); return r[f]?.[k] === val; }
        return r[col] === val;
      }));
      if (sortSpec) {
        const [col, dir] = sortSpec;
        out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      return out;
    };
    const b = {
      select(_cols, opts) { if (op.type === 'update') { op.returning = true; return b; } op = { type: 'select', count: opts?.count, head: opts?.head }; return b; },
      eq(col, val) { filters.push([col, val]); return b; },
      order(col, o) { sortSpec = [col, o?.ascending === false ? 'desc' : 'asc']; return b; },
      limit() { return b; },
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      single: async () => ({ data: match()[0] ?? null, error: null }),
      insert: async (row) => {
        const nowIso = new Date().toISOString();
        // Emulate the schema default: pending_actions.expires_at defaults to
        // now() + 30 minutes (migration 0034) when the writer omits it.
        const defaults = table === 'pending_actions'
          ? { expires_at: new Date(Date.now() + 30 * 60000).toISOString() }
          : {};
        db[table].push({ id: `id-${db[table].length + 1}-${Math.random().toString(36).slice(2, 7)}`, created_at: nowIso, updated_at: nowIso, ...defaults, ...row });
        return { error: null };
      },
      update(patch) { op = { type: 'update', patch }; return b; },
      delete() { op = { type: 'delete' }; return b; },
      then: (resolve) => {
        if (op.type === 'select') {
          const m = match();
          if (op.head) return resolve({ data: null, count: m.length, error: null });
          return resolve({ data: m, error: null });
        }
        if (op.type === 'update') {
          const m = match();
          for (const r of m) Object.assign(r, op.patch);
          return resolve({ data: m, error: null });
        }
        if (op.type === 'delete') {
          const m = match();
          db[table] = db[table].filter((r) => !m.includes(r));
          return resolve({ error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return b;
  }
  return { from: (t) => builder(t), _db: db };
}

const NOW = new Date('2026-10-12T00:00:00.000Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const mkFact = (id, importance, ageDays, extraMeta = {}) => ({
  id, space_id: 'S1', kind: 'memory', status: 'open',
  title: `fact ${id}`, details: `details ${id}`,
  meta: { mkey: `k:${id}`, mcat: 'preference', importance, ...extraMeta },
  created_at: daysAgo(ageDays), updated_at: daysAgo(ageDays),
});

describe('D1/B1 — non-destructive maintenance planning (spec §3)', () => {
  it('rescores stale importance-1 facts (90d+), never deletes', () => {
    const plan = planMemoryMaintenance([mkFact('a', 1, 100)], NOW);
    assert.deepEqual(plan.rescore, ['a']);
    assert.deepEqual(plan.flagReview, []);
  });

  it('flags 180d+ low-importance facts for the review queue', () => {
    const plan = planMemoryMaintenance([mkFact('a', 1, 200), mkFact('b', 2, 200)], NOW);
    assert.deepEqual(plan.rescore, ['a']); // only importance<=1 rescores
    assert.deepEqual([...plan.flagReview].sort(), ['a', 'b']);
  });

  it('leaves fresh and important facts alone', () => {
    const plan = planMemoryMaintenance([mkFact('a', 1, 10), mkFact('b', 5, 400), mkFact('c', 3, 200)], NOW);
    assert.deepEqual(plan.rescore, []);
    assert.deepEqual(plan.flagReview, []);
  });

  it('is idempotent: already-rescored / already-flagged facts are skipped', () => {
    const plan = planMemoryMaintenance([
      mkFact('a', 1, 200, { retrieval_boost: 0.5, review_candidate: true }),
    ], NOW);
    assert.deepEqual(plan.rescore, []);
    assert.deepEqual(plan.flagReview, []);
  });

  it('applyMemoryMaintenance updates metadata only — row count unchanged, second run is a no-op', async () => {
    const supa = fakeSupa([mkFact('a', 1, 100), mkFact('b', 2, 200, { retrieval_boost: 0.5 }), mkFact('c', 4, 5)]);
    const r1 = await applyMemoryMaintenance(supa, 'S1', NOW);
    assert.equal(r1.rescored, 1);
    assert.equal(r1.review_flagged, 1);
    assert.equal(supa._db.items.length, 3, 'no row may be deleted');
    assert.equal(supa._db.items.find((r) => r.id === 'a').meta.retrieval_boost, 0.5);
    assert.equal(supa._db.items.find((r) => r.id === 'b').meta.review_candidate, true);
    const r2 = await applyMemoryMaintenance(supa, 'S1', NOW);
    assert.deepEqual(r2, { rescored: 0, review_flagged: 0 });
  });

  it('scoreFact applies the retrieval_boost visibility penalty', () => {
    const nowIso = new Date().toISOString();
    const base = { title: 'مفتاح السيارة', details: 'في درج المطبخ', created_at: nowIso, updated_at: nowIso };
    const normal = scoreFact({ ...base, meta: { importance: 3 } }, ['مفتاح']);
    const decayed = scoreFact({ ...base, meta: { importance: 3, retrieval_boost: 0.5 } }, ['مفتاح']);
    assert.ok(decayed < normal, `decayed=${decayed} should rank below normal=${normal}`);
  });
});

describe('D1/B2 — quota mechanics: block-on-overflow, never prune (spec §4)', () => {
  it('pruneFacts is gone from the engine (no caller can invoke deletion)', () => {
    assert.equal('pruneFacts' in memoryEngine, false);
  });

  it('quotaGate blocks only at/over an explicit cap', () => {
    assert.equal(quotaGate(0, undefined), false);
    assert.equal(quotaGate(9999, undefined), false);
    assert.equal(quotaGate(199, 200), false);
    assert.equal(quotaGate(200, 200), true);
    assert.equal(quotaGate(250, 200), true);
  });

  it('upsertFacts at cap: new facts blocked, nothing deleted, same-mkey updates still save', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1, { mkey: 'k:a' }), mkFact('b', 3, 1, { mkey: 'k:b' })]);
    const blocked = await upsertFacts(supa, 'S1', 'U1', [{ content: 'new fact', mkey: 'k:c', mcat: 'preference', importance: 3 }], 'learned', { cap: 2 });
    assert.deepEqual(blocked, { saved: 0, updated: 0, blocked: 1 });
    assert.equal(supa._db.items.length, 2, 'overflow must never delete existing facts');
    const upd = await upsertFacts(supa, 'S1', 'U1', [{ content: 'a v2', mkey: 'k:a', mcat: 'preference', importance: 3 }], 'learned', { cap: 2 });
    assert.deepEqual(upd, { saved: 0, updated: 1, blocked: 0 });
    assert.equal(supa._db.items.length, 2);
  });

  it('upsertFacts without a cap saves as before (no invented numbers)', async () => {
    const supa = fakeSupa([]);
    const r = await upsertFacts(supa, 'S1', 'U1', [{ content: 'x', mkey: 'k:x', mcat: 'preference', importance: 3 }], 'learned');
    assert.deepEqual(r, { saved: 1, updated: 0, blocked: 0 });
  });

  it('countFactsForQuota counts open facts; oldestWeakestForReview is read-only and ordered', async () => {
    const supa = fakeSupa([
      mkFact('new-strong', 5, 1), mkFact('old-weak', 1, 300), mkFact('mid-weak', 1, 100),
    ]);
    assert.equal(await countFactsForQuota(supa, 'S1'), 3);
    const review = await oldestWeakestForReview(supa, 'S1', 2);
    assert.deepEqual(review.map((f) => f.id), ['old-weak', 'mid-weak']);
    assert.equal(supa._db.items.length, 3, 'review listing must not mutate the store');
  });
});

describe('D1 — static guard: no hard-delete of memory items outside the sanctioned purge', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const itemsDelete = /\.from\(['"]items['"]\)\s*\.delete\(\)/g;

  it('memory-consolidate contains no items delete', () => {
    assert.equal(read('../functions/memory-consolidate/index.ts').match(itemsDelete), null);
  });

  it('chat contains no items delete (forget goes through trash)', () => {
    assert.equal(read('../functions/chat/index.ts').match(itemsDelete), null);
  });

  it('memory engine has exactly one items delete, inside purgeExpiredTrashedFacts', () => {
    const src = read('../functions/_shared/memory.ts');
    const hits = [...src.matchAll(itemsDelete)];
    assert.equal(hits.length, 1);
    assert.ok(hits[0].index > src.indexOf('purgeExpiredTrashedFacts'), 'the single delete must live in the trash purge');
  });
});

describe('D1/B3 — forget_fact scoped matching (spec §5)', () => {
  const F = (id, details, extraMeta = {}) => ({
    id, space_id: 'S1', kind: 'memory', status: 'open',
    title: `k:${id}`, details, meta: { mkey: `k:${id}`, mcat: 'preference', importance: 3, ...extraMeta },
    created_at: daysAgo(1), updated_at: daysAgo(1),
  });

  it('exact match auto-selects exactly one fact', () => {
    const facts = [F('a', 'يشرب قهوة كل صباح'), F('b', 'يحب الشاي')];
    const m = matchForget(facts, 'يشرب قهوة كل صباح');
    assert.equal(m.tier, 'exact');
    assert.equal(m.auto?.id, 'a');
  });

  it('mkey match: query tokens subset of a known mkey', () => {
    const facts = [F('a', 'يحب القهوة', { mkey: 'preference:coffee' }), F('b', 'يحب الشاي', { mkey: 'preference:tea' })];
    const m = matchForget(facts, 'coffee');
    assert.equal(m.tier, 'mkey');
    assert.equal(m.auto?.id, 'a');
  });

  it('ambiguous substring (the old mass-delete repro): 3 candidates, zero auto-deleted', () => {
    const facts = [
      F('a', 'يشتري حليب كل اسبوع'),
      F('b', 'حليب اللوز في الثلاجة'),
      F('c', 'القط يحب الحليب'),
    ];
    const m = matchForget(facts, 'حليب');
    assert.equal(m.tier, 'substring');
    assert.equal(m.auto, null);
    assert.equal(m.candidates.length, 3);
  });

  it('single substring candidate proceeds automatically', () => {
    const facts = [F('a', 'مفتاح السيارة في درج المطبخ'), F('b', 'يحب الشاي')];
    const m = matchForget(facts, 'مطبخ');
    assert.equal(m.tier, 'substring');
    assert.equal(m.auto?.id, 'a');
  });

  it('route facts are never matched by chat forget', () => {
    const facts = [F('r', 'حليب يروح على التسوق', { mcat: 'route' })];
    const m = matchForget(facts, 'حليب');
    assert.equal(m.tier, 'none');
    assert.equal(m.candidates.length, 0);
  });

  it('no match → none (never guess)', () => {
    const m = matchForget([F('a', 'يحب الشاي')], 'برتقال');
    assert.equal(m.tier, 'none');
    assert.equal(m.auto, null);
  });
});

describe('D1/B3+B4 — fact trash, undo, and the sanctioned purge (spec §5.2, decision #6)', () => {
  it('trashFact moves to trash (row survives, leaves the open set); restoreFact undoes it', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    const row = supa._db.items[0];
    assert.equal(await trashFact(supa, row, 'user_forget'), true);
    assert.equal(supa._db.items.length, 1, 'trash is a status flip, not a delete');
    assert.equal(supa._db.items[0].status, 'trashed');
    assert.ok(supa._db.items[0].meta.trashed_at);
    assert.equal((await listTrashedFacts(supa, 'S1')).length, 1);
    const restored = await restoreFact(supa, 'S1', 'a');
    assert.ok(restored);
    assert.equal(supa._db.items[0].status, 'open');
    assert.equal(supa._db.items[0].meta.trashed_at, undefined);
  });

  it('purge deletes ONLY trashed rows past the 30-day window', async () => {
    const old = mkFact('old-trash', 3, 40, { trashed_at: daysAgo(31) });
    old.status = 'trashed';
    const fresh = mkFact('fresh-trash', 3, 1, { trashed_at: daysAgo(10) });
    fresh.status = 'trashed';
    const live = mkFact('live-old', 1, 400); // ancient but OPEN — untouchable
    const supa = fakeSupa([old, fresh, live]);
    const n = await purgeExpiredTrashedFacts(supa, 'S1', 30, NOW);
    assert.equal(n, 1);
    assert.deepEqual(supa._db.items.map((r) => r.id).sort(), ['fresh-trash', 'live-old']);
  });
});

describe('D1/B4 — universal 30-day trash floor (decision #6)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('migration 0035 adds trashed status + retention floor trigger + backfill', () => {
    const sql = read('../migrations/0035_d1_data_protection.sql');
    assert.ok(sql.includes("'trashed'"), 'items status must allow trashed');
    assert.ok(sql.includes('profiles_trash_floor'), 'floor trigger must exist');
    assert.ok(/set trash_retention_days = 30\s+where trash_retention_days < 30/.test(sql), 'backfill must raise sub-30 rows');
  });

  it('client never falls back to permanent delete (0) on missing/error', () => {
    const src = read('../../packages/voice-engine/src/client.ts');
    assert.ok(!/trash_retention_days \?\? 0/.test(src), 'missing profile must not mean 0 retention');
    assert.ok(src.includes('Math.max(30,'), 'client enforces the 30-day floor');
  });

  it('admin tools cannot set retention below the floor', () => {
    for (const f of ['../functions/admin-subscribe/index.ts', '../functions/admin-set-limits/index.ts']) {
      assert.ok(read(f).includes('trash_retention_days: [30, 3650]'), `${f} range must start at 30`);
    }
  });

  it('gardener wires the sanctioned trash purge', () => {
    assert.ok(read('../functions/memory-consolidate/index.ts').includes('purgeExpiredTrashedFacts'));
  });
});

describe('D1/B1-fix — gardener must not filter on dropped columns', () => {
  it('memory-consolidate never references notes.deleted_at (dropped in 0019)', () => {
    const src = readFileSync(new URL('../functions/memory-consolidate/index.ts', import.meta.url), 'utf8');
    assert.ok(!/\.is\(\s*['"]deleted_at['"]/.test(src) && !/\.eq\(\s*['"]deleted_at['"]/.test(src),
      'deleted_at was dropped by migration 0019; filtering on it silently zeroes the job');
  });
});

describe('D1 correction — confirmed forget (preview-only AI + user-sent code)', () => {
  const UID = 'user-1';
  const future = () => new Date(Date.now() + 600000).toISOString();
  const mkRow = (over = {}) => ({
    id: 'pa-1', user_id: UID, status: 'pending', expires_at: future(),
    payload: { fact_ids: ['a'], fact_texts: ['fact a'], memory_space_id: 'S1', confirm_code: '123456' },
    ...over,
  });

  it('parse: accepts ONLY the bare 6-digit code or «نفّذ/confirm <code>» as the whole message', () => {
    assert.equal(parseForgetConfirmation('123456'), '123456');
    assert.equal(parseForgetConfirmation('نفّذ 123456'), '123456');
    assert.equal(parseForgetConfirmation('نفذ ١٢٣٤٥٦'), '123456'); // Arabic-Indic digits
    assert.equal(parseForgetConfirmation('confirm 123456'), '123456');
  });

  it('parse: rejects codes embedded in text, wrong lengths, non-codes', () => {
    assert.equal(parseForgetConfirmation('الكود هو 123456'), null);
    assert.equal(parseForgetConfirmation('بدي أنسى 123456'), null);
    assert.equal(parseForgetConfirmation('نفّذ 12345'), null);
    assert.equal(parseForgetConfirmation('نفّذ 1234567'), null);
    assert.equal(parseForgetConfirmation('انساني الرقم 123456 من فضلك'), null);
    assert.equal(parseForgetConfirmation('شو الأخبار'), null);
  });

  it('validate: a genuine code for the right user passes', () => {
    assert.deepEqual(validateForgetConfirmation(mkRow(), UID, '123456', new Date()), { ok: true });
  });

  it('NEGATIVE validate: forged code fails closed', () => {
    const v = validateForgetConfirmation(mkRow(), UID, '999999', new Date());
    assert.equal(v.ok, false);
    assert.equal(v.reason, 'bad_code');
  });

  it('NEGATIVE validate: expired, consumed, superseded, wrong-user, missing rows all fail', () => {
    assert.equal(validateForgetConfirmation(mkRow({ expires_at: new Date(Date.now() - 1000).toISOString() }), UID, '123456', new Date()).ok, false);
    assert.equal(validateForgetConfirmation(mkRow({ status: 'executed' }), UID, '123456', new Date()).reason, 'not_pending');
    assert.equal(validateForgetConfirmation(mkRow({ status: 'superseded' }), UID, '123456', new Date()).ok, false);
    assert.equal(validateForgetConfirmation(mkRow(), 'someone-else', '123456', new Date()).reason, 'wrong_user');
    assert.equal(validateForgetConfirmation(null, UID, '123456', new Date()).ok, false);
  });

  it('preview: creates a pending row + code, supersedes older previews, trashes NOTHING', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    supa._db.pending_actions.push({ id: 'old', user_id: UID, action_type: 'forget_memory', status: 'pending', payload: {}, expires_at: future() });
    const facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', facts);
    assert.ok(p && /^\d{6}$/.test(p.confirm_code));
    assert.equal(supa._db.pending_actions.find((r) => r.id === 'old').status, 'superseded');
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    assert.deepEqual(row.payload.fact_ids, ['a']);
    assert.equal(supa._db.items[0].status, 'open', 'a preview must never trash');
  });

  it('NEGATIVE unconfirmed exact match: unique match still only previews (store untouched)', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    const facts = await loadFacts(supa, 'S1');
    const m = matchForget(facts, 'fact a');
    assert.ok(m.auto, 'unique match exists');
    // The ONLY thing the AI path may do with a unique match is preview:
    await createForgetPreview(supa, UID, 'S1', [m.auto]);
    assert.equal(supa._db.items[0].status, 'open');
    assert.equal(supa._db.items.length, 1);
  });

  it('confirmed roundtrip: user code validates, exactly the previewed fact trashes, single use', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1), mkFact('b', 3, 1)]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', [facts.find((f) => f.id === 'a')]);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    // Without the user's message there is no execution — validate is the gate:
    assert.equal(validateForgetConfirmation(row, UID, p.confirm_code, new Date()).ok, true);
    const claimed = await claimForgetPreview(supa, row.id);
    assert.ok(claimed && claimed.status === 'executing');
    const { trashed } = await executeConfirmedForget(supa, claimed);
    assert.equal(trashed.length, 1);
    assert.equal(supa._db.items.find((r) => r.id === 'a').status, 'trashed');
    assert.equal(supa._db.items.find((r) => r.id === 'b').status, 'open');
    assert.equal(row.status, 'executed');
    assert.equal(await claimForgetPreview(supa, row.id), null, 'an executed preview cannot be re-claimed');
    const again = await executeConfirmedForget(supa, claimed); // replay attempt
    assert.equal(again.trashed.length, 0, 'consumed previews cannot execute twice');
  });

  it('NEGATIVE forged confirmation: wrong code never validates; expired row cannot execute', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', facts);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    const forged = parseForgetConfirmation('نفّذ 000000');
    assert.equal(validateForgetConfirmation(row, UID, forged, new Date()).ok, false);
    assert.equal(supa._db.items[0].status, 'open');
    row.expires_at = new Date(Date.now() - 1000).toISOString(); // let it lapse
    const { trashed } = await executeConfirmedForget(supa, row);
    assert.equal(trashed.length, 0, 'expired previews refuse to execute even if called');
    assert.equal(supa._db.items[0].status, 'open');
    assert.ok(p.confirm_code !== '000000');
  });

  it('execute skips route facts even if a preview lists them', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1, { mcat: 'route' })]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', facts);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    const claimed = await claimForgetPreview(supa, row.id);
    const { trashed } = await executeConfirmedForget(supa, claimed);
    assert.equal(trashed.length, 0);
    assert.equal(supa._db.items[0].status, 'open');
  });

  it('GUARD: chat has NO trashFact — the AI path cannot trash; confirmation is deterministic', () => {
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    assert.ok(!chat.includes('trashFact'), 'chat must never call trashFact directly');
    const body = chat.slice(chat.indexOf('async function toolForgetFact'), chat.indexOf('async function toolRestoreFact'));
    assert.ok(body.includes('createForgetPreview') && body.includes('needs_confirmation'),
      'forget tool must be preview-only');
    assert.ok(chat.includes('parseForgetConfirmation(t)') && chat.includes('validateForgetConfirmation')
      && chat.includes('executeConfirmedForget'),
      'the deterministic confirmation fast path must be wired in the handler');
  });

  it('GUARD: governed executor fails closed on unknown action types (no delete-space fall-through)', () => {
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    // PR-B/M4 restructure: the executor runs inside the atomic-claim
    // try block, so the unknown-type branch ASSIGNS the error (the claim
    // is then released and the error returned) instead of returning
    // inline. The invariant is unchanged: unknown types error out and
    // never fall through to a destructive executor.
    assert.ok(chat.includes("res = { error: 'unknown action_type' }"));
    assert.ok(!/else res = await executeDeleteSpace/.test(chat),
      'executeDeleteSpace must never be a default branch');
  });

  it('GUARD (req #7): Delete Forever stays user-controlled — no edge function references it', () => {
    for (const f of ['chat/index.ts', '_shared/memory.ts', 'memory-consolidate/index.ts', 'memory-learn/index.ts']) {
      const src = readFileSync(new URL(`../functions/${f}`, import.meta.url), 'utf8');
      assert.ok(!src.includes('deleteTrashRowForever') && !src.includes('emptyTrash'),
        `${f} must not reference the client-only Delete-Forever actions`);
    }
  });
});

describe('D1 hardening — atomic claim + fail-closed expiry (owner re-review)', () => {
  const UID = 'user-1';
  const future = () => new Date(Date.now() + 600000).toISOString();
  const mkRow = (over = {}) => ({
    id: 'pa-1', user_id: UID, status: 'pending', expires_at: future(),
    payload: { fact_ids: ['a'], fact_texts: ['fact a'], memory_space_id: 'S1', confirm_code: '123456' },
    ...over,
  });

  it('NEGATIVE expiry: missing, null, empty, and malformed expires_at all fail CLOSED', () => {
    for (const bad of [undefined, null, '', 'not-a-date', '2026-13-45T99:99:99Z']) {
      const v = validateForgetConfirmation(mkRow({ expires_at: bad }), UID, '123456', new Date());
      assert.equal(v.ok, false, `expires_at=${String(bad)} must not validate`);
      assert.equal(v.reason, 'expired');
    }
  });

  it('NEGATIVE expiry: execute refuses a CLAIMED row with malformed expiry', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', facts);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    const claimed = await claimForgetPreview(supa, row.id);
    claimed.expires_at = 'garbage';
    const { trashed } = await executeConfirmedForget(supa, claimed);
    assert.equal(trashed.length, 0);
    assert.equal(supa._db.items[0].status, 'open');
  });

  it('execute refuses an UNCLAIMED (still pending) row — no execution without the atomic claim', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', facts);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    assert.equal(validateForgetConfirmation(row, UID, p.confirm_code, new Date()).ok, true);
    const { trashed } = await executeConfirmedForget(supa, row); // validated but never claimed
    assert.equal(trashed.length, 0);
    assert.equal(supa._db.items[0].status, 'open');
  });

  it('claim: exactly one winner — a second claim on the same preview returns null', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', facts);
    const first = await claimForgetPreview(supa, p.action_id);
    const second = await claimForgetPreview(supa, p.action_id);
    assert.ok(first && first.status === 'executing');
    assert.equal(second, null, 'the conditional claim must be single-winner');
  });

  it('release: a failed execution returns the preview to pending so the user can retry', async () => {
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', facts);
    const claimed = await claimForgetPreview(supa, p.action_id);
    assert.ok(claimed);
    await releaseForgetClaim(supa, p.action_id);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    assert.equal(row.status, 'pending');
    const reclaimed = await claimForgetPreview(supa, p.action_id); // retry works
    assert.ok(reclaimed && reclaimed.status === 'executing');
  });
});

describe('Post-D1 bugfix — notes.deleted_at stale filters (dropped in 0019)', () => {
  it('GUARD: no function filters any query on deleted_at (the column is gone)', () => {
    const root = new URL('../functions/', import.meta.url);
    const files = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) files.push(p);
      }
    };
    walk(root);
    assert.ok(files.length > 10, 'guard must actually scan the functions tree');
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      assert.ok(!/\.(is|eq|filter|not|or)\(\s*['"][^'"]*deleted_at/.test(src),
        `${f.pathname} filters on deleted_at — dropped by 0019; PostgREST errors 42703 and the read silently returns nothing`);
    }
  });

  // Fake PostgREST over the CANONICAL schema: notes has no deleted_at, so a
  // query filtering on it errors exactly like the real API (data: null,
  // 42703). Before the fix, listTabs/getTabNotes hit that error and
  // silently returned zeros/empties; the assertions below prove the reads
  // now return real data through the same paths.
  function fakeTabsSupa({ tabs = [], notes = [] }) {
    function builder(table) {
      const filters = [];
      let countMode = false;
      let limitN = null;
      let orderCol = null;
      const rows = table === 'notes' ? notes : tabs;
      const b = {
        select(_c, opts) { if (opts?.count) countMode = true; return b; },
        eq(c, v) { filters.push(['eq', c, v]); return b; },
        is(c, v) { filters.push(['is', c, v]); return b; },
        neq(c, v) { filters.push(['neq', c, v]); return b; },
        or() { return b; },
        order(c) { orderCol = c; return b; },
        limit(n) { limitN = n; return b; },
        then: (resolve) => {
          if (table === 'notes' && filters.some(([, c]) => c === 'deleted_at')) {
            return resolve({ data: null, count: null, error: { code: '42703', message: 'column notes.deleted_at does not exist' } });
          }
          let out = rows.filter((r) => filters.every(([op, c, v]) =>
            op === 'eq' ? r[c] === v : op === 'is' ? (v === null ? r[c] == null : r[c] === v) : r[c] !== v));
          if (orderCol) out = [...out].sort((a, z) => (String(a[orderCol]) < String(z[orderCol]) ? 1 : -1));
          if (countMode) return resolve({ data: null, count: out.length, error: null });
          if (limitN) out = out.slice(0, limitN);
          return resolve({ data: out, count: null, error: null });
        },
      };
      return b;
    }
    return { from: (t) => builder(t) };
  }

  const seedNotes = [
    { id: 'n1', space_id: 'S1', tab_id: null, transcript: 'passport is in the drawer', created_at: '2026-10-01T10:00:00Z' },
    { id: 'n2', space_id: 'S1', tab_id: null, transcript: 'buy milk tomorrow', created_at: '2026-10-02T10:00:00Z' },
    { id: 'n3', space_id: 'S1', tab_id: 'papers', transcript: 'passport renewal appointment', created_at: '2026-10-03T10:00:00Z' },
    { id: 'n4', space_id: 'S1', tab_id: 'secret', transcript: 'vault note — must stay excluded', created_at: '2026-10-04T10:00:00Z' },
  ];

  it('listTabs returns REAL note counts (pre-fix: silently zeroed by the 42703 error)', async () => {
    const supa = fakeTabsSupa({ tabs: [], notes: seedNotes });
    const tabs = await listTabs(supa, 'S1', 'private');
    assert.equal(tabs.find((t) => t.id === 'main').noteCount, 2);
    assert.equal(tabs.find((t) => t.id === 'papers').noteCount, 1);
  });

  it('getTabNotes returns the tab notes + total (pre-fix: always empty)', async () => {
    const supa = fakeTabsSupa({ tabs: [], notes: seedNotes });
    const main = await getTabNotes(supa, 'S1', 'main');
    assert.equal(main.totalCount, 2);
    assert.deepEqual(main.notes.map((n) => n.id), ['n2', 'n1']); // newest first
    const papers = await getTabNotes(supa, 'S1', 'papers');
    assert.equal(papers.totalCount, 1);
    assert.equal(papers.notes[0].id, 'n3');
  });

  it('the secret tab stays excluded from counts and reads (vault boundary preserved)', async () => {
    const supa = fakeTabsSupa({ tabs: [], notes: seedNotes });
    const tabs = await listTabs(supa, 'S1', 'private');
    const total = tabs.reduce((a, t) => a + t.noteCount, 0);
    assert.equal(total, 3, 'the secret note (n4) must never be counted');
  });
});
describe('Stage 1 — photo isolation guard (D0 HIGH)', () => {
  const ME = 'aaaaaaaa-1111-2222-3333-444444444444';
  const OTHER = 'bbbbbbbb-1111-2222-3333-444444444444';
  const own = `https://proj.supabase.co/storage/v1/object/public/item-photos/${ME}/photo1.jpg`;
  const foreign = `https://proj.supabase.co/storage/v1/object/public/item-photos/${OTHER}/secret.jpg`;

  it('keeps the caller\'s OWN storage photo URL', async () => {
    const { sanitizePhotoUrl } = await import('../functions/_shared/photo-guard.ts');
    assert.equal(sanitizePhotoUrl(own, ME), own);
  });

  it('NEGATIVE: drops a FOREIGN user\'s storage photo URL (the planted-reference attack)', async () => {
    const { sanitizePhotoUrl } = await import('../functions/_shared/photo-guard.ts');
    assert.equal(sanitizePhotoUrl(foreign, ME), null);
  });

  it('keeps external (non-storage) https image URLs for the vision flow', async () => {
    const { sanitizePhotoUrl } = await import('../functions/_shared/photo-guard.ts');
    const ext = 'https://example.com/some/image.png';
    assert.equal(sanitizePhotoUrl(ext, ME), ext);
  });

  it('rejects non-https, non-strings, and traversal-shaped folders', async () => {
    const { sanitizePhotoUrl } = await import('../functions/_shared/photo-guard.ts');
    assert.equal(sanitizePhotoUrl('http://x/item-photos/' + ME + '/a.jpg', ME), null);
    assert.equal(sanitizePhotoUrl(null, ME), null);
    assert.equal(sanitizePhotoUrl(42, ME), null);
    assert.equal(sanitizePhotoUrl(`https://p/storage/v1/object/public/item-photos/../${OTHER}/s.jpg`, ME), null);
    assert.equal(sanitizePhotoUrl(`https://p/storage/v1/object/public/item-photos/%2e%2e/${OTHER}/s.jpg`, ME), null);
  });

  it('GUARD: chat wires the sanitizer after auth, before any photo use', () => {
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    assert.ok(chat.includes("sanitizePhotoUrl(photoUrl, userId)"),
      'the handler must re-sanitize the client photo_url against the authenticated user');
    assert.ok(chat.includes("from '../_shared/photo-guard.ts'"));
  });
});

describe('Stage 1b — route/classify auth gate (D0 MEDIUM: public AI-spend oracle)', () => {
  for (const fn of ['classify', 'route']) {
    it(`${fn}: requires a user JWT and rate-limits BEFORE any model call`, () => {
      const src = readFileSync(new URL(`../functions/${fn}/index.ts`, import.meta.url), 'utf8');
      assert.ok(src.includes("from '../_shared/edge-auth.ts'") && src.includes('authUserId(req)'),
        `${fn} must resolve the caller from the JWT`);
      assert.ok(src.includes('if (!callerId) return json401();'),
        `${fn} must 401 when no user is resolved`);
      assert.ok(src.includes(`checkRateLimit(adminClient(), callerId, '${fn}')`),
        `${fn} must rate-limit per user`);
      const authAt = src.indexOf('authUserId(req)');
      const aiAt = src.indexOf('chat/completions');
      assert.ok(authAt !== -1 && aiAt !== -1 && authAt < aiAt,
        `${fn}: the gate must precede the model fetch`);
    });
  }

  it('auth-gates manifest no longer lists classify/route as public', () => {
    const check = readFileSync(new URL('./auth-gates-check.mjs', import.meta.url), 'utf8');
    assert.ok(check.includes("classify: ['user-jwt']") && check.includes("route: ['user-jwt']"));
    assert.ok(!check.includes("'stateless text classifier'") && !check.includes("'stateless input router'"),
      'the stale public exceptions (and their no-longer-true rationale) must be gone');
  });
});

describe('T-D2-4 — per-user daily AI spend cap (F-SEC-03)', () => {
  // OWNER AUDIT (final correction): authorization + charge are ONE
  // atomic RPC — try_charge_ai_spend applies the charge only when the
  // resulting total stays <= cap, else returns NULL. This fake mirrors
  // the SQL contract exactly (incl. invalid-input rejection).
  const ledgerSupa = (initial = 0, failAt = null) => {
    const state = { total: initial, rpcCalls: 0 };
    return {
      _state: state,
      rpc: async (fn, args) => {
        state.rpcCalls++;
        if (failAt === fn) return { data: null, error: { message: 'rpc down' } };
        if (fn === 'ai_spend_total') return { data: state.total, error: null };
        if (fn === 'try_charge_ai_spend') {
          const { p_amount, p_cap } = args;
          if (p_amount == null || p_amount < 0 || p_cap == null || p_cap <= 0 || p_amount > p_cap) return { data: null, error: null };
          if (state.total + p_amount > p_cap) return { data: null, error: null };
          state.total += p_amount;
          return { data: state.total, error: null };
        }
        return { data: null, error: { message: 'unknown fn' } };
      },
    };
  };
  const throwingSupa = () => ({
    rpc: () => { throw new Error('rpc exploded'); },
  });

  it('estimates cost from published rates; unknown models price at the premium fallback', async () => {
    const { estimateCostUsd, FALLBACK_RATE } = await import('../functions/_shared/spend.ts');
    // 1M in + 1M out on gpt-5-mini = 0.25 + 2.00
    assert.equal(estimateCostUsd('gpt-5-mini', 1_000_000, 1_000_000), 2.25);
    assert.equal(estimateCostUsd('gpt-4o-mini', 1_000_000, 0), 0.15);
    assert.equal(estimateCostUsd('some-future-model', 1_000_000, 0), FALLBACK_RATE.input);
    assert.equal(estimateCostUsd('gpt-5-mini', null, undefined), 0);
    assert.equal(estimateCostUsd('gpt-5-mini', -5, -5), 0);
    assert.ok(Number.isFinite(estimateCostUsd('gpt-5-mini', 'abc', {})), 'garbage token values never yield NaN');
  });

  it('parses cap config: default $2, env override, kill-switch disables', async () => {
    const { parseSpendCapUsd } = await import('../functions/_shared/spend.ts');
    assert.equal(parseSpendCapUsd(undefined, undefined), 2.0);
    assert.equal(parseSpendCapUsd('0.50', undefined), 0.5);
    assert.equal(parseSpendCapUsd('garbage', undefined), 2.0);
    assert.equal(parseSpendCapUsd('-3', undefined), 2.0);
    assert.equal(parseSpendCapUsd('5', '1'), null);
  });

  it('pre-check is READ-ONLY: allows under the cap without charging; denies at/over it', async () => {
    const { checkSpendCap } = await import('../functions/_shared/spend.ts');
    const s1 = ledgerSupa(0.5);
    assert.equal((await checkSpendCap(s1, 'u1', 2.0)).allowed, true);
    assert.equal(s1._state.total, 0.5, 'the pre-check never charges — enforcement is per-attempt');
    const denied = await checkSpendCap(ledgerSupa(2.0), 'u1', 2.0);
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'cap_reached');
  });

  it('chargeModelCall: ONE atomic authorize+charge — applies under the cap, NULL at the boundary denies', async () => {
    const { chargeModelCall, estimateCallChargeUsd } = await import('../functions/_shared/spend.ts');
    const spec = { inputBytes: 4000, maxOutTokens: 2000 };
    const charge = estimateCallChargeUsd(spec);
    assert.ok(Number.isFinite(charge) && charge > 0);
    const s1 = ledgerSupa(2.0 - charge / 2); // headroom for only half a charge
    const r1 = await chargeModelCall(s1, 'u1', spec, 2.0);
    assert.equal(r1.allowed, false, 'a charge that would cross the cap is rejected atomically');
    assert.equal(r1.reason, 'cap_reached');
    assert.equal(s1._state.total, 2.0 - charge / 2, 'a rejected charge leaves the ledger untouched');
    const s2 = ledgerSupa(0);
    const r2 = await chargeModelCall(s2, 'u1', spec, 2.0);
    assert.equal(r2.allowed, true);
    assert.ok(Math.abs(s2._state.total - charge) < 1e-9, 'an accepted charge lands exactly once');
  });

  it('charge math is a PROVEN bound: UTF-8 bytes (byte-level BPE) + envelope + image bound, at the derived max rate', async () => {
    const { estimateCallChargeUsd, estimateCostUsd, ENVELOPE_TOKEN_ALLOWANCE, IMAGE_TOKEN_BOUND, FALLBACK_RATE } = await import('../functions/_shared/spend.ts');
    const c = estimateCallChargeUsd({ inputBytes: 10000, maxOutTokens: 2000 });
    const expect = estimateCostUsd('__fallback__', 10000 + ENVELOPE_TOKEN_ALLOWANCE, 2000);
    assert.ok(Math.abs(c - expect) < 1e-12);
    const withImg = estimateCallChargeUsd({ inputBytes: 0, maxOutTokens: 400, images: 1 });
    assert.ok(Math.abs(withImg - estimateCostUsd('__fallback__', ENVELOPE_TOKEN_ALLOWANCE + IMAGE_TOKEN_BOUND, 400)) < 1e-12);
    assert.ok(FALLBACK_RATE.input >= 0.8 && FALLBACK_RATE.output >= 4.0, 'priced at the component-wise table maximum (qwen rates dominate)');
  });

  it('NEGATIVE: FALLBACK_RATE dominates EVERY rate-table entry (a pricier future model cannot silently break the bound)', async () => {
    const { MODEL_RATES_USD_PER_1M, FALLBACK_RATE } = await import('../functions/_shared/spend.ts');
    for (const [model, r] of Object.entries(MODEL_RATES_USD_PER_1M)) {
      assert.ok(FALLBACK_RATE.input >= r.input && FALLBACK_RATE.output >= r.output, `${model} exceeds the fallback rate`);
    }
    // The round-3 violation this pins: qwen output $4.00 > gpt-5-mini $2.00.
    assert.ok(MODEL_RATES_USD_PER_1M['qwen/qwen3.8-27b'].output > MODEL_RATES_USD_PER_1M['gpt-5-mini'].output);
  });

  it('NEGATIVE: the byte bound cannot be undercut by dense tokenization (Arabic/emoji payloads measure in BYTES, not chars)', async () => {
    const { byteLen, payloadBytes, estimateCallChargeUsd } = await import('../functions/_shared/spend.ts');
    const ar = 'ذاكرة'; // 5 Arabic chars, 10 UTF-8 bytes
    assert.equal(byteLen(ar), 10);
    assert.equal(byteLen('🔥'), 4); // 1 visible char, 2 UTF-16 units, 4 bytes
    assert.equal(payloadBytes([{ role: 'user', content: ar }]), 10);
    // A char-based estimate would have charged ceil(6 x 0.75) = 5 tokens;
    // the byte bound charges 10 — dense-script input can no longer slip
    // under the reservation.
    const charge = estimateCallChargeUsd({ inputBytes: byteLen(ar), maxOutTokens: 10 });
    const charEra = (Math.ceil(5 * 0.75) + 96) * 0.8 / 1e6 + 10 * 4.0 / 1e6;
    assert.ok(charge > charEra - 1e-12, 'byte-bound charge covers the old char-era underestimate');
  });

  it('NEGATIVE: IMAGE_TOKEN_BOUND covers the documented gpt-4o-mini worst case (2,833 + 8 tiles x 5,667 = 48,169)', async () => {
    const { IMAGE_TOKEN_BOUND } = await import('../functions/_shared/spend.ts');
    assert.ok(IMAGE_TOKEN_BOUND >= 48169, `bound ${IMAGE_TOKEN_BOUND} must cover the documented tile-algorithm worst case`);
  });

  it('FAIL-CLOSED: invalid estimates deny WITHOUT any RPC (missing/NaN/negative)', async () => {
    const { chargeModelCall } = await import('../functions/_shared/spend.ts');
    for (const spec of [{ inputBytes: NaN, maxOutTokens: 100 }, { inputBytes: -5, maxOutTokens: 100 }, { inputBytes: 100, maxOutTokens: 0 }, { inputBytes: 100 }, {}, null]) {
      const s1 = ledgerSupa(0);
      const r = await chargeModelCall(s1, 'u1', spec, 2.0);
      assert.equal(r.allowed, false, `spec ${JSON.stringify(spec)} must deny`);
      assert.equal(r.reason, 'check_failed');
      assert.equal(s1._state.rpcCalls, 0, 'no RPC is attempted for an invalid estimate');
    }
  });

  it('FAIL-CLOSED: pre-check read error denies; charge RPC error denies; thrown RPC denies', async () => {
    const { checkSpendCap, chargeModelCall } = await import('../functions/_shared/spend.ts');
    assert.equal((await checkSpendCap(ledgerSupa(0, 'ai_spend_total'), 'u1', 2.0)).reason, 'check_failed');
    const rc = await chargeModelCall(ledgerSupa(0, 'try_charge_ai_spend'), 'u1', { inputBytes: 100, maxOutTokens: 100 }, 2.0);
    assert.equal(rc.allowed, false); assert.equal(rc.reason, 'check_failed');
    const rt = await chargeModelCall(throwingSupa(), 'u1', { inputBytes: 100, maxOutTokens: 100 }, 2.0);
    assert.equal(rt.allowed, false); assert.equal(rt.reason, 'check_failed');
    const rp = await checkSpendCap(throwingSupa(), 'u1', 2.0);
    assert.equal(rp.allowed, false); assert.equal(rp.reason, 'check_failed');
  });

  it('kill-switch (cap=null) allows pre-check AND charges without touching the ledger', async () => {
    const { checkSpendCap, chargeModelCall } = await import('../functions/_shared/spend.ts');
    assert.equal((await checkSpendCap(throwingSupa(), 'u1', null)).allowed, true);
    assert.equal((await chargeModelCall(throwingSupa(), 'u1', { inputBytes: 100, maxOutTokens: 100 }, null)).allowed, true);
  });

  it('AUDIT REGRESSION: enforcement binds regardless of ai_events volume (the gate never sums events)', async () => {
    const { chargeModelCall } = await import('../functions/_shared/spend.ts');
    // Ledger at cap + empty events table -> still denied. The pre-0044
    // gate would have summed zero events and allowed.
    const r = await chargeModelCall(ledgerSupa(2.0), 'heavy-user', { inputBytes: 10, maxOutTokens: 10 }, 2.0);
    assert.equal(r.allowed, false);
    assert.equal(r.reason, 'cap_reached');
  });

  it('sumSpendFromEvents paginates FULLY: exact total past the old 5,000-row limit (PostgREST page cap emulated)', async () => {
    const { sumSpendFromEvents, estimateCostUsd } = await import('../functions/_shared/spend.ts');
    // 6,000 events; the fake honors PostgREST semantics: .range(a,b)
    // returns at most the requested window, and any single response is
    // capped at 1,000 rows — the old .limit(5000) read would have seen
    // at most 1,000-5,000 of these rows and undercounted.
    const rows = Array.from({ length: 6000 }, () => ({ model: 'gpt-4o-mini', prompt_tokens: 1000, completion_tokens: 0 }));
    const pagedSupa = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({
                range: async (a, b) => ({ data: rows.slice(a, Math.min(b + 1, a + 1000)), error: null }),
              }),
            }),
          }),
        }),
      }),
    };
    const total = await sumSpendFromEvents(pagedSupa, 'u1');
    const expected = 6000 * estimateCostUsd('gpt-4o-mini', 1000, 0);
    assert.ok(Math.abs(total - expected) < 1e-6, `expected exact ${expected}, got ${total}`);
    assert.ok(5000 * estimateCostUsd('gpt-4o-mini', 1000, 0) < total, 'the truncated read would have undercounted');
  });

  it('GUARD: chat/ask/extract enforce the cap on their model paths', () => {
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    const ask = readFileSync(new URL('../functions/ask/index.ts', import.meta.url), 'utf8');
    const extract = readFileSync(new URL('../functions/extract/index.ts', import.meta.url), 'utf8');
    assert.ok(chat.includes('checkSpendCap(admin, userId)'), 'chat pre-checks the ledger once per request');
    assert.ok(chat.includes('chargeModelCall(gate.supa, gate.userId'), 'chat charges per attempt inside its model wrappers');
    assert.ok(chat.includes('__SPEND_CAP__') && chat.includes('spendCapMessage(ar)'),
      'a denied charge surfaces the graceful cap answer');
    assert.ok(chat.includes('spend.allowed && !inVault'), 'chat split path still respects the pre-check');
    assert.ok(ask.includes('checkSpendCap(admin, userId)') && ask.includes('chargeModelCall(admin, userId'), 'ask pre-checks and charges per attempt');
    assert.ok(extract.includes('checkSpendCap(supabase, rlUser)') && extract.includes('chargeModelCall(supabase, rlUser'), 'extract pre-checks and charges per attempt against the note owner');
    const learn = readFileSync(new URL('../functions/memory-learn/index.ts', import.meta.url), 'utf8');
    assert.ok(learn.includes('chargeModelCall'), 'memory-learn (an AI path) is charged too');
    // INVENTORY (owner correction round 2): EVERY edge function that
    // calls a model endpoint charges the ledger — route, classify and
    // memory-consolidate included. transcribe is the sole exclusion
    // (per-audio-minute Whisper on the free tier, rate-limited, no
    // token telemetry — disclosed in the audit register).
    for (const fn of ['route', 'classify']) {
      const src = readFileSync(new URL(`../functions/${fn}/index.ts`, import.meta.url), 'utf8');
      assert.ok(src.includes('chat/completions') && src.includes('chargeModelCall'), `${fn} charges its model call`);
    }
    const cons = readFileSync(new URL('../functions/memory-consolidate/index.ts', import.meta.url), 'utf8');
    assert.ok(cons.includes('chargeModelCall'), 'memory-consolidate charges its per-user episode call');
    assert.ok(chat.includes("if (e instanceof Error && e.message === '__SPEND_CAP__') throw e;"),
      'callVision rethrows cap denials instead of swallowing them as vision failures');
  });

  it('R1: the vision path is gated AND metered (it was neither)', () => {
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    const visionAt = chat.indexOf('vres = await callVision');
    assert.ok(visionAt !== -1, 'vision call site present');
    const before = chat.slice(Math.max(0, visionAt - 1500), visionAt);
    assert.ok(before.includes('if (!spend.allowed)'), 'vision model call must sit behind the spend gate');
    assert.ok(before.includes("detail: `vision:"), 'vision denial is ops-logged as a spend_cap hit');
    const after = chat.slice(visionAt, visionAt + 900);
    assert.ok(after.includes('logAi(admin,') && after.includes('ai.visionModel') && after.includes('prompt_tokens'),
      'vision calls are metered into ai_events with usage');
    assert.ok(chat.includes('Promise<{ text: string; usage: any } | null>'),
      'callVision returns usage for metering');
  });
});

describe('Launch readiness PR-D — LOW findings closure (F-INT-05/07)', () => {
  it('chainToExtract retries with backoff and surfaces FINAL failure (never swallows silently)', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    const { chainToExtract } = await import('../functions/_shared/extract-chain.ts');
    let calls = 0;
    const alwaysFail = async () => { calls++; return { ok: false, status: 500 }; };
    let failedNote = null;
    const ok = await chainToExtract('note-1', async (nid) => { failedNote = nid; }, alwaysFail);
    assert.equal(ok, false);
    assert.equal(calls, 3, 'three attempts before giving up');
    assert.equal(failedNote, 'note-1', 'final failure is surfaced to the caller logger');
    // succeeds on the second attempt -> true, no failure callback
    let calls2 = 0; let failed2 = false;
    const flaky = async () => { calls2++; return { ok: calls2 >= 2, status: calls2 >= 2 ? 200 : 503 }; };
    const ok2 = await chainToExtract('note-2', async () => { failed2 = true; }, flaky);
    assert.equal(ok2, true);
    assert.equal(calls2, 2);
    assert.equal(failed2, false);
  });

  it('GUARD: transcribe/chat chain via the retried helper and ops-log final failures', () => {
    for (const fn of ['transcribe', 'chat']) {
      const src = readFileSync(new URL(`../functions/${fn}/index.ts`, import.meta.url), 'utf8');
      assert.ok(src.includes('chainToExtract'), `${fn} uses the retried chaining helper`);
      assert.ok(src.includes('extract.chain_failed'), `${fn} ops-logs final chain failures`);
    }
  });

  it('GUARD: admin-stats has NO row-limit truncation left (F-INT-05)', () => {
    const src = readFileSync(new URL('../functions/admin-stats/index.ts', import.meta.url), 'utf8');
    assert.ok(!src.includes('.limit('), 'every aggregate is paginated or exact-counted');
    assert.ok(src.includes('fetchAll'), 'the pagination helper is present');
  });
});

describe('PR-B hardening — F-SEC-04/05/06/07/08', () => {
  it('timingSafeEqual: exact match only, length- and content-sensitive', async () => {
    const { timingSafeEqual } = await import('../functions/_shared/edge-auth.ts');
    assert.equal(timingSafeEqual('s3cret-token', 's3cret-token'), true);
    assert.equal(timingSafeEqual('s3cret-token', 's3cret-tokem'), false);
    assert.equal(timingSafeEqual('s3cret-token', 's3cret'), false);
    assert.equal(timingSafeEqual('', ''), false);
    assert.equal(timingSafeEqual('', 'x'), false);
    assert.equal(timingSafeEqual('x', ''), false);
  });

  it('GUARD: no admin function compares the token with !== anymore', () => {
    for (const fn of ['admin-ai-governance', 'admin-broadcast', 'admin-catalog', 'admin-set-limits', 'admin-stats', 'admin-subscribe', 'admin-user']) {
      const src = readFileSync(new URL(`../functions/${fn}/index.ts`, import.meta.url), 'utf8');
      assert.ok(src.includes('timingSafeEqual(got, expected)'), `${fn} must use the constant-time compare`);
      assert.ok(!src.includes('got !== expected'), `${fn} must not early-exit compare the admin token`);
    }
    const mc = readFileSync(new URL('../functions/memory-consolidate/index.ts', import.meta.url), 'utf8');
    assert.ok(mc.includes('timingSafeEqual(cronHeader, cronSecret)'), 'cron secret compare is constant-time too');
  });

  it('sanitizeTelemetryText strips secrets, PII shapes, and control chars', async () => {
    const { sanitizeTelemetryText } = await import('../functions/_shared/sanitize.ts');
    const dirty = 'Boom at https://x.co/p?token=abc123&u=4 for user@mail.com\nnext line\ttab';
    const clean = sanitizeTelemetryText(dirty, 200);
    assert.ok(!clean.includes('abc123') && !clean.includes('user@mail.com'));
    assert.ok(!clean.includes('\n') && !clean.includes('\t'));
    const jwt = sanitizeTelemetryText('hdr eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_here ok', 200);
    assert.ok(!jwt.includes('eyJhbGciOiJIUzI1NiJ9'));
    assert.ok(sanitizeTelemetryText('Bearer abc.def-123', 200).includes('[redacted]'));
    assert.equal(sanitizeTelemetryText('x'.repeat(500), 50).length, 50);
    assert.equal(sanitizeTelemetryText(null, 50), '');
    // control characters are stripped (the whole point of the class):
    const ctrl = sanitizeTelemetryText('abc', 50);
    assert.ok(!ctrl.includes('') && !ctrl.includes(''));
  });

  it('retryDelayMs grows exponentially with bounded jitter', async () => {
    const { retryDelayMs } = await import('../functions/_shared/backoff.ts');
    const noJitter = () => 0;
    assert.equal(retryDelayMs(0, 600, 8000, noJitter), 600);
    assert.equal(retryDelayMs(1, 600, 8000, noJitter), 1200);
    assert.equal(retryDelayMs(2, 600, 8000, noJitter), 2400);
    assert.equal(retryDelayMs(10, 600, 8000, noJitter), 8000);
    const j = retryDelayMs(0, 600, 8000, () => 0.999);
    assert.ok(j >= 600 && j < 850);
  });

  it('GUARD: join-family claims invite uses atomically + rate-limits; codes are 10 chars', () => {
    const jf = readFileSync(new URL('../functions/join-family/index.ts', import.meta.url), 'utf8');
    assert.ok(jf.includes("rpc('claim_invite_use'"), 'redemption must claim via the atomic RPC');
    assert.ok(!jf.includes('used_count: invite.used_count + 1'), 'the stale check-then-increment write must be gone');
    assert.ok(jf.includes("checkRateLimit(admin, user.id, 'join-family')"), 'redemption attempts are rate-limited');
    const mig = readFileSync(new URL('../migrations/0040_invite_atomic_claim.sql', import.meta.url), 'utf8');
    assert.ok(mig.includes('used_count < max_uses') && mig.includes('used_count = used_count + 1'),
      'the claim is one conditional UPDATE');
    const client = readFileSync(new URL('../../packages/voice-engine/src/client.ts', import.meta.url), 'utf8');
    assert.ok(client.includes('new Uint8Array(10)'), 'new invite codes are 10 chars (~49.6 bits)');
  });

  it('GUARD: execute_action claims the row atomically; eval_mode is audit-logged', () => {
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    assert.ok(chat.includes(".eq('status', 'approved')") && chat.includes("status: 'executing'"),
      'execution requires winning the approved→executing claim');
    assert.ok(chat.includes("kind: 'eval_mode.impersonation'"), 'impersonation is written to the audit log');
    assert.ok(chat.includes('retryDelayMs(2 - retries)'), 'provider retries use exponential backoff');
    assert.ok(!chat.includes('setTimeout(r, 1500)'), 'the fixed 1.5s retry is gone');
    // review N1: approve/cancel must never touch an executing row
    const n1 = (chat.match(/execution in progress/g) ?? []).length;
    assert.ok(n1 >= 2, 'approve + cancel both refuse mid-execution rows');
    assert.ok(chat.includes("if (row.status === 'executing') return { error: 'execution in progress' };"),
      'the refusal is a status guard, not a comment');
  });

  it('GUARD: report-error stores only sanitized telemetry', () => {
    const re = readFileSync(new URL('../functions/report-error/index.ts', import.meta.url), 'utf8');
    assert.ok(re.includes('sanitizeTelemetryText(b?.message'), 'message is sanitized');
    assert.ok(re.includes('sanitizeTelemetryText(b.stack') && re.includes('sanitizeTelemetryText(b.context'));
    assert.ok(!re.includes('String(b?.message'), 'raw client text must not reach storage');
  });
});

describe('D2 durable memory — dedup auditability, retention separation (spec §6/§10/§11)', async () => {
  const { findDuplicateCandidates, mergeFacts, planMemoryMaintenance } = await import('../functions/_shared/memory.ts');
  const row = (over) => ({
    id: 'x', title: 'k', details: 'نفس النص', meta: { mkey: 'a', importance: 3 },
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
  });

  it('candidates: identical text with different keys is surfaced for the user', () => {
    const pairs = findDuplicateCandidates([
      row({ id: '1', meta: { mkey: 'a', importance: 3 } }),
      row({ id: '2', meta: { mkey: 'b', importance: 3 } }),
    ]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].reason, 'same_text_diff_key');
  });

  it('candidates: retry duplicates (same key, created within 24h) are EXCLUDED — the job auto-merges those', () => {
    const pairs = findDuplicateCandidates([
      row({ id: '1', created_at: '2026-10-01T00:00:00Z' }),
      row({ id: '2', created_at: '2026-10-01T12:00:00Z' }),
    ]);
    assert.equal(pairs.length, 0);
  });

  it('candidates: same key but days apart is a stale duplicate for review', () => {
    const pairs = findDuplicateCandidates([
      row({ id: '1', created_at: '2026-10-01T00:00:00Z' }),
      row({ id: '2', created_at: '2026-10-05T00:00:00Z' }),
    ]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].reason, 'same_text_stale_dup');
  });

  it('candidates: episodes never appear; different text neither', () => {
    assert.equal(findDuplicateCandidates([
      row({ id: '1', meta: { mkey: 'a', mcat: 'episode' } }),
      row({ id: '2', meta: { mkey: 'b', mcat: 'episode' } }),
    ]).length, 0);
    assert.equal(findDuplicateCandidates([
      row({ id: '1' }), row({ id: '2', details: 'نص مختلف تماما', meta: { mkey: 'b' } }),
    ]).length, 0);
  });

  it('mergeFacts: provenance preserved, importance bumped+capped, loser trashed (never deleted)', async () => {
    const writes = [];
    const fake = {
      from() {
        const chain = {
          _op: null, _payload: null,
          update(p) { chain._op = 'update'; chain._payload = p; return chain; },
          eq() { return chain; },
          async then(res) { writes.push(chain); res({ data: null, error: null }); },
        };
        return chain;
      },
    };
    const keep = row({ id: 'k', meta: { mkey: 'a', importance: 5 } });
    const loser = row({ id: 'l', details: 'النص القديم', meta: { mkey: 'b', importance: 2 } });
    assert.equal(await mergeFacts(fake, keep, loser), true);
    const keeperWrite = writes.find((w) => w._payload?.meta?.previous_versions);
    assert.ok(keeperWrite, 'keeper write carries previous_versions');
    assert.equal(keeperWrite._payload.meta.importance, 5, 'importance capped at 5');
    assert.equal(keeperWrite._payload.meta.previous_versions.length, 1);
    assert.equal(keeperWrite._payload.meta.previous_versions[0].from_id, 'l');
    const loserWrite = writes.find((w) => w._payload?.status === 'trashed');
    assert.ok(loserWrite, 'loser is trashed');
    assert.equal(loserWrite._payload.meta.trash_reason, 'merged_duplicate');
    assert.ok(!writes.some((w) => w._op === 'delete'), 'merge NEVER hard-deletes');
  });

  it('mergeFacts: merged_text overrides the keeper text; same-id is a no-op', async () => {
    const writes = [];
    const fake = {
      from() {
        const chain = {
          _op: null, _payload: null,
          update(p) { chain._op = 'update'; chain._payload = p; return chain; },
          eq() { return chain; },
          async then(res) { writes.push(chain); res({ data: null, error: null }); },
        };
        return chain;
      },
    };
    const keep = row({ id: 'k' });
    assert.equal(await mergeFacts(fake, keep, row({ id: 'l' }), 'النص المدمج'), true);
    assert.equal(writes[0]._payload.details, 'النص المدمج');
    assert.equal(await mergeFacts(fake, keep, keep), false);
  });

  it('GUARD: chat exposes the duplicate tools; MERGE IS PREVIEW-ONLY (owner delete-safety ruling)', () => {
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    assert.ok(chat.includes("case 'list_memory_duplicates'"), 'list_memory_duplicates dispatched');
    assert.ok(chat.includes("case 'merge_memories'"), 'merge_memories dispatched');
    assert.ok(chat.includes('memory not found in your private space'), 'ids are validated against the caller\u2019s own facts');
    // F1: the model tool may ONLY create a preview — the merge itself
    // runs in the deterministic fast path after the user sends the code.
    const toolStart = chat.indexOf('async function toolMergeMemories');
    const toolRegion = chat.slice(toolStart, toolStart + 2400);
    assert.ok(toolRegion.includes('createMergePreview'), 'the tool creates a preview');
    assert.ok(toolRegion.includes('needs_confirmation: true'), 'the tool returns a confirmation code');
    assert.ok(!toolRegion.includes('mergeFacts('), 'the tool must NEVER execute the merge itself');
    assert.ok(!toolRegion.includes('trashFact'), 'the tool must never trash anything');
    assert.ok(chat.includes(".in('action_type', ['forget_memory', 'merge_memory'])"), 'the fast path serves both rails');
    assert.ok(chat.includes('executeConfirmedMerge(admin, claimed)'), 'merge executes only after validate + atomic claim');
    const brain = readFileSync(new URL('../functions/_shared/app-brain.ts', import.meta.url), 'utf8');
    assert.ok(brain.includes('PREVIEW-ONLY like forget_fact'), 'the model contract states preview-only');
    assert.ok(brain.includes('NEVER confirm on the user'), 'no model-side confirmation');
  });

  it('GUARD: consolidate dry-run writes nothing and every run reports to ops_events (§6.3)', () => {
    const job = readFileSync(new URL('../functions/memory-consolidate/index.ts', import.meta.url), 'utf8');
    assert.ok(job.includes("searchParams.get('dry_run') === '1'"), 'dry_run parsed');
    assert.ok(job.includes('if (dryRun) report.merged++;'), 'dry-run counts merges without trashing');
    assert.ok(job.includes('planMemoryMaintenance(facts, new Date())'), 'dry-run uses the pure planner');
    assert.ok(job.includes("kind: dryRun ? 'memory.consolidate.dry_run' : 'memory.consolidate'"), 'runs are reported to ops_events');
  });

  it('GUARD (§10): the transcript sweep touches ONLY chat_sessions — never items', () => {
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const start = app.indexOf('const loadHistory');
    assert.ok(start > 0, 'loadHistory located');
    const region = app.slice(start, start + 1600);
    assert.ok(region.includes("from('chat_sessions')") && region.includes(".lt('expires_at'"),
      'expired sessions are swept on history load');
    const sweepLine = region.split('\n').find((l) => l.includes("from('chat_sessions')") && l.includes('delete'));
    assert.ok(sweepLine, 'the sweep is a chat_sessions delete');
    assert.ok(!/from\('items'\)[^;]*\.delete\(\)/.test(region), 'the sweep region contains no items delete');
  });

  it('GUARD (§1 contract): the client memory delete goes through TRASH, not a hard delete', () => {
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const at = app.indexOf('deleteMemoryItem');
    const region = app.slice(at, at + 1400);
    assert.ok(region.includes("status: 'trashed'"), 'replaced facts are trashed');
    assert.ok(region.includes("trash_reason: 'replaced_by_restatement'"), 'the trash reason is recorded');
    assert.ok(!region.includes(".from('items').delete()"), 'no hard delete of a memory row remains in the client memory path');
  });
});

describe('D2 merge rail — preview-only merge on the forget confirmation machinery (review F1)', async () => {
  const { createMergePreview, executeConfirmedMerge, validateForgetConfirmation, claimForgetPreview, loadFacts } =
    await import('../functions/_shared/memory.ts');
  const UID = 'user-1';
  const dupA = () => ({ id: 'a', title: 'العنوان', details: 'نفس النص', meta: { mkey: 'k:a', importance: 2 }, status: 'open', kind: 'memory', space_id: 'S1', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' });
  const dupB = () => ({ id: 'b', title: 'العنوان', details: 'نفس النص', meta: { mkey: 'k:b', importance: 4 }, status: 'open', kind: 'memory', space_id: 'S1', created_at: '2026-10-05T00:00:00Z', updated_at: '2026-10-05T00:00:00Z' });

  it('preview issues a code and trashes NOTHING; non-duplicate pairs are refused', async () => {
    const supa = fakeSupa([dupA(), dupB()]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createMergePreview(supa, UID, 'S1', facts[0], facts[1]);
    assert.ok(p && /^\d{6}$/.test(p.confirm_code), 'a 6-digit code is issued');
    assert.ok(supa._db.items.every((i) => i.status === 'open'), 'preview alone changes no memory');
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    assert.equal(row.action_type, 'merge_memory');
    const notDup = await createMergePreview(supa, UID, 'S1', facts[0], { ...facts[1], id: 'z', details: 'نص مختلف' });
    assert.equal(notDup, null, 'a pair that is not an identical-text duplicate gets no code');
  });

  it('full rail: validate + claim + execute merges with provenance and trashes the loser', async () => {
    const supa = fakeSupa([dupA(), dupB()]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createMergePreview(supa, UID, 'S1', facts[0], facts[1]);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    assert.equal(validateForgetConfirmation(row, UID, p.confirm_code, new Date()).ok, true);
    const claimed = await claimForgetPreview(supa, row.id);
    const res = await executeConfirmedMerge(supa, claimed);
    assert.equal(res.merged, true);
    // loadFacts is newest-first: facts[0] (id 'b', the keeper) survives;
    // facts[1] (id 'a', the loser) is trashed with provenance on 'b'.
    const a = supa._db.items.find((i) => i.id === 'a');
    const b = supa._db.items.find((i) => i.id === 'b');
    assert.equal(a.status, 'trashed');
    assert.equal(a.meta.trash_reason, 'merged_duplicate');
    assert.equal(b.meta.previous_versions.length, 1);
    assert.equal(b.meta.previous_versions[0].from_id, 'a');
    assert.equal(b.meta.importance, 5, 'max(4,2)+1 capped at 5');
    assert.equal(supa._db.pending_actions.find((r) => r.id === p.action_id).status, 'executed');
  });

  it('execution refuses when a fact changed since the preview (no longer duplicates)', async () => {
    const supa = fakeSupa([dupA(), dupB()]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createMergePreview(supa, UID, 'S1', facts[0], facts[1]);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    const claimed = await claimForgetPreview(supa, row.id);
    supa._db.items.find((i) => i.id === 'b').details = 'اتعدلت بعد المعاينة';
    const res = await executeConfirmedMerge(supa, claimed);
    assert.equal(res.merged, false);
    assert.ok(supa._db.items.every((i) => i.status === 'open'), 'nothing was trashed');
  });

  it('execution refuses an UNCLAIMED row — validation alone never merges', async () => {
    const supa = fakeSupa([dupA(), dupB()]);
    const facts = await loadFacts(supa, 'S1');
    const p = await createMergePreview(supa, UID, 'S1', facts[0], facts[1]);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    const res = await executeConfirmedMerge(supa, row); // still 'pending'
    assert.equal(res.merged, false);
    assert.ok(supa._db.items.every((i) => i.status === 'open'));
  });
});

describe('BUGFIX 0042 — items.updated_at exists (memory engine selects/orders by it)', () => {
  it('GUARD: migration 0042 adds the column, backfills, and installs the touch trigger', () => {
    const mig = readFileSync(new URL('../migrations/0042_items_updated_at.sql', import.meta.url), 'utf8');
    assert.ok(mig.includes('add column updated_at'), 'column added');
    assert.ok(mig.includes("column_name = 'updated_at'"), 'the add+backfill are guarded on the column being absent (re-apply is a no-op)');
    assert.ok(mig.includes('set updated_at = created_at'), 'existing rows backfilled from created_at');
    assert.ok(mig.includes('create trigger items_touch_updated_at'), 'BEFORE UPDATE trigger keeps it current');
    assert.ok(mig.includes('before update on public.items'), 'trigger is on items');
  });

  it('GUARD: every items select in the memory engine only names columns the schema has', () => {
    const engine = readFileSync(new URL('../functions/_shared/memory.ts', import.meta.url), 'utf8');
    const selects = engine.match(/\.select\('([^']+)'\)/g) ?? [];
    assert.ok(selects.length > 0);
    // The schema truth this guards: items columns per migrations 0002+
    // plus 0035 (status values) and 0042 (updated_at).
    const itemsCols = new Set(['id', 'space_id', 'note_id', 'kind', 'title', 'details', 'due_at', 'status', 'created_by', 'created_at', 'assigned_to', 'meta', 'list_id', 'bought_at', 'reminder_sent_at', 'vault_id', 'updated_at']);
    // Only the items selects (they contain title/details/meta together)
    const itemsSelects = selects.filter((s) => s.includes('details') && s.includes('meta'));
    assert.ok(itemsSelects.length >= 3, 'loadFacts + trash/review listings found');
    for (const s of itemsSelects) {
      const cols = s.match(/\((.*)\)/)[1].replace(/'/g, '').split(',').map((c) => c.trim());
      for (const c of cols) assert.ok(itemsCols.has(c), `column '${c}' must exist on items`);
    }
  });
});

describe('D3 PR-A — janitor allowlist, scrubber, index migration (T-D3-1/2/3)', async () => {
  const { JANITOR_ALLOWLIST, JANITOR_NEVER, isJanitorTarget, janitorCutoff, runJanitor } =
    await import('../functions/_shared/janitor.ts');
  const { scrubSentryEvent, scrubString } = await import('../functions/_shared/sentry-scrub.ts');

  it('the janitor allowlist is exactly the three telemetry tables', () => {
    assert.deepEqual(JANITOR_ALLOWLIST.map((t) => t.table).sort(), ['ai_events', 'ops_events', 'rate_limits']);
    for (const t of JANITOR_NEVER) assert.equal(isJanitorTarget(t), false, `${t} must never be a janitor target`);
    assert.equal(isJanitorTarget('items'), false);
    assert.equal(isJanitorTarget('pending_actions'), false);
  });

  it('cutoffs: rate_limits 2d, ai/ops events 90d', () => {
    const now = new Date('2026-10-12T00:00:00Z');
    const byTable = Object.fromEntries(JANITOR_ALLOWLIST.map((t) => [t.table, janitorCutoff(t, now)]));
    assert.equal(byTable['rate_limits'], '2026-10-10T00:00:00.000Z');
    assert.equal(byTable['ai_events'], '2026-07-14T00:00:00.000Z');
    assert.equal(byTable['ops_events'], '2026-07-14T00:00:00.000Z');
  });

  it('runJanitor dry-run counts but deletes NOTHING; execute deletes only allowlisted rows', async () => {
    const mkDb = () => ({
      rate_limits: [{ window_start: '2026-10-01T00:00:00Z' }, { window_start: '2026-10-12T00:00:00Z' }],
      ai_events: [{ id: 1, created_at: '2026-01-01T00:00:00Z' }, { id: 2, created_at: '2026-10-12T00:00:00Z' }],
      ops_events: [{ id: 1, created_at: '2026-01-01T00:00:00Z' }],
      items: [{ id: 'keep-me', created_at: '2020-01-01T00:00:00Z' }],
    });
    const fakeFor = (db) => ({
      from(table) {
        const filters = [];
        let op = 'select';
        const rows = () => (db[table] ?? []).filter((r) => filters.every(([o, c, v]) => (o === '<' ? r[c] < v : r[c] >= v)));
        const b = {
          select(_c, o) { if (o?.head) { b._head = true; } return b; },
          lt(c, v) { filters.push(['<', c, v]); return b; },
          gte(c, v) { filters.push(['>=', c, v]); return b; },
          order() { return b; },
          limit() { return b; },
          in(_c, vals) { b._in = vals; return b; },
          delete() { op = 'delete'; return b; },
          then(res) {
            if (op === 'delete') {
              if (b._in) db[table] = db[table].filter((r) => !b._in.includes(r.id));
              else db[table] = db[table].filter((r) => !rows().includes(r));
              return res({ error: null });
            }
            const m = rows();
            return res(b._head ? { data: null, count: m.length, error: null } : { data: m, error: null });
          },
        };
        return b;
      },
    });
    const now = new Date('2026-10-12T00:00:00Z');
    const db1 = mkDb();
    const dry = await runJanitor(fakeFor(db1), { execute: false, now });
    assert.ok(dry.every((r) => r.deleted === 0), 'dry-run deletes nothing');
    assert.equal(dry.find((r) => r.table === 'ai_events').would_delete, 1);
    assert.equal(db1.ai_events.length, 2, 'dry-run left rows intact');
    const db2 = mkDb();
    const wet = await runJanitor(fakeFor(db2), { execute: true, now });
    assert.equal(db2.ai_events.length, 1, 'only the stale ai_event is gone');
    assert.equal(db2.ops_events.length, 0);
    assert.equal(db2.rate_limits.length, 1);
    assert.equal(db2.items.length, 1, 'user data is structurally unreachable');
    assert.ok(wet.every((r) => r.deleted <= r.would_delete));
  });

  it('GUARD: the janitor function is double-gated and reports to ops', () => {
    const fn = readFileSync(new URL('../functions/telemetry-janitor/index.ts', import.meta.url), 'utf8');
    assert.ok(fn.includes("searchParams.get('execute') === '1'"), 'execute requires the query flag');
    assert.ok(fn.includes("Deno.env.get('JANITOR_ENABLED') === '1'"), 'execute requires the env kill-switch');
    assert.ok(fn.includes('execute = wantExecute && enabled'), 'both gates must agree');
    assert.ok(!fn.includes("from('items')") && !fn.includes("from('notes')"), 'the function never names user tables');
  });

  it('scrubber: credentials, JWTs, emails, URL queries and user objects never survive', () => {
    const ev = scrubSentryEvent({
      message: 'failed for user a.b@example.com with Bearer abc.def.ghi',
      user: { id: 'u1', email: 'a.b@example.com' },
      request: { url: 'https://x.supabase.co/storage/v1/object/sign/item-photos/u/p.jpg?token=SECRET', data: { note: 'حليب' }, headers: { authorization: 'Bearer abc' } },
      extra: { api_key: 'sk-123', nested: { jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature' }, keep: 'plain' },
    });
    const s = JSON.stringify(ev);
    assert.ok(!s.includes('a.b@example.com'), 'emails stripped');
    assert.ok(!s.includes('SECRET') && !s.includes('sk-123'), 'secrets stripped');
    assert.ok(!s.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWTs stripped');
    assert.equal(ev.user, undefined, 'user object removed');
    assert.equal(ev.request.data, undefined, 'request body removed');
    assert.equal(ev.extra.keep, 'plain', 'innocuous fields survive');
    assert.ok(scrubString('x'.repeat(500)).length <= 300, 'strings are capped');
    // review N2: an opaque-token URL under a non-'url' key loses its query
    const ev2 = scrubSentryEvent({ photo: 'https://cdn.example.com/p.jpg?sig=OPAQUESECRET123&dl=1' });
    assert.equal(ev2.photo, 'https://cdn.example.com/p.jpg', 'URL queries are stripped under ANY key');
  });

  it('GUARD (review N1): the janitor counts via each target\u2019s own column — rate_limits has no id', () => {
    const j = readFileSync(new URL('../functions/_shared/janitor.ts', import.meta.url), 'utf8');
    assert.ok(j.includes(".select(target.column, { count: 'exact', head: true })"), 'count selects the timestamp column');
    assert.ok(!j.includes(".select('id', { count: 'exact', head: true })"), 'the id-count bug cannot return');
  });

  it('GUARD: migration 0043 carries the measured index set + pg_trgm', () => {
    const mig = readFileSync(new URL('../migrations/0043_d3_search_indexes.sql', import.meta.url), 'utf8');
    for (const name of ['items_title_trgm', 'items_details_trgm', 'notes_transcript_trgm', 'items_note_id_idx', 'items_space_kind_status_idx']) {
      assert.ok(mig.includes(name), `${name} present`);
    }
    assert.ok(mig.includes('create extension if not exists pg_trgm'), 'pg_trgm enabled');
    assert.ok(mig.includes('gin_trgm_ops'), 'trigram GIN opclass used');
  });
});

describe('D3 PR-B — offline outbox/cache + createItem idempotency (T-D3-4/5/6)', async () => {
  const { OfflineSync } = await import('../../packages/voice-engine/src/offline.ts');
  const memKv = () => {
    const m = new Map();
    return {
      get: async (k) => m.get(k) ?? null,
      set: async (k, v) => { m.set(k, v); },
      delete: async (k) => { m.delete(k); },
      _map: m,
    };
  };
  let seq = 0;
  const ids = () => `id-${++seq}`;

  it('list cache: round-trips rows with a timestamp; corrupt entries read as null', async () => {
    const off = new OfflineSync(memKv(), { newId: ids, now: () => new Date('2026-10-12T00:00:00Z') });
    assert.equal(await off.readList('items:S1'), null);
    await off.cacheList('items:S1', [{ id: 'a' }, { id: 'b' }]);
    const got = await off.readList('items:S1');
    assert.equal(got.rows.length, 2);
    assert.equal(got.cachedAt, '2026-10-12T00:00:00.000Z');
  });

  it('outbox: FIFO flush, stop-at-first-failure, attempts counted, order preserved', async () => {
    seq = 0;
    const off = new OfflineSync(memKv(), { newId: ids });
    await off.enqueueCreate({ id: 'item-1', title: 'one' });
    await off.enqueueCreate({ id: 'item-2', title: 'two' });
    await off.enqueueCreate({ id: 'item-3', title: 'three' });
    const seen = [];
    const r1 = await off.flush(async (op) => {
      seen.push(op.payload.id);
      return op.payload.id === 'item-2' ? 'retry' : 'ok';
    });
    assert.deepEqual(seen, ['item-1', 'item-2'], 'flush stops at the first failure — item-3 never attempted');
    assert.deepEqual(r1, { sent: 1, remaining: 2, deadLettered: 0 });
    const pending = await off.pending();
    assert.deepEqual(pending.map((p) => p.payload.id), ['item-2', 'item-3'], 'order preserved');
    assert.equal(pending[0].attempts, 1);
    const r2 = await off.flush(async () => 'ok');
    assert.deepEqual(r2, { sent: 2, remaining: 0, deadLettered: 0 });
  });

  it('outbox: a throwing sender is a retry, not a lost op; queued payload carries its stable id', async () => {
    const off = new OfflineSync(memKv(), { newId: ids });
    const op = await off.enqueueCreate({ id: 'stable-1', title: 'x' });
    assert.equal(op.payload.id, 'stable-1');
    const r = await off.flush(async () => { throw new Error('network down'); });
    assert.deepEqual(r, { sent: 0, remaining: 1, deadLettered: 0 });
    assert.equal((await off.pending())[0].attempts, 1);
  });

  it('dead-letter: a permanently failing op stops blocking the queue after MAX attempts (review N1)', async () => {
    const { MAX_FLUSH_ATTEMPTS } = await import('../../packages/voice-engine/src/offline.ts');
    const off = new OfflineSync(memKv(), { newId: ids });
    await off.enqueueCreate({ id: 'poison', title: 'bad' });
    await off.enqueueCreate({ id: 'behind', title: 'good' });
    const send = async (op) => (op.payload.id === 'poison' ? 'retry' : 'ok');
    for (let i = 0; i < MAX_FLUSH_ATTEMPTS; i++) await off.flush(send);
    const r = await off.flush(send);
    assert.equal(r.deadLettered, 1, 'the poison op was dead-lettered');
    assert.equal(r.sent, 1, 'the op behind it finally flowed');
    assert.equal(r.remaining, 0);
    const dead = await off.deadLettered();
    assert.equal(dead.length, 1);
    assert.equal(dead[0].payload.id, 'poison');
  });

  it('error classification (review N1): coded server errors are NOT queueable; transport errors are', async () => {
    const { isQueueableError } = await import('../../packages/voice-engine/src/offline.ts');
    assert.equal(isQueueableError({ code: '23514' }), false, 'CHECK violation is permanent');
    assert.equal(isQueueableError({ code: '42501' }), false, 'RLS denial is permanent');
    assert.equal(isQueueableError({ code: 'PGRST301' }), false, 'PostgREST errors are permanent');
    assert.equal(isQueueableError(new TypeError('Failed to fetch')), true, 'fetch failure is transport');
    assert.equal(isQueueableError(new Error('socket hangup')), true, 'uncoded errors are transport');
  });

  it('cache keys separate pages (review N2); corrupt outbox is preserved, not discarded (review N4)', async () => {
    const { listCacheKey } = await import('../../packages/voice-engine/src/offline.ts');
    assert.notEqual(listCacheKey('items:S1', 60, 0), listCacheKey('items:S1', 100, 0));
    assert.notEqual(listCacheKey('items:S1', 100, 0), listCacheKey('items:S1', 100, 100));
    const kv = memKv();
    await kv.set('offline:outbox:v1', '{corrupt json');
    const off = new OfflineSync(kv, { newId: ids });
    assert.deepEqual(await off.pending(), [], 'corrupt outbox reads as empty');
    const sideKeys = [...kv._map.keys()].filter((k) => k.includes(':corrupt:'));
    assert.equal(sideKeys.length, 1, 'the corrupt payload was preserved under a side key');
  });

  it('GUARD (T-D3-6): createItem assigns a client id and resolves 23505 to the existing row', () => {
    const client = readFileSync(new URL('../../packages/voice-engine/src/client.ts', import.meta.url), 'utf8');
    assert.ok(client.includes('const id = input.id ?? uuid4();'), 'id is client-assigned and stable across retries');
    assert.ok(client.includes("code === '23505'"), 'PK conflict is detected');
    assert.ok(client.includes("eq('id', id)"), 'conflict resolves by fetching the existing row');
    assert.ok(client.includes('createItemOfflineFirst'), 'offline-first create exists');
    assert.ok(client.includes('listItemsCached'), 'cached list read exists');
    assert.ok(client.includes('flushOutbox'), 'outbox flush is wired to createItem');
  });
});

describe('D4 — entitlements fail-closed + vault gate OFF (decision #4) + webhook idempotency core', async () => {
  const ent = await import('../functions/_shared/entitlements.ts');
  const wh = await import('../functions/_shared/stripe-webhook-core.ts');

  it('entitled: deny-by-default for unknown plan/feature/garbage', () => {
    assert.equal(ent.entitled('free', 'extra_family_slot'), false);
    assert.equal(ent.entitled('family_plus', 'extra_family_slot'), true);
    assert.equal(ent.entitled('family_plus', 'priority_support'), true);
    assert.equal(ent.entitled('family_plus', 'nonsense'), false);
    assert.equal(ent.entitled('enterprise', 'extra_family_slot'), false);
    assert.equal(ent.entitled(null, 'extra_family_slot'), false);
    assert.equal(ent.entitled(undefined, undefined), false);
    assert.equal(ent.entitled('', ''), false);
  });

  it('DECISION #4 PROOF: the vault paid gate is OFF — vault_ai denied for every plan', () => {
    assert.equal(ent.VAULT_PAID_GATE_ENABLED, false);
    for (const p of ent.PLANS) assert.equal(ent.entitled(p, 'vault_ai'), false, `${p} must not have vault_ai while the gate is off`);
  });

  it('planFromMirror: only active/trialing known plans resolve; dunning grace honors the paid period (review N4)', () => {
    assert.equal(ent.planFromMirror(null), 'free');
    assert.equal(ent.planFromMirror({ plan_id: 'family_plus', status: 'active' }), 'family_plus');
    assert.equal(ent.planFromMirror({ plan_id: 'family_plus', status: 'trialing' }), 'family_plus');
    assert.equal(
      ent.planFromMirror({ plan_id: 'family_plus', status: 'past_due', current_period_end: '2026-11-01T00:00:00Z' }, '2026-10-15T00:00:00Z'),
      'family_plus',
      'past_due inside the paid period keeps the plan (no mid-period cutoff)',
    );
    assert.equal(
      ent.planFromMirror({ plan_id: 'family_plus', status: 'past_due', current_period_end: '2026-10-01T00:00:00Z' }, '2026-10-15T00:00:00Z'),
      'free',
      'past_due past the paid period resolves to free',
    );
    assert.equal(ent.planFromMirror({ plan_id: 'family_plus', status: 'past_due' }), 'free', 'past_due without a period end fails closed');
    assert.equal(ent.planFromMirror({ plan_id: 'family_plus', status: 'canceled' }), 'free');
    assert.equal(ent.planFromMirror({ plan_id: 'gold', status: 'active' }), 'free');
    assert.equal(ent.planFromMirror({}), 'free');
  });

  it('webhook decisions: duplicate skipped, stale skipped, unknown types ignored, fresh processed', () => {
    assert.deepEqual(wh.decideWebhookEvent({ eventType: 'invoice.paid', eventCreated: 100, alreadyClaimed: true, mirrorWatermark: 0 }), { action: 'skip_duplicate' });
    assert.deepEqual(wh.decideWebhookEvent({ eventType: 'invoice.paid', eventCreated: 50, alreadyClaimed: false, mirrorWatermark: 100 }), { action: 'skip_stale' });
    assert.deepEqual(wh.decideWebhookEvent({ eventType: 'invoice.paid', eventCreated: 100, alreadyClaimed: false, mirrorWatermark: 100 }), { action: 'process' }, 'equal watermark is not stale');
    assert.deepEqual(wh.decideWebhookEvent({ eventType: 'charge.refunded', eventCreated: 100, alreadyClaimed: false, mirrorWatermark: 0 }), { action: 'ignore_type' });
    assert.deepEqual(wh.decideWebhookEvent({ eventType: 'customer.subscription.updated', eventCreated: 200, alreadyClaimed: false, mirrorWatermark: 100 }), { action: 'process' });
    assert.deepEqual(
      wh.decideWebhookEvent({ eventType: 'invoice.paid', eventCreated: NaN, alreadyClaimed: false, mirrorWatermark: 0 }),
      { action: 'skip_stale' },
      'a malformed created fails closed — never falls through to process (review N3)',
    );
  });

  it('GUARD: the D4 design package exists and legal drafts carry the not-final marking', () => {
    for (const f of ['STRIPE_ARCHITECTURE.md', 'ENTITLEMENTS.md', 'QUOTA_PRICE_OPTIONS.md', 'LEGAL_DRAFTS.md', 'ACCOUNT_LIFECYCLE.md']) {
      assert.ok(existsSync(new URL(`../../docs/autonomous/d4/${f}`, import.meta.url)), `missing docs/autonomous/d4/${f}`);
    }
    const legal = readFileSync(new URL('../../docs/autonomous/d4/LEGAL_DRAFTS.md', import.meta.url), 'utf8');
    assert.ok(legal.includes('NOT LEGAL ADVICE'), 'legal drafts must be marked non-final');
    const quota = readFileSync(new URL('../../docs/autonomous/d4/QUOTA_PRICE_OPTIONS.md', import.meta.url), 'utf8');
    assert.ok(quota.includes('OD-01/02 remain OPEN'), 'quota paper must not finalize numbers');
  });
});

describe('D4 T-D4-6 — dead commercial UI cleanup (F-COM-09)', () => {
  it('GUARD: the demo-seed button and panel are dev-only (__DEV__ gate)', () => {
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.ok(app.includes('{__DEV__ && showDemo && ('), 'the demo panel render is __DEV__-gated');
    const toggleIdx = app.indexOf('setShowDemo((v) => !v)');
    const gateIdx = app.lastIndexOf('{__DEV__ && (', toggleIdx);
    assert.ok(gateIdx > -1 && toggleIdx - gateIdx < 300, 'the 🧪 toggle button sits inside a __DEV__ block');
    // The seed capability itself remains for dev use (engine method untouched).
    assert.ok(app.includes('engine.seedDemoData'), 'seedDemoData still wired for dev builds');
  });
});

describe('Launch readiness PR-A — 18+ age gate (Decision #5)', () => {
  const boundary = (ageOn, isAdult, parseBirthDate) => {
    const on = new Date('2026-10-12T12:00:00Z');
    assert.equal(ageOn('2008-10-12', on), 18, 'turns 18 ON the birthday');
    assert.equal(isAdult('2008-10-12', on), true);
    assert.equal(ageOn('2008-10-13', on), 17, 'one day short is still 17');
    assert.equal(isAdult('2008-10-13', on), false);
    assert.equal(ageOn('1990-01-01', on), 36);
    // Feb-29 births: older on Mar 1 in non-leap years, not on Feb 28.
    assert.equal(ageOn('2008-02-29', new Date('2026-02-28T12:00:00Z')), 17);
    assert.equal(ageOn('2008-02-29', new Date('2026-03-01T12:00:00Z')), 18);
    // Undeclared / invalid -> null age, never adult.
    for (const bad of [null, undefined, '', 'abc', '2008-13-01', '2008-02-30', '12-10-2008', 20081012]) {
      assert.equal(parseBirthDate(bad), null, `${String(bad)} must not parse`);
      assert.equal(ageOn(bad, on), null);
      assert.equal(isAdult(bad, on), false);
    }
    assert.equal(parseBirthDate(' 1990-05-17 '), '1990-05-17', 'surrounding space tolerated');
  };

  it('edge _shared/age.ts: boundary math is exact', async () => {
    const { ageOn, isAdult, parseBirthDate } = await import('../functions/_shared/age.ts');
    boundary(ageOn, isAdult, parseBirthDate);
  });

  it('voice-engine age.ts: IDENTICAL math (the two implementations cannot drift)', async () => {
    const { ageOn, isAdult, parseBirthDate } = await import('../../packages/voice-engine/src/age.ts');
    boundary(ageOn, isAdult, parseBirthDate);
  });

  it('GUARD: migration 0045 + chat gate + app gate are all wired', () => {
    const mig = readFileSync(new URL('../migrations/0045_profiles_birth_date.sql', import.meta.url), 'utf8');
    assert.ok(mig.includes('birth_date date'), 'migration adds the column');
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    assert.ok(chat.includes("kind: 'age_gate.blocked'") && chat.includes('isAdult(bd)'), 'chat refuses missing/under-18 declarations before model paths');
    const gateAt = chat.indexOf('age_gate.blocked');
    const spendAt = chat.indexOf('const spend = await checkSpendCap');
    assert.ok(gateAt !== -1 && spendAt !== -1 && gateAt < spendAt, 'the age gate runs BEFORE the spend pre-check');
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.ok(app.includes("ageStatus === 'needed'") && app.includes("ageStatus === 'blocked'"), 'app renders both gate screens');
    assert.ok(app.includes('setMyBirthDate'), 'app persists the declaration through the engine');
  });
});

describe('Launch readiness PR-B — offline layer wired into the app', () => {
  it('GUARD: the shared engine singleton enables the offline layer over AsyncStorage', () => {
    const lib = readFileSync(new URL('../../apps/mobile/src/lib/engine.ts', import.meta.url), 'utf8');
    assert.ok(lib.includes('engine.enableOffline(asyncStorageKV)'), 'offline layer is enabled at construction');
    assert.ok(lib.includes('@react-native-async-storage/async-storage'), 'KV is AsyncStorage-backed (survives restarts)');
  });

  it('GUARD: app create/read paths are offline-first; outbox flushes on foreground + sign-in', () => {
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.ok(!app.includes('engine.createItem('), 'no direct online-only createItem call remains in the app');
    assert.ok((app.match(/engine\.createItemOfflineFirst\(/g) ?? []).length >= 4, 'all four direct-create sites are offline-first');
    assert.ok(app.includes('engine.listItemsCached(spaceId)'), 'the items refresh reads through the cache');
    assert.ok(app.includes("s === 'active'") && app.includes('engine.flushOutbox()'), 'foreground flush is wired');
    assert.ok(app.includes('pendingSync > 0') && app.includes("tx('offlinePending'"), 'the drawer shows the queued-sync indicator');
    // review N1: the INDIRECT create paths (watch / expense helpers)
    // are offline-first too — no createItem( survives in the helpers
    for (const lib of ['watch', 'expenses']) {
      const src = readFileSync(new URL(`../../apps/mobile/src/lib/${lib}.ts`, import.meta.url), 'utf8');
      assert.ok(!src.includes('.createItem('), `${lib} helper creates via the offline-first surface`);
      assert.ok(src.includes('createItemOfflineFirst'), `${lib} helper is offline-first`);
    }
  });
});

describe('Launch readiness PR-C — accessibility completion (measured gaps only)', () => {
  it('GUARD: every icon-only control found in the completion audit carries role + label', () => {
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    // handler -> the accessibilityLabel key it must carry (audit of
    // 2026-10-12: 156 pressables scanned; these were the bare ones)
    const pairs = [
      ['deleteMessage(item.id)', "a11yDeleteMessage"],
      ["voteAnswer(item.id, 'up'", 'a11yGoodAnswer'],
      ["voteAnswer(item.id, 'down'", 'a11yBadAnswer'],
      ['startEditSecret(item)', 'a11yEdit'],
      ['askDeleteSecret(item.id)', 'a11yDeleteSecret'],
      ['setShowDemo((v) => !v)', 'a11yDemoPanel'],
      ['deleteSession(sess.id)', 'a11yDeleteChat'],
      ['dismissBroadcast(b.id)', 'a11yDismiss'],
      ['setChatPhotoUri(null)', 'a11yRemovePhoto'],
      ['setSecretPhotoUri(null)', 'a11yRemovePhoto'],
      ['openRename', 'a11yEdit'],
      ['onAssign(item)', 'a11yAssign'],
      ['setSecretSearchOpen((v) => !v)', 'a11ySearchSecrets'],
      ['setActiveListId(null)', 'close'],
      ['restoreTrashRow(r)', 'a11yRestoreItem'],
      ['dismissProposal(item.id', 'a11yDismiss'],
      // second sweep (independent review F1-F8): the first audit
      // undercounted; these were found bare and are now labeled too
      ['nukeTrashRow(r)', 'a11yDeleteForever'],
      ['askPhotoSource(item)', 'a11yAttachPhoto'],
      ['doRemoveMember(famSpace', 'a11yRemoveMember'],
    ];
    for (const [handler, key] of pairs) {
      // A handler may also appear as a swipe gesture or a definition;
      // pass when ANY occurrence sits in a tag carrying the label.
      let found = false;
      for (let at = app.indexOf(handler); at !== -1; at = app.indexOf(handler, at + 1)) {
        const tag = app.slice(Math.max(0, at - 200), at + 400);
        if (tag.includes(`accessibilityLabel={t('${key}')}`)) { found = true; break; }
      }
      assert.ok(found, `${handler} is labeled ${key}`);
    }
    // photo thumbnails open the viewer with a label; the chat bubble
    // exposes the long-press reaction via role + hint.
    assert.ok((app.match(/accessibilityLabel=\{t\('a11yViewPhoto'\)\}/g) ?? []).length >= 4, 'all four photo viewers labeled');
    assert.ok(app.includes("accessibilityHint={t('a11yReactHint')}"), 'bubble long-press is discoverable');
    // reaction picker + tab icon picker: the emoji is the accessible name
    assert.ok(app.includes('onPress={() => applyReaction(item, e)} hitSlop={6} accessibilityRole="button" accessibilityLabel={e}'), 'reaction buttons are labeled by their emoji');
    assert.ok(app.includes('accessibilityLabel={ic}'), 'tab icon choices are labeled by their emoji');
    // tasks checkbox carries a state-aware label
    assert.ok(app.includes("accessibilityLabel={item.status === 'done' ? t('a11yMarkOpen') : t('a11yMarkDone')}"), 'tasks checkbox is state-labeled');
    // components swept in the second pass
    const swipe = readFileSync(new URL('../../apps/mobile/src/lib/SwipeRow.tsx', import.meta.url), 'utf8');
    assert.ok(swipe.includes('accessibilityLabel={label ?? icon}'), 'SwipeRow side actions always carry an accessible name');
    const welcome = readFileSync(new URL('../../apps/mobile/src/components/WelcomeScreen.tsx', import.meta.url), 'utf8');
    assert.ok(welcome.includes("mic === 'recording' ? t('a11yStopRecording') : t('a11yRecord')"), 'welcome mic is state-labeled');
    assert.ok(welcome.includes("accessibilityLabel={t('a11ySend')}"), 'welcome send is labeled');
  });

  it('the new a11y keys exist in both dictionaries', () => {
    const i18n = readFileSync(new URL('../../apps/mobile/src/lib/i18n.ts', import.meta.url), 'utf8');
    for (const k of ['a11yViewPhoto', 'a11yReactHint', 'a11yDeleteMessage', 'a11yGoodAnswer', 'a11yBadAnswer', 'a11yEdit', 'a11yDeleteSecret', 'a11yDismiss', 'a11yRemovePhoto', 'a11yDeleteChat', 'a11yAssign', 'a11ySearchSecrets', 'a11yRestoreItem', 'a11yDemoPanel', 'a11yDeleteForever', 'a11yRemoveMember', 'a11yMarkDone', 'a11yMarkOpen']) {
      assert.ok((i18n.match(new RegExp(`^  ${k}:`, 'gm')) ?? []).length === 2, `${k} present in AR and EN`);
    }
  });
});

describe('F-LAUNCH-01 Option B — no direct client items delete; RPC is the only path (0046)', () => {
  const mig = readFileSync(new URL('../../supabase/migrations/0046_items_delete_rpc.sql', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../packages/voice-engine/src/client.ts', import.meta.url), 'utf8');

  it('0046 splits the FOR ALL policy and grants no client DELETE', () => {
    assert.ok(mig.includes('drop policy if exists "items_member_write"'), 'FOR ALL policy dropped');
    assert.ok(mig.includes('"items_member_insert"') && mig.includes('for insert'), 'insert policy kept');
    assert.ok(mig.includes('"items_member_update"') && mig.includes('for update'), 'update policy kept');
    assert.ok(!/create policy[^;]*for delete/i.test(mig), 'no DELETE policy is created');
  });

  it('the RPC is a hardened SECURITY DEFINER with tight grants', () => {
    assert.ok(mig.includes('function public.hard_delete_items(p_ids uuid[])'), 'function defined');
    assert.ok(mig.includes('security definer'), 'definer');
    assert.ok(mig.includes("set search_path = ''"), 'search_path pinned empty');
    assert.ok(mig.includes("raise exception 'authentication required'"), 'null uid rejected');
    assert.ok(mig.includes('can_access_space'), 'per-row space authorization inside the RPC');
    assert.ok(mig.includes("from anon"), 'anon revoked');
    assert.ok(mig.includes("to authenticated"), 'authenticated granted');
  });

  it('client code holds NO direct items delete (multiline-aware census); the RPC is the path', () => {
    const directDeletes = client.match(/from\('items'\)[\s\S]{0,60}?\.delete\(/g) ?? [];
    assert.equal(directDeletes.length, 0, `direct items deletes remain: ${directDeletes.length}`);
    assert.ok(client.includes("rpc('hard_delete_items'"), 'client routes through the RPC');
    for (const fn of ['deleteNote', 'deleteSpaceTab', 'deleteTabForever', 'trashNote', 'trashSecretNote', 'trashItem', 'trashShoppingList', 'deleteSecretNote']) {
      assert.ok(client.includes(`async ${fn}`) || client.includes(fn), `${fn} flow preserved`);
    }
  });

  it('trash semantics preserved: snapshots still precede deletion in the trash flows', () => {
    for (const fn of ['trashNote', 'trashItem', 'trashShoppingList']) {
      const start = client.indexOf(`async ${fn}`);
      const slice = client.slice(start, start + 2600);
      const snap = slice.indexOf("from('trash_bin').insert");
      // the snapshot path's delete is the first hardDeleteItems AFTER the insert
      // (trashItem's retention<=0 permanent branch precedes the insert in source).
      const del = slice.indexOf('hardDeleteItems', snap);
      assert.ok(snap > -1 && del > snap, `${fn}: trash_bin snapshot is written before the RPC delete`);
    }
  });

  it('the shopping_lists cascade is closed the same way (FOR ALL split + list RPC)', () => {
    assert.ok(mig.includes('drop policy if exists "shopping_lists_member"'), 'lists FOR ALL dropped');
    assert.ok(mig.includes('"shopping_lists_member_read"') && mig.includes('for select'), 'lists SELECT policy re-created (0014 FOR ALL carried it — review F1)');
    assert.ok(mig.includes('function public.hard_delete_shopping_list(p_id uuid)'), 'list RPC defined');
    const listDeletes = client.match(/from\('shopping_lists'\)[\s\S]{0,60}?\.delete\(/g) ?? [];
    assert.equal(listDeletes.length, 0, 'no direct shopping_lists deletes remain in client code');
    assert.ok(client.includes("rpc('hard_delete_shopping_list'"), 'client routes list deletion through the RPC');
  });

  it('server-side deletes are untouched (service role: engine purge + account erasure)', () => {
    const mem = readFileSync(new URL('../../supabase/functions/_shared/memory.ts', import.meta.url), 'utf8');
    assert.ok(mem.includes('purgeExpiredTrashedFacts'), 'engine purge intact');
  });
});

describe('D5 PR-1 — web foundations: deep-link allowlist, SEO/PWA shell, brand tokens', async () => {
  const { parseDeepLink } = await import('../../apps/mobile/src/lib/deeplinks.ts');

  it('parseDeepLink: only well-formed join intents survive; everything else is null', () => {
    assert.deepEqual(parseDeepLink('mawjood://family/join?code=abc123'), { kind: 'join-family', code: 'ABC123' });
    assert.deepEqual(parseDeepLink('https://bfip-platform.github.io/join?code=XYZ987'), { kind: 'join-family', code: 'XYZ987' });
    assert.deepEqual(
      parseDeepLink('https://bfip-platform.github.io/Mawjood/join?code=XYZ987'),
      { kind: 'join-family', code: 'XYZ987' },
      'one deployment-subpath segment is tolerated for https (review N1)',
    );
    assert.equal(parseDeepLink('https://x.example/a/b/join?code=XYZ987'), null, 'two prefix segments are NOT tolerated');
    assert.equal(parseDeepLink('mawjood://x/family/join?code=XYZ987'), null, 'the app scheme stays strict');
    assert.equal(parseDeepLink('mawjood://family/join?code=short'), null, 'too-short code rejected');
    assert.equal(parseDeepLink('mawjood://family/join'), null, 'missing code rejected');
    assert.equal(parseDeepLink('mawjood://vault/open?path=secret'), null, 'unknown path rejected');
    assert.deepEqual(
      parseDeepLink('mawjood://family/join?code=ABC123&token=leak'),
      { kind: 'join-family', code: 'ABC123' },
      'extra params are never read — only the allowlisted code is extracted',
    );
    assert.equal(parseDeepLink('https://evil.example/join?code=../../etc'), null, 'malicious code rejected');
    assert.equal(parseDeepLink('javascript:alert(1)'), null);
    assert.equal(parseDeepLink(''), null);
    assert.equal(parseDeepLink(null), null);
    assert.equal(parseDeepLink(42), null);
    assert.equal(parseDeepLink('not a url'), null);
  });

  it('GUARD: app.json carries the static SEO shell; OG/manifest are injected by useWebMeta; manifest + robots exist; links route through the parser', () => {
    const appJson = JSON.parse(readFileSync(new URL('../../apps/mobile/app.json', import.meta.url), 'utf8'));
    assert.ok(appJson.expo.web.description?.length > 20, 'static meta description via app.json');
    assert.equal(appJson.expo.web.themeColor, '#FAF7F2', 'static theme-color via app.json');
    const layout = readFileSync(new URL('../../apps/mobile/src/app/_layout.tsx', import.meta.url), 'utf8');
    assert.ok(layout.includes('useWebMeta'), 'OG/manifest runtime injector exists');
    assert.ok(layout.includes("link.setAttribute('rel', 'manifest')"), 'manifest link injected (relative href)');
    assert.ok(layout.includes("'og:title'"), 'OG title injected');
    const manifest = JSON.parse(readFileSync(new URL('../../apps/mobile/public/manifest.webmanifest', import.meta.url), 'utf8'));
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.short_name, 'Mawjood');
    assert.ok(manifest.icons.every((i) => !i.src.startsWith('assets/')), 'manifest icons resolve to public/ files, not bundle assets');
    assert.ok(existsSync(new URL('../../apps/mobile/public/robots.txt', import.meta.url)), 'robots.txt exists');
    assert.ok(existsSync(new URL('../../apps/mobile/public/icon-1024.png', import.meta.url)), 'PWA icon exists in public/');
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.ok(app.includes('parseDeepLink(raw)'), 'the app routes links through the fail-closed parser');
    assert.ok(app.includes("Linking.addEventListener('url'"), 'live link subscription wired');
  });

  it('GUARD (T-D5-5): BRAND tokens carry the Decision #11 baseline; OD-39 stays open', () => {
    const theme = readFileSync(new URL('../../apps/mobile/src/lib/theme.ts', import.meta.url), 'utf8');
    assert.ok(theme.includes("accentBlue: '#3B82C4'"), 'soft blue token (Decision #11)');
    assert.ok(theme.includes("accentSage: '#5E7E63'"), 'muted sage token (Decision #11)');
    assert.ok(theme.includes('IBM Plex Sans Arabic'), 'arabic font token');
    assert.ok(theme.includes('OD-39'), 'the not-final caveat travels with the tokens');
  });
});

describe('D5 PR-2 — responsive foundation (T-D5-1)', () => {
  it('GUARD: wide web gets a centered 880px column; native/narrow untouched; no hooks violations', () => {
    const layout = readFileSync(new URL('../../apps/mobile/src/app/_layout.tsx', import.meta.url), 'utf8');
    assert.ok(layout.includes("Platform.OS === 'web' && width >= 1024"), 'the wide treatment is web-only and breakpoint-gated');
    assert.ok(layout.includes('maxWidth: 880'), 'readable column cap');
    assert.ok(layout.includes('useWindowDimensions'), 'breakpoint comes from the window hook');
    // The hook calls sit in InnerLayout before any conditional return.
    const hookIdx = layout.indexOf('useWindowDimensions()');
    const innerIdx = layout.indexOf('function InnerLayout');
    assert.ok(hookIdx > innerIdx, 'hook is inside the layout component');
  });
});

describe('D5 PR-3 — a11y pass on primary surfaces + in-app support (T-D5-3/4)', () => {
  it('GUARD: primary controls carry roles/labels; support lives in Profile and rides report-error', () => {
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.ok(app.includes("accessibilityLabel={t('a11yMenu')}"), 'menu button labeled');
    assert.ok(app.includes('accessibilityRole="tab"'), 'tabs expose the tab role');
    assert.ok(app.includes("accessibilityLabel={isRecording ? t('a11yStopRecording') : textNote.trim() ? t('a11ySend') : t('a11yRecord')}"), 'composer action announces its current mode');
    assert.ok(app.includes("context: 'support'"), 'support messages ride the report-error channel with the support context');
    assert.ok(app.includes("invoke('report-error'"), 'support uses the existing function — no new endpoint');
    // Decision #12: support must NOT add a drawer destination.
    const drawerRegion = app.slice(app.indexOf('side drawer menu'), app.indexOf('side drawer menu') + 200);
    assert.ok(app.includes("{t('supportSection')}"), 'support section renders (inside Profile)');
  });
  it('GUARD: i18n carries the new keys in BOTH languages', () => {
    const i18n = readFileSync(new URL('../../apps/mobile/src/lib/i18n.ts', import.meta.url), 'utf8');
    for (const k of ['a11yMenu', 'a11yAttachPhoto', 'a11ySend', 'a11yRecord', 'a11yStopRecording', 'supportSection', 'supportHint', 'supportSend', 'supportSent', 'supportFailed']) {
      const hits = i18n.split(`${k}:`).length - 1;
      assert.ok(hits >= 2, `${k} must exist in AR and EN (found ${hits})`);
    }
  });
});

describe('D6 — AI-E2E harness: journeys + injection regression pack (T-D6-3/4)', async () => {
  const { INJECTION_CORPUS } = await import('./ai-e2e/injection-corpus.mjs');
  const UID = 'user-1';

  it('INJECTION PACK: every payload fails the confirmation parser — or is inert without a pending row', async () => {
    for (const p of INJECTION_CORPUS) {
      assert.equal(parseForgetConfirmation(p.text), p.parse, `${p.id}: parser outcome drifted`);
    }
    // The inertness half: a parsed code with NO pending row for the user
    // validates nothing and executes nothing.
    const supa = fakeSupa([mkFact('a', 3, 1)]);
    assert.equal(validateForgetConfirmation(null, UID, '123456', new Date()).ok, false);
    assert.equal(await claimForgetPreview(supa, 'nonexistent-row'), null);
    assert.equal(supa._db.items[0].status, 'open', 'corpus payloads changed no state');
  });

  it('STRUCTURAL INVARIANTS: chat cannot trash; the tree-wide trashFact census is exactly the sanctioned callers', () => {
    const chat = readFileSync(new URL('../functions/chat/index.ts', import.meta.url), 'utf8');
    assert.ok(!/trashFact\s*\(/.test(chat), 'chat/index.ts must never call trashFact');
    // Tree-wide census (review N3): walk every function file — a future
    // caller in a NEW file must fail this test loudly.
    const callers = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) {
          const src = readFileSync(p, 'utf8');
          const hits = (src.match(/trashFact\s*\(/g) ?? []).length;
          // the definition line counts once in memory.ts; calls elsewhere count fully
          if (hits > 0) callers.push(`${p.split('/functions/')[1]}:${hits}`);
        }
      }
    };
    walk(new URL('../functions', import.meta.url).pathname);
    assert.deepEqual(
      callers.sort(),
      ['_shared/memory.ts:3', 'memory-consolidate/index.ts:1'],
      'trashFact may exist only as: engine definition + claimed forget executor + mergeFacts (memory.ts ×3 incl. def) and the §6.1 call (consolidate ×1)',
    );
    // INTEGRATION (audit): mergeFacts — the third engine site — must be
    // reachable ONLY from executeConfirmedMerge (the claimed rail).
    const engine = readFileSync(new URL('../functions/_shared/memory.ts', import.meta.url), 'utf8');
    assert.equal((engine.match(/mergeFacts\(supa/g) ?? []).length, 1, 'mergeFacts has exactly one caller');
    assert.ok(engine.includes('executeConfirmedMerge'), 'that caller is the claimed merge executor');
  });

  it('JOURNEY: learn → recall → gardener (flags only) → forget via rail → restore → purge window', async () => {
    const supa = fakeSupa([
      mkFact('keep', 4, 10),
      mkFact('drop', 3, 10),
      mkFact('stale', 1, 200),
    ]);
    // Recall sees all three.
    let facts = await loadFacts(supa, 'S1');
    assert.equal(facts.length, 3);
    // Gardener: plan + apply — statuses must be UNTOUCHED (no auto-delete).
    const plan = planMemoryMaintenance(facts, NOW);
    assert.ok(plan.flagReview.includes('stale'), 'stale low-importance fact is flagged for review');
    await applyMemoryMaintenance(supa, 'S1', NOW);
    for (const f of supa._db.items) assert.equal(f.status, 'open', `gardener must never change status (${f.id})`);
    assert.equal(supa._db.items.find((f) => f.id === 'stale').meta.review_candidate, true, 'the review flag landed as metadata only');
    // Forget journey for 'drop': preview → forged code refused → real code executes.
    facts = await loadFacts(supa, 'S1');
    const p = await createForgetPreview(supa, UID, 'S1', [facts.find((f) => f.id === 'drop')]);
    const row = supa._db.pending_actions.find((r) => r.id === p.action_id);
    assert.equal(validateForgetConfirmation(row, UID, '000000', new Date()).ok, false, 'forged code refused');
    assert.equal(validateForgetConfirmation(row, UID, p.confirm_code, new Date()).ok, true);
    const claimed = await claimForgetPreview(supa, row.id);
    const { trashed } = await executeConfirmedForget(supa, claimed);
    assert.equal(trashed.length, 1);
    assert.equal(supa._db.items.find((f) => f.id === 'drop').status, 'trashed');
    assert.equal(supa._db.items.find((f) => f.id === 'keep').status, 'open');
    // Restore: the fact returns to open and recall.
    const restored = await restoreFact(supa, 'S1', 'drop');
    assert.ok(restored && restored.status === 'open');
    // Purge: a freshly trashed fact is NEVER purge-eligible.
    await trashFact(supa, supa._db.items.find((f) => f.id === 'drop'), 'test');
    const purged = await purgeExpiredTrashedFacts(supa, 30);
    assert.equal(purged, 0, 'purge respects the retention window');
    assert.equal(supa._db.items.length, 3, 'nothing was hard-deleted in the whole journey');
  });

  it('HARNESS DOC: the live-model protocol exists and names its gates', () => {
    const doc = readFileSync(new URL('../../docs/autonomous/d6/AI_E2E_HARNESS.md', import.meta.url), 'utf8');
    assert.ok(doc.includes('NOT in CI'), 'the live layer is honestly separated from CI');
    assert.ok(doc.includes('Injection drill'), 'the live protocol includes the injection drill');
  });
});

describe('D6 PR-2 — search relevance ranking (T-D6-2)', async () => {
  const { rankByRelevance, trigramSimilarity } = await import('../../packages/voice-engine/src/rank.ts');

  it('an exact older match outranks a newer partial hit; ties keep recency', () => {
    const rows = [
      { id: 'partial-new', text: 'حليب بالشوكولاتة وحلويات' },
      { id: 'exact-old', text: 'حليب الأطفال' },
      { id: 'partial-older', text: 'بودره حليب للقهوه' },
    ];
    const ranked = rankByRelevance(rows, 'حليب الأطفال', (r) => r.text);
    assert.equal(ranked[0].id, 'exact-old', 'the exact match wins despite being older');
  });

  it('trigram similarity ranks a typo-tolerant near-match above noise', () => {
    const sim = trigramSimilarity('حليب', 'حليب الأطفال');
    const noise = trigramSimilarity('حليب', 'مفاتيح السيارة');
    assert.ok(sim > noise, `near (${sim}) > noise (${noise})`);
    assert.ok(trigramSimilarity('milk', 'milk') === 1, 'identity is 1');
    assert.equal(trigramSimilarity('', 'x'), 0);
  });

  it('GUARD: search() ranks its candidate pool and keeps the classic page sizes', () => {
    const client = readFileSync(new URL('../../packages/voice-engine/src/client.ts', import.meta.url), 'utf8');
    assert.ok(client.includes('rankByRelevance(i.data as Item[], q,'), 'items are ranked');
    assert.ok(client.includes('.slice(0, 30)') && client.includes('.slice(0, 20)'), 'page sizes preserved (30 items / 20 notes)');
  });
});

describe('D6 PR-3 — maintenance surfacing (T-D6-1)', async () => {
  const { scanMemoryMaintenance } = await import('../../apps/mobile/src/lib/userMemory.ts');
  const row = (id, title, details, meta = {}) => ({ id, title, details, meta });

  it('scan: identical normalized lines with distinct keys form a duplicate group; same-key rows do not', () => {
    const rows = [
      row('1', 'بيناديني', 'أبو كريم', { mkey: 'identity:name' }),
      row('2', 'بيناديني', 'ابو كريم', { mkey: 'identity:nickname' }),
      row('3', 'الخضرة عندي', 'بندورة', { mkey: 'meaning:veg' }),
      row('4', 'الخضرة عندي', 'بندورة', { mkey: 'meaning:veg' }), // retry dup — same key
      row('5', 'سيارتي', 'أودي', { mkey: 'fact:car', review_candidate: true }),
    ];
    const scan = scanMemoryMaintenance(rows);
    assert.equal(scan.duplicateGroups, 1, 'only the name pair (hamza-variant lines, distinct keys) groups');
    assert.equal(scan.reviewFlagged, 1);
  });

  it('scan is read-only by construction and the banner surface writes nothing', () => {
    const lib = readFileSync(new URL('../../apps/mobile/src/lib/userMemory.ts', import.meta.url), 'utf8');
    const start = lib.indexOf('export function scanMemoryMaintenance');
    const scanBody = lib.slice(start, lib.indexOf('\nexport ', start + 10));
    assert.ok(!/delete|update|insert|trash/i.test(scanBody), 'the scan performs no mutation calls');
    const app = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.ok(app.includes('scanMemoryMaintenance(rows)'), 'banner is fed by the scan');
    assert.ok(app.includes("onSendText(t('maintAsk'))"), 'acting on the banner goes through chat (the rails), not a local delete');
  });

  it('GUARD: maint i18n keys exist in both languages', () => {
    const i18n = readFileSync(new URL('../../apps/mobile/src/lib/i18n.ts', import.meta.url), 'utf8');
    for (const k of ['maintBanner', 'maintAsk', 'maintDismiss']) {
      assert.ok((i18n.split(`${k}:`).length - 1) >= 2, `${k} in AR + EN`);
    }
  });
});

describe('G1 — resolveSupabaseConfig (P0-1 fail-soft init validator)', () => {
  it('accepts a valid https URL + key', () => {
    const r = resolveSupabaseConfig({ url: 'https://caimavjwasxiegjhxdsr.supabase.co', anonKey: 'anon-key-123' });
    assert.equal(r.ok, true);
    assert.equal(r.url, 'https://caimavjwasxiegjhxdsr.supabase.co');
    assert.equal(r.anonKey, 'anon-key-123');
  });

  it('trims surrounding whitespace from url and key', () => {
    const r = resolveSupabaseConfig({ url: '  https://x.supabase.co  ', anonKey: '  k  ' });
    assert.equal(r.ok, true);
    assert.equal(r.url, 'https://x.supabase.co');
    assert.equal(r.anonKey, 'k');
  });

  it('accepts http (local dev) URLs', () => {
    const r = resolveSupabaseConfig({ url: 'http://localhost:54321', anonKey: 'k' });
    assert.equal(r.ok, true);
  });

  it('rejects an empty url', () => {
    const r = resolveSupabaseConfig({ url: '', anonKey: 'k' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /url/i);
  });

  it('rejects an undefined url', () => {
    const r = resolveSupabaseConfig({ url: undefined, anonKey: 'k' });
    assert.equal(r.ok, false);
  });

  it('rejects a null url', () => {
    const r = resolveSupabaseConfig({ url: null, anonKey: 'k' });
    assert.equal(r.ok, false);
  });

  it('rejects a scheme-less host (the createClient "Invalid supabaseUrl" class)', () => {
    const r = resolveSupabaseConfig({ url: 'caimavjwasxiegjhxdsr.supabase.co', anonKey: 'k' });
    assert.equal(r.ok, false);
  });

  it('rejects a non-http(s) scheme', () => {
    const r = resolveSupabaseConfig({ url: 'ftp://x.supabase.co', anonKey: 'k' });
    assert.equal(r.ok, false);
  });

  it('rejects a blank anon key', () => {
    const r = resolveSupabaseConfig({ url: 'https://x.supabase.co', anonKey: '   ' });
    assert.equal(r.ok, false);
    assert.match(r.reason, /key/i);
  });

  it('rejects a missing anon key', () => {
    const r = resolveSupabaseConfig({ url: 'https://x.supabase.co', anonKey: undefined });
    assert.equal(r.ok, false);
  });
});

describe('G1/G6 — startup hardening census guards (P0-1 / P1-4)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('supabase.ts resolves config through the validator (no ?? \'\' into createClient)', () => {
    const src = read('../../apps/mobile/src/lib/supabase.ts');
    assert.ok(src.includes('resolveSupabaseConfig'), 'supabase.ts must use resolveSupabaseConfig');
    assert.ok(!src.includes("?? ''"), 'the empty-string fallback that made createClient throw must be gone');
    assert.ok(src.includes('supabaseConfigError'), 'supabase.ts must export supabaseConfigError');
  });

  it('_layout.tsx installs the crash guard as its FIRST import', () => {
    const src = read('../../apps/mobile/src/app/_layout.tsx');
    const firstImport = src.split('\n').find((l) => l.startsWith('import'));
    assert.equal(firstImport, "import '../lib/crash-guard';");
    assert.ok(src.includes('supabaseConfigError'), '_layout must branch on supabaseConfigError');
  });

  it('crash-guard.ts never statically imports supabase (it guards module-scope death)', () => {
    const src = read('../../apps/mobile/src/lib/crash-guard.ts');
    assert.ok(!/^\s*import\s[^;]*from\s+['"]\.\/supabase['"]/m.test(src), 'no static supabase import');
    assert.ok(!/^\s*import\s+['"]\.\/supabase['"]/m.test(src), 'no side-effect supabase import');
    assert.ok(src.includes("import('./supabase')"), 'reporting must lazy-load supabase');
    assert.ok(src.includes('report-error'), 'reports go through the report-error channel');
    assert.ok(src.includes('startup-global-handler'), 'reports carry the startup context tag');
  });
});

describe('iOS remediation G2/G4 — lazy first-frame audio (P0-3) + boot state machine (P1-2/P2-5)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('GUARD: no eager expo-audio hooks — native audio objects are created lazily, never at first render', () => {
    const hooks = read('../../apps/mobile/src/hooks/useVoiceRecorder.ts');
    assert.ok(!hooks.includes('useAudioRecorder('),
      'useVoiceRecorder must not call the eager useAudioRecorder hook (native recorder at first render)');
    assert.ok(hooks.includes('AudioModule.AudioRecorder') && hooks.includes('new AudioRecorderClass('),
      'the recorder must be constructed imperatively (AudioModule.AudioRecorder alias), inside the first start() call');
    const app = read('../../apps/mobile/src/app/index.tsx');
    assert.ok(!app.includes('useAudioPlayer('),
      'index.tsx must not call the eager useAudioPlayer hook (native player at first render)');
    assert.ok(!app.includes('useAudioPlayerStatus('),
      'playback status must come from the lazy player hook, not useAudioPlayerStatus');
    assert.ok(app.includes('useLazyAudioPlayer()'),
      'index.tsx must consume the lazy player hook');
  });

  it('GUARD: boot transitions to signed-in BEFORE the spaces load, and spaces load cannot throw', () => {
    const app = read('../../apps/mobile/src/app/index.tsx');
    const signedInAt = app.indexOf("setAuthState('signed-in');");
    const loadAt = app.indexOf('withTimeout(loadSpaces(user.id), 12000)');
    assert.ok(signedInAt > -1 && loadAt > signedInAt,
      'P1-2: setAuthState(signed-in) must precede the spaces load so a spaces failure cannot strand authState at loading');
    assert.ok(app.includes('const loadSpaces = useCallback'),
      'the spaces load must live in the shared loadSpaces helper (boot + banner retry)');
    assert.ok(app.includes('setBootError(true)') && app.includes("t('bootSpacesFail')"),
      'a spaces failure must surface the retryable boot-error banner');
  });

  it('GUARD: boot i18n keys exist in both languages', () => {
    const i18n = read('../../apps/mobile/src/lib/i18n.ts');
    for (const k of ['bootSpacesFail', 'bootRetry']) {
      assert.ok((i18n.split(`${k}:`).length - 1) >= 2, `${k} in AR + EN`);
    }
  });
});

describe('EAS env embedding — Supabase config reaches remote builds (build 23 gate failure)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('GUARD: app.config.ts carries the CI env into expoConfig.extra', () => {
    const cfg = read('../../apps/mobile/app.config.ts');
    assert.ok(cfg.includes('process.env.EXPO_PUBLIC_SUPABASE_URL'), 'config reads the URL env');
    assert.ok(cfg.includes('process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY'), 'config reads the anon-key env');
    assert.ok(cfg.includes('supabaseUrl'), 'config writes extra.supabaseUrl');
    assert.ok(cfg.includes('supabaseAnonKey'), 'config writes extra.supabaseAnonKey');
    assert.ok(cfg.includes('...config'), 'config spreads the static app.json values through');
  });

  it('GUARD: supabase.ts falls back to expoConfig.extra when process.env is absent (EAS remote bundling)', () => {
    const src = read('../../apps/mobile/src/lib/supabase.ts');
    assert.ok(src.includes('expo-constants'), 'supabase.ts imports Constants');
    assert.ok(src.includes('Constants.expoConfig'), 'supabase.ts reads the embedded config');
    assert.ok(src.includes('extra.supabaseUrl'), 'URL falls back to extra');
    assert.ok(src.includes('extra.supabaseAnonKey'), 'anon key falls back to extra');
    assert.ok(src.includes('resolveSupabaseConfig'), 'validator still gates the resolved values');
  });
});

describe('EAS build env — eas.json feeds the builder-side config resolution (build 23 gate failure #2)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('GUARD: eas.json production profile declares the production environment and the scratch URL env', () => {
    const eas = JSON.parse(read('../../apps/mobile/eas.json'));
    assert.equal(eas.build.production.environment, 'production');
    assert.equal(
      eas.build.production.env.EXPO_PUBLIC_SUPABASE_URL,
      'https://caimavjwasxiegjhxdsr.supabase.co',
      'the beta build must resolve the SCRATCH project URL from eas.json env',
    );
    assert.equal(eas.build.production.ios.autoIncrement, false, 'autoIncrement stays disabled');
  });

  it('GUARD: app.config.ts logs safe SET/MISSING diagnostics (never values)', () => {
    const cfg = read('../../apps/mobile/app.config.ts');
    assert.ok(cfg.includes('[app.config]'), 'diagnostic marker present');
    assert.ok(cfg.includes('MISSING'), 'diagnostic reports missing vars');
    assert.ok(cfg.includes('scratch host'), 'diagnostic reports scratch-host match as a boolean');
  });
});

describe('UI-01 — keyboard safety, modal bounds, RTL inputs, swipe action bounds', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  const near = (src, anchor, span = 320) => {
    const i = src.indexOf(anchor);
    assert.ok(i >= 0, `anchor missing: ${anchor}`);
    return src.slice(i, i + span);
  };

  it('GUARD: chat, vault page, mgmt page and every input-bearing fade modal are keyboard-avoiding', () => {
    const kavCount = idx.split('KeyboardAvoidingView').length - 1;
    assert.ok(kavCount >= 9, `expected >=9 KeyboardAvoidingView references (import + 8 usages), got ${kavCount}`);
    assert.ok(idx.includes("behavior={Platform.OS === 'ios' ? 'padding' : undefined}"), 'iOS padding behavior used');
  });

  it('GUARD: composer and free-text modal inputs follow the language direction (ta())', () => {
    assert.ok(near(idx, "placeholder={t('chatPlaceholder')}").includes('textAlign: ta()'), 'main composer input is direction-aligned');
    assert.ok(near(idx, "placeholder={t('tabNamePh')}").includes('fieldInput'), 'tab-name input uses the filled field style, not the code style');
    assert.ok(near(idx, "placeholder={t('newListTitlePh')}").includes('fieldInput'), 'new-list title uses the filled field style');
    assert.ok(near(idx, "placeholder={t('newListItemsPh')}").includes('fieldInput'), 'new-list items use the filled field style');
    assert.ok(near(idx, "placeholder={t('familyNamePh')}").includes('textAlign: ta()'), 'rename input is direction-aligned');
    assert.ok(near(idx, "placeholder={t('secretAddPlaceholder')}").includes('textAlign: ta()'), 'vault composer input is direction-aligned');
    assert.ok(near(idx, "placeholder={t('assigneePh')}").includes('textAlign: ta()'), 'assignee input is direction-aligned');
  });

  it('GUARD: swipe actions are bounded tiles clipped to the card radius (no full-row color bars)', () => {
    const sr = read('../../apps/mobile/src/lib/SwipeRow.tsx');
    assert.ok(sr.includes('width: ACTION_WIDTH'), 'action tile has a fixed width');
    assert.ok(!/action:\s*\{\s*flex:\s*1/.test(sr), 'action tile is not flex:1 (the oversized-background defect)');
    assert.ok(sr.includes("overflow: 'hidden'"), 'swipe container clips the action layer');
    assert.ok(sr.includes('containerStyle'), 'swipe container style is set');
    assert.ok(idx.includes('radius={14}'), 'shopping cards pass their 14px radius');
  });

  it('GUARD: modal cards are height-bounded and shopping spacing comes from the list gap only', () => {
    const st = read('../../apps/mobile/src/screens/home/styles.ts');
    const card = st.slice(st.indexOf('modalCard: {'), st.indexOf('modalCard: {') + 220);
    assert.ok(card.includes("maxHeight: '88%'"), 'modalCard is height-bounded');
    const shop = st.slice(st.indexOf('shopListCard: {'), st.indexOf('shopListCard: {') + 260);
    assert.ok(!shop.includes('marginBottom'), 'shopListCard carries no margin (list gap owns the spacing)');
    assert.ok(st.includes('kav: { flex: 1 }'), 'shared keyboard-avoiding container style exists');
  });

  it('GUARD: AuthScreen placeholder color is a palette value, not a string literal', () => {
    const as = read('../../apps/mobile/src/components/AuthScreen.tsx');
    assert.ok(!as.includes('"P.faint"'), 'no literal "P.faint" placeholder color remains');
    assert.ok(as.includes('placeholderTextColor={P.faint}'), 'palette placeholder color used');
  });
});

describe('OTA infrastructure — expo-updates, fingerprint runtime, beta channel lock', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const PROJECT_ID = '8e464152-4348-424b-8632-9ebb5028837e';

  it('GUARD: expo-updates is installed at an SDK-pinned version', () => {
    const pkg = JSON.parse(read('../../apps/mobile/package.json'));
    assert.ok(pkg.dependencies['expo-updates'], 'expo-updates dependency present');
    assert.ok(pkg.dependencies['expo-updates'].startsWith('~57.'), 'expo-updates matches SDK 57');
  });

  it('GUARD: app.json carries the EAS Update URL and the fingerprint policy', () => {
    const app = JSON.parse(read('../../apps/mobile/app.json'));
    assert.equal(app.expo.updates?.url, `https://u.expo.dev/${PROJECT_ID}`);
    assert.equal(app.expo.runtimeVersion?.policy, 'fingerprint');
    assert.ok((app.expo.plugins ?? []).includes('expo-updates'), 'expo-updates plugin registered');
    assert.equal(app.expo.extra?.eas?.projectId, PROJECT_ID, 'project id unchanged');
  });

  it('GUARD: eas.json stamps the beta channel and NO profile targets a production channel', () => {
    const eas = JSON.parse(read('../../apps/mobile/eas.json'));
    assert.equal(eas.build.production.channel, 'beta');
    for (const [name, profile] of Object.entries(eas.build)) {
      assert.notEqual(profile.channel, 'production', `profile ${name} must not use a production channel`);
    }
    assert.equal(eas.build.production.env.EXPO_PUBLIC_SUPABASE_URL, 'https://caimavjwasxiegjhxdsr.supabase.co', 'build env still targets scratch');
  });

  it('GUARD: app.config.ts never overrides updates/runtimeVersion (frozen for fingerprint stability)', () => {
    const cfg = read('../../apps/mobile/app.config.ts');
    assert.ok(!cfg.includes('runtimeVersion'), 'no runtimeVersion override in dynamic config');
    assert.ok(!/updates\s*:/.test(cfg), 'no updates override in dynamic config');
    assert.ok(cfg.includes('...config'), 'dynamic config still spreads the static app.json');
  });

  it('GUARD: the publish workflow (owner-applied) is manual-only, beta-locked and fail-closed', () => {
    const doc = read('../../docs/autonomous/launch/UPDATE_BETA_WORKFLOW_OWNER_STEP.md');
    assert.ok(doc.includes('workflow_dispatch'), 'manual dispatch only');
    assert.ok(doc.includes('--channel beta'), 'publishes to beta');
    assert.ok(!doc.includes('--channel production'), 'no path to a production channel');
    assert.ok(doc.includes('refs/heads/main'), 'main-only guard present');
    // hardened model: ONE env source — guard and publish both resolve the
    // EAS production environment; the GitHub Supabase secrets are never read
    assert.ok(doc.includes('eas env:exec --environment production'), 'guard runs inside the EAS production environment');
    assert.ok(doc.includes('node scripts/ota-env-guard.mjs'), 'committed provenance guard is what runs');
    assert.ok(!doc.includes('secrets.EXPO_PUBLIC_SUPABASE'), 'publish job never reads the GitHub Supabase secrets');
    assert.ok(doc.includes('UPDATE_MESSAGE: ${{ inputs.message }}'), 'inputs reach shell via env only (no run: interpolation)');
    assert.ok(doc.includes('KEY-VERIFIED-IN-DASHBOARD'), 'opaque-key attestation gate present');
    assert.ok(doc.includes('actions/checkout@11d5960a326750d5838078e36cf38b85af677262'), 'checkout pinned by SHA');
    assert.ok(doc.includes('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'), 'setup-node pinned by SHA');
  });
});

describe('OTA env guard — behavior against fabricated keys (the real CLI, spawned)', () => {
  const scriptPath = new URL('../../apps/mobile/scripts/ota-env-guard.mjs', import.meta.url).pathname;
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (p) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(p)}.fakesig`;
  const future = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  const past = Math.floor(Date.now() / 1000) - 3600;
  const GOOD_URL = 'https://caimavjwasxiegjhxdsr.supabase.co';
  const goodJwt = jwt({ ref: 'caimavjwasxiegjhxdsr', role: 'anon', exp: future, iss: GOOD_URL });

  async function runGuard(env) {
    const { execFile } = await import('node:child_process');
    return new Promise((resolve) => {
      execFile('node', [scriptPath], { env: { PATH: process.env.PATH, ...env } }, (err, stdout) => {
        resolve({ code: err ? (err.code ?? 1) : 0, stdout });
      });
    });
  }

  it('valid scratch JWT + exact URL passes and prints no key material', async () => {
    const r = await runGuard({ EXPO_PUBLIC_SUPABASE_URL: GOOD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: goodJwt });
    assert.equal(r.code, 0, r.stdout);
    assert.ok(r.stdout.includes('PASS'), 'guard reports PASS');
    assert.ok(!r.stdout.includes(goodJwt), 'the key itself is never printed');
    assert.ok(!r.stdout.includes('fakesig'), 'no key fragment is printed');
  });

  it('a key issued for the PRODUCTION project is blocked (ref claim)', async () => {
    const prodJwt = jwt({ ref: 'mwjzosfrxwxcrzcsiear', role: 'anon', exp: future, iss: 'https://mwjzosfrxwxcrzcsiear.supabase.co' });
    const r = await runGuard({ EXPO_PUBLIC_SUPABASE_URL: GOOD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: prodJwt });
    assert.notEqual(r.code, 0);
  });

  it('a service_role key is blocked (must never ship in an app bundle)', async () => {
    const svcJwt = jwt({ ref: 'caimavjwasxiegjhxdsr', role: 'service_role', exp: future });
    const r = await runGuard({ EXPO_PUBLIC_SUPABASE_URL: GOOD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: svcJwt });
    assert.notEqual(r.code, 0);
  });

  it('an expired key is blocked', async () => {
    const expJwt = jwt({ ref: 'caimavjwasxiegjhxdsr', role: 'anon', exp: past });
    const r = await runGuard({ EXPO_PUBLIC_SUPABASE_URL: GOOD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: expJwt });
    assert.notEqual(r.code, 0);
  });

  it('substring and look-alike URLs are blocked (exact equality only)', async () => {
    for (const bad of [
      'https://caimavjwasxiegjhxdsr.supabase.co.evil.example',
      'https://caimavjwasxiegjhxdsr.supabase.co/',
      'https://mwjzosfrxwxcrzcsiear.supabase.co',
      '',
    ]) {
      const r = await runGuard({ EXPO_PUBLIC_SUPABASE_URL: bad, EXPO_PUBLIC_SUPABASE_ANON_KEY: goodJwt });
      assert.notEqual(r.code, 0, `URL must be rejected: ${bad || '(empty)'}`);
    }
  });

  it('opaque keys fail closed without attestation and pass with it', async () => {
    const bare = await runGuard({ EXPO_PUBLIC_SUPABASE_URL: GOOD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fabricated' });
    assert.notEqual(bare.code, 0);
    const attested = await runGuard({
      EXPO_PUBLIC_SUPABASE_URL: GOOD_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fabricated',
      CONFIRM_OPAQUE_KEY: 'KEY-VERIFIED-IN-DASHBOARD',
    });
    assert.equal(attested.code, 0, attested.stdout);
  });

  it('missing key is blocked', async () => {
    const r = await runGuard({ EXPO_PUBLIC_SUPABASE_URL: GOOD_URL });
    assert.notEqual(r.code, 0);
  });
});

describe('CFP-01 A — modal stability, tap-outside policy, space labels', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  const styles = read('../../apps/mobile/src/screens/home/styles.ts');
  const constants = read('../../apps/mobile/src/screens/home/constants.ts');
  const i18n = read('../../apps/mobile/src/lib/i18n.ts');

  it('GUARD (item 5): space names are localized and rendered beside the tab icons', () => {
    for (const k of ['spaceNamePrivate', 'spaceNameFamily', 'spaceNameWork']) {
      assert.ok((i18n.match(new RegExp(`${k}:`, 'g')) ?? []).length >= 2, `${k} exists in both dicts`);
    }
    assert.ok(constants.includes('export function spaceLabel'), 'localized spaceLabel helper exists');
    assert.ok(idx.includes('{spaceLabel(st)}'), 'space tab bar renders icon + visible name');
    assert.ok(!idx.includes('SPACE_LABELS'), 'hardcoded-English label map no longer used by the screen');
  });

  it('GUARD (item 1): the new-list modal is anchored, scrollable, and free of JS height state', () => {
    assert.ok(!idx.includes('listItemsH'), 'the state-driven input height (shake mechanism) is gone');
    assert.ok(idx.includes('styles.modalBgAnchored'), 'new-list backdrop is top-anchored');
    assert.ok(idx.includes('style={styles.modalScroll}'), 'form region scrolls inside the card');
    assert.ok(styles.includes('modalBgAnchored'), 'anchored style defined');
    assert.ok(styles.includes('modalScroll'), 'modal scroll style defined');
  });

  it('GUARD (item 2): backdrop-close covers exactly the eligible modals, guarded where input is at risk', () => {
    const hits = idx.match(/modalBackdropHit/g) ?? [];
    assert.equal(hits.length, 11, 'exactly the 11 eligible modals carry a backdrop hit-area');
    assert.ok(idx.includes('function requestBackdropClose'), 'dirty-confirm policy helper defined');
    assert.ok(idx.includes("t('closeConfirmTitle')"), 'confirmation copy is localized');
    // security-sensitive flows stay excluded: no backdrop inside the join or delete-tab modals
    const blockOf = (anchor) => {
      const start = idx.indexOf(anchor);
      return idx.slice(start, idx.indexOf('</Modal>', start));
    };
    assert.ok(!blockOf('visible={joinOpen}').includes('modalBackdropHit'), 'join-by-code modal has no backdrop dismiss');
    assert.ok(!blockOf('visible={delTab !== null}').includes('modalBackdropHit'), 'delete-tab confirmation has no backdrop dismiss');
  });
});

describe('CFP-01 B — input limits (item 3) and conversation history 5/+5 (item 4)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  const client = read('../../packages/voice-engine/src/client.ts');
  const reportError = read('../../supabase/functions/report-error/index.ts');

  it('GUARD (item 4): drawer history windows at 5, growing by 5', () => {
    assert.ok(idx.includes('useState(5); // CFP-01 item 4'), 'initial window is 5');
    assert.ok(idx.includes('setHistVisible(5); // collapse the history list back to 5'), 'drawer-open reset is 5');
    assert.ok(idx.includes('setHistVisible((v) => v + 5)'), 'Show More adds 5');
    assert.ok(!idx.includes('setHistVisible((v) => v + 10)'), 'the old +10 increment is gone');
    assert.ok(!idx.includes('setHistVisible(10)'), 'the old reset-to-10 is gone');
  });

  it('GUARD (item 3): family name is capped at 20 in UI, engine, and the DB boundary', () => {
    const renameBlock = idx.slice(idx.indexOf('rename family (owner only)'), idx.indexOf('rename family (owner only)') + 1500);
    assert.ok(renameBlock.includes('maxLength={20}'), 'rename input caps at 20');
    assert.ok(renameBlock.includes('{renameValue.length}/20'), 'rename counter is shown');
    const rs = client.slice(client.indexOf('async renameSpace(spaceId'), client.indexOf('async renameSpace(spaceId') + 400);
    assert.ok(rs.includes('slice(0, 20)'), 'engine renameSpace enforces 20');
    const mig = read('../../supabase/migrations/0047_family_name_length.sql');
    assert.ok(mig.includes("new.type = 'family'"), 'DB trigger scopes to family spaces only');
    assert.ok(mig.includes('char_length(new.name) > 20'), 'DB trigger enforces 20');
    assert.ok(mig.includes('before insert or update of name'), 'trigger fires on writes only (existing rows untouched)');
  });

  it('GUARD (item 3): support messages cap at 1000 in UI, client, and server — telemetry keeps 200', () => {
    assert.ok(idx.includes('maxLength={1000}'), 'support input caps at 1000');
    assert.ok(idx.includes('{supportText.length}/1000'), 'support counter is shown');
    assert.ok(idx.includes('message: msg.slice(0, 1000)'), 'client sends up to 1000');
    assert.ok(reportError.includes('const SUPPORT_MESSAGE_MAX = 1000'), 'server support cap constant is 1000');
    assert.ok(reportError.includes("context === 'support' ? SUPPORT_MESSAGE_MAX : 200"), 'only the support context gets 1000; telemetry stays 200');
  });
});

describe('CFP-01 C — shopping lists server-side pagination (item 6)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const client = read('../../packages/voice-engine/src/client.ts');
  const idx = read('../../apps/mobile/src/app/index.tsx');

  it('GUARD: listShoppingLists pages server-side with a stable order; unpaged callers keep full fetch', () => {
    const fn = client.slice(client.indexOf('async listShoppingLists'), client.indexOf('async listShoppingLists') + 1400);
    assert.ok(fn.includes('opts?: PageOpts'), 'paging opts accepted');
    assert.ok(fn.includes('q.range(offset, offset + limit - 1)'), 'offset pages use range()');
    assert.ok(fn.includes(".order('id', { ascending: false })"), 'id tiebreak keeps pages stable');
    assert.ok(fn.includes('if (opts)'), 'paging applies only when opts are passed (digest/smart-shopping unaffected)');
  });

  it('GUARD: the shopping tab loads 10 lists, appends 10 per Show More, and hides it in search', () => {
    assert.ok(idx.includes('const SHOP_LISTS_PAGE = 10'), 'page size is 10');
    assert.ok(idx.includes('listShoppingLists(spaceId, { offset: 0, limit: SHOP_LISTS_PAGE })'), 'first page loads in refreshFamily');
    assert.ok(idx.includes('const loadMoreShopLists = useCallback'), 'load-more handler exists');
    assert.ok(idx.includes('shopListsHasMore && !shopSearch.inSearch'), 'Show More renders only when more pages exist and not while searching');
  });
});

describe('CFP-01 E — composer & microphone redesign (item 8)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  const styles = read('../../apps/mobile/src/screens/home/styles.ts');

  it('GUARD: the shared composer styles carry the redesign (both composers inherit it)', () => {
    assert.ok(styles.includes('composerBoxRecording'), 'recording state tints the composer box border');
    const input = styles.slice(styles.indexOf('composerInput: {'), styles.indexOf('composerInput: {') + 200);
    assert.ok(input.includes('fontSize: 16'), 'composer text is 16px (readability + no iOS focus zoom)');
    const cam = styles.slice(styles.indexOf('cameraBtn: {'), styles.indexOf('cameraBtn: {') + 220);
    assert.ok(cam.includes('backgroundColor: P.input'), 'in-box camera action sits on a soft disc');
  });

  it('GUARD: both composers show the recording tint; the vault composer auto-grows like the main one', () => {
    assert.equal((idx.match(/composerBoxRecording/g) ?? []).length, 2, 'main + vault composers both wired');
    assert.ok(!idx.includes('secretComposerH'), 'vault composer auto-grows natively (no JS height state — critical-hotfix change)');
    assert.ok(idx.includes('maxHeight: 120'), 'vault input keeps its own 120 growth cap inline');
    // behavior preservation: the combined mic/send control logic is untouched
    assert.ok(idx.includes("textNote.trim() && !isRecording ? () => onSendText() : onRecordPress"), 'main mic/send swap unchanged');
    assert.ok(idx.includes("secretDraft.trim() && !isRecording ? () => void saveSecretNoteLocal() : onSecretRecordPress"), 'vault mic/send swap unchanged');
  });
});

describe('CFP-01 D — custom spaces + configurable entitlements (item 7)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  const client = read('../../packages/voice-engine/src/client.ts');
  const fn = read('../../supabase/functions/manage-space/index.ts');
  const mig = read('../../supabase/migrations/0048_custom_spaces_limit.sql');
  const adminLimits = read('../../supabase/functions/admin-set-limits/index.ts');

  it('GUARD: the limit is configuration (profile default 2, plan feature 7, grants), not code branches', () => {
    assert.ok(mig.includes('custom_spaces_limit integer not null default 2'), 'free default is a profile column');
    assert.ok(mig.includes('custom_spaces_limit:7'), 'paid plans carry 7 via the features catalog');
    assert.ok(adminLimits.includes('custom_spaces_limit: [0, 100]'), 'admin can adjust the limit per user');
    assert.ok(fn.includes('Math.max(limit,'), 'effective limit = max of sources (downgrade-safe)');
    assert.ok(fn.includes("kind', 'custom_spaces_limit'") || fn.includes(".eq('kind', 'custom_spaces_limit')"), 'grants are honored');
  });

  it('GUARD: manage-space enforces owner-only, custom-only, non-empty-refusal, and the creation cap', () => {
    assert.ok(fn.includes("space.type !== 'custom'"), 'built-in spaces are protected (not_custom)');
    assert.ok(fn.includes("space.owner_id !== user.id"), 'owner check precedes mutations');
    assert.ok(fn.includes("fail('not_empty', 409)"), 'non-empty spaces refuse deletion (data preserved)');
    assert.ok(fn.includes("fail('limit_reached', 403)"), 'creation is capped server-side');
    assert.ok(fn.includes("action === 'create'") && fn.includes("action === 'rename'") && fn.includes("action === 'delete'"), 'all three actions exist');
    assert.ok(fn.includes('is_anonymous'), 'anonymous trial accounts cannot create spaces');
  });

  it('GUARD: engine + UI wiring is present', () => {
    assert.ok(client.includes("functions.invoke('manage-space'"), 'engine routes through the fn');
    assert.ok(client.includes('async createCustomSpace') && client.includes('async renameCustomSpace') && client.includes('async deleteCustomSpace'), 'engine CRUD methods exist');
    assert.ok(client.includes('async getCustomSpacesLimit'), 'engine reads the base limit');
    assert.ok(idx.includes("t('mySpaces')"), 'profile hosts the My Spaces manager');
    assert.ok(idx.includes('visible={spaceNameOpen}'), 'create/rename modal exists');
    assert.ok(idx.includes('onDeleteCustomSpace'), 'two-step delete is wired');
  });
});

describe('CFP-01 D hardening — DB-boundary entitlement enforcement (migration 0049)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const mig = read('../../supabase/migrations/0049_custom_spaces_db_limit.sql');
  const chat = read('../../supabase/functions/chat/index.ts');
  const behavioral = read('../../supabase/tests/authz-behavioral.mjs');

  it('GUARD: the cap lives in a trigger every insert path crosses, serialized per owner', () => {
    assert.ok(mig.includes('before insert on public.spaces'), 'trigger is on spaces insert');
    assert.ok(mig.includes("when (new.type = 'custom')"), 'trigger scopes to custom spaces only (built-ins exempt)');
    assert.ok(mig.includes('pg_advisory_xact_lock'), 'per-owner advisory lock serializes concurrent creators');
    assert.ok(mig.includes('custom_spaces_limit_reached'), 'rejections carry the stable marker');
    assert.ok(mig.includes("set search_path = ''"), 'definer functions pin search_path');
  });

  it('GUARD: the SQL limit resolution mirrors the edge-fn semantics (MAX of profile / plan / grant)', () => {
    assert.ok(mig.includes('custom_spaces_effective_limit'), 'shared SQL resolver exists');
    assert.ok(mig.includes('custom_spaces_limit'), 'all three sources are read');
    assert.ok(mig.includes('user_subscriptions') && mig.includes('subscription_grants') && mig.includes('profiles'), 'profile + plan + grant sources present');
    assert.ok(mig.includes('greatest('), 'MAX semantics (downgrade-safe)');
  });

  it('GUARD: the AI creation path pre-checks the same limit; behavioral proofs are wired into CI', () => {
    assert.ok(chat.includes("rpc('custom_spaces_effective_limit'"), 'chat executor resolves the shared limit');
    assert.ok(chat.includes("error: 'limit_reached'"), 'chat executor returns the limit code');
    assert.ok(behavioral.includes('custom_spaces_limit_reached'), 'behavioral suite asserts DB rejections');
    assert.ok(behavioral.includes('concurrency: exactly 2 of 6'), 'concurrency proof exists in the behavioral suite');
    assert.ok(behavioral.includes('downgrade: all 5 existing spaces preserved'), 'downgrade-preservation proof exists');
  });
});

describe('CFP-01 D navigation — custom spaces open in the generic browse UI', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  const constants = read('../../apps/mobile/src/screens/home/constants.ts');

  it('GUARD: AppView admits custom; openCustomSpace mirrors the generic loader set', () => {
    assert.ok(constants.includes("'chat' | SpaceType | 'custom'"), 'AppView includes the custom view');
    assert.ok(idx.includes('const openCustomSpace = useCallback'), 'openCustomSpace exists');
    assert.ok(idx.includes("setView('custom')"), 'opening a custom space sets the custom view');
    assert.ok(idx.includes('notesPage.refresh((o, l) => engine.listNotes(sid'), 'notes loader is parameterized by the custom space id');
    assert.ok(idx.includes('thingsPage.refresh((o, l) => engine.listThings(sid'), 'things loader is parameterized by the custom space id');
    assert.ok(idx.includes('refreshTabs(sid);'), 'custom tabs load for the opened space');
  });

  it('GUARD: entry point + demo re-open routing handle the custom view', () => {
    assert.ok(idx.includes('openCustomSpace(sp); }}'), 'profile My Spaces rows open the space');
    assert.equal((idx.match(/view === 'custom'/g) ?? []).length, 3, 'two demo re-open sites plus the active custom-space tab route custom views');
    // the generic browse branch is type-keyed, so custom spaces reuse it:
    assert.ok(idx.includes("viewSpace?.type === 'family' ? ("), 'family-vs-generic branch stays type-keyed (custom falls into generic)');
  });
});

describe('CFP-01 hotfix — Profile modal sequencing (stacked-modal wedge)', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  it('the space-name modal is only ever presented via the sequenced swap (never while Profile is open)', () => {
    // every setSpaceNameOpen(true) sits inside a queueAfterModalClose callback
    assert.equal((idx.match(/setSpaceNameOpen\(true\)/g) ?? []).length, 2, 'exactly the two queued presentations');
    assert.equal((idx.match(/queueAfterModalClose\(\(\) => setSpaceNameOpen\(true\)\)/g) ?? []).length, 2);
    // both entry points close Profile first
    const create = idx.slice(idx.indexOf('const openSpaceCreate'), idx.indexOf('const openSpaceRename'));
    const rename = idx.slice(idx.indexOf('const openSpaceRename'), idx.indexOf('const closeSpaceName'));
    assert.ok(create.includes('setProfileOpen(false)'), 'create closes Profile before presenting');
    assert.ok(rename.includes('setProfileOpen(false)'), 'rename closes Profile before presenting');
  });
  it('the swap helper waits out the fade and supersedes stale timers', () => {
    assert.ok(idx.includes('const queueAfterModalClose = useCallback('), 'sequencing helper exists');
    assert.ok(idx.includes('clearTimeout(modalSwapTimer.current)'), 'a newer swap cancels the pending one');
    assert.ok(idx.includes('setTimeout(fn, 380)'), 'presentation waits for the dismissal fade');
  });
  it('closing the name modal returns to Profile through the same sequencing', () => {
    assert.ok(idx.includes('const closeSpaceName = useCallback('), 'single close path');
    const save = idx.slice(idx.indexOf('const saveSpaceName'), idx.indexOf('const onDeleteCustomSpace'));
    assert.ok(save.includes('closeSpaceName(true)'), 'successful save returns to Profile (list refreshed first)');
    assert.ok(idx.includes('onRequestClose={() => closeSpaceName(true)}'), 'Android back returns to Profile');
    assert.equal((idx.match(/setSpaceNameOpen\(false\)/g) ?? []).length, 1, 'the raw close setter lives only inside closeSpaceName');
  });
  it('Profile open itself performs no manage-space load (no new async work on open)', () => {
    const profileBtn = idx.slice(idx.indexOf('setProfileOpen(true);', idx.indexOf('menuProfile')) - 200, idx.indexOf('menuProfile'));
    assert.ok(!profileBtn.includes('manageSpace') && !profileBtn.includes('getCustomSpacesLimit'), 'open handler only flips visibility');
    assert.ok(idx.includes(".getCustomSpacesLimit(user.id)"), 'the limit still loads once at sign-in');
  });
});

describe('UI polish — New Space button, composer growth, send contrast', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  const styles = read('../../apps/mobile/src/screens/home/styles.ts');
  const i18n = read('../../apps/mobile/src/lib/i18n.ts');
  it('New Space is a filled ink button with a real white plus glyph; handler + label keys preserved', () => {
    const btn = styles.slice(styles.indexOf('newSpaceBtn: {'), styles.indexOf('newSpaceBtn: {') + 260);
    assert.ok(btn.includes('backgroundColor: P.ink'), 'filled with the ink token (near-black in light, inverted in dark)');
    assert.ok(styles.includes("newSpaceBtnPlus: { fontSize: 20, fontWeight: '700', color: P.paper }"), 'plus glyph is paper-white');
    assert.ok(styles.includes("newSpaceBtnText: { fontSize: 15, fontWeight: '700', color: P.paper }"), 'label is paper-white');
    assert.ok(idx.includes('onPress={openSpaceCreate} style={styles.newSpaceBtn}'), 'same create handler, new style');
    assert.ok(idx.includes('<Text style={styles.newSpaceBtnPlus}>+</Text>'), 'plus is a text glyph (inherits the paper color), not an emoji');
    assert.ok(!i18n.includes("newSpaceBtn: '➕"), 'the emoji plus is gone from both dictionaries');
  });
  it('main composer grows to ~6 lines (148) then scrolls internally; vault cap untouched', () => {
    assert.ok(!idx.includes('setComposerH(') && !idx.includes('height: composerH'), 'growth is native auto-sizing, not JS height state (critical-hotfix change)');
    assert.ok(!idx.includes('Math.min(148'), 'the unreliable content-size clamp is gone');
    const input = styles.slice(styles.indexOf('composerInput: {'), styles.indexOf('composerInput: {') + 200);
    assert.ok(input.includes('maxHeight: 148'), 'shared input style matches the new main cap');
    assert.ok(!idx.includes('scrollEnabled={false}'), 'the input still scrolls internally past the cap');
    const row = styles.slice(styles.indexOf('inputRow: {'), styles.indexOf('inputRow: {') + 120);
    assert.ok(row.includes("alignItems: 'flex-end'"), 'send/mic stay bottom-aligned as the box grows');
  });
  it('send state is ink + paper arrow in both composers; logic and labels unchanged', () => {
    assert.ok(styles.includes('micBtnSend: { backgroundColor: P.ink }'), 'send disc is ink');
    assert.ok(styles.includes('micBtnTextSend: { color: P.paper }'), 'send arrow is explicitly paper-white');
    assert.equal((idx.match(/styles\.micBtnSend/g) ?? []).length, 2, 'main + vault buttons both wired');
    assert.equal((idx.match(/styles\.micBtnTextSend/g) ?? []).length, 2, 'both arrows tinted');
    assert.ok(idx.includes("textNote.trim() && !isRecording ? () => onSendText() : onRecordPress"), 'main handler logic untouched');
    assert.ok(idx.includes("secretDraft.trim() && !isRecording ? () => void saveSecretNoteLocal() : onSecretRecordPress"), 'vault handler logic untouched');
    assert.ok(idx.includes("accessibilityLabel={isRecording ? t('a11yStopRecording') : textNote.trim() ? t('a11ySend') : t('a11yRecord')}"), 'a11y labels untouched');
  });
});

describe('Critical regression hotfix — startup bounds, drawer guarantee, recording audio-mode, native composer sizing', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const idx = read('../../apps/mobile/src/app/index.tsx');
  const hook = read('../../apps/mobile/src/hooks/useVoiceRecorder.ts');
  it('BEHAVIOR: withTimeout resolves fast values, nulls slow ones, propagates rejections', async () => {
    const { withTimeout } = await import('../../apps/mobile/src/lib/withTimeout.ts');
    assert.equal(await withTimeout(Promise.resolve(42), 1000), 42);
    assert.equal(await withTimeout(new Promise((r) => setTimeout(() => r('late'), 200)), 30), null);
    await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 1000), /boom/);
  });
  it('boot-critical network awaits are bounded; the draft archive no longer gates first paint', () => {
    assert.ok(idx.includes('withTimeout(supabase.auth.getSession(), 12000)'), 'session establishment is bounded');
    assert.ok(idx.includes('withTimeout(loadSpaces(user.id), 12000)'), 'spaces load is bounded');
    const boot = idx.slice(idx.indexOf('const boot = useCallback'), idx.indexOf('const handleAuthEvent'));
    assert.ok(!boot.includes('await persistSession('), 'stale-draft archive is background work now');
    assert.ok(boot.includes('void persistSession('), 'the archive still happens, off the critical path');
  });
  it('drawer actions unmount the overlay before dispatching native surfaces', () => {
    const cm = idx.slice(idx.indexOf('const closeMenu'), idx.indexOf('const closeMenu') + 700);
    assert.ok(cm.includes('menuX.stopAnimation()'), 'closing stops any in-flight drawer animation');
    assert.ok(cm.includes('setMenuOpen(false)'), 'the drawer overlay is removed immediately');
    assert.ok(cm.includes('setTimeout(after, 0)'), 'queued actions dispatch on the next event-loop turn');
  });
  it('recording configures a recordable audio session BEFORE preparing, and never fails silently', () => {
    assert.ok(hook.includes('setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })'), 'recordable session is requested');
    assert.ok(
      hook.indexOf('setAudioModeAsync') < hook.indexOf('prepareToRecordAsync'),
      'the audio mode is set before prepareToRecordAsync',
    );
    assert.ok(hook.includes("console.warn('recording start failed', e)"), 'start() catches and reports instead of throwing into the void');
    assert.ok(hook.includes('setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })'), 'stop() hands the session back to playback');
    assert.ok(idx.includes("if (!ok) pushMsg('app', t('recordFail'))"), 'a failed start surfaces the existing recordFail message in chat');
  });
  it('both composers size natively: no explicit height, min 44, caps in style only', () => {
    assert.ok(!idx.includes('height: secretComposerH') && !idx.includes('height: composerH'), 'no controlled heights remain');
    assert.equal((idx.match(/minHeight: 44/g) ?? []).length, 2, 'both inputs keep the one-line minimum');
    assert.ok(idx.includes("maxHeight: 120, textAlignVertical: 'top'"), 'vault input caps at 120 inline');
  });
});


describe('mobile home navigation regressions', () => {
  it('keeps the drawer overlay above Home content in the render tree', () => {
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const drawer = idx.indexOf("side drawer menu: in-tree overlay");
    const homeContent = idx.indexOf("      {view === 'chat' ? (");
    assert.ok(drawer > homeContent, 'drawer must render after Home content so it receives taps');
  });

  it('renders user-created spaces beside the built-in space tabs', () => {
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const tabs = idx.slice(
      idx.indexOf("      {/* view tabs: chat home + spaces for browsing */}"),
      idx.indexOf("      {/* anonymous trial account"),
    );
    assert.match(tabs, /customSpaces\.map/);
    assert.match(tabs, /openCustomSpace\(sp\)/);
    assert.match(tabs, /view === 'custom' && viewSpace\?\.id === sp\.id/);
  });
});


describe('mobile navigation hardening — first paint and horizontal spaces', () => {
  it('uses an in-tree overlay for the drawer and defers history refresh', () => {
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const drawerStart = idx.indexOf("side drawer menu: in-tree overlay");
    const welcomeStart = idx.lastIndexOf("      {/* first-run welcome: 3 steps, once per device */}");
    const drawer = idx.slice(drawerStart, welcomeStart);
    assert.match(drawer, /\{menuOpen \? \(/, 'drawer is rendered in the app tree');
    assert.doesNotMatch(drawer, /<Modal visible=\{menuOpen\}/, 'drawer does not use a native Modal presenter');
    assert.match(idx, /setTimeout\(\(\) => \{ void loadHistory\(\); \}, 0\)/);
  });

  it('renders the home and space tabs in a horizontally scrollable row', () => {
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const tabs = idx.slice(
      idx.indexOf("view tabs: chat home + spaces for browsing"),
      idx.indexOf("anonymous trial account"),
    );
    assert.match(tabs, /<ScrollView[\s\S]*horizontal/);
    assert.match(tabs, /showsHorizontalScrollIndicator={false}/);
    assert.match(tabs, /customSpaces\.map/);
  });
});


describe('mobile navigation hardening — header hit target', () => {
  it('keeps the Home header above the content touch surface', () => {
    const styles = readFileSync(new URL('../../apps/mobile/src/screens/home/styles.ts', import.meta.url), 'utf8');
    const header = styles.slice(styles.indexOf('header:'), styles.indexOf('title:'));
    assert.match(header, /zIndex: 100/);
    assert.match(header, /elevation: 10/);
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.ok(idx.includes('onPress={openMenu}'), 'hamburger keeps its open handler');
    assert.ok(idx.includes('hitSlop={12}'), 'hamburger keeps the enlarged touch target');
  });
});


describe('mobile drawer modal sequencing', () => {
  it('defers history work and uses the native animation driver when opening', () => {
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const open = idx.slice(idx.indexOf('const openMenu'), idx.indexOf('const openMenu') + 800);
    assert.match(open, /useNativeDriver: true/);
    assert.match(open, /setTimeout\(\(\) => \{ void loadHistory\(\); \}, 0\)/);
  });

  it('removes the in-tree drawer before presenting another native surface', () => {
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    const close = idx.slice(idx.indexOf('const closeMenu'), idx.indexOf('const closeMenu') + 1300);
    assert.match(close, /after\?: \(\) => void/);
    assert.match(close, /menuX\.stopAnimation\(\)/, 'closing stops the in-flight drawer animation');
    assert.match(close, /setMenuOpen\(false\)/, 'drawer is unmounted before navigation');
    assert.match(close, /setTimeout\(after, 0\)/, 'queued actions dispatch on the next event-loop turn');
    assert.match(idx, /closeMenu\(\(\) => setProfileOpen\(true\)\)/);
    assert.match(idx, /closeMenu\(\(\) => setAboutOpen\(true\)\)/);
  });
});


describe('first-run welcome hardening', () => {
  it('keeps onboarding content keyboard-safe and scrollable', () => {
    const welcome = readFileSync(new URL('../../apps/mobile/src/components/WelcomeScreen.tsx', import.meta.url), 'utf8');
    assert.ok(welcome.includes('KeyboardAvoidingView'), 'welcome avoids the iOS keyboard');
    assert.ok(welcome.includes('keyboardShouldPersistTaps="handled"'), 'welcome keeps controls tappable with the keyboard open');
    assert.ok(welcome.includes('showsVerticalScrollIndicator={false}'), 'welcome content can scroll without visual clutter');
  });

  it('does not leave onboarding actions waiting forever', () => {
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.ok(idx.includes('withTimeout(engine.saveVoiceNote'), 'voice save is bounded');
    assert.ok(idx.includes('withTimeout(engine.saveTextNote'), 'text save is bounded');
    assert.ok(idx.includes('withTimeout(engine.chat('), 'demo question is bounded');
    assert.ok(idx.includes('const deadline = Date.now() + 30_000'), 'transcription polling is bounded');
  });

  it('recorder and onboarding callbacks recover from rejected promises', () => {
    const welcome = readFileSync(new URL('../../apps/mobile/src/components/WelcomeScreen.tsx', import.meta.url), 'utf8');
    assert.ok(welcome.includes("setMic('failed')"), 'recorder failures return to a retryable state');
    assert.ok(welcome.includes('finally {'), 'save and ask states always clear');
  });
});


describe('drawer native modal dismissal sequencing', () => {
  it('waits for drawer onDismiss before presenting a queued profile modal', () => {
    const idx = readFileSync(new URL('../../apps/mobile/src/app/index.tsx', import.meta.url), 'utf8');
    assert.match(idx, /\{menuOpen \? \(/, 'drawer is conditionally mounted');
    assert.doesNotMatch(idx, /<Modal visible=\{menuOpen\}/, 'drawer has no native presenter');
    assert.match(idx, /menuX\.stopAnimation\(\)/, 'drawer closes without waiting for animation callbacks');
    assert.match(idx, /setTimeout\(after, 0\)/, 'drawer actions dispatch after immediate removal');
  });
});
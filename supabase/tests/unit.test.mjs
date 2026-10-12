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
import { resolveTabName } from '../functions/_shared/tabs.ts';
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
import { readFileSync } from 'node:fs';

// edge-auth.ts imports supabase-js from esm.sh — resolve it to our stub
// BEFORE the dynamic import below.
register('./resolve-hook.mjs', import.meta.url);
const edgeAuth = await import('../functions/_shared/edge-auth.ts');

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

describe('PR-B hardening — F-SEC-04/05/06/07/08', () => {
  it('timingSafeEqual: exact match only, length- and content-sensitive', async () => {
    const { timingSafeEqual } = await import('../functions/_shared/edge-auth.ts');
    assert.equal(timingSafeEqual('s3cret-token', 's3cret-token'), true);
    assert.equal(timingSafeEqual('s3cret-token', 's3cret-tokem'), false);
    assert.equal(timingSafeEqual('s3cret-token', 's3cret'), false);
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
  });

  it('GUARD: report-error stores only sanitized telemetry', () => {
    const re = readFileSync(new URL('../functions/report-error/index.ts', import.meta.url), 'utf8');
    assert.ok(re.includes('sanitizeTelemetryText(b?.message'), 'message is sanitized');
    assert.ok(re.includes('sanitizeTelemetryText(b.stack') && re.includes('sanitizeTelemetryText(b.context'));
    assert.ok(!re.includes('String(b?.message'), 'raw client text must not reach storage');
  });
});

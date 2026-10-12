// ── 🧠 Memory engine ("ذاكرة زي Muse") ─────────────────────────────────────
// ONE shared engine consumed by:
//   * memory-learn      — implicit learning: extracts durable facts from every
//                         chat turn (the app learns like Muse, not just from
//                         explicit "ناديني X" commands)
//   * chat              — recall: relevance-ranked facts injected per turn +
//                         remember_fact / forget_fact / list_memories tools
//   * memory-consolidate — nightly gardener: daily episodes, duplicate
//                         surfacing, visibility re-scoring (NEVER deletes a
//                         live memory — D1 data-protection contract, spec §1)
//
// DURABILITY CONTRACT (owner decision #1, D0.5 spec §1): a saved memory is
// deleted ONLY through a user-initiated door: explicit delete → 30-day trash,
// user-confirmed merge, full account delete, or the trash auto-purge of rows
// the user already trashed. Age, downgrade, and quota overflow NEVER delete.
// The single `.delete()` on items in this file lives in
// purgeExpiredTrashedFacts() and only touches status='trashed' rows past
// their retention window.
//
// Store: items rows with kind='memory' (migration 0023) in the user's PRIVATE
// space — owner-only by RLS, invisible in every tab. meta carries:
//   { mkey, mcat, layer, importance 1-5, source: 'explicit'|'learned'|'episode' }
//
// Zero-dependency, extractable: pure functions + a tiny Supabase surface.
// No pgvector needed — v1 retrieval is token-overlap scoring with Arabic
// normalization; swap scoreFact() for vector search later without touching
// the consumers.

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface LearnedFact {
  /** one concise line in the user's language, e.g. "بيناديني: أبو كريم" */
  content: string;
  /** stable snake_case key, e.g. "identity:name" — same concept, same key */
  mkey: string;
  /** identity|family|preference|routine|meaning|entity|episode|place_habit|route */
  mcat: string;
  /** 1-5: 5 = identity/family core, 1 = trivial */
  importance: number;
  /** optional structured payload (e.g. routing rules) — persisted into meta */
  // deno-lint-ignore no-explicit-any
  meta?: Record<string, any>;
}

export interface MemoryRow {
  id: string;
  title: string;
  details: string | null;
  meta: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/** Arabic-aware normalization: uniform matching across dialects. */
export function normAr(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^ء-غف-يa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set([
  'انا', 'انت', 'انتي', 'هو', 'هي', 'احنا', 'نحن', 'هاد', 'هاي', 'هاظ', 'هادا',
  'هيدا', 'اللي', 'اللى', 'التي', 'الذي', 'في', 'من', 'على', 'الى', 'إلى',
  'مع', 'و', 'او', 'أو', 'بس', 'كمان', 'عشان', 'عند', 'عندي', 'شو', 'ايش',
  'مين', 'وين', 'كيف', 'ليش', 'the', 'a', 'an', 'and', 'or', 'is', 'are',
  'my', 'me', 'i',
]);

function tokens(s: string): string[] {
  return normAr(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
}

/** Relevance of one fact to the current user message. */
export function scoreFact(f: MemoryRow, queryTokens: string[]): number {
  const factTokens = new Set(tokens(`${f.title} ${f.details ?? ''}`));
  if (factTokens.size === 0 || queryTokens.length === 0) return 0;
  let hits = 0;
  for (const q of queryTokens) {
    for (const t of factTokens) {
      if (t === q || (t.length > 3 && q.length > 3 && (t.includes(q) || q.includes(t)))) {
        hits++;
        break;
      }
    }
  }
  const importance = Number(f.meta?.importance ?? 3);
  const daysOld =
    (Date.now() - new Date(f.updated_at ?? f.created_at).getTime()) / 86400000;
  const recency = Math.max(0, 1 - daysOld / 180);
  // Visibility decay (spec §3.1): stale low-importance facts rank lower via
  // meta.retrieval_boost — they are NEVER deleted for age.
  const boost = Number(f.meta?.retrieval_boost ?? 1);
  return (hits * 3 + importance * 0.6 + recency * 0.5) * (boost > 0 ? boost : 1);
}

/** Load all open memory facts for a space. */
export async function loadFacts(supa: Supa, spaceId: string): Promise<MemoryRow[]> {
  const { data } = await supa
    .from('items')
    .select('id, title, details, meta, created_at, updated_at')
    .eq('space_id', spaceId)
    .eq('kind', 'memory')
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(300);
  return (data ?? []) as MemoryRow[];
}

/**
 * Recall: top-N facts ranked for THIS message (like Muse re-reading MEMORY.md
 * every turn — but relevance-ranked, so 200 facts don't bloat the prompt).
 */
export async function recallFacts(
  supa: Supa,
  spaceId: string,
  query: string,
  limit = 12,
): Promise<MemoryRow[]> {
  const facts = await loadFacts(supa, spaceId);
  const qt = tokens(query);
  return facts
    .filter((f) => f.meta?.mcat !== 'route') // routing rules aren't conversational memories
    .map((f) => ({ f, s: scoreFact(f, qt) }))
    .filter((x) => x.s > 1.2)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f);
}

export function factLine(f: MemoryRow): string {
  const v = (f.details ?? '').trim();
  return v ? `${f.title}: ${v}`.slice(0, 140) : f.title.slice(0, 140);
}

/** System prompt for the extraction call. Existing facts are passed so the
 *  model reuses mkeys instead of duplicating ("smart" dedupe at write time). */
export function learnSystem(existing: MemoryRow[], uiAr: boolean): string {
  const known = existing
    .slice(0, 40)
    .map((f) => `- ${String(f.meta?.mkey ?? '?')}: ${factLine(f)}`)
    .join('\n');
  return `You extract DURABLE user memories from one conversation turn. Reply with ONLY JSON: {"facts":[{"content":"...","mkey":"...","mcat":"...","importance":1-5}]}.

Rules:
- "content": ONE concise line in the ${uiAr ? 'user\u2019s language (Levantine Arabic as they write it)' : 'user\u2019s language'}.
- "mkey": stable snake_case key (identity:name, family:son_name, preference:wake_time, routine:friday, meaning:خضرة, place_habit:keys). SAME concept as an existing fact below → reuse its exact mkey (that updates it instead of duplicating).
- "mcat": identity | family | preference | routine | meaning | entity | place_habit
- "importance": 5 = identity/family core · 4 = strong preference/routine · 3 = useful fact · 2 = weak · 1 = trivial
- Extract ONLY lasting facts: name/nickname, family members + relations, routines, habits, strong likes/dislikes, word meanings, where they habitually keep things.
- NEVER extract: one-off tasks, appointments, shopping items, places of single notes (those live in items/notes already) · transient statements ("I'm tired now") · the assistant's own words as user facts.
- PRIVACY HARD RULE: if the turn mentions secret words, codes, passwords, PINs, or anything the user wants hidden/protected, extract NOTHING from that turn. Secrets are never memorized.
- If nothing durable: {"facts":[]}.

Already known (reuse mkeys!):
${known || '(none yet)'}`;
}

/** Parse the model's extraction reply. Never throws. */
export function parseLearned(raw: string): LearnedFact[] {
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const p = JSON.parse(clean);
    const arr = Array.isArray(p.facts) ? p.facts : [];
    return arr
      .filter((x: any) => typeof x?.content === 'string' && x.content.trim())
      .map((x: any) => ({
        content: String(x.content).trim().slice(0, 160),
        mkey: String(x.mkey ?? '').toLowerCase().replace(/[^a-z0-9_:ء-غف-ي-]/g, '').slice(0, 60) || `fact:${Date.now()}`,
        mcat: ['identity', 'family', 'preference', 'routine', 'meaning', 'entity', 'place_habit', 'episode'].includes(x.mcat) ? x.mcat : 'preference',
        importance: Math.min(5, Math.max(1, Number(x.importance) || 3)),
      }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * Quota gate (spec §4): true when a NEW save must be blocked. The cap value
 * itself is an owner decision (OD-01/02, options in spec §4.4) — until the
 * owner picks one, callers pass no cap and nothing is blocked. Overflow NEVER
 * deletes existing facts; it only refuses new creation.
 */
export function quotaGate(count: number, cap?: number): boolean {
  return typeof cap === 'number' && cap > 0 && count >= cap;
}

/** Read-only count of open memory facts in a space (quota + admin stats). */
export async function countFactsForQuota(supa: Supa, spaceId: string): Promise<number> {
  const { count, data } = await supa
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('space_id', spaceId)
    .eq('kind', 'memory')
    .eq('status', 'open');
  if (typeof count === 'number') return count;
  return ((data ?? []) as unknown[]).length;
}

/**
 * Read-only candidate listing for user-driven cleanup (spec §4.2): weakest +
 * stalest first. Listing NEVER mutates the store — deletion is the user's
 * choice, through trash.
 */
export async function oldestWeakestForReview(supa: Supa, spaceId: string, n = 20): Promise<MemoryRow[]> {
  const facts = await loadFacts(supa, spaceId);
  return facts
    .slice()
    .sort((a, b) => Number(a.meta?.importance ?? 3) - Number(b.meta?.importance ?? 3) || (a.updated_at < b.updated_at ? -1 : 1))
    .slice(0, n);
}

/**
 * Upsert learned facts. Same mkey → update + reinforce (importance bump, like
 * Muse's "last reinforced"). Returns counts for logging.
 *
 * D1 (spec §4.1): when `opts.cap` is provided and the store is at cap, NEW
 * facts are refused (`blocked`) — nothing is deleted to make room. Updates to
 * facts the user already owns (same mkey) are never blocked.
 */
export async function upsertFacts(
  supa: Supa,
  spaceId: string,
  userId: string,
  facts: LearnedFact[],
  source: 'learned' | 'explicit' | 'episode' = 'learned',
  opts?: { cap?: number },
): Promise<{ saved: number; updated: number; blocked: number }> {
  let saved = 0;
  let updated = 0;
  let blocked = 0;
  let knownCount: number | null = null;
  for (const f of facts) {
    const { data: existing } = await supa
      .from('items')
      .select('id, meta')
      .eq('space_id', spaceId)
      .eq('kind', 'memory')
      .eq('status', 'open')
      .eq('meta->>mkey', f.mkey)
      .limit(1)
      .maybeSingle();
    if (existing) {
      const oldImp = Number(existing.meta?.importance ?? 3);
      await supa
        .from('items')
        .update({
          details: f.content,
          updated_at: new Date().toISOString(),
          meta: { ...(existing.meta ?? {}), ...(f.meta ?? {}), importance: Math.min(5, Math.max(oldImp, f.importance) + (oldImp >= f.importance ? 1 : 0)), mcat: f.mcat, source },
        })
        .eq('id', existing.id);
      updated++;
    } else {
      if (opts?.cap !== undefined) {
        if (knownCount === null) knownCount = await countFactsForQuota(supa, spaceId);
        if (quotaGate(knownCount, opts.cap)) {
          blocked++;
          continue;
        }
      }
      const { error } = await supa.from('items').insert({
        space_id: spaceId,
        kind: 'memory',
        title: f.mkey,
        details: f.content,
        status: 'open',
        created_by: userId,
        meta: { ...(f.meta ?? {}), mkey: f.mkey, mcat: f.mcat, layer: f.mcat === 'episode' ? 'episode' : 'fact', importance: f.importance, source },
      });
      if (!error) {
        saved++;
        if (knownCount !== null) knownCount++;
      }
    }
  }
  return { saved, updated, blocked };
}

/**
 * Non-destructive maintenance planning (spec §3, decision #7). PURE.
 * - rescore: importance ≤1 facts untouched for 90+ days get a retrieval
 *   penalty (meta.retrieval_boost = 0.5). The row stays; it ranks lower.
 * - flagReview: facts untouched for 180+ days with importance ≤2 become
 *   review-queue candidates (meta.review_candidate = true) for the user to
 *   keep / archive / delete — the system never decides for them.
 * Idempotent: facts already rescored/flagged are not returned again.
 */
export function planMemoryMaintenance(
  facts: MemoryRow[],
  now: Date,
): { rescore: string[]; flagReview: string[] } {
  const rescore: string[] = [];
  const flagReview: string[] = [];
  for (const f of facts) {
    const ageDays = (now.getTime() - new Date(f.updated_at).getTime()) / 86400000;
    const importance = Number(f.meta?.importance ?? 3);
    if (ageDays > 90 && importance <= 1 && Number(f.meta?.retrieval_boost ?? 1) !== 0.5) {
      rescore.push(f.id);
    }
    if (ageDays > 180 && importance <= 2 && f.meta?.review_candidate !== true) {
      flagReview.push(f.id);
    }
  }
  return { rescore, flagReview };
}

/**
 * Apply planMemoryMaintenance to one space: metadata UPDATEs only.
 * This replaces the old 90-day hard-delete ("decay"). NEVER deletes.
 */
export async function applyMemoryMaintenance(
  supa: Supa,
  spaceId: string,
  now: Date = new Date(),
): Promise<{ rescored: number; review_flagged: number }> {
  const facts = await loadFacts(supa, spaceId);
  const plan = planMemoryMaintenance(facts, now);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const patchFor = new Map<string, Record<string, unknown>>();
  for (const id of plan.rescore) patchFor.set(id, { ...(patchFor.get(id) ?? {}), retrieval_boost: 0.5 });
  for (const id of plan.flagReview) patchFor.set(id, { ...(patchFor.get(id) ?? {}), review_candidate: true });
  for (const [id, patch] of patchFor) {
    const row = byId.get(id);
    if (!row) continue;
    await supa
      .from('items')
      .update({ meta: { ...(row.meta ?? {}), ...patch } })
      .eq('id', id);
  }
  return { rescored: plan.rescore.length, review_flagged: plan.flagReview.length };
}

/**
 * Scoped forget matching (spec §5.1). PURE — decides WHAT a forget request
 * may touch, never deletes anything itself.
 *   tier 'exact'     — normalized content/title equals the query
 *   tier 'mkey'      — every query token appears in a fact's mkey tokens
 *   tier 'substring' — legacy substring candidates (any query token in text)
 * `auto` is set ONLY when the winning tier yields exactly one candidate;
 * otherwise the caller must ask the user to pick from `candidates`.
 * Route facts (mcat='route') are excluded — they change only via explicit
 * corrections (spec §5.3).
 */
export interface ForgetMatch {
  tier: 'exact' | 'mkey' | 'substring' | 'none';
  candidates: MemoryRow[];
  auto: MemoryRow | null;
}

export function matchForget(facts: MemoryRow[], query: string): ForgetMatch {
  const q = normAr(query ?? '');
  if (!q) return { tier: 'none', candidates: [], auto: null };
  const eligible = facts.filter((f) => f.meta?.mcat !== 'route');
  const done = (tier: ForgetMatch['tier'], candidates: MemoryRow[]): ForgetMatch => ({
    tier,
    candidates,
    auto: candidates.length === 1 ? candidates[0] : null,
  });

  const exact = eligible.filter((f) =>
    normAr(f.details ?? '') === q || normAr(f.title) === q || normAr(`${f.title} ${f.details ?? ''}`) === q);
  if (exact.length > 0) return done('exact', exact);

  const qt = q.split(' ').filter(Boolean);
  const mkey = eligible.filter((f) => {
    const kt = String(f.meta?.mkey ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return qt.length > 0 && kt.length > 0 && qt.every((t) => kt.includes(t));
  });
  if (mkey.length > 0) return done('mkey', mkey);

  const qtoks = qt.filter((w) => w.length > 1);
  const sub = eligible.filter((f) => {
    const ft = normAr(`${f.title} ${f.details ?? ''}`);
    return qtoks.some((t) => ft.includes(t));
  });
  if (sub.length > 0) return done('substring', sub);

  return { tier: 'none', candidates: [], auto: null };
}

/**
 * Move a memory fact to trash (spec §5.2): status flip + trashed_at stamp.
 * Recoverable for the retention window; the row is NOT deleted here.
 * Requires migration 0035 (items status 'trashed') wherever deployed.
 */
export async function trashFact(
  supa: Supa,
  fact: MemoryRow,
  reason: string,
): Promise<boolean> {
  const { error } = await supa
    .from('items')
    .update({
      status: 'trashed',
      meta: { ...(fact.meta ?? {}), trashed_at: new Date().toISOString(), trash_reason: reason },
    })
    .eq('id', fact.id);
  return !error;
}

/** Restore a trashed memory fact back to open (undo, spec §5.2). */
export async function restoreFact(supa: Supa, spaceId: string, factId: string): Promise<MemoryRow | null> {
  const { data } = await supa
    .from('items')
    .select('id, title, details, meta, created_at, updated_at')
    .eq('space_id', spaceId)
    .eq('kind', 'memory')
    .eq('status', 'trashed')
    .eq('id', factId)
    .maybeSingle();
  if (!data) return null;
  const meta = { ...((data as MemoryRow).meta ?? {}) };
  delete meta.trashed_at;
  delete meta.trash_reason;
  const { error } = await supa
    .from('items')
    .update({ status: 'open', meta })
    .eq('id', factId);
  if (error) return null;
  return { ...(data as MemoryRow), meta };
}

/** List trashed memory facts in a space (undo / trash views). */
export async function listTrashedFacts(supa: Supa, spaceId: string): Promise<MemoryRow[]> {
  const { data } = await supa
    .from('items')
    .select('id, title, details, meta, created_at, updated_at')
    .eq('space_id', spaceId)
    .eq('kind', 'memory')
    .eq('status', 'trashed')
    .order('updated_at', { ascending: false })
    .limit(300);
  return (data ?? []) as MemoryRow[];
}

/**
 * The ONLY sanctioned hard-delete of memory rows (decision #6, spec §1 door
 * #4): purge facts that are ALREADY in trash (status='trashed') and whose
 * 30-day recovery window has expired. Live ('open') memories are never
 * touched by this function — the status filter is the guarantee.
 */
export async function purgeExpiredTrashedFacts(
  supa: Supa,
  spaceId: string,
  retentionDays = 30,
  now: Date = new Date(),
): Promise<number> {
  const trashed = await listTrashedFacts(supa, spaceId);
  const cutoff = now.getTime() - retentionDays * 86400000;
  let n = 0;
  for (const f of trashed) {
    const at = new Date(String(f.meta?.trashed_at ?? '')).getTime();
    if (Number.isFinite(at) && at < cutoff) {
      const { error } = await supa.from('items').delete().eq('id', f.id);
      if (!error) n++;
    }
  }
  return n;
}

// ── Confirmed forget (owner correction to spec §5, 2026-10-12) ─────────────
// AI-initiated forgetting is PREVIEW-ONLY. The model can select a memory and
// create a pending preview, but the move to trash executes ONLY when the
// USER sends the server-issued confirmation code as their own chat message.
// The code is validated server-side against a pending_actions row
// (action_type='forget_memory', migration 0036) bound to (user, fact set,
// 30-minute expiry, single use). A model-supplied fact_id, a model-claimed
// "the user confirmed", or a forged code can never trash anything.

export interface PendingForgetRow {
  id: string;
  user_id: string;
  status: string;
  expires_at: string;
  payload: {
    fact_ids?: string[];
    fact_texts?: string[];
    memory_space_id?: string;
    confirm_code?: string;
  };
}

/** Generate a 6-digit confirmation code (server-side only). */
export function newForgetCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, '0');
}

/**
 * Extract a confirmation code from a raw user message. PURE.
 * Accepts ONLY: the bare 6 digits, or "نفّذ/نفذ <code>", or "confirm <code>"
 * as the ENTIRE message (Arabic-Indic digits normalized). Anything else —
 * including a code embedded in a longer sentence — returns null, so a code
 * quoted inside notes or model text can never act as a confirmation.
 */
export function parseForgetConfirmation(text: string): string | null {
  const latin = (text ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const m = normAr(latin).match(/^(?:نفذ|confirm)\s+(\d{6})$|^(\d{6})$/);
  return m ? (m[1] ?? m[2]) : null;
}

/**
 * Validate a confirmation attempt against its pending row. PURE.
 * Fails closed on every mismatch: no row, wrong user, wrong/forged code,
 * non-pending status (already executed/cancelled/superseded), expiry.
 */
export function validateForgetConfirmation(
  row: PendingForgetRow | null,
  userId: string,
  code: string,
  now: Date,
): { ok: true } | { ok: false; reason: string } {
  if (!row) return { ok: false, reason: 'no_pending' };
  if (row.user_id !== userId) return { ok: false, reason: 'wrong_user' };
  if (row.status !== 'pending') return { ok: false, reason: 'not_pending' };
  if (new Date(row.expires_at).getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  if (!row.payload?.confirm_code || row.payload.confirm_code !== code) {
    return { ok: false, reason: 'bad_code' };
  }
  return { ok: true };
}

/**
 * Create a pending forget preview (supersedes the user's older pending
 * forget previews, so at most one code is live per user). Returns the
 * action id + code for the model to show the user. Trashes NOTHING.
 */
export async function createForgetPreview(
  supa: Supa,
  userId: string,
  spaceId: string,
  selected: MemoryRow[],
): Promise<{ action_id: string; confirm_code: string } | null> {
  if (selected.length === 0) return null;
  await supa
    .from('pending_actions')
    .update({ status: 'superseded' })
    .eq('user_id', userId)
    .eq('action_type', 'forget_memory')
    .eq('status', 'pending');
  const confirm_code = newForgetCode();
  const id = crypto.randomUUID();
  const { error } = await supa.from('pending_actions').insert({
    id,
    user_id: userId,
    action_type: 'forget_memory',
    payload: {
      fact_ids: selected.map((f) => f.id),
      fact_texts: selected.map((f) => factLine(f)),
      // Deliberately NOT named `space_id`: governed executors read
      // payload.space_id — a forget preview must never be interpretable
      // as a space action payload.
      memory_space_id: spaceId,
      confirm_code,
    },
    approvals: 0,
    required_approvals: 1,
    status: 'pending',
  });
  if (error) return null;
  return { action_id: id, confirm_code };
}

/**
 * Execute a VALIDATED forget preview: move exactly the previewed facts to
 * trash (re-checked live: still open, same space, never route facts) and
 * consume the pending row. Defense in depth: refuses non-pending or
 * expired rows even if called directly. Called ONLY from the deterministic
 * confirmation path after validateForgetConfirmation passes — never from
 * a model tool.
 */
export async function executeConfirmedForget(
  supa: Supa,
  row: PendingForgetRow,
): Promise<{ trashed: string[] }> {
  if (row.status !== 'pending') return { trashed: [] };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { trashed: [] };
  const spaceId = String(row.payload?.memory_space_id ?? '');
  const ids = new Set((row.payload?.fact_ids ?? []).map(String));
  if (!spaceId || ids.size === 0) return { trashed: [] };
  const facts = await loadFacts(supa, spaceId);
  const trashed: string[] = [];
  for (const f of facts) {
    if (!ids.has(f.id)) continue;
    if (f.meta?.mcat === 'route') continue;
    if (await trashFact(supa, f, 'user_forget_confirmed')) trashed.push(factLine(f));
  }
  await supa.from('pending_actions').update({ status: 'executed' }).eq('id', row.id);
  return { trashed };
}

/** Find the user's private space id (memory lives there, owner-only). */
export async function privateSpaceId(supa: Supa): Promise<string | null> {
  const { data } = await supa.from('spaces').select('id').eq('type', 'private').limit(1).maybeSingle();
  return (data as any)?.id ?? null;
}

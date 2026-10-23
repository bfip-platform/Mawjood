// Phase 3 — family pillar helpers.
// "سارة: اشتري خبز" → { name: 'سارة', task: 'اشتري خبز' }
// (Deliberately import-free: this module is loaded standalone by the
// unit-test runner and the edge functions' import graph.)

const ASSIGN_RE = /^([\p{L}][\p{L} .]{1,20}?)\s*[:：]\s*(.+)$/u;
const NON_NAME_START = /^(الساعة|ساعة|الوقت|وقت|اليوم|بكرا|غدا)\b/;

/**
 * Detect the "name: task" assignment pattern in a family-space note.
 * Returns null when the text isn't an assignment.
 */
export function parseAssignment(text: string): { name: string; task: string } | null {
  const m = text.trim().match(ASSIGN_RE);
  if (!m) return null;
  const name = m[1].trim();
  const task = m[2].trim();
  if (!task || NON_NAME_START.test(name)) return null;
  return { name, task };
}

// ── directed shopping: "يا جون جيب تفاح خيار بندورة" ──
// One shopping list is created for the named person, who gets the
// notification; everyone in the family space can see the list.

const SHOP_VERBS = 'جيب|جيبي|هات|هاتي|اشتري|اشتر|خذ|خد|خود|جبلنا|جبلي|جبيلي|جيبلي';
// note: \b doesn't work after Arabic letters (\w is latin-only), so the
// verb is followed by an explicit whitespace/end lookahead instead.
const DIRECTED_SHOP_RE = new RegExp(
  `^\\s*يا\\s+([\\p{L}][\\p{L} ]{1,38}?)\\s+(?:${SHOP_VERBS})(?=\\s|$)\\s*(.+)$`,
  'u',
);

/**
 * Detect "يا {name} {buy-verb} {items}". Returns null when the text
 * isn't a directed shopping request.
 */
export function parseDirectedShopping(text: string): { name: string; itemsRaw: string } | null {
  const m = text.trim().match(DIRECTED_SHOP_RE);
  if (!m) return null;
  const name = m[1].trim();
  const itemsRaw = m[2].trim();
  if (!itemsRaw) return null;
  return { name, itemsRaw };
}

/**
 * Shopping item titles: the ONE parsing rule for typed/pasted shopping
 * input, shared by the new-list modal and the chat directed-shopping
 * intercept (audit SHOPPING_AUDIT_FIXES.md, P1).
 *
 * Separators are ONLY newlines and commas (، , ؛ ;) — the same rule the
 * new-list field's placeholder has always promised ("افصل بفاصلة أو
 * سطر جديد"). A chunk is ONE item, however many words it has:
 * "صابون إيدين" and "حليب خالي الدسم" stay single items. Spaces never
 * split, and و never splits either — "تفاح وخيار" typed without a
 * comma is one item named "تفاح وخيار", exactly as written; the old
 * split-on-every-space behavior (which also stripped a leading و off
 * words, corrupting e.g. "ورق عنب") is gone.
 */
export const MAX_SHOPPING_ITEMS = 100;
export const MAX_SHOPPING_ITEM_CHARS = 120;

/** De-dupe + cap an already-split title list (first occurrence wins). */
export function cleanShoppingItemTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of titles) {
    // code-point slice, mirroring nameLimits.clampNameLength (kept local
    // so this module stays import-free — see the header note)
    const clean = raw.replace(/\s+/g, ' ').trim();
    const title = Array.from(clean).slice(0, MAX_SHOPPING_ITEM_CHARS).join('');
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(title);
    if (out.length >= MAX_SHOPPING_ITEMS) break;
  }
  return out;
}

/** Split raw shopping input into item titles per the rule above. */
export function splitShoppingItems(raw: string): string[] {
  const chunks = raw
    .split(/[\n\r،,؛;]+/)
    .map((c) => c.replace(/^\s*[-•*·]\s+/, '')); // pasted-list bullet markers
  return cleanShoppingItemTitles(chunks);
}

/**
 * PostgREST or-filter for keyset (cursor) pagination over shopping
 * lists in (created_at desc, id desc) order: rows strictly after the
 * cursor row. Stable under creates/deletes between page loads, unlike
 * offset paging (audit P9).
 */
export function shoppingListCursorFilter(before: { createdAt: string; id: string }): string {
  return `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`;
}

/**
 * True when an RPC call failed only because the function does not exist
 * yet (migration not applied on this environment). Gates the engine's
 * legacy fallbacks: permission and validation errors must NEVER fall
 * back — they are real answers from the database.
 */
export function isMissingFunctionError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  if (!e) return false;
  if (e.code === 'PGRST202' || e.code === '42883') return true;
  const text = [e.message, e.details, e.hint].filter((v) => typeof v === 'string').join(' ');
  return /could not find the function|function .* does not exist/i.test(text);
}

/** Arabic-name normalization for member matching (أ/إ/آ→ا, ة→ه, ى→ي). */
export function normalizeName(s: string): string {
  return s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
}

export interface FamilyMemberLike {
  user_id: string;
  display_name: string | null;
  is_manager: boolean;
  role: string;
}

/**
 * Resolve "جون" / "زوجي" to a family member.
 * - زوجي/جوزي → the family manager (owner)
 * - otherwise → exact match on the first word of a member's display name
 * Returns null when nobody matches — the caller then falls back to the
 * normal flow instead of notifying the wrong person.
 */
export function resolveFamilyMember(
  rawName: string,
  members: FamilyMemberLike[],
): { user_id: string; display_name: string | null } | null {
  const n = normalizeName(rawName);
  if (/^(زوجي|جوزي)$/.test(n)) {
    const o = members.find((m) => m.is_manager || m.role === 'owner');
    return o ? { user_id: o.user_id, display_name: o.display_name } : null;
  }
  for (const m of members) {
    const dn = normalizeName(m.display_name ?? '');
    if (!dn) continue;
    const first = dn.split(/\s+/)[0];
    if (first === n || dn === n) {
      return { user_id: m.user_id, display_name: m.display_name };
    }
  }
  return null;
}

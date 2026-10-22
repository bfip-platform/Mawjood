/**
 * Space strip ordering (Spaces & Family UX wave) — pure helpers.
 *
 * The home strip shows the built-in space types (private/family/work) and
 * the user's custom spaces as one row of entries. Users can reorder the
 * SPACE entries (the chat Home tab stays pinned first — it is not a space).
 * The order is a per-user display preference: an array of entry keys
 * ("type:private", "space:<uuid>") persisted device-locally (see
 * spacePrefs.ts). It never touches the spaces themselves or their data —
 * deleting/reordering entries here cannot lose a space: unknown keys are
 * dropped, and entries missing from the saved order keep their natural
 * order at the end.
 */

export type SpaceStripEntry =
  | { kind: 'builtin'; type: 'private' | 'family' | 'work' }
  | { kind: 'custom'; id: string };

export function entryKey(e: SpaceStripEntry): string {
  return e.kind === 'builtin' ? `type:${e.type}` : `space:${e.id}`;
}

/** The entries' keys in their natural (default) order. */
export function defaultOrderKeys(entries: SpaceStripEntry[]): string[] {
  return entries.map(entryKey);
}

/**
 * Apply a saved order to the current entries: entries whose keys appear in
 * `orderKeys` come first, in the saved sequence; every remaining entry
 * follows in its natural order. Stale keys (deleted spaces) and duplicate
 * keys are ignored, so the result is always a permutation of `entries`.
 */
export function applySpaceOrder<T extends SpaceStripEntry>(entries: T[], orderKeys: string[] | null): T[] {
  if (!orderKeys || orderKeys.length === 0) return [...entries];
  const byKey = new Map(entries.map((e) => [entryKey(e), e] as const));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const k of orderKeys) {
    const e = byKey.get(k);
    if (e && !seen.has(k)) {
      out.push(e);
      seen.add(k);
    }
  }
  for (const e of entries) {
    const k = entryKey(e);
    if (!seen.has(k)) {
      out.push(e);
      seen.add(k);
    }
  }
  return out;
}

/**
 * Move one key one step toward the start (dir -1) or the end (dir +1).
 * Returns a NEW array; at the edges (or for an unknown key) the move is a
 * no-op returning an array with identical content.
 */
export function moveInOrder(orderKeys: string[], key: string, dir: -1 | 1): string[] {
  const i = orderKeys.indexOf(key);
  if (i < 0) return [...orderKeys];
  const j = i + dir;
  if (j < 0 || j >= orderKeys.length) return [...orderKeys];
  const next = [...orderKeys];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Move an item directly to the drop target index, preserving every other key. */
export function moveToIndex(orderKeys: string[], key: string, targetIndex: number): string[] {
  const from = orderKeys.indexOf(key);
  if (from < 0 || orderKeys.length < 2) return [...orderKeys];
  const to = Math.max(0, Math.min(orderKeys.length - 1, targetIndex));
  if (from === to) return [...orderKeys];
  const next = [...orderKeys];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

/**
 * Resolve the insertion slot from the dragged pointer and current peer centers.
 * Counting peers on the pointer's leading side is stable after the placeholder
 * moves; selecting the nearest center can bounce between adjacent slots.
 */
export function resolveDropIndex(
  orderKeys: string[],
  key: string,
  pointerX: number,
  layouts: Record<string, { left: number; width: number }>,
  isRTL = false,
): number {
  if (!orderKeys.includes(key) || !Number.isFinite(pointerX)) return -1;
  const peers = orderKeys.filter((candidate) => candidate !== key);
  if (peers.length === 0) return -1;
  let index = 0;
  for (const candidate of peers) {
    const box = layouts[candidate];
    if (!box || !Number.isFinite(box.left) || !Number.isFinite(box.width) || box.width <= 0) return -1;
    const center = box.left + box.width / 2;
    if (isRTL ? center > pointerX : center < pointerX) index += 1;
  }
  return Math.min(orderKeys.length - 1, index);
}

/** Sanitize an unparsed persisted value into a clean key list. */
export function sanitizeOrderKeys(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter(
    (k): k is string => typeof k === 'string' && (k.startsWith('type:') || k.startsWith('space:')),
  );
  return out.length > 0 ? [...new Set(out)] : null;
}

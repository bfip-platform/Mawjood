/**
 * Relevance ranking for client search (D6 T-D6-2).
 *
 * The database side already does the heavy lifting: the trigram GIN
 * indexes (migration 0043) make the ILIKE candidate fetch fast
 * (measured in the D3 baseline). What ILIKE cannot do is ORDER by
 * relevance — results came back newest-first, so a perfect match from
 * last month sat under yesterday's partial hit. This module re-ranks
 * the fetched candidate pool in memory with a pg_trgm-style trigram
 * similarity (Jaccard over character-trigram sets), the same metric
 * the Postgres extension uses, computed locally over at most a few
 * dozen short strings — microseconds, no extra round-trips.
 *
 * Ordering contract (stable + predictable):
 *  1. Exact substring matches (normalized) always outrank fuzzy-only.
 *  2. Within a class, higher trigram similarity first.
 *  3. Ties keep the incoming order (recency — the DB's created_at
 *     order), so ranking never makes results jump randomly.
 */

/** Light normalization for comparison: case, Arabic diacritics/tatweel,
 *  hamza/ة/ى unification — mirroring the engine's normAr essentials. */
export function rankNormalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trigrams(s: string): Set<string> {
  const padded = `  ${rankNormalize(s)} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** pg_trgm-flavored similarity in [0, 1] (Jaccard over trigram sets). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function rankByRelevance<T>(
  rows: T[],
  query: string,
  getText: (row: T) => string,
): T[] {
  const q = rankNormalize(query);
  if (!q) return [...rows];
  const scored = rows.map((row, idx) => {
    const text = rankNormalize(getText(row));
    const exact = text.includes(q) ? 1 : 0;
    return { row, idx, exact, sim: trigramSimilarity(q, text) };
  });
  scored.sort((a, b) => b.exact - a.exact || b.sim - a.sim || a.idx - b.idx);
  return scored.map((s) => s.row);
}

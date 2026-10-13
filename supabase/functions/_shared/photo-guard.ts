// ── photo URL guard (Stage 1 security fix, D0 HIGH) ────────────────────────
// Defense layer 2 of 2 (layer 1 is migration 0038 hardening can_read_photo):
// a client-supplied photo_url may only reference the caller's OWN storage
// folder. Before this, chat accepted any https URL and stored it on the
// note — letting a user plant a reference to another user's private photo,
// which the storage policy then honored. External (non-storage) https
// image URLs stay allowed: pasting an image link for the vision flow is a
// legitimate use and carries no storage privilege.

/**
 * Return the URL if it is safe to store/use for this user, else null.
 * - non-string / non-https → null
 * - URLs pointing into the item-photos bucket: the first path segment
 *   (the uploader's folder) must be exactly the caller's user id
 * - any other https URL → allowed unchanged
 */
export function sanitizePhotoUrl(raw: unknown, userId: string): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('https://')) return null;
  const url = raw.slice(0, 500);
  const marker = '/item-photos/';
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const path = url.slice(i + marker.length);
  let folder = '';
  try {
    folder = decodeURIComponent((path.split('/')[0] ?? '').split('?')[0]);
  } catch {
    return null;
  }
  return folder === userId ? url : null;
}

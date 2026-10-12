/**
 * Deep-link parser (D5 T-D5-2) — FAIL-CLOSED allowlist.
 *
 * Security rule from the roadmap: deep links must never leak or carry
 * object paths, tokens, or arbitrary state. This parser therefore
 * recognizes ONLY the intents below and returns null for everything
 * else — unknown schemes, unknown paths, malformed parameters. Callers
 * treat null as "ignore the link entirely".
 *
 * Allowed intents:
 *  - mawjood://family/join?code=XXXXXX   (invite code: 6–10 alphanumerics,
 *    matching the invite-code shapes the app issues)
 *  - https://<site>/join?code=XXXXXX     (same, universal-link form;
 *    ONE leading path segment — a deployment subpath like /Mawjood/ —
 *    is tolerated for https only, since the web trial is served from a
 *    subpath; the tail must still match exactly)
 *
 * NOT links: photo/storage URLs, auth tokens, reset links — those flows
 * live inside the app already and must never be drivable from outside.
 */

export type DeepLinkIntent = { kind: 'join-family'; code: string };

const INVITE_CODE = /^[A-Za-z0-9]{6,10}$/;

export function parseDeepLink(raw: unknown): DeepLinkIntent | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const isAppScheme = url.protocol === 'mawjood:';
  const isWeb = url.protocol === 'https:';
  if (!isAppScheme && !isWeb) return null;

  // Normalize the path: the app scheme puts the first segment in `host`
  // (mawjood://family/join), while https URLs keep it in the pathname.
  const parts = url.pathname.split('/').filter((s) => s.length > 0);
  const segments = isAppScheme && url.host ? [url.host, ...parts] : parts;
  let path = segments.join('/');
  // https only: tolerate ONE deployment-subpath segment (review N1 —
  // the Pages trial serves the app under /Mawjood/).
  if (isWeb && segments.length > 2) path = segments.slice(1).join('/');

  if (path === 'family/join' || path === 'join') {
    const code = url.searchParams.get('code') ?? '';
    if (!INVITE_CODE.test(code)) return null;
    return { kind: 'join-family', code: code.toUpperCase() };
  }
  return null;
}

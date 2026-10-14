/**
 * Pure Supabase configuration validation (G1 / P0-1).
 *
 * Why this exists: @supabase/supabase-js `createClient()` THROWS
 * ("supabaseUrl is required." / "Invalid supabaseUrl") when handed an
 * empty or malformed URL. supabase.ts used to call it at module scope
 * with `url ?? ''`, so a missing/blank EXPO_PUBLIC_SUPABASE_URL secret
 * killed the app during bundle evaluation — white screen, SIGABRT via
 * reportFatal, no error screen, no telemetry. This module has NO
 * react-native imports and NO side effects so it can be unit-tested
 * directly and used to fail soft: supabase.ts resolves the config
 * first and only ever passes a structurally valid URL to createClient.
 */
export type SupabaseConfigResult =
  | { ok: true; url: string; anonKey: string }
  | { ok: false; reason: string };

export function resolveSupabaseConfig(env: {
  url?: string | null;
  anonKey?: string | null;
}): SupabaseConfigResult {
  const url = (env.url ?? '').trim();
  if (!url) {
    return { ok: false, reason: 'Supabase URL is missing or empty (EXPO_PUBLIC_SUPABASE_URL).' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: `Supabase URL is not a valid URL: "${url}".` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      reason: `Supabase URL must use http or https, got "${parsed.protocol}".`,
    };
  }
  if (!parsed.host) {
    return { ok: false, reason: `Supabase URL has no host: "${url}".` };
  }
  const anonKey = (env.anonKey ?? '').trim();
  if (!anonKey) {
    return {
      ok: false,
      reason: 'Supabase anon key is missing or empty (EXPO_PUBLIC_SUPABASE_ANON_KEY).',
    };
  }
  return { ok: true, url, anonKey };
}

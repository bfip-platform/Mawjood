import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { resolveSupabaseConfig } from './supabase-config';

/**
 * Fail-soft init (G1 / P0-1): createClient() THROWS on an empty/invalid
 * URL, and this module evaluates at startup — a bad EXPO_PUBLIC_* secret
 * used to be a module-scope fatal (white screen + SIGABRT, no error
 * screen). Now the config is validated first; on failure the client is
 * created against a syntactically valid placeholder so module scope
 * never throws, and the root layout renders the configuration-error
 * screen from `supabaseConfigError` instead of the app. No secret values
 * are ever included in the reason string (structure only).
 */
/**
 * Value sources, in order:
 *  1. process.env.EXPO_PUBLIC_* — Metro-inlined at bundle time. Present
 *     for web exports and local bundles; ABSENT in EAS remote builds,
 *     whose bundler runs on Expo's servers without the CI runner's env
 *     (build 23 shipped with no Supabase host in the bundle).
 *  2. Constants.expoConfig.extra — set by app.config.ts, which the EAS
 *     CLI evaluates locally on the machine starting the build (where
 *     the CI step env DOES exist) and embeds in the app.
 * The same codebase pattern already reads extra.eas.projectId in
 * src/lib/push.ts.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const resolved = resolveSupabaseConfig({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey,
});

export const supabaseConfigError: string | null = resolved.ok ? null : resolved.reason;

if (!resolved.ok) {
  console.warn(`Supabase configuration error — ${resolved.reason}`);
}

export const supabase = createClient(
  resolved.ok ? resolved.url : 'https://invalid.mawjood.local',
  resolved.ok ? resolved.anonKey : 'invalid-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // web: pick up the session from the magic-link redirect URL fragment
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);

/** Anonymous sign-in for the trial (kept for returning anon users). */
export async function ensureSignedIn() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return anon.user!;
}

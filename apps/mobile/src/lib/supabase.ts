import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
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
const resolved = resolveSupabaseConfig({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
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

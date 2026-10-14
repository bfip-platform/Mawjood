import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic config — carries the Supabase client config into EAS builds.
 *
 * Why this exists (build 23 bundle-gate failure): `eas build` without
 * `--local` bundles the JS on Expo's REMOTE build servers. The CI
 * runner's environment — where build-ios.yml exports
 * EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from repo
 * secrets — does NOT travel with the project upload, and eas.json
 * declares no `env`, so on the remote builder those variables were
 * undefined at Metro time and the bundle shipped with NO Supabase host
 * inlined (neither scratch nor production).
 *
 * This config is evaluated LOCALLY by the EAS/expo CLI on the machine
 * that STARTS the build (the CI runner, where the secrets are in the
 * step environment). The resolved config — including `extra` — is
 * embedded in the built app, and src/lib/supabase.ts reads the values
 * back at runtime via Constants.expoConfig.extra when the
 * Metro-inlined process.env values are absent. No values are committed
 * to the repo: with no env present the extras are empty strings and the
 * G1 fail-soft configuration screen remains the guard. The static
 * app.json values arrive as `config` and are spread through unchanged.
 */
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    extra: {
      ...(config.extra ?? {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  }) as ExpoConfig;

/**
 * Startup crash telemetry (G6 / P1-4).
 *
 * Before this module, a JS fatal during startup died silently: the
 * ErrorUtils handler lived in a Home-screen effect, which installs far
 * too late for module-scope or first-render failures (build 22 was
 * diagnosed blind for exactly this reason). This guard is imported
 * FIRST by the root layout — before any route module — and forwards
 * uncaught JS errors to the existing `report-error` edge function /
 * ops_events channel (context: 'startup-global-handler').
 *
 * Hard rules for this file:
 * - NO static imports at all. In particular it must never statically
 *   import './supabase' or AsyncStorage: it exists to report failures
 *   in exactly those module-scope paths, so it cannot depend on them
 *   having loaded. The client is lazy-loaded inside a try/catch.
 * - Reporting is best-effort and must NEVER throw.
 * - The previous global handler is always chained to, so the
 *   platform's default fatal behavior (redbox in dev, reportFatal in
 *   release) is preserved.
 */

let installed = false;

/** Best-effort report of an uncaught error. Never throws. */
export async function reportFatalLike(error: unknown, isFatal?: boolean): Promise<void> {
  try {
    const { supabase } = await import('./supabase');
    await supabase.functions
      .invoke('report-error', {
        body: {
          message: String((error as { message?: unknown } | null)?.message ?? error),
          stack: String((error as { stack?: unknown } | null)?.stack ?? ''),
          context: 'startup-global-handler',
        },
      })
      .catch(() => {});
  } catch {
    // Swallow everything: telemetry must never become a crash source.
  }
}

function installCrashGuard(): void {
  if (installed) return;
  installed = true;
  try {
    // RN publishes ErrorUtils on the global object at runtime; reading
    // it from globalThis avoids a module-scope react-native import.
    const ErrorUtils = (globalThis as { ErrorUtils?: unknown }).ErrorUtils as
      | {
          setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
          getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | null;
        }
      | undefined;
    if (!ErrorUtils || typeof ErrorUtils.setGlobalHandler !== 'function') return;
    const previous =
      typeof ErrorUtils.getGlobalHandler === 'function' ? ErrorUtils.getGlobalHandler() : null;
    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      void reportFatalLike(error, isFatal);
      if (typeof previous === 'function') {
        previous(error, isFatal);
      }
    });
  } catch {
    // Never throw at startup.
  }
}

installCrashGuard();

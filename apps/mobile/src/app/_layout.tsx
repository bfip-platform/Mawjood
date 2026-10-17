import '../lib/crash-guard';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Platform, StatusBar, Text, View, useWindowDimensions } from 'react-native';
import { useTheme, initTheme } from '../lib/theme';
import { supabaseConfigError } from '../lib/supabase';
import ErrorBoundary from '../components/ErrorBoundary';

// Keep the native splash under our control. If a route/module stalls during
// startup, the user must still reach a visible loading or configuration/error
// screen instead of being trapped on the static splash image forever.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Web only: browsers draw their own focus ring on text inputs/textareas and
 * react-native-web doesn't forward outline styles, so a tiny CSS rule removes
 * it (the composer has its own visible border already).
 */
function useNoInputFocusRing() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.createElement('style');
    el.setAttribute('data-mawjood', 'no-input-ring');
    el.textContent =
      'textarea:focus,input:focus{outline:none !important;box-shadow:none !important;}';
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
}

/**
 * Web only (D5 T-D5-2): the SPA export shell is generated from app.json —
 * description + theme-color land statically from there. The Open Graph
 * tags and the PWA manifest link have no app.json channel in single-page
 * output mode, so they are injected here on mount (JS-rendering crawlers
 * and the browser's installability check both read the live DOM). The
 * manifest href is RELATIVE so the same export works at a domain root
 * and under the GitHub Pages /Mawjood/ subpath. Static-only values —
 * nothing user-specific is ever written into the document head.
 */
function useWebMeta() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const added: Element[] = [];
    const meta = (attr: 'property' | 'name', key: string, content: string) => {
      const el = document.createElement('meta');
      el.setAttribute(attr, key);
      el.setAttribute('content', content);
      el.setAttribute('data-mawjood', 'web-meta');
      document.head.appendChild(el);
      added.push(el);
    };
    meta('property', 'og:type', 'website');
    meta('property', 'og:title', 'Mawjood — موجود');
    meta(
      'property',
      'og:description',
      'A voice-memory assistant for your things, tasks and family — Arabic and English from day one.',
    );
    meta('name', 'apple-mobile-web-app-capable', 'yes');
    const link = document.createElement('link');
    link.setAttribute('rel', 'manifest');
    link.setAttribute('href', 'manifest.webmanifest');
    link.setAttribute('data-mawjood', 'web-meta');
    document.head.appendChild(link);
    added.push(link);
    return () => {
      added.forEach((el) => el.remove());
    };
  }, []);
}

// Inner component: all the hooks and UI that might throw.
// Wrapped by ErrorBoundary OUTSIDE so any startup JS error
// shows on screen instead of crashing the app.
function InnerLayout() {
  const { resolved, palette: P } = useTheme();
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 4000);
    return () => clearTimeout(safetyTimer);
  }, []);
  useNoInputFocusRing();
  useWebMeta();
  const { width } = useWindowDimensions();
  // D5 T-D5-1 (responsive foundation): on wide WEB viewports the app
  // renders as a centered, readable column (max 880px) over the paper
  // background instead of stretching edge-to-edge. Native layouts and
  // narrow web are untouched; the chat-first architecture (Decision
  // #12) is preserved — this is a frame, not a redesign.
  const wideWeb = Platform.OS === 'web' && width >= 1024;
  // Init theme AFTER mount — calling AsyncStorage at import time crashes
  // on iOS 26 (TurboModule NSException during bridge init).
  useEffect(() => {
    initTheme();
  }, []);
  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: P.paper, alignItems: wideWeb ? 'center' : 'stretch' }}
    >
      <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} />
      <View style={wideWeb ? { flex: 1, width: '100%', maxWidth: 880 } : { flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: P.paper },
          }}
        />
      </View>
    </GestureHandlerRootView>
  );
}

/**
 * G1 / P0-1: shown INSTEAD of the app when the Supabase configuration
 * is invalid (missing/blank/malformed EXPO_PUBLIC_* env). supabase.ts
 * fails soft onto a placeholder client so we reach this screen instead
 * of dying at module scope. The reason string is structural only —
 * it never contains secret values.
 */
function ConfigErrorScreen({ reason }: { reason: string }) {
  const { palette: P } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: P.paper, padding: 24, justifyContent: 'center' }}>
      <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>⚙️</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: P.ink, textAlign: 'center', marginBottom: 8 }}>
        خطأ في إعدادات التطبيق
      </Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: P.ink, textAlign: 'center', marginBottom: 12 }}>
        App configuration error
      </Text>
      <Text style={{ fontSize: 14, color: P.muted, textAlign: 'center', marginBottom: 6 }}>
        التطبيق غير مُعدّ بشكل صحيح — صوّر الشاشة وابعثها للدعم.
      </Text>
      <Text style={{ fontSize: 14, color: P.muted, textAlign: 'center', marginBottom: 16 }}>
        This build is misconfigured. Screenshot this screen and send it to support.
      </Text>
      <View style={{ backgroundColor: P.input, borderRadius: 12, padding: 12 }}>
        <Text selectable style={{ fontSize: 12, color: P.ink, fontFamily: 'monospace' }}>
          {reason}
        </Text>
      </View>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Hide as soon as the root commits; the 4s timer above is a final guard
    // for a child route that takes longer than expected to mount.
    void SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <ErrorBoundary>
      {supabaseConfigError ? <ConfigErrorScreen reason={supabaseConfigError} /> : <InnerLayout />}
    </ErrorBoundary>
  );
}

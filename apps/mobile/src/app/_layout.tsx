import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Platform, StatusBar, Text, View, useWindowDimensions } from 'react-native';
import { useTheme, initTheme } from '../lib/theme';
import ErrorBoundary from '../components/ErrorBoundary';

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

// Inner component: all the hooks and UI that might throw.
// Wrapped by ErrorBoundary OUTSIDE so any startup JS error
// shows on screen instead of crashing the app.
function InnerLayout() {
  const { resolved, palette: P } = useTheme();
  useNoInputFocusRing();
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

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <InnerLayout />
    </ErrorBoundary>
  );
}

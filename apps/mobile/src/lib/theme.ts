// theme.ts — light / dark / auto (time-based) theming.
// Module-level store (same pattern as i18n.ts): any component can useTheme()
// and they all stay in sync. Persisted in AsyncStorage.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TextStyle } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

// ── Design tokens (engine-style, zero-dependency) ─────────────────────
// ONE type scale + spacing + radius for the whole app so every screen
// reads the same. Sizes picked for Arabic-first readability: body 16px
// minimum for anything the user must read, 44–48px touch targets.

export interface TypeToken {
  size: number;
  height: number; // lineHeight
  weight: TextStyle['fontWeight'];
}

export const TYPO: Record<
  'display' | 'title' | 'headline' | 'body' | 'bodyBold' | 'sub' | 'subBold' | 'caption' | 'tiny',
  TypeToken
> = {
  display: { size: 30, height: 38, weight: '800' }, // hero numbers, big headers
  title: { size: 22, height: 29, weight: '800' }, // screen titles, empty states
  headline: { size: 18, height: 25, weight: '700' }, // section headers, card titles
  body: { size: 16, height: 24, weight: '400' }, // chat bubbles, main reading text
  bodyBold: { size: 16, height: 24, weight: '600' },
  sub: { size: 14, height: 20, weight: '400' }, // secondary descriptions
  subBold: { size: 14, height: 20, weight: '600' },
  caption: { size: 12, height: 16, weight: '500' }, // timestamps, hints
  tiny: { size: 11, height: 14, weight: '500' }, // badges, micro-labels
};

/** Spacing scale (px). */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36 } as const;

/** Corner radius scale (px). */
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** Minimum comfortable touch target (px). */
export const TOUCH = 48;

/**
 * Brand layer (Decision #11 — brand v1.2 baseline; D5 T-D5-5
 * foundations). Monochrome-first: the palettes above carry the product;
 * these two accents exist as NAMED tokens so future screens use them
 * sparingly and consistently instead of inventing hexes. Fonts: Inter +
 * IBM Plex Sans Arabic. NOTE: OD-39 (final logo / final color lock-in /
 * polished screens) is still OPEN — these are baseline tokens, not a
 * final brand commitment, and no screen restyle rides on them yet.
 */
export const BRAND = {
  accentBlue: '#3574B8', // deep calm blue — primary accent, sparing
  accentSage: '#5E7E63', // muted sage — secondary accent, sparing
  fontLatin: 'Inter',
  fontArabic: 'IBM Plex Sans Arabic',
} as const;

// Palette refresh (owner decision, Oct 26, 2026): the general palette
// below was re-tuned in place — same token names, no screen changes —
// taking colour/feel direction from live reference products studied for
// this purpose (achromatic, low-noise admin surfaces in the Zenith /
// Linear direction; the calm restraint of Bear for reading surfaces).
// Inspiration only: every value here is our own, implemented in our own
// tokens. Per-screen application follows as its own step.

/** Flatten a type token into a RN text style. */
export function typeStyle(t: TypeToken): { fontSize: number; lineHeight: number; fontWeight: TextStyle['fontWeight'] } {
  return { fontSize: t.size, lineHeight: t.height, fontWeight: t.weight };
}

export interface Palette {
  ink: string; // primary text / dark fills
  ink2: string; // strong text
  text2: string; // secondary text
  text3: string; // tertiary text
  muted: string; // muted text
  faint: string; // placeholder / faint
  faint2: string;
  faint3: string;
  paper: string; // app background / light text on dark fills
  surface: string; // cards
  surface2: string; // pills, secondary surfaces
  input: string; // text inputs
  bubbleApp: string; // agent reply bubbles — soft eye-friendly gray
  tint: string; // subtle cool-tinted surfaces
  accent: string; // monochrome primary action
  accentDeep: string; // small accent text
  info: string; // blue
  infoSoft: string; // blue tint bg
  success: string; // green
  successSoft: string; // green tint bg
  danger: string; // red
  dangerSoft: string; // red tint bg
  dangerDeep: string; // deep red text
  warn: string; // amber text
  border: string; // default borders / dividers
  borderWarn: string; // amber borders
  borderSuccess: string; // green borders
  overlay: string; // modal dim
  gray: string; // neutral gray
}

const light: Palette = {
  ink: '#0E1116',
  ink2: '#1F242C',
  text2: '#4F5865',
  text3: '#626B77',
  muted: '#66707B',
  faint: '#75808B',
  faint2: '#828C97',
  faint3: '#8E97A1',
  paper: '#F9FAFA',
  surface: '#FFFFFF',
  surface2: '#EFF2F4',
  input: '#F2F4F6',
  bubbleApp: '#EDF1F4',
  tint: '#EAF1F7',
  accent: '#0E1116',
  accentDeep: '#1F242C',
  info: '#2F6596',
  infoSoft: '#E9F1F8',
  success: '#3E6B52',
  successSoft: '#E9F2EC',
  danger: '#B23A3A',
  dangerSoft: '#FAEBEB',
  dangerDeep: '#993030',
  warn: '#7A5C1E',
  border: '#E2E6EA',
  borderWarn: '#E7D8B4',
  borderSuccess: '#C6DFCF',
  overlay: 'rgba(14,17,22,0.45)',
  gray: '#66707B',
};

const dark: Palette = {
  ink: '#F5F7F9',
  ink2: '#E4E8EC',
  text2: '#BEC6CF',
  text3: '#AAB4BF',
  muted: '#A2ADB9',
  faint: '#939FAA',
  faint2: '#8A95A1',
  faint3: '#808B97',
  paper: '#0A0C0F',
  surface: '#14171C',
  surface2: '#1F232A',
  input: '#1F232A',
  bubbleApp: '#20262E',
  tint: '#1C2836',
  accent: '#F5F7F9',
  accentDeep: '#D9DFE7',
  info: '#8FB9E3',
  infoSoft: '#182A3E',
  success: '#93C2A2',
  successSoft: '#1A3026',
  danger: '#EE9A9A',
  dangerSoft: '#372024',
  dangerDeep: '#F0AAAA',
  warn: '#DFC384',
  border: '#272D35',
  borderWarn: '#4F422A',
  borderSuccess: '#33503F',
  overlay: 'rgba(0,0,0,0.66)',
  gray: '#9AA4AF',
};

const KEY = 'mawjood.theme-mode';
// auto: dark from 19:00 to 07:00, light otherwise
const NIGHT_START = 19;
const NIGHT_END = 7;

let mode: ThemeMode = 'light';
let resolved: ResolvedTheme = 'light';
const listeners = new Set<() => void>();

function isNightNow(): boolean {
  const h = new Date().getHours();
  return h >= NIGHT_START || h < NIGHT_END;
}

function compute(): ResolvedTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return isNightNow() ? 'dark' : 'light';
}

function emit() {
  listeners.forEach((l) => l());
}

/** Re-resolve (e.g. on app foreground) and notify if it flipped. */
export function refreshTheme() {
  const r = compute();
  if (r !== resolved) {
    resolved = r;
    emit();
  }
}

export async function initTheme(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') mode = v;
  } catch {
    /* keep default */
  }
  resolved = compute();
  emit();
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export function getResolvedTheme(): ResolvedTheme {
  return resolved;
}

export function getPalette(): Palette {
  return resolved === 'dark' ? dark : light;
}

export async function setThemeMode(m: ThemeMode): Promise<void> {
  mode = m;
  try {
    await AsyncStorage.setItem(KEY, m);
  } catch {
    /* keep in-memory */
  }
  resolved = compute();
  emit();
}

export function cycleThemeMode(): void {
  void setThemeMode(mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light');
}

export function useTheme() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((x) => x + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    mode,
    resolved,
    palette: getPalette(),
    setMode: setThemeMode,
    cycle: cycleThemeMode,
    refresh: refreshTheme,
  };
}

// keep auto mode honest while the app stays open
setInterval(() => {
  if (mode === 'auto') refreshTheme();
}, 60_000);

// load the saved choice as soon as the module is imported

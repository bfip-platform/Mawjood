import type { SpaceType } from '@mawjood/voice-engine';
import { t, type TKey } from '../../lib/i18n';

/** Home-screen module constants (extracted from the home screen monolith, Phase C). */

export const VOICE_REPLY_KEY = 'mawjood.voice-reply'; // '1' = speak replies to voice notes

export const KIND_ICON: Record<string, string> = {
  task: '⬜',
  appointment: '📅',
  shopping: '🛒',
  place: '📍',
  spec: '📏',
  opinion: '💭',
  checklist: '🧳',
  thing: '📦',
};

export const SPACE_LABELS: Record<string, string> = {
  private: '🔒 Private',
  family: '👨‍👩‍👧 Family',
  work: '💼 Work',
};

// built-in family tab keys — anything else in familyTab is a custom tab id
export const FAMILY_BUILTIN_KEYS: ReadonlySet<string> = new Set([
  'members',
  'shopping',
  'tasks',
  'agenda',
  'things',
  'notes',
]);

export const SPACE_SHORT: Record<SpaceType, string> = {
  private: '🔒',
  family: '👨‍👩‍👧',
  work: '💼',
};

/** Localized display-name key per built-in space type (CFP-01 item 5). */
export const SPACE_NAME_KEYS: Record<SpaceType, TKey> = {
  private: 'spaceNamePrivate',
  family: 'spaceNameFamily',
  work: 'spaceNameWork',
};

/**
 * Visible space label: icon + LOCALIZED name for the built-in spaces
 * (previously a hardcoded-English map); any other space (family spaces the
 * user named, custom spaces) falls back to its stored name.
 */
export function spaceLabel(type: string, fallbackName?: string): string {
  const key = SPACE_NAME_KEYS[type as SpaceType];
  if (key) return `${SPACE_SHORT[type as SpaceType]} ${t(key)}`;
  return fallbackName ?? type;
}

export type AppView = 'chat' | SpaceType | 'custom';

export const ACTIVE_CHAT_KEY = 'mawjood.active-chat'; // in-progress chat draft
export const ACTIVE_FAMILY_KEY = 'mawjood.active-family.v1'; // last-viewed family space id
export const HISTORY_IDLE_MS = 2 * 60 * 1000; // current chat survives 2 min after background
export const MAX_HISTORY_MSGS = 100; // cap stored messages per session
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

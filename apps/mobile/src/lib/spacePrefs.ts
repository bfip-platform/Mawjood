import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeOrderKeys } from './spaceOrder';

/**
 * Per-user, device-local space display preferences (Spaces & Family UX
 * wave): strip order + custom-space icons.
 *
 * Why device-local: the spaces schema has no per-user order/icon columns,
 * and ordering is a personal display preference (two members of the same
 * family may order their strips differently), so it does not belong ON the
 * shared space row. These keys follow the app's existing `mawjood.*`
 * AsyncStorage preference pattern (theme, language, welcomed flag).
 * Limitation, documented in docs/SPACES_FAMILY_UX.md: preferences do not
 * sync across devices; the server-side follow-up is a `profiles.space_order`
 * column + engine adoption, which needs an owner-applied migration.
 *
 * Every function is total: reads resolve null/{} on any failure, writes
 * resolve false — callers roll back optimistic UI on false.
 */

const orderKey = (uid: string) => `mawjood.space-order.${uid}`;
const iconsKey = (uid: string) => `mawjood.space-icons.${uid}`;

export async function loadSpaceOrder(uid: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(orderKey(uid));
    if (!raw) return null;
    return sanitizeOrderKeys(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveSpaceOrder(uid: string, keys: string[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(orderKey(uid), JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

export async function loadSpaceIcons(uid: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(iconsKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length > 0 && v.length <= 8) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveSpaceIcons(uid: string, icons: Record<string, string>): Promise<boolean> {
  try {
    await AsyncStorage.setItem(iconsKey(uid), JSON.stringify(icons));
    return true;
  } catch {
    return false;
  }
}

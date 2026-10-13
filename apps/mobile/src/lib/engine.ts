import AsyncStorage from '@react-native-async-storage/async-storage';
import { VoiceEngine, type KVStore } from '@mawjood/voice-engine';
import { supabase } from './supabase';

/** Shared VoiceEngine singleton (was module-level in the home screen). */
export const engine = new VoiceEngine(supabase);

// D3 offline layer (PR-B wiring): AsyncStorage-backed KV so the read
// cache + write outbox survive restarts. Screens call the engine's
// offline-first methods (createItemOfflineFirst / listItemsCached /
// flushOutbox); with no KV the layer would stay disabled and every
// call would behave exactly as the plain online one.
const asyncStorageKV: KVStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  delete: (key) => AsyncStorage.removeItem(key),
};
engine.enableOffline(asyncStorageKV);

/**
 * Client-side IndexedDB Audio Cache
 * Inspired by Revive's multi-tier audio caching architecture.
 * Caches synthesized audio by (language, provider, voice, text) to:
 * 1. Eliminate repetition network latency (0ms playback during exercises).
 * 2. Drastically reduce Sarvam AI / Gemini API credit usage during multi-rep workouts.
 * 3. Provide immediate offline resilience for previously heard guidance cues.
 */

const DB_NAME = 'rehabsense_voice_cache_v1';
const STORE_NAME = 'synthesized_audio';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB unavailable in this environment'));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

export function buildVoiceCacheKey(
  language: string,
  provider: string,
  voice: string,
  text: string,
): string {
  return `${language.toLowerCase()}|${provider.toLowerCase()}|${voice.toLowerCase()}|${text.trim()}`;
}

export interface CachedAudioEntry {
  base64: string;
  mimeType: string;
  timestamp: number;
}

export async function getCachedVoiceAudio(cacheKey: string): Promise<CachedAudioEntry | null> {
  try {
    const db = await getDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedVoiceAudio(
  cacheKey: string,
  base64: string,
  mimeType = 'audio/wav',
): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: CachedAudioEntry = {
        base64,
        mimeType,
        timestamp: Date.now(),
      };
      const req = store.put(entry, cacheKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Non-blocking: storage failure should not prevent voice playback
  }
}

export async function clearVoiceCache(): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore error
  }
}

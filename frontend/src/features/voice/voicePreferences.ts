import {
  OriginalTextLanguage,
  TTSProviderName,
  VoiceLanguageCode,
} from '../../types/api';

export interface VoicePreferences {
  textLanguage: OriginalTextLanguage;
  speechLanguage: VoiceLanguageCode;
  provider: TTSProviderName;
  voice: string;
}

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  textLanguage: 'auto',
  speechLanguage: 'ml-IN',
  provider: 'gemini',
  voice: 'Kore',
};

const STORAGE_KEY = 'rehabsense.voice-preferences.v1';

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  return null;
}

export function loadVoicePreferences(): VoicePreferences {
  const storage = getStorage();
  if (!storage) return DEFAULT_VOICE_PREFERENCES;
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_VOICE_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<VoicePreferences>;
    return {
      textLanguage: parsed.textLanguage === 'en-IN' || parsed.textLanguage === 'ml-IN' ? parsed.textLanguage : 'auto',
      speechLanguage: parsed.speechLanguage === 'en-IN' ? 'en-IN' : 'ml-IN',
      provider: parsed.provider === 'sarvam' ? 'sarvam' : 'gemini',
      voice: typeof parsed.voice === 'string' && parsed.voice ? parsed.voice : DEFAULT_VOICE_PREFERENCES.voice,
    };
  } catch {
    return DEFAULT_VOICE_PREFERENCES;
  }
}

export function saveVoicePreferences(preferences: VoicePreferences): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private browsing or storage restrictions should not block speech.
  }
}

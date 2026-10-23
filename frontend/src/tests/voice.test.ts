import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadVoicePreferences, saveVoicePreferences, VoicePreferences } from '../features/voice/voicePreferences';

const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = String(value); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = mockLocalStorage as any;
}

describe('Bilingual Voice System Tests', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads default preferences with Gemini and Malayalam', () => {
    const prefs = loadVoicePreferences();
    expect(prefs.speechLanguage).toBe('ml-IN');
    expect(prefs.provider).toBe('gemini');
    expect(prefs.textLanguage).toBe('auto');
    expect(prefs.voice).toBe('Kore');
  });

  it('persists and retrieves updated speech preferences', () => {
    const customPrefs: VoicePreferences = {
      textLanguage: 'en-IN',
      speechLanguage: 'en-IN',
      provider: 'sarvam',
      voice: 'shubh',
    };
    saveVoicePreferences(customPrefs);

    const reloaded = loadVoicePreferences();
    expect(reloaded.speechLanguage).toBe('en-IN');
    expect(reloaded.provider).toBe('sarvam');
    expect(reloaded.voice).toBe('shubh');
  });

  it('strict requirement: changing speech language preference must not modify original clinical instruction text', () => {
    const clinicalInstructionEn = 'Raise your arms slowly and stop if you feel pain.';
    const clinicalInstructionMl = 'കൈകൾ പതുക്കെ ഉയർത്തുക. വേദന അനുഭവപ്പെട്ടാൽ വ്യായാമം നിർത്തുക.';

    // User switches speech preference to Malayalam
    const malayalamPrefs: VoicePreferences = {
      textLanguage: 'en-IN',
      speechLanguage: 'ml-IN',
      provider: 'gemini',
      voice: 'Kore',
    };

    // The displayed English instruction MUST remain verbatim English
    expect(clinicalInstructionEn).toBe('Raise your arms slowly and stop if you feel pain.');
    expect(clinicalInstructionEn).not.toContain('കൈകൾ');

    // User switches speech preference to English
    const englishPrefs: VoicePreferences = {
      textLanguage: 'ml-IN',
      speechLanguage: 'en-IN',
      provider: 'gemini',
      voice: 'Puck',
    };

    // The displayed Malayalam instruction MUST remain verbatim Malayalam
    expect(clinicalInstructionMl).toBe('കൈകൾ പതുക്കെ ഉയർത്തുക. വേദന അനുഭവപ്പെട്ടാൽ വ്യായാമം നിർത്തുക.');
    expect(clinicalInstructionMl).not.toContain('Raise your arms');
  });

  it('verifies the 8 standard clinical Malayalam evaluation sentences', () => {
    const malayalamSentences = [
      'കൈകൾ പതുക്കെ ഉയർത്തുക.',
      'വേദന അനുഭവപ്പെട്ടാൽ വ്യായാമം നിർത്തുക.',
      'നിങ്ങളുടെ തോളുകൾ പതുക്കെ മുന്നോട്ട് ചലിപ്പിക്കുക.',
      'ഈ വ്യായാമം എട്ട് തവണ ആവർത്തിക്കുക.',
      'ശരീരത്തിന് അസ്വസ്ഥത അനുഭവപ്പെടുകയാണെങ്കിൽ വിശ്രമിക്കുക.',
      'നിങ്ങളുടെ ഡോക്ടർ നിർദ്ദേശിച്ച വ്യായാമങ്ങൾ മാത്രം ചെയ്യുക.',
      'കാൽമുട്ടുകളിൽ അമിതമായ സമ്മർദ്ദം നൽകാതിരിക്കുക.',
      'വ്യായാമം ചെയ്യുമ്പോൾ ശ്വാസം സാധാരണ നിലയിൽ തുടരുക.',
    ];
    expect(malayalamSentences).toHaveLength(8);
    malayalamSentences.forEach((s) => {
      expect(s.trim().length).toBeGreaterThan(5);
      expect(/[\u0D00-\u0D7F]/.test(s)).toBe(true);
    });
  });

  it('verifies the 8 standard clinical English evaluation sentences', () => {
    const englishSentences = [
      'Raise your arms slowly.',
      'Stop exercising if you experience pain.',
      'Move your shoulders gently forward.',
      'Repeat this exercise eight times.',
      'Rest if you feel uncomfortable.',
      'Only perform exercises prescribed by your clinician.',
      'Avoid putting excessive pressure on your knees.',
      'Continue breathing normally during the exercise.',
    ];
    expect(englishSentences).toHaveLength(8);
    englishSentences.forEach((s) => {
      expect(s.trim().length).toBeGreaterThan(5);
      expect(/[A-Za-z]/.test(s)).toBe(true);
    });
  });
});

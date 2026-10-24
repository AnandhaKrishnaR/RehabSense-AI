import { CanonicalExerciseId, MovementPhase, MovementResult } from '../../types/vision';
import { VoiceLanguageCode, VoiceTemplate } from '../../types/api';
import { apiClient } from '../../services/apiClient';
import { loadVoicePreferences, VoicePreferences } from './voicePreferences';
import {
  buildVoiceCacheKey,
  getCachedVoiceAudio,
  setCachedVoiceAudio,
} from './voiceIndexedDBCache';

export const MOVEMENT_COACH_MESSAGES = {
  bodyweight_squat: {
    start: 'സ്ക്വാറ്റ് വ്യായാമം തുടങ്ങാം. കാലുകൾ തോളിന്റെ വീതിയിൽ വയ്ക്കുക. പുറം നേരെ വച്ച് പതുക്കെ താഴേക്ക് ഇരിക്കുക. വേദന തോന്നിയാൽ ഉടൻ നിർത്തുക.',
    eccentric: 'പതുക്കെ താഴേക്ക് ഇരിക്കുക. നിങ്ങളുടെ പുറം നേരെ വയ്ക്കുക.',
    inflection: 'നന്നായി. ഇനി പതുക്കെ മുകളിലേക്ക് വരിക.',
    concentric: 'പതുക്കെ മുകളിലേക്ക് ഉയരുക. പുറം നേരെ വയ്ക്കുക.',
  },
  shoulder_flexion: {
    start: 'കൈ ഉയർത്തുന്ന വ്യായാമം തുടങ്ങാം. കൈ ശരീരത്തോട് ചേർത്ത് നേരെ നിൽക്കുക. കൈ പതുക്കെ മുന്നിലേക്ക് ഉയർത്തുക. വേദന തോന്നിയാൽ ഉടൻ നിർത്തുക.',
    eccentric: 'കൈ പതുക്കെ മുകളിലേക്ക് ഉയർത്തുക. വേദനയില്ലാത്ത പരിധിയിൽ മാത്രം ചെയ്യുക.',
    inflection: 'നന്നായി. ഇനി കൈ പതുക്കെ താഴേക്ക് കൊണ്ടുവരിക.',
    concentric: 'കൈ പതുക്കെ താഴേക്ക് കൊണ്ടുവരിക. ശരീരത്തോട് ചേർക്കുക.',
  },
} as const;

const ENGLISH_MOVEMENT_COACH_MESSAGES = {
  bodyweight_squat: {
    start: 'Let us begin the squat exercise. Keep your feet shoulder-width apart and your back straight. Sit down slowly. Stop immediately if you feel pain.',
    eccentric: 'Sit down slowly and keep your back straight.',
    inflection: 'Good. Now slowly stand back up.',
    concentric: 'Stand up slowly and keep your back straight.',
  },
  shoulder_flexion: {
    start: 'Let us begin the arm raise exercise. Stand straight with your arm by your side. Slowly raise your arm forward. Stop immediately if you feel pain.',
    eccentric: 'Raise your arm slowly and stay within a pain-free range.',
    inflection: 'Good. Now slowly lower your arm.',
    concentric: 'Lower your arm slowly and keep it close to your body.',
  },
} as const;

export function getMovementCoachStartMessage(
  exercise: CanonicalExerciseId,
  speechLanguage: VoiceLanguageCode,
  voiceTemplates: Record<string, VoiceTemplate> = {},
): string {
  if (speechLanguage === 'en-IN') return ENGLISH_MOVEMENT_COACH_MESSAGES[exercise].start;

  const prefix = exercise === 'bodyweight_squat' ? 'squat' : 'shoulder';
  return voiceTemplates[`${prefix}_start`]?.text || MOVEMENT_COACH_MESSAGES[exercise].start;
}

export function getMovementCoachMessage(
  exercise: CanonicalExerciseId,
  phase: MovementPhase | undefined,
  repetitions: number,
  previousPhase: MovementPhase | undefined,
  previousRepetitions: number,
  measurementReliable: boolean,
  movementChecks: string[] = [],
  voiceTemplates: Record<string, VoiceTemplate> = {},
  speechLanguage: VoiceLanguageCode = 'ml-IN',
): string | null {
  const messages = speechLanguage === 'en-IN'
    ? ENGLISH_MOVEMENT_COACH_MESSAGES
    : MOVEMENT_COACH_MESSAGES;
  const template = (key: string) => speechLanguage === 'ml-IN' ? voiceTemplates[key]?.text : undefined;

  if (!measurementReliable || phase === 'unreliable') {
    return previousPhase !== 'unreliable'
      ? template('camera_unreliable') || (speechLanguage === 'en-IN'
        ? 'Your movement is not clearly visible. Please adjust your position.'
        : 'ചലനം വ്യക്തമായി കാണുന്നില്ല. ദയവായി നിങ്ങളുടെ സ്ഥാനം ശരിയാക്കുക.')
      : null;
  }

  if (movementChecks.length > 0 && movementChecks.includes('asymmetrical_knee_flexion')) {
    return template('movement_check_knees') || (speechLanguage === 'en-IN'
      ? 'Keep your knees pointing in the same direction. Move slowly.'
      : 'കാൽമുട്ടുകൾ ഒരേ ദിശയിൽ വയ്ക്കുക. പതുക്കെ ചെയ്യുക.');
  }

  if (phase === 'completed' && repetitions > previousRepetitions) {
    return speechLanguage === 'en-IN'
      ? `Well done. ${repetitions} repetitions completed.`
      : `നന്നായി ചെയ്തു. ${repetitions} ആവർത്തനം പൂർത്തിയായി.`;
  }

  if (phase && phase !== previousPhase) {
    if (phase === 'eccentric' || phase === 'inflection' || phase === 'concentric') {
      const prefix = exercise === 'bodyweight_squat' ? 'squat' : 'shoulder';
      return template(`${prefix}_${phase}`) || messages[exercise][phase];
    }
  }

  return null;
}

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let audioContext: AudioContext | null = null;
let activeSourceNode: AudioBufferSourceNode | null = null;
let speechQueue: Array<{ text: string; preferences: VoicePreferences; segment: boolean; priority: 'high' | 'normal' }> = [];
let isAudioPlaying = false;
let lastSpokenTime = 0;
const SPEECH_COOLDOWN_MS = 1200;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      audioContext = new AudioCtx();
    }
  }
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

/**
 * Pre-caches common movement cues in IndexedDB on exercise start.
 * Like Revive, this guarantees zero-latency, instant playback during movement reps.
 */
export async function precacheExerciseCues(exercise: CanonicalExerciseId): Promise<void> {
  const preferences = loadVoicePreferences();
  const cues = preferences.speechLanguage === 'en-IN'
    ? ENGLISH_MOVEMENT_COACH_MESSAGES[exercise]
    : MOVEMENT_COACH_MESSAGES[exercise];
  if (!cues) return;

  const phrases = [cues.start, cues.eccentric, cues.inflection, cues.concentric];

  for (const phrase of phrases) {
    const cacheKey = buildVoiceCacheKey(
      preferences.speechLanguage,
      preferences.provider,
      preferences.voice,
      phrase,
    );
    const existing = await getCachedVoiceAudio(cacheKey);
    if (!existing) {
      try {
        const res = await apiClient.speakText(phrase, preferences.speechLanguage, {
          textLanguage: preferences.speechLanguage,
          speechLanguage: preferences.speechLanguage,
          provider: preferences.provider,
          voice: preferences.voice,
        });
        if (res?.audio_base64) {
          await setCachedVoiceAudio(cacheKey, res.audio_base64, res.mime_type || 'audio/wav');
        }
      } catch {
        // Silently continue pre-caching next cue
      }
    }
  }
}

/**
 * Speaks text (Malayalam or English) using Revive's multi-tier strategy:
 * 1. Checks client IndexedDB cache (0ms latency, zero API cost).
 * 2. If uncached, calls the Sarvam Bulbul v3 backend TTS proxy and caches response.
 * 3. Plays via Web Audio API (or HTML5 Audio fallback).
 * 4. Priority queue with cooldown prevents overlapping cues.
 * 5. Urgent interrupt mode for safety / pain alerts.
 */
export function speakMalayalam(
  text: string,
  interrupt = false,
  preferenceOverrides: Partial<VoicePreferences> = {},
): boolean {
  if (!text || !text.trim()) return false;

  const context = getAudioContext();
  if (context?.state === 'suspended') void context.resume().catch(() => {});

  const now = performance.now();
  if (!interrupt && isAudioPlaying && now - lastSpokenTime < SPEECH_COOLDOWN_MS) {
    // Drop rapid low-priority spam during active movement
    return false;
  }

  if (interrupt) {
    // Urgent safety or pain alert: halt active playback immediately
    speechQueue = [];
    if (activeSourceNode) {
      try { activeSourceNode.stop(); } catch {}
      activeSourceNode = null;
    }
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio = null;
    }
    window.speechSynthesis?.cancel();
    activeUtterance = null;
    isAudioPlaying = false;
  }

  const preferences = { ...loadVoicePreferences(), ...preferenceOverrides };
  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) || []).length;
  
  speechQueue.push({
    text: text.trim(),
    preferences,
    segment: text.length > 240 || sentenceCount >= 3,
    priority: interrupt ? 'high' : 'normal',
  });

  processNextInQueue();
  return true;
}

async function processNextInQueue(): Promise<void> {
  if (isAudioPlaying || speechQueue.length === 0) {
    return;
  }

  const nextSpeech = speechQueue.shift();
  if (!nextSpeech) return;

  isAudioPlaying = true;
  lastSpokenTime = performance.now();
  window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-start'));

  const finish = () => {
    activeAudio = null;
    activeUtterance = null;
    activeSourceNode = null;
    isAudioPlaying = false;
    lastSpokenTime = performance.now();
    window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-end'));
    processNextInQueue();
  };

  const fail = () => {
    speechQueue = [];
    isAudioPlaying = false;
    activeAudio = null;
    activeUtterance = null;
    activeSourceNode = null;
    window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-error'));
  };

  // Tier 1: Check Client IndexedDB Cache (Revive pattern)
  const cacheKey = buildVoiceCacheKey(
    nextSpeech.preferences.speechLanguage,
    nextSpeech.preferences.provider,
    nextSpeech.preferences.voice,
    nextSpeech.text,
  );

  const cached = await getCachedVoiceAudio(cacheKey);
  if (cached && cached.base64) {
    playBase64Audio(cached.base64, cached.mimeType || 'audio/wav', finish, () => {
      // If cached playback fails, proceed with live fetch
      fetchLiveAndPlay(nextSpeech, cacheKey, finish, fail);
    });
    return;
  }

  // Tier 2: Live Fetch from Backend TTS Proxy
  fetchLiveAndPlay(nextSpeech, cacheKey, finish, fail);
}

function fetchLiveAndPlay(
  nextSpeech: { text: string; preferences: VoicePreferences; segment: boolean },
  cacheKey: string,
  finish: () => void,
  fail: () => void,
): void {
  apiClient.speakText(nextSpeech.text, nextSpeech.preferences.speechLanguage, {
    textLanguage: nextSpeech.preferences.textLanguage,
    speechLanguage: nextSpeech.preferences.speechLanguage,
    provider: nextSpeech.preferences.provider,
    voice: nextSpeech.preferences.voice,
    segment: nextSpeech.segment,
  })
    .then(async (res) => {
      if (res?.audio_base64) {
        // Cache to IndexedDB for subsequent repetitions
        void setCachedVoiceAudio(cacheKey, res.audio_base64, res.mime_type || 'audio/wav');
        playAudioSegments([res], 0, nextSpeech.preferences.speechLanguage, finish, fail);
      } else if (res?.segments?.length) {
        playAudioSegments(res.segments, 0, nextSpeech.preferences.speechLanguage, finish, fail);
      } else {
        speakBrowserFallback(nextSpeech.text, nextSpeech.preferences.speechLanguage, finish, fail);
      }
    })
    .catch((err) => {
      console.warn('[VoiceCoach] Backend speakText request error:', err);
      if ((err as Error & { code?: string }).code === 'language_incompatible') {
        speechQueue = [];
        isAudioPlaying = false;
        window.dispatchEvent(new CustomEvent('rehabsense-voice-compatibility-warning', {
          detail: (err as Error).message,
        }));
        return;
      }
      speakBrowserFallback(nextSpeech.text, nextSpeech.preferences.speechLanguage, finish, fail);
    });
}

/**
 * Plays base64 audio via Web Audio API for lowest latency and zero distortion.
 * Falls back to HTML5 Audio if Web Audio API decoding fails.
 */
function playBase64Audio(
  base64Data: string,
  mimeType: string,
  onComplete: () => void,
  onFailure: () => void,
): void {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      // Decode base64 to binary buffer
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      ctx.decodeAudioData(
        bytes.buffer.slice(0),
        (audioBuffer) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          activeSourceNode = source;

          source.onended = () => {
            activeSourceNode = null;
            onComplete();
          };

          source.start(0);
        },
        () => {
          // Web Audio decode failed, fallback to HTML5 Audio
          playHtml5AudioFallback(base64Data, mimeType, onComplete, onFailure);
        },
      );
      return;
    }
  } catch {
    // Continue to HTML5 fallback
  }

  playHtml5AudioFallback(base64Data, mimeType, onComplete, onFailure);
}

function playHtml5AudioFallback(
  base64Data: string,
  mimeType: string,
  onComplete: () => void,
  onFailure: () => void,
): void {
  try {
    const audio = new Audio(`data:${mimeType || 'audio/wav'};base64,${base64Data}`);
    audio.playbackRate = 1.0;
    activeAudio = audio;
    audio.onended = onComplete;
    audio.onerror = onFailure;
    audio.ontimeupdate = () => {
      if (audio.duration > 0) {
        window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-progress', {
          detail: { progress: audio.currentTime / audio.duration },
        }));
      }
    };
    audio.play().catch(onFailure);
  } catch {
    onFailure();
  }
}

function playAudioSegments(
  segments: Array<{ audio_base64?: string | null; mime_type?: string; fallback_text?: string; prepared_text?: string }>,
  index: number,
  speechLanguage: VoicePreferences['speechLanguage'],
  onComplete: () => void,
  onFailure: () => void,
): void {
  if (index >= segments.length) {
    onComplete();
    return;
  }

  const segment = segments[index];
  const playNext = () => playAudioSegments(segments, index + 1, speechLanguage, onComplete, onFailure);
  const useBrowserFallback = () => {
    const fallbackText = segment.prepared_text || segment.fallback_text;
    if (!fallbackText) {
      onFailure();
      return;
    }
    speakBrowserFallback(fallbackText, speechLanguage, playNext, onFailure);
  };

  if (!segment.audio_base64) {
    useBrowserFallback();
    return;
  }

  playBase64Audio(segment.audio_base64, segment.mime_type || 'audio/wav', playNext, useBrowserFallback);
}

function speakBrowserFallback(
  text: string,
  speechLanguage: VoicePreferences['speechLanguage'],
  onEndCallback: () => void,
  onFailure: () => void,
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    onFailure();
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      onEndCallback();
    };
    utterance.onerror = () => {
      onFailure();
    };

    const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find((voice) => voice.lang.toLowerCase() === speechLanguage.toLowerCase())
        || voices.find((voice) => voice.lang.toLowerCase().startsWith(speechLanguage.slice(0, 2).toLowerCase()));
      utterance.lang = speechLanguage;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }
    activeUtterance = utterance;

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn('[VoiceCoach] Speech synthesis fallback failed:', err);
    onFailure();
    return false;
  }
}

export function pauseMalayalam(): void {
  if (activeAudio) activeAudio.pause();
  else if (audioContext && audioContext.state === 'running') audioContext.suspend().catch(() => {});
  else window.speechSynthesis?.pause();
}

export function resumeMalayalam(): void {
  if (activeAudio) void activeAudio.play();
  else if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  else window.speechSynthesis?.resume();
}

export function stopMalayalam(): void {
  speechQueue = [];
  if (activeSourceNode) {
    try { activeSourceNode.stop(); } catch {}
    activeSourceNode = null;
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  window.speechSynthesis?.cancel();
  activeUtterance = null;
  isAudioPlaying = false;
  window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-end'));
}

export function movementResultHasChanged(result: MovementResult, previous: MovementResult | null): boolean {
  return !previous
    || result.current_phase !== previous.current_phase
    || result.repetitions !== previous.repetitions
    || result.measurement_reliable !== previous.measurement_reliable;
}

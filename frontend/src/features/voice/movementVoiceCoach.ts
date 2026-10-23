import { CanonicalExerciseId, MovementPhase, MovementResult } from '../../types/vision';
import { VoiceTemplate } from '../../types/api';
import { apiClient } from '../../services/apiClient';
import { loadVoicePreferences, VoicePreferences } from './voicePreferences';

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

export function getMovementCoachMessage(
  exercise: CanonicalExerciseId,
  phase: MovementPhase | undefined,
  repetitions: number,
  previousPhase: MovementPhase | undefined,
  previousRepetitions: number,
  measurementReliable: boolean,
  movementChecks: string[] = [],
  voiceTemplates: Record<string, VoiceTemplate> = {},
): string | null {
  if (!measurementReliable || phase === 'unreliable') {
    return previousPhase !== 'unreliable'
      ? voiceTemplates.camera_unreliable?.text || 'ചലനം വ്യക്തമായി കാണുന്നില്ല. ദയവായി നിങ്ങളുടെ സ്ഥാനം ശരിയാക്കുക.'
      : null;
  }

  if (movementChecks.length > 0 && movementChecks.includes('asymmetrical_knee_flexion')) {
    return voiceTemplates.movement_check_knees?.text || 'കാൽമുട്ടുകൾ ഒരേ ദിശയിൽ വയ്ക്കുക. പതുക്കെ ചെയ്യുക.';
  }

  if (phase === 'completed' && repetitions > previousRepetitions) {
    return `നന്നായി ചെയ്തു. ${repetitions} ആവർത്തനം പൂർത്തിയായി.`;
  }

  if (phase && phase !== previousPhase) {
    if (phase === 'eccentric' || phase === 'inflection' || phase === 'concentric') {
      const prefix = exercise === 'bodyweight_squat' ? 'squat' : 'shoulder';
      const template = voiceTemplates[`${prefix}_${phase}`]?.text;
      return template || MOVEMENT_COACH_MESSAGES[exercise][phase];
    }
  }

  return null;
}

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechQueue: Array<{ text: string; preferences: VoicePreferences; segment: boolean }> = [];
let isAudioPlaying = false;

/**
 * Speaks Malayalam text to the patient.
 * 1. Fetches native Malayalam audio from backend TTS (/api/v1/voice/speak/) and plays it via HTML5 Audio.
 * 2. Features non-overlapping playback queue so sentences are not clipped mid-word.
 * 3. Supports interrupt mode for urgent clinician/safety alerts.
 * 4. Falls back to browser speech when backend TTS is unavailable.
 */
export function speakMalayalam(
  text: string,
  interrupt = false,
  preferenceOverrides: Partial<VoicePreferences> = {},
): boolean {
  if (!text || !text.trim()) return false;

  if (interrupt) {
    // Clear queue and immediately stop active audio for urgent alerts
    speechQueue = [];
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
    text,
    preferences,
    segment: text.length > 240 || sentenceCount >= 3,
  });
  processNextInQueue();
  return true;
}

function processNextInQueue(): void {
  if (isAudioPlaying || speechQueue.length === 0) {
    return;
  }

  const nextSpeech = speechQueue.shift();
  if (!nextSpeech) return;

  isAudioPlaying = true;
  window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-start'));
  const finish = () => {
    activeAudio = null;
    activeUtterance = null;
    isAudioPlaying = false;
    window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-end'));
    processNextInQueue();
  };
  const fail = () => {
    speechQueue = [];
    isAudioPlaying = false;
    activeAudio = null;
    activeUtterance = null;
    window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-error'));
  };

  apiClient.speakText(nextSpeech.text, nextSpeech.preferences.speechLanguage, {
    textLanguage: nextSpeech.preferences.textLanguage,
    speechLanguage: nextSpeech.preferences.speechLanguage,
    provider: nextSpeech.preferences.provider,
    voice: nextSpeech.preferences.voice,
    segment: nextSpeech.segment,
  })
    .then((res) => {
      if (res?.segments?.length) {
          playAudioSegments(res.segments, 0, nextSpeech.preferences.speechLanguage, finish, fail);
      } else if (res?.audio_base64) {
          playAudioSegments([res], 0, nextSpeech.preferences.speechLanguage, finish, fail);
      } else {
          speakBrowserFallback(nextSpeech.text, nextSpeech.preferences.speechLanguage, finish, fail);
      }
    })
    .catch((err) => {
      console.warn('[VoiceCoach] Backend speakText request error, falling back to browser speech:', err);
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

  const audio = new Audio(`data:${segment.mime_type || 'audio/wav'};base64,${segment.audio_base64}`);
  audio.playbackRate = 1.0;
  (audio as any).preservesPitch = true;
  activeAudio = audio;
  audio.onended = playNext;
  audio.onerror = useBrowserFallback;
  audio.ontimeupdate = () => {
    if (audio.duration > 0) {
      window.dispatchEvent(new CustomEvent('rehabsense-voice-playback-progress', {
        detail: { progress: audio.currentTime / audio.duration },
      }));
    }
  };
  audio.play().catch(useBrowserFallback);
}

function speakBrowserFallback(
  text: string,
  speechLanguage: VoicePreferences['speechLanguage'],
  onEndCallback: () => void,
  onFailure: () => void,
): boolean {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
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
    const selectedVoice = voices.find((voice) => voice.lang.toLowerCase() === speechLanguage.toLowerCase());
    if (!selectedVoice) {
      onFailure();
      return false;
    }
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
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
  else window.speechSynthesis?.pause();
}

export function resumeMalayalam(): void {
  if (activeAudio) void activeAudio.play();
  else window.speechSynthesis?.resume();
}

export function stopMalayalam(): void {
  speechQueue = [];
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

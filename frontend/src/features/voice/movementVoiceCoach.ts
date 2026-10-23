import { CanonicalExerciseId, MovementPhase, MovementResult } from '../../types/vision';
import { apiClient } from '../../services/apiClient';

export const MOVEMENT_COACH_MESSAGES = {
  bodyweight_squat: {
    start: 'ഇപ്പോൾ കാലുകൾ തോളിന്റെ വീതിയിൽ വയ്ക്കുക. പതുക്കെ താഴേക്ക് ഇരിക്കുക. നിങ്ങളുടെ പുറം നേരെ വയ്ക്കുക. വേദന അനുഭവപ്പെട്ടാൽ ഉടൻ നിർത്തുക.',
    eccentric: 'പതുക്കെ താഴേക്ക് ഇരിക്കുക. നിങ്ങളുടെ പുറം നേരെ വയ്ക്കുക.',
    inflection: 'നന്നായി. ഇപ്പോൾ പതുക്കെ മുകളിലേക്ക് വരിക.',
    concentric: 'പതുക്കെ മുകളിലേക്ക് വരിക. പുറം നേരെ വയ്ക്കുക.',
  },
  shoulder_flexion: {
    start: 'ഇപ്പോൾ കൈ ശരീരത്തോട് ചേർത്ത് നിൽക്കുക. കൈ പതുക്കെ മുന്നിലേക്ക് ഉയർത്തുക. വേദന അനുഭവപ്പെട്ടാൽ ഉടൻ നിർത്തുക.',
    eccentric: 'കൈ പതുക്കെ മുകളിലേക്ക് ഉയർത്തുക. വേദനയുള്ള പരിധിക്കപ്പുറം പോകരുത്.',
    inflection: 'നന്നായി. ഇനി കൈ പതുക്കെ താഴേക്ക് കൊണ്ടുവരിക.',
    concentric: 'കൈ പതുക്കെ താഴേക്ക് കൊണ്ടുവരിക.',
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
): string | null {
  if (!measurementReliable || phase === 'unreliable') {
    return previousPhase !== 'unreliable'
      ? 'ക്യാമറയിൽ നിങ്ങളുടെ ശരീരം വ്യക്തമായി കാണുന്നില്ല. ദയവായി ക്യാമറയ്ക്ക് മുന്നിൽ ശരിയായി നിൽക്കുക.'
      : null;
  }

  if (movementChecks.length > 0 && movementChecks.includes('asymmetrical_knee_flexion')) {
    return 'നിങ്ങളുടെ ചലനം ശരിയായ പരിധിയിൽ അല്ല. പതുക്കെ ചെയ്യുക, കാൽമുട്ടുകൾ ഒരേ ദിശയിൽ വയ്ക്കുക.';
  }

  if (phase === 'completed' && repetitions > previousRepetitions) {
    return `നന്നായി. ${repetitions} ആവർത്തനം പൂർത്തിയായി.`;
  }

  if (phase && phase !== previousPhase) {
    if (phase === 'eccentric' || phase === 'inflection' || phase === 'concentric') {
      return MOVEMENT_COACH_MESSAGES[exercise][phase];
    }
  }

  return null;
}

let activeAudio: HTMLAudioElement | null = null;

/**
 * Plays an audible feedback tone using the browser Web Audio API.
 * Ensures the user always hears audio even if voice packs are missing.
 */
export function playNotificationTone(frequency = 587.33, duration = 0.25): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    // Non-critical audio chime fallback
  }
}

/**
 * Speaks Malayalam text to the patient.
 * 1. Fetches real Malayalam audio from backend TTS (/api/v1/voice/speak/) and plays it via HTML5 Audio.
 * 2. Simultaneously attempts browser SpeechSynthesis with available voices as fallback.
 * 3. Emits an audible tone to guarantee sound feedback.
 */
export function speakMalayalam(text: string): boolean {
  if (!text) return false;

  // Sound chime to immediately notify user of incoming audio
  playNotificationTone(523.25, 0.15);

  // Stop previous audio if playing
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }

  // Primary: Request synthesized audio from backend (Sarvam AI / gTTS / tone fallback)
  apiClient.speakText(text, 'ml')
    .then((res) => {
      if (res && res.audio_base64) {
        const mime = res.mime_type || 'audio/wav';
        const audio = new Audio(`data:${mime};base64,${res.audio_base64}`);
        activeAudio = audio;
        audio.play().catch((playErr) => {
          console.warn('[VoiceCoach] Backend audio playback failed, trying browser synthesis fallback:', playErr);
          speakBrowserFallback(text);
        });
      } else {
        speakBrowserFallback(text);
      }
    })
    .catch((err) => {
      console.warn('[VoiceCoach] Backend speakText request error, falling back to browser speech:', err);
      speakBrowserFallback(text);
    });

  return true;
}

function speakBrowserFallback(text: string): boolean {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      return false;
    }
    // Look for Malayalam voice first
    let selectedVoice = voices.find((v) => v.lang.startsWith('ml') || v.name.toLowerCase().includes('malayalam'));
    if (!selectedVoice) {
      // Look for any Indic voice
      selectedVoice = voices.find((v) => v.lang.startsWith('hi') || v.lang.startsWith('ta') || v.lang.startsWith('te'));
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = 'ml-IN';
    }

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn('[VoiceCoach] Speech synthesis fallback failed:', err);
    return false;
  }
}

export function movementResultHasChanged(result: MovementResult, previous: MovementResult | null): boolean {
  return !previous
    || result.current_phase !== previous.current_phase
    || result.repetitions !== previous.repetitions
    || result.measurement_reliable !== previous.measurement_reliable;
}

import React, { useEffect, useState } from 'react';
import { Pause, Play, Square, Volume2 } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { TTSCompatibilityResponse, TTSVoiceOption } from '../../types/api';
import { loadVoicePreferences, saveVoicePreferences, VoicePreferences } from './voicePreferences';
import { pauseMalayalam, resumeMalayalam, speakMalayalam, stopMalayalam } from './movementVoiceCoach';

interface VoiceSettingsPanelProps {
  englishText: string;
  malayalamText: string;
}

export function VoiceSettingsPanel({ englishText, malayalamText }: VoiceSettingsPanelProps) {
  const [preferences, setPreferences] = useState<VoicePreferences>(loadVoicePreferences);
  const [voices, setVoices] = useState<TTSVoiceOption[]>([]);
  const [compatibility, setCompatibility] = useState<TTSCompatibilityResponse | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [playbackStatus, setPlaybackStatus] = useState('');
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState('');

  const originalText = preferences.textLanguage === 'en-IN'
    ? englishText
    : preferences.textLanguage === 'ml-IN'
      ? malayalamText
      : preferences.speechLanguage === 'en-IN'
        ? englishText
        : malayalamText;

  const updatePreferences = (updates: Partial<VoicePreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...updates };
      saveVoicePreferences(next);
      return next;
    });
    setError('');
  };

  useEffect(() => {
    let active = true;
    setVoiceLoading(true);
    setVoices([]);
    apiClient.getTTSVoiceOptions(preferences.provider, preferences.speechLanguage)
      .then((response) => {
        if (!active) return;
        setVoices(response.voices);
        if (!response.voices.some((voice) => voice.id === preferences.voice) && response.voices[0]) {
          updatePreferences({ voice: response.voices[0].id });
        }
        if (response.voices.length === 0) {
          setError(`No verified ${preferences.speechLanguage} voices are available for ${preferences.provider}.`);
        }
      })
      .catch((requestError: Error) => {
        if (active) setError(requestError.message || 'Could not load compatible voices.');
      })
      .finally(() => {
        if (active) setVoiceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preferences.provider, preferences.speechLanguage]);

  useEffect(() => {
    let active = true;
    apiClient.checkTTSCompatibility(
      originalText,
      preferences.textLanguage,
      preferences.speechLanguage,
      preferences.provider,
    ).then((result) => {
      if (active) setCompatibility(result);
    }).catch((requestError: Error) => {
      if (active) setCompatibility({
        compatible: false,
        detected_text_language: 'unknown',
        text_language: preferences.textLanguage,
        speech_language: preferences.speechLanguage,
        provider: preferences.provider,
        warning: requestError.message || 'Could not verify language compatibility.',
      });
    });
    return () => {
      active = false;
    };
  }, [originalText, preferences.textLanguage, preferences.speechLanguage, preferences.provider]);

  useEffect(() => {
    const handlePlaybackStart = () => {
      setPlaybackStatus('Playing');
      setPlaybackProgress(0);
      setIsPaused(false);
    };
    const handlePlaybackEnd = () => {
      setPlaybackStatus('');
      setPlaybackProgress(0);
      setIsPaused(false);
    };
    const handlePlaybackError = () => {
      setPlaybackStatus('');
      setError('Audio could not be played. Check provider access or available browser voices.');
    };
    const handleCompatibilityWarning = (event: Event) => {
      setPlaybackStatus('');
      setCompatibility((current) => current ? {
        ...current,
        compatible: false,
        warning: (event as CustomEvent<string>).detail || current.warning,
      } : current);
    };
    const handleProgress = (event: Event) => {
      const progress = (event as CustomEvent<{ progress: number }>).detail?.progress;
      if (typeof progress === 'number') setPlaybackProgress(Math.round(progress * 100));
    };

    window.addEventListener('rehabsense-voice-playback-start', handlePlaybackStart);
    window.addEventListener('rehabsense-voice-playback-end', handlePlaybackEnd);
    window.addEventListener('rehabsense-voice-playback-error', handlePlaybackError);
    window.addEventListener('rehabsense-voice-compatibility-warning', handleCompatibilityWarning);
    window.addEventListener('rehabsense-voice-playback-progress', handleProgress);
    return () => {
      window.removeEventListener('rehabsense-voice-playback-start', handlePlaybackStart);
      window.removeEventListener('rehabsense-voice-playback-end', handlePlaybackEnd);
      window.removeEventListener('rehabsense-voice-playback-error', handlePlaybackError);
      window.removeEventListener('rehabsense-voice-compatibility-warning', handleCompatibilityWarning);
      window.removeEventListener('rehabsense-voice-playback-progress', handleProgress);
    };
  }, []);

  const playOriginalText = () => {
    if (!compatibility?.compatible) return;
    speakMalayalam(originalText, false, preferences);
  };

  const previewVoice = () => {
    const previewText = preferences.speechLanguage === 'en-IN'
      ? 'Please get ready to begin the exercise.'
      : 'വ്യായാമം തുടങ്ങാൻ തയ്യാറാകൂ.';
    const previewLanguage = preferences.speechLanguage;
    speakMalayalam(previewText, false, {
      ...preferences,
      textLanguage: previewLanguage,
    });
  };

  return (
    <section className="card" aria-label="Speech settings" style={{ marginBottom: '1rem' }}>
      <h3 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Speech settings</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem' }}>
          Original text language
          <select
            value={preferences.textLanguage}
            onChange={(event) => updatePreferences({ textLanguage: event.target.value as VoicePreferences['textLanguage'] })}
          >
            <option value="auto">Auto detect</option>
            <option value="en-IN">English</option>
            <option value="ml-IN">മലയാളം (Malayalam)</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem' }}>
          Speech language
          <select
            value={preferences.speechLanguage}
            onChange={(event) => updatePreferences({ speechLanguage: event.target.value as VoicePreferences['speechLanguage'] })}
          >
            <option value="en-IN">English (India)</option>
            <option value="ml-IN">മലയാളം (India)</option>
          </select>
        </label>
        <div style={{ display: 'grid', gap: '0.25rem', alignContent: 'start', fontSize: '0.82rem' }}>
          Provider
          <strong>Sarvam AI</strong>
        </div>
        <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem' }}>
          Voice
          <select
            value={preferences.voice}
            disabled={voiceLoading || voices.length === 0}
            onChange={(event) => updatePreferences({ voice: event.target.value })}
          >
            {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
          </select>
        </label>
      </div>

      {compatibility && !compatibility.compatible && (
        <p role="alert" style={{ color: '#9a3412', margin: '0.75rem 0 0', fontSize: '0.84rem' }}>
          {compatibility.warning}
        </p>
      )}
      <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Original text to speak: <span lang={preferences.textLanguage === 'en-IN' ? 'en-IN' : 'ml-IN'}>{originalText}</span>
      </p>
      {error && (
        <p role="alert" style={{ color: '#991b1b', margin: '0.5rem 0 0', fontSize: '0.84rem' }}>{error}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" className="btn btn-outline" disabled={voiceLoading} onClick={previewVoice}>
          <Volume2 size={16} /> Preview voice
        </button>
        <button type="button" className="btn btn-primary" disabled={!compatibility?.compatible || voiceLoading} onClick={playOriginalText}>
          <Play size={16} /> Play instruction
        </button>
        <button type="button" className="btn btn-outline" disabled={!playbackStatus} onClick={() => { pauseMalayalam(); setIsPaused(true); }}>
          <Pause size={16} /> Pause
        </button>
        <button type="button" className="btn btn-outline" disabled={!isPaused} onClick={() => { resumeMalayalam(); setIsPaused(false); }}>
          <Play size={16} /> Resume
        </button>
        <button type="button" className="btn btn-outline" disabled={!playbackStatus} onClick={stopMalayalam} aria-label="Stop speech">
          <Square size={16} /> Stop
        </button>
        {playbackStatus && <span role="status" style={{ fontSize: '0.82rem' }}>{playbackStatus}</span>}
      </div>
      {playbackStatus && <progress value={playbackProgress} max={100} aria-label="Speech progress" style={{ width: '100%', marginTop: '0.5rem' }} />}
    </section>
  );
}

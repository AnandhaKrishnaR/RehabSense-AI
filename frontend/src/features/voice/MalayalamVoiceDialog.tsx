import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Check, AlertCircle, Volume2, Edit3, X } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { SymptomReportPayload } from '../../types/api';
import { speakMalayalam } from './movementVoiceCoach';

interface SpeechRecognitionEventLike extends Event {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export interface MalayalamVoiceDialogProps {
  sessionId: string;
  onSymptomSubmitted: (symptom: SymptomReportPayload) => void;
  onClose: () => void;
}

export function MalayalamVoiceDialog({ sessionId, onSymptomSubmitted, onClose }: MalayalamVoiceDialogProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [painScore, setPainScore] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<string>('moderate');
  const [bodyArea, setBodyArea] = useState<string>('');
  const [hasExtracted, setHasExtracted] = useState(false);
  const [voiceFeedbackText, setVoiceFeedbackText] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognizedTextRef = useRef('');

  useEffect(() => {
    const handlePlaybackError = () => {
      setRecordingError('Speech playback failed. Check the configured TTS provider or matching browser voice and try again.');
    };
    window.addEventListener('rehabsense-voice-playback-error', handlePlaybackError);
    return () => window.removeEventListener('rehabsense-voice-playback-error', handlePlaybackError);
  }, []);

  // Sample quick phrases in Malayalam for immediate testing / demo
  const samplePhrases = [
    { label: 'കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു (Pain increases on arm raise)', text: 'കൈ ഉയർത്തുമ്പോൾ വേദന കൂടുന്നു', pain: 6, diff: 'hard', area: 'shoulder' },
    { label: 'കാൽമുട്ടിൽ ചെറിയ ബുദ്ധിമുട്ടുണ്ട് (Mild knee stiffness)', text: 'കാൽമുട്ടിൽ ചെറിയ ബുദ്ധിമുട്ടുണ്ട്', pain: 3, diff: 'moderate', area: 'knee' },
    { label: 'വ്യായാമം ചെയ്യാൻ എളുപ്പമാണ് (Exercise feels comfortable)', text: 'വ്യായാമം ചെയ്യാൻ എളുപ്പമാണ്', pain: 0, diff: 'easy', area: '' },
    { label: 'കടുത്ത നെഞ്ചുവേദന തോന്നുന്നു (Urgent: Severe chest pain)', text: 'കടുത്ത നെഞ്ചുവേദന തോന്നുന്നു', pain: 9, diff: 'very_hard', area: 'chest' },
  ];

  const startRecording = async () => {
    try {
      setRecordingError(null);
      recognizedTextRef.current = '';
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const recognitionWindow = window as SpeechRecognitionWindow;
      const SpeechRecognition = recognitionWindow.SpeechRecognition || recognitionWindow.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'ml-IN';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event) => {
            let finalText = '';
            let interimText = '';
            for (let i = 0; i < event.results.length; i += 1) {
              const result = event.results[i];
              if (result.isFinal) {
                finalText += result[0].transcript;
              } else {
                interimText += result[0].transcript;
              }
            }
            recognizedTextRef.current = finalText;
            setTranscript(`${finalText}${interimText}`.trim());
          };
          recognition.onerror = () => {
            // Non-fatal: backend will transcribe via Sarvam STT
          };
          speechRecognitionRef.current = recognition;
          recognition.start();
        } catch (e) {
          console.warn('[VoiceDialog] Browser SpeechRecognition optional preview unavailable, will use Sarvam AI audio upload.');
        }
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const recognizedText = recognizedTextRef.current.trim();
        try {
          const res = await apiClient.transcribeAudio(audioBlob, 'ml', recognizedText || undefined);
          setTranscript(res.text);
          if (res.extracted_symptoms) {
            setPainScore(res.extracted_symptoms.suggested_pain_score);
            setDifficulty(res.extracted_symptoms.suggested_difficulty || 'moderate');
            setBodyArea(res.extracted_symptoms.body_area || '');
          }
          setHasExtracted(true);
          const spokenAcknowledgement = 'നിങ്ങളുടെ മറുപടി രേഖപ്പെടുത്തി. ദയവായി വിവരങ്ങൾ പരിശോധിക്കുക.';
          setVoiceStatus('ശബ്ദം കേൾക്കുന്നു...');
          speakMalayalam(spokenAcknowledgement);
        } catch (err: any) {
          console.error(err);
          setRecordingError(err.message || 'Speech could not be transcribed. Please try again.');
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.warn('Microphone permission not granted or unavailable, please use sample phrase or text input.');
      setRecordingError('Microphone access was not granted. Please allow microphone access or select a test phrase.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      speechRecognitionRef.current?.stop();
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    }
  };

  const selectSamplePhrase = (phrase: typeof samplePhrases[0]) => {
    setTranscript(phrase.text);
    setPainScore(phrase.pain);
    setDifficulty(phrase.diff);
    setBodyArea(phrase.area);
    setHasExtracted(true);
    setVoiceStatus(`തിരഞ്ഞെടുത്തു: ${phrase.text}`);
    speakMalayalam(`നിങ്ങൾ തിരഞ്ഞെടുത്തത്: ${phrase.text}`);
  };

  const replayTranscript = () => {
    if (!transcript) return;
    setVoiceStatus('ശബ്ദം കേൾക്കുന്നു...');
    speakMalayalam(`നിങ്ങൾ പറഞ്ഞത്: ${transcript}`);
  };

  const handleSubmit = async () => {
    const payload: SymptomReportPayload = {
      transcript: transcript || 'No verbal transcript provided',
      pain_score: painScore,
      difficulty,
      body_area: bodyArea,
      patient_confirmed: true, // Explicitly confirmed by user in UI
      language: 'ml',
    };

    try {
      await apiClient.submitSymptoms(sessionId, payload);

      // Play synthesized Malayalam speech guidance
      const isWorsening = (painScore ?? 0) >= 6 || (transcript && transcript.includes('കൂടുന്നു'));
      const replyText = isWorsening
        ? 'വേദന കൂടുന്നതായി കാണുന്നു. വ്യായാമം താൽക്കാലികമായി നിർത്തി വിശ്രമിക്കുക, ഫിസിയോതെറാപ്പിസ്റ്റിനെ അറിയിക്കുക.'
        : 'വിവരങ്ങൾ രേഖപ്പെടുത്തി. സാവധാനം വ്യായാമം തുടരുക.';
      setVoiceFeedbackText(replyText);
      speakMalayalam(replyText);

      onSymptomSubmitted(payload);
    } catch (err) {
      console.error('Error submitting symptom report:', err);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1rem',
    }}>
      <div className="card" style={{ maxWidth: '580px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              Malayalam Voice & Symptom Check
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
              ശാരീരിക ബുദ്ധിമുട്ടുകളോ വേദനയോ രേഖപ്പെടുത്തുക
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Voice Recording Controls */}
        <div style={{
          background: isRecording ? '#fee2e2' : '#f0f9ff',
          border: `1px solid ${isRecording ? '#fca5a5' : '#bae6fd'}`,
          borderRadius: '10px',
          padding: '1.25rem',
          textAlign: 'center',
          marginBottom: '1.25rem',
        }}>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
            style={{ borderRadius: '50px', padding: '0.75rem 1.5rem', margin: '0 auto 0.75rem' }}
          >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            {isRecording ? 'Stop Recording' : 'Record Voice in Malayalam'}
          </button>
          <p style={{ fontSize: '0.85rem', color: isRecording ? '#991b1b' : '#0369a1', margin: 0 }}>
            {isRecording
              ? '🔴 Recording audio... Speak naturally in Malayalam.'
              : isProcessing
              ? 'Analyzing speech with conservative symptom extraction...'
              : 'Tap to speak your symptom, or select a test phrase below.'}
          </p>
          {recordingError && (
            <p style={{ color: '#b91c1c', fontSize: '0.8rem', margin: '0.5rem 0 0' }} role="alert">
              {recordingError}
            </p>
          )}
          {voiceStatus && (
            <p style={{ color: '#0369a1', fontSize: '0.8rem', margin: '0.5rem 0 0', fontWeight: 600 }} role="status">
              🔊 {voiceStatus}
            </p>
          )}
        </div>

        {/* Quick Sample Phrases for Demo */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
            Quick Malayalam Test Phrases (click a speaker button to hear the phrase):
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {samplePhrases.map((phrase, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  className="btn btn-outline"
                  style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left', fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                  onClick={() => selectSamplePhrase(phrase)}
                >
                  {phrase.label}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '0.4rem 0.6rem' }}
                  title="Play audio in Malayalam"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectSamplePhrase(phrase);
                    speakMalayalam(phrase.text);
                  }}
                >
                  <Volume2 size={16} color="#0284c7" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Extracted Symptom Confirmation Fields */}
        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Edit3 size={16} color="#0284c7" />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Extracted Symptom Review (Patient Confirmation)</span>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Transcribed Malayalam Text:
            </label>
            <input
              type="text"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="e.g. കൈ ഉയർത്തുമ്പോൾ വേദന തോന്നുന്നു"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.9rem' }}
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={replayTranscript}
              disabled={!transcript}
              style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.35rem 0.6rem', gap: '0.3rem' }}
            >
              <Volume2 size={14} color="#0284c7" /> Play Malayalam Audio
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Pain Score (0 - 10 VAS): <strong>{painScore !== null ? painScore : 'Not inferred'}</strong>
              </label>
              <select
                value={painScore === null ? '' : painScore}
                onChange={(e) => setPainScore(e.target.value === '' ? null : Number(e.target.value))}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.88rem' }}
              >
                <option value="">Select a confirmed score</option>
                {Array.from({ length: 11 }, (_, score) => (
                  <option key={score} value={score}>{score}</option>
                ))}
              </select>
              {painScore === null && (
                <small style={{ color: 'var(--text-muted)' }}>
                  Pain was detected, but its intensity was unclear. Set a score only after confirming it with the patient.
                </small>
              )}
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Difficulty Level:
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.88rem' }}
              >
                <option value="easy">Easy (ലളിതം)</option>
                <option value="moderate">Moderate (മിതമായത്)</option>
                <option value="hard">Hard (ബുദ്ധിമുട്ടുള്ളത്)</option>
                <option value="very_hard">Very Hard (കടുത്തത്)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Reported Body Area:
            </label>
            <input
              type="text"
              value={bodyArea}
              onChange={(e) => setBodyArea(e.target.value)}
              placeholder="e.g. shoulder, knee, back"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        {/* Malayalam Voice Feedback Display */}
        {voiceFeedbackText && (
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Volume2 size={20} color="#059669" />
            <div style={{ fontSize: '0.85rem', color: '#065f46' }}>
              <strong>AI Spoken Response:</strong> {voiceFeedbackText}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!transcript && painScore === null}>
            <Check size={16} /> Confirm & Save Report
          </button>
        </div>
      </div>
    </div>
  );
}

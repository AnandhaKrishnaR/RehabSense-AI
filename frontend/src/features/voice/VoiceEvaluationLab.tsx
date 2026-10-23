import React, { useState, useEffect } from 'react';
import { Volume2, Play, Pause, RotateCcw, CheckCircle, AlertCircle, Star } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import {
  VoiceLanguageCode,
  TTSVoiceOption,
  VoiceEvaluationEntry,
  VoiceEvaluationResponse,
} from '../../types/api';

export function VoiceEvaluationLab() {
  const [speechLanguage, setSpeechLanguage] = useState<VoiceLanguageCode>('ml-IN');
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [customText, setCustomText] = useState<string>('');

  const [sarvamVoice, setSarvamVoice] = useState<string>('shubh');
  const [sarvamVoices, setSarvamVoices] = useState<TTSVoiceOption[]>([]);
  const [sarvamAudio, setSarvamAudio] = useState<HTMLAudioElement | null>(null);
  const [sarvamLoading, setSarvamLoading] = useState(false);
  const [sarvamPlaying, setSarvamPlaying] = useState(false);

  // Evaluation presets & history
  const [presetsData, setPresetsData] = useState<VoiceEvaluationResponse | null>(null);
  const [evaluations, setEvaluations] = useState<VoiceEvaluationEntry[]>([]);

  // Scoring rubric form (1-5)
  const [scores, setScores] = useState({
    pronunciation_score: 5,
    naturalness_score: 4,
    clarity_score: 5,
    medical_terms_score: 5,
    overall_score: 5,
  });
  const [notes, setNotes] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Fetch presets and recorded evaluations
  useEffect(() => {
    apiClient.getVoiceEvaluationData().then((res) => {
      setPresetsData(res);
      if (res.evaluations) {
        setEvaluations(res.evaluations);
      }
    });
  }, []);

  // Fetch Sarvam voices
  useEffect(() => {
    apiClient.getTTSVoiceOptions('sarvam', speechLanguage)
      .then((res) => {
        setSarvamVoices(res.voices);
        if (res.voices.length > 0 && !res.voices.some((v) => v.id === sarvamVoice)) {
          setSarvamVoice(res.voices[0].id);
        }
      })
      .catch(() => {});
  }, [speechLanguage]);

  // Active sentence
  const currentPresets = presetsData?.presets[speechLanguage] || [];
  const activeSentence = customText.trim() ? customText.trim() : (currentPresets[selectedPresetIndex] || '');

  // Helper to play base64 audio
  const playAudioBase64 = (
    base64Data: string,
    mimeType: string,
    onPlayState: (playing: boolean) => void,
    onAudioCreated: (audio: HTMLAudioElement) => void,
  ) => {
    const audioUrl = `data:${mimeType};base64,${base64Data}`;
    const audio = new Audio(audioUrl);
    audio.onplay = () => onPlayState(true);
    audio.onended = () => onPlayState(false);
    audio.onerror = () => {
      onPlayState(false);
      setStatusMessage('Audio playback encountered a browser decoding error.');
    };
    onAudioCreated(audio);
    audio.play().catch(() => onPlayState(false));
  };

  // Generate Sarvam audio
  const handleSarvamGenerate = async () => {
    if (!activeSentence) return;
    setSarvamLoading(true);
    setStatusMessage('');
    try {
      if (sarvamAudio) sarvamAudio.pause();
      const res = await apiClient.speakText(activeSentence, speechLanguage, {
        provider: 'sarvam',
        voice: sarvamVoice,
        textLanguage: speechLanguage,
      });
      if (res.audio_base64) {
        playAudioBase64(res.audio_base64, res.mime_type || 'audio/wav', setSarvamPlaying, setSarvamAudio);
      }
    } catch (err: any) {
      setStatusMessage(`Sarvam: ${err.message || 'Failed to generate audio.'}`);
    } finally {
      setSarvamLoading(false);
    }
  };

  // Submit manual evaluation
  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry: VoiceEvaluationEntry = {
      provider: 'sarvam',
      speech_language: speechLanguage,
      voice: sarvamVoice,
      sentence: activeSentence,
      pronunciation_score: scores.pronunciation_score,
      naturalness_score: scores.naturalness_score,
      clarity_score: scores.clarity_score,
      medical_terms_score: scores.medical_terms_score,
      overall_score: scores.overall_score,
      notes,
    };
    try {
      const saved = await apiClient.submitVoiceEvaluation(entry);
      setEvaluations((prev) => [saved, ...prev]);
      setSubmitSuccess(true);
      setNotes('');
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err: any) {
      setStatusMessage(`Evaluation submission failed: ${err.message}`);
    }
  };

  return (
    <div className="container" style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Title Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Volume2 color="#0284c7" /> AI Voice Quality Evaluation & Testing Lab
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
            Listen to and clinically rate Malayalam and Indian English speech generated by Sarvam AI Bulbul v3.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '8px', color: '#991b1b', marginBottom: '1rem', fontSize: '0.85rem' }}>
          ⚠️ {statusMessage}
        </div>
      )}

      {/* Language & Presets Selector */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Evaluation Language:</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn ${speechLanguage === 'ml-IN' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.85rem', padding: '0.35rem 0.85rem' }}
              onClick={() => { setSpeechLanguage('ml-IN'); setSelectedPresetIndex(0); }}
            >
              മലയാളം (ml-IN)
            </button>
            <button
              className={`btn ${speechLanguage === 'en-IN' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.85rem', padding: '0.35rem 0.85rem' }}
              onClick={() => { setSpeechLanguage('en-IN'); setSelectedPresetIndex(0); }}
            >
              English (India en-IN)
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Select Standard Clinical Benchmark Sentence (1 of 8):
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.5rem' }}>
            {currentPresets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                className={`btn ${selectedPresetIndex === idx && !customText.trim() ? 'btn-primary' : 'btn-outline'}`}
                style={{
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  padding: '0.5rem 0.75rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                }}
                onClick={() => {
                  setSelectedPresetIndex(idx);
                  setCustomText('');
                }}
                title={preset}
              >
                #{idx + 1}. {preset}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            Or Enter Custom Sentence:
          </label>
          <input
            type="text"
            className="input"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Type any Malayalam or English physiotherapy instruction to test..."
            style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid var(--border)' }}
          />
        </div>

        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' }}>
          <strong style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Target Spoken Text:</strong>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', marginTop: '0.25rem' }}>
            "{activeSentence}"
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', borderTop: '4px solid #0d9488' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700, color: '#0d9488' }}>
            Sarvam AI TTS
          </h3>
          <span className="badge badge-success">bulbul:v3</span>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Regional speech synthesis for Malayalam and Indian English.
        </p>
        <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
          Sarvam Speaker:
        </label>
        <select
          value={sarvamVoice}
          onChange={(e) => setSarvamVoice(e.target.value)}
          style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1rem' }}
        >
          {sarvamVoices.map((voice) => (
            <option key={voice.id} value={voice.id}>{voice.label}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleSarvamGenerate}
            disabled={sarvamLoading || !activeSentence}
            style={{ flex: 1, padding: '0.5rem', background: '#0d9488', borderColor: '#0d9488' }}
          >
            {sarvamLoading ? 'Synthesizing...' : sarvamPlaying ? <><Pause size={16} /> Playing</> : <><Play size={16} /> Listen to Sarvam</>}
          </button>
          {sarvamAudio && (
            <button
              className="btn btn-outline"
              onClick={() => { sarvamAudio.currentTime = 0; sarvamAudio.play(); }}
              title="Replay"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Clinician & Developer Evaluation Form */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: '#fafafa' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Star color="#eab308" /> Manual Voice Quality Evaluation Form
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Evaluate the spoken audio you just heard using the standardized 1–5 scoring rubric. Scores are recorded for audit and clinical review.
        </p>

        <form onSubmit={handleSubmitEvaluation}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 1rem' }}>
            Rating provider: Sarvam AI ({sarvamVoice})
          </p>

          {/* 5-Criteria Rubric */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            {[
              { key: 'pronunciation_score', label: 'Pronunciation', desc: 'Accurate phonetics, correct vowels/consonants' },
              { key: 'naturalness_score', label: 'Naturalness', desc: 'Fluency, rhythm, unhurried physiotherapy cadence' },
              { key: 'clarity_score', label: 'Clarity', desc: 'Intelligibility, no clipping or distortion' },
              { key: 'medical_terms_score', label: 'Medical Terms', desc: 'Accurate anatomy, joints, and repetition numbers' },
              { key: 'overall_score', label: 'Overall Quality', desc: 'Patient accessibility and clinic readiness' },
            ].map((criterion) => (
              <div key={criterion.key} style={{ background: '#ffffff', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.2rem' }}>
                  {criterion.label}
                </label>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem', minHeight: '2rem' }}>
                  {criterion.desc}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {[1, 2, 3, 4, 5].map((val) => (
                    <label key={val} style={{ fontSize: '0.82rem', textAlign: 'center', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={criterion.key}
                        value={val}
                        checked={(scores as any)[criterion.key] === val}
                        onChange={() => setScores({ ...scores, [criterion.key]: val })}
                        style={{ display: 'block', margin: '0 auto 0.2rem' }}
                      />
                      {val}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Evaluator Clinical Observations / Notes:
            </label>
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Natural Kerala inflection; clean pauses at commas; correctly enunciated 'shoulder' and Malayalam numbers."
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1.5rem' }}>
              <CheckCircle size={16} /> Save Clinical Evaluation
            </button>
            {submitSuccess && (
              <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.85rem' }}>
                ✓ Evaluation recorded successfully!
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Historical Evaluations Table */}
      {evaluations.length > 0 && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.75rem' }}>
            Recorded Voice Evaluations ({evaluations.length})
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Provider</th>
                  <th style={{ padding: '0.5rem' }}>Lang</th>
                  <th style={{ padding: '0.5rem' }}>Voice</th>
                  <th style={{ padding: '0.5rem' }}>Sentence</th>
                  <th style={{ padding: '0.5rem' }}>Pron</th>
                  <th style={{ padding: '0.5rem' }}>Nat</th>
                  <th style={{ padding: '0.5rem' }}>Clar</th>
                  <th style={{ padding: '0.5rem' }}>Med</th>
                  <th style={{ padding: '0.5rem' }}>Overall</th>
                  <th style={{ padding: '0.5rem' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{ev.provider}</td>
                    <td style={{ padding: '0.5rem' }}>{ev.speech_language}</td>
                    <td style={{ padding: '0.5rem' }}>{ev.voice}</td>
                    <td style={{ padding: '0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ev.sentence}>
                      {ev.sentence}
                    </td>
                    <td style={{ padding: '0.5rem' }}>{ev.pronunciation_score}/5</td>
                    <td style={{ padding: '0.5rem' }}>{ev.naturalness_score}/5</td>
                    <td style={{ padding: '0.5rem' }}>{ev.clarity_score}/5</td>
                    <td style={{ padding: '0.5rem' }}>{ev.medical_terms_score}/5</td>
                    <td style={{ padding: '0.5rem', fontWeight: 700, color: '#0284c7' }}>{ev.overall_score}/5</td>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{ev.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { apiClient, DEMO_EXERCISES } from '../../services/apiClient';
import { ExerciseDefinition, SessionRecord, SymptomReportPayload, SafetyEvaluationResponse, VoiceTemplate } from '../../types/api';
import { CanonicalExerciseId, MovementResult } from '../../types/vision';
import { PhysiotherapyAvatar } from '../avatar/PhysiotherapyAvatar';
import { usePoseLandmarker } from '../movement/usePoseLandmarker';
import { MalayalamVoiceDialog } from '../voice/MalayalamVoiceDialog';
import { VoiceSettingsPanel } from '../voice/VoiceSettingsPanel';
import {
  getMovementCoachMessage,
  MOVEMENT_COACH_MESSAGES,
  movementResultHasChanged,
  speakMalayalam,
} from '../voice/movementVoiceCoach';
import {
  Play,
  Pause,
  Square,
  Mic,
  AlertTriangle,
  CheckCircle,
  Video,
  VideoOff,
  RefreshCw,
  Info,
  ShieldCheck,
  Volume2,
} from 'lucide-react';

export function ExerciseSessionView() {
  const [exercises, setExercises] = useState<ExerciseDefinition[]>(DEMO_EXERCISES);
  const [selectedExerciseId, setSelectedExerciseId] = useState<CanonicalExerciseId>('bodyweight_squat');
  const [currentSession, setCurrentSession] = useState<SessionRecord | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [repetitions, setRepetitions] = useState(0);
  const [targetReps, setTargetReps] = useState(10);
  const [movementResult, setMovementResult] = useState<MovementResult | null>(null);
  const [safetyAlert, setSafetyAlert] = useState<SafetyEvaluationResponse | null>(null);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<any | null>(null);
  const [voiceTemplates, setVoiceTemplates] = useState<Record<string, VoiceTemplate>>({});
  const [voicePlaybackError, setVoicePlaybackError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const measurementThrottleRef = useRef<number>(0);
  const previousMovementResultRef = useRef<MovementResult | null>(null);
  const lastCoachMessageAtRef = useRef(0);

  // Fetch exercises from API
  useEffect(() => {
    apiClient.getExercises().then((list) => {
      if (list && list.length > 0) {
        setExercises(list);
      }
    });
    apiClient.getVoiceTemplates().then((response) => {
      if (response?.templates) setVoiceTemplates(response.templates);
    });
  }, []);

  useEffect(() => {
    const handlePlaybackError = () => setVoicePlaybackError(true);
    window.addEventListener('rehabsense-voice-playback-error', handlePlaybackError);
    return () => window.removeEventListener('rehabsense-voice-playback-error', handlePlaybackError);
  }, []);

  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId) || exercises[0];

  // Callback for pose landmarker stream
  const handleMovementResult = (result: MovementResult) => {
    const previousResult = previousMovementResultRef.current;
    setMovementResult(result);
    setRepetitions(result.repetitions);
    if (previousResult && movementResultHasChanged(result, previousResult)) {
      const message = getMovementCoachMessage(
        result.exercise,
        result.current_phase,
        result.repetitions,
        previousResult.current_phase,
        previousResult.repetitions,
        result.measurement_reliable,
        result.movement_checks,
        voiceTemplates,
      );
      const now = Date.now();
      if (message && now - lastCoachMessageAtRef.current >= 1500) {
        speakMalayalam(message);
        lastCoachMessageAtRef.current = now;
      }
    }
    previousMovementResultRef.current = result;

    // Periodically sync measurements with backend (every 2.5 seconds or on rep completion)
    const now = Date.now();
    if (currentSession && sessionActive && !sessionPaused) {
      if (now - measurementThrottleRef.current > 2500 || result.current_phase === 'completed') {
        measurementThrottleRef.current = now;
        apiClient.submitMeasurement(currentSession.id, result);
      }
    }
  };

  const {
    isModelLoading,
    cameraActive,
    isSimulated,
    startCamera,
    stopCamera,
    setSimulationMode,
  } = usePoseLandmarker({
    exerciseId: selectedExerciseId,
    onMovementResult: handleMovementResult,
    enabled: sessionActive && !sessionPaused,
  });

  // Start new exercise session
  const startSession = async () => {
    setVoicePlaybackError(false);
    // Speak start instructions aloud in Malayalam voice immediately
    const startTemplateKey = selectedExerciseId === 'bodyweight_squat' ? 'squat_start' : 'shoulder_start';
    speakMalayalam(voiceTemplates[startTemplateKey]?.text || MOVEMENT_COACH_MESSAGES[selectedExerciseId].start);

    try {
      const sess = await apiClient.createSession({
        exercise_id: selectedExerciseId,
        target_reps: targetReps,
      });
      setCurrentSession(sess);
      setSessionActive(true);
      setSessionPaused(false);
      setRepetitions(0);
      setSafetyAlert(null);
      setSessionSummary(null);
      previousMovementResultRef.current = null;
      lastCoachMessageAtRef.current = 0;

      // Start webcam if video element exists
      if (videoRef.current) {
        startCamera(videoRef.current);
      }
    } catch (err: any) {
      console.error('Failed to create session:', err);
    }
  };

  // Pause / Resume session
  const togglePause = () => {
    setSessionPaused(!sessionPaused);
  };

  // End exercise session
  const endSession = async () => {
    setSessionActive(false);
    stopCamera();

    const summary = {
      exerciseName: selectedExercise.name,
      completedReps: repetitions,
      targetReps,
      completionRate: Math.round((repetitions / targetReps) * 100),
      reviewRequired: !!safetyAlert?.review_required,
      endedAt: new Date().toLocaleTimeString(),
    };
    setSessionSummary(summary);
  };

  const handleSymptomSubmitted = (symptom: SymptomReportPayload) => {
    setShowVoiceDialog(false);

    // Evaluate safety with reported pain score and symptoms
    if (currentSession) {
      const isWorsening = Boolean((symptom.pain_score ?? 0) >= 6 || (symptom.transcript && symptom.transcript.includes('കൂടുന്നു')));
      apiClient.evaluateSafety({
        session_id: currentSession.id,
        pain_score: symptom.pain_score,
        worsening_pain: isWorsening,
        reported_symptoms: [symptom.difficulty, symptom.transcript],
      }).then((evaluation) => {
        if (evaluation.review_required) {
          setSafetyAlert(evaluation);
          setSessionPaused(true);
          // Speak pause-and-rest guidance aloud in Malayalam
          const safetyVoiceMsg = voiceTemplates.safety_pause_pain?.text
            || 'വ്യായാമം താൽക്കാലികമായി നിർത്തുക. നിങ്ങളുടെ ഫിസിയോതെറാപ്പിസ്റ്റ് പറഞ്ഞതുപോലെ ചെയ്യുക.';
          speakMalayalam(safetyVoiceMsg);
        }
      });
    }
  };

  return (
    <div>
      {voicePlaybackError && (
        <div role="alert" style={{ marginBottom: '0.75rem', color: '#991b1b' }}>
          Malayalam audio could not be played. Check Sarvam connectivity or an available browser Malayalam voice.
        </div>
      )}
      {/* Exercise Selection Header */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Prescribed Movement Track
          </span>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem' }}>
            {exercises.map((ex) => (
              <button
                key={ex.id}
                onClick={() => {
                  if (!sessionActive) setSelectedExerciseId(ex.id);
                }}
                disabled={sessionActive}
                className={`btn ${selectedExerciseId === ex.id ? 'btn-primary' : 'btn-outline'}`}
                style={{ fontSize: '0.9rem' }}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>

        {/* Session Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {!sessionActive ? (
            <button className="btn btn-primary" onClick={startSession} style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}>
              <Play size={18} /> Start Session
            </button>
          ) : (
            <>
              <button className="btn btn-outline" onClick={togglePause}>
                {sessionPaused ? <Play size={18} /> : <Pause size={18} />}
                {sessionPaused ? 'Resume' : 'Pause'}
              </button>
              <button className="btn btn-danger" onClick={endSession}>
                <Square size={18} /> End Session
              </button>
            </>
          )}

          <button
            className="btn btn-outline"
            onClick={() => setShowVoiceDialog(true)}
            style={{ borderColor: '#0284c7', color: '#0284c7' }}
          >
            <Mic size={18} /> Malayalam Voice / Pain Check
          </button>
        </div>
      </div>

      {selectedExercise && (
        <VoiceSettingsPanel
          englishText={selectedExercise.instructions_en}
          malayalamText={selectedExercise.instructions_ml}
        />
      )}

      {/* Safety Alert Banner */}
      {safetyAlert && safetyAlert.review_required && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #f87171',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <AlertTriangle size={28} color="#ef4444" />
          <div style={{ flex: 1, minWidth: '220px' }}>
            <h4 style={{ color: '#991b1b', margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
              Physiotherapist Review Flagged (സുരക്ഷാ മുന്നറിയിപ്പ്)
            </h4>
            <p style={{ color: '#7f1d1d', margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
              {safetyAlert.feedback[0] || 'വേദന കൂടുന്നതായി കാണുന്നു. വ്യായാമം താൽക്കാലികമായി നിർത്തി വിശ്രമിക്കുക.'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            onClick={() => speakMalayalam(voiceTemplates.safety_pause_pain?.text
              || 'വ്യായാമം താൽക്കാലികമായി നിർത്തുക. നിങ്ങളുടെ ഫിസിയോതെറാപ്പിസ്റ്റ് പറഞ്ഞതുപോലെ ചെയ്യുക.')}
          >
            <Volume2 size={16} /> Listen to Audio
          </button>
          <span className="badge badge-danger">Review Required</span>
        </div>
      )}

      {/* Main Dual-Column Exercise Area */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Left Column: 3D Physiotherapy Avatar Guidance */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
              3D Form Demonstration
            </h3>
            <span className="badge badge-info">Biomechanical Guide</span>
          </div>

          <div style={{ flex: 1, minHeight: '380px' }}>
            <PhysiotherapyAvatar
              exerciseId={selectedExerciseId}
              liveAngles={movementResult?.joint_angles}
              height={380}
            />
          </div>

          {/* Bilingual Instructions Box */}
          <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0369a1', fontSize: '0.82rem', fontWeight: 600 }}>
                <Info size={14} /> Clinical Movement Tips:
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                onClick={() => speakMalayalam(selectedExercise.instructions_ml)}
                title="Listen to Malayalam Instructions"
              >
                <Volume2 size={13} color="#0284c7" /> Listen to Audio
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', margin: '0 0 0.4rem', color: 'var(--text-main)' }}>
              <strong>English:</strong> {selectedExercise.instructions_en}
            </p>
            <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-muted)' }}>
              <strong>മലയാളം:</strong> {selectedExercise.instructions_ml}
            </p>
          </div>
        </div>

        {/* Right Column: Real-Time Webcam & Movement Analysis */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                Live Movement Analysis
              </h3>
              {isSimulated && (
                <span className="badge badge-warning" title="Running kinematic demonstration mode">
                  Demo Kinematics
                </span>
              )}
            </div>

            {/* Landmark Reliability Badge */}
            <span className={`badge ${movementResult?.measurement_reliable !== false ? 'badge-success' : 'badge-danger'}`}>
              {movementResult?.measurement_reliable !== false ? 'Landmarks Reliable' : 'Low Visibility'}
            </span>
          </div>

          {/* Video / Pose Canvas Viewport */}
          <div style={{
            flex: 1,
            minHeight: '380px',
            position: 'relative',
            background: '#0f172a',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)', // Mirror view
                display: cameraActive && !isSimulated ? 'block' : 'none',
              }}
            />

            {/* Simulated / Fallback Kinematic Overlay when camera is simulated */}
            {(!cameraActive || isSimulated) && (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>
                <Video size={48} color="#0284c7" style={{ margin: '0 auto 1rem' }} />
                <h4 style={{ color: '#f8fafc', margin: '0 0 0.5rem' }}>
                  {sessionActive ? 'Pose Landmarker Active' : 'Webcam Standby'}
                </h4>
                <p style={{ fontSize: '0.85rem', maxWidth: '340px', margin: '0 auto' }}>
                  {sessionActive
                    ? 'Processing joint landmarks and repetition state transitions in real time.'
                    : 'Click "Start Session" to activate camera pose tracking.'}
                </p>
              </div>
            )}

            {/* Repetition and Joint Angle Overlay HUD */}
            {sessionActive && (
              <div style={{
                position: 'absolute',
                top: 12,
                left: 12,
                right: 12,
                display: 'flex',
                justifyContent: 'space-between',
                pointerEvents: 'none',
              }}>
                {/* Rep Counter Box */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(6px)',
                  color: '#ffffff',
                  padding: '0.65rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                    Repetitions
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8' }}>
                    {repetitions} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>/ {targetReps}</span>
                  </div>
                </div>

                {/* Primary Joint Angle Box */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(6px)',
                  color: '#ffffff',
                  padding: '0.65rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  textAlign: 'right',
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                    {selectedExerciseId === 'bodyweight_squat' ? 'Knee Angle' : 'Shoulder Flexion'}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#4ade80' }}>
                    {selectedExerciseId === 'bodyweight_squat'
                      ? `${movementResult?.joint_angles?.left_knee ?? '--'}°`
                      : `${movementResult?.joint_angles?.left_shoulder ?? '--'}°`}
                  </div>
                </div>
              </div>
            )}

            {/* Movement Phase Indicator */}
            {sessionActive && movementResult?.current_phase && (
              <div style={{
                position: 'absolute',
                bottom: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#f8fafc',
                padding: '0.35rem 0.85rem',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                border: '1px solid rgba(255,255,255,0.2)',
              }}>
                Phase: {movementResult.current_phase}
              </div>
            )}
          </div>

          {/* Quick Guidance Metrics Below Viewport */}
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>Target Depth: {selectedExerciseId === 'bodyweight_squat' ? '≤ 100° Knee' : '≥ 120° Shoulder'}</span>
            <span>Reliability Threshold: 65% Visibility</span>
          </div>
        </div>
      </div>

      {/* Session Completion Modal */}
      {sessionSummary && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem',
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '2rem' }}>
            <CheckCircle size={56} color="#10b981" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Session Completed!
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Great effort! Your exercise tracking data has been recorded for physiotherapist review.
            </p>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', textAlign: 'left', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Exercise:</span>
                <strong>{sessionSummary.exerciseName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Repetitions Completed:</span>
                <strong>{sessionSummary.completedReps} / {sessionSummary.targetReps}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Completion Rate:</span>
                <strong>{sessionSummary.completionRate}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Clinician Review Status:</span>
                <span className={`badge ${sessionSummary.reviewRequired ? 'badge-warning' : 'badge-success'}`}>
                  {sessionSummary.reviewRequired ? 'Flagged for Review' : 'Normal'}
                </span>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setSessionSummary(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Malayalam Voice & Symptom Dialog */}
      {showVoiceDialog && currentSession && (
        <MalayalamVoiceDialog
          sessionId={currentSession.id}
          onSymptomSubmitted={handleSymptomSubmitted}
          onClose={() => setShowVoiceDialog(false)}
        />
      )}
    </div>
  );
}

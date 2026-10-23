import {
  HealthResponse,
  ExerciseDefinition,
  TherapyPlan,
  SessionRecord,
  CreateSessionPayload,
  SymptomReportPayload,
  SymptomRecord,
  SafetyEvaluationRequest,
  SafetyEvaluationResponse,
  ClinicianReviewItem,
  ResolveReviewPayload,
  VoiceTranscriptionResponse,
  VoiceSpeakResponse,
  ProgressSummaryResponse,
} from '../types/api';
import { MovementResult, CanonicalExerciseId } from '../types/vision';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

// Default synthetic exercises for fallback and demo mode
export const DEMO_EXERCISES: ExerciseDefinition[] = [
  {
    id: 'bodyweight_squat',
    name: 'Bodyweight Squat',
    target_joints: ['left_knee', 'right_knee', 'left_hip', 'right_hip'],
    description: 'Stand with feet shoulder-width apart, lower hips until knees bend toward 90-100 degrees, then return to standing.',
    instructions_en: 'Keep your chest tall, knees tracking over your toes, and lower smoothly.',
    instructions_ml: 'നെഞ്ച് നേരെ വയ്ക്കുക, കാൽമുട്ടുകൾ വളച്ച് പതുക്കെ താഴേക്ക് ഇരിക്കുക, തുടർന്ന് നിവർന്നു നിൽക്കുക.',
    default_target_reps: 10,
    demo_parameters: {
      inflection_knee_angle: 100.0,
      standing_knee_angle: 160.0,
    },
  },
  {
    id: 'shoulder_flexion',
    name: 'Shoulder Flexion (Arm Raise)',
    target_joints: ['left_shoulder', 'right_shoulder'],
    description: 'Raise your arm forward and upward in front of your body within a comfortable pain-free range.',
    instructions_en: 'Keep your arm straight without arching your lower back. Lower smoothly.',
    instructions_ml: 'കൈ നേരെ മുന്നിലേക്ക് സാവധാനം ഉയർത്തുക. വേദനയുള്ള പരിധിക്കപ്പുറം ഉയർത്തരുത്.',
    default_target_reps: 8,
    demo_parameters: {
      peak_shoulder_angle: 120.0,
      resting_shoulder_angle: 30.0,
    },
  },
];

class ApiClient {
  private baseUrl: string;
  private demoMode: boolean;

  constructor() {
    this.baseUrl = API_BASE_URL;
    this.demoMode = (import.meta as any).env?.VITE_DEMO_MODE === 'true';
  }

  public setDemoMode(enabled: boolean) {
    this.demoMode = enabled;
  }

  public isDemoMode(): boolean {
    return this.demoMode;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || errorBody.error || `HTTP error ${response.status}`);
      }
      return await response.json();
    } catch (err: any) {
      if (this.demoMode) {
        console.warn(`[RehabSense API] Network call to ${endpoint} failed, using demo fallback:`, err.message);
        return this.getMockResponse<T>(endpoint, options);
      }
      throw err;
    }
  }

  public async getHealth(): Promise<HealthResponse> {
    try {
      return await this.request<HealthResponse>('/health/');
    } catch (err) {
      return {
        status: 'healthy (demo fallback)',
        version: '1.0.0',
        demo_mode: true,
        voice_provider: 'mock',
        database: 'demo-local',
      };
    }
  }

  public async getExercises(): Promise<ExerciseDefinition[]> {
    try {
      return await this.request<ExerciseDefinition[]>('/exercises/');
    } catch (err) {
      return DEMO_EXERCISES;
    }
  }

  public async getExercise(id: CanonicalExerciseId): Promise<ExerciseDefinition> {
    try {
      return await this.request<ExerciseDefinition>(`/exercises/${id}/`);
    } catch (err) {
      const found = DEMO_EXERCISES.find((e) => e.id === id);
      if (!found) throw new Error(`Exercise ${id} not found`);
      return found;
    }
  }

  public async createSession(payload: CreateSessionPayload): Promise<SessionRecord> {
    try {
      return await this.request<SessionRecord>('/sessions/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return {
        id: `demo-session-${Date.now()}`,
        exercise: payload.exercise_id,
        exercise_name: DEMO_EXERCISES.find((e) => e.id === payload.exercise_id)?.name,
        therapy_plan: payload.therapy_plan_id || null,
        status: 'in_progress',
        target_reps: payload.target_reps || 10,
        completed_reps: 0,
        started_at: new Date().toISOString(),
        ended_at: null,
        review_required: false,
      };
    }
  }

  public async submitMeasurement(sessionId: string, measurement: MovementResult): Promise<any> {
    try {
      return await this.request(`/sessions/${sessionId}/measurements/`, {
        method: 'POST',
        body: JSON.stringify(measurement),
      });
    } catch (err) {
      return { stored: true, demo: true, id: `demo-m-${Date.now()}` };
    }
  }

  public async submitSymptoms(sessionId: string, symptom: SymptomReportPayload): Promise<SymptomRecord> {
    try {
      return await this.request<SymptomRecord>(`/sessions/${sessionId}/symptoms/`, {
        method: 'POST',
        body: JSON.stringify(symptom),
      });
    } catch (err) {
      return {
        ...symptom,
        id: `demo-sym-${Date.now()}`,
        session_id: sessionId,
        reported_at: new Date().toISOString(),
      };
    }
  }

  public async evaluateSafety(payload: SafetyEvaluationRequest): Promise<SafetyEvaluationResponse> {
    try {
      return await this.request<SafetyEvaluationResponse>('/safety/evaluate/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Deterministic demo fallback
      const painHigh = (payload.pain_score || 0) >= 7;
      const worsening = !!payload.worsening_pain;
      const reviewReq = painHigh || worsening;
      return {
        review_required: reviewReq,
        reasons: reviewReq ? (painHigh ? ['high_pain_score'] : ['patient_reported_increasing_pain']) : [],
        measurement_reliable: true,
        feedback: reviewReq
          ? ['Pause the exercise and follow your clinician guidance.', 'Please rest and avoid pushing through pain.']
          : ['Movement within normal parameters.'],
        urgent_alert: false,
      };
    }
  }

  public async transcribeAudio(audioBlob: Blob, language = 'ml', textFallback?: string): Promise<VoiceTranscriptionResponse> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('language', language);
    if (textFallback) {
      formData.append('text', textFallback);
    }

    try {
      const response = await fetch(`${this.baseUrl}/voice/transcribe/`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Transcription failed');
      return await response.json();
    } catch (err) {
      // Demo fallback Malayalam symptom transcription
      return {
        text: textFallback || 'കൈ ഉയർത്തുമ്പോൾ ചെറിയ വേദന തോന്നുന്നു',
        language: 'ml',
        confidence: 0.95,
        provider: 'mock (demo)',
        extracted_symptoms: {
          pain_detected: true,
          suggested_pain_score: 4,
          suggested_difficulty: 'moderate',
          body_area: 'arm_shoulder',
        },
      };
    }
  }

  public async speakText(text: string, language = 'ml'): Promise<VoiceSpeakResponse> {
    try {
      return await this.request<VoiceSpeakResponse>('/voice/speak/', {
        method: 'POST',
        body: JSON.stringify({ text, language }),
      });
    } catch (err) {
      return {
        audio_url: null,
        audio_base64: null,
        mime_type: 'audio/wav',
        provider: 'mock (demo)',
        fallback_text: text,
      };
    }
  }

  public async getProgress(): Promise<ProgressSummaryResponse> {
    try {
      return await this.request<ProgressSummaryResponse>('/progress/');
    } catch (err) {
      return {
        total_sessions: 5,
        completed_exercises: {
          bodyweight_squat: {
            sessions_count: 3,
            total_reps: 28,
            average_primary_angle: 92.5,
          },
          shoulder_flexion: {
            sessions_count: 2,
            total_reps: 16,
            average_primary_angle: 118.0,
          },
        },
        pain_trend: [
          { date: '2026-10-21', pain_score: 5 },
          { date: '2026-10-22', pain_score: 4 },
          { date: '2026-10-23', pain_score: 3 },
        ],
        flagged_sessions_count: 1,
      };
    }
  }

  public async getClinicianReviews(): Promise<ClinicianReviewItem[]> {
    try {
      return await this.request<ClinicianReviewItem[]>('/clinician/reviews/');
    } catch (err) {
      return [
        {
          id: 'demo-rev-1',
          session_id: 'demo-sess-101',
          patient_identifier: 'Patient #1042',
          exercise: 'shoulder_flexion',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          status: 'pending',
          severity: 'warning',
          flag_reasons: ['patient_reported_increasing_pain', 'pain_score_elevated'],
          safety_feedback: ['Patient reported pain score 6/10 during arm elevation.'],
          latest_pain_score: 6,
          completed_reps: 4,
          measurements_count: 12,
        },
      ];
    }
  }

  public async resolveReview(reviewId: string, payload: ResolveReviewPayload): Promise<any> {
    try {
      return await this.request(`/clinician/reviews/${reviewId}/resolve/`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return { status: 'resolved', audit_id: `audit-${Date.now()}` };
    }
  }

  private getMockResponse<T>(endpoint: string, options: RequestInit): any {
    return {} as T;
  }
}

export const apiClient = new ApiClient();

import { CanonicalExerciseId, MovementResult } from './vision';

export interface HealthResponse {
  status: string;
  version: string;
  demo_mode: boolean;
  voice_provider: string;
  database: string;
}

export interface ExerciseDefinition {
  id: CanonicalExerciseId;
  name: string;
  target_joints: string[];
  description: string;
  instructions_en: string;
  instructions_ml: string;
  default_target_reps: number;
  demo_parameters: Record<string, number>;
}

export interface TherapyPlanItem {
  id?: string;
  exercise_id: CanonicalExerciseId;
  target_sets: number;
  target_reps: number;
  notes?: string;
}

export interface TherapyPlan {
  id: string;
  patient_name: string;
  clinician_name: string;
  notes: string;
  is_active: boolean;
  items: TherapyPlanItem[];
  created_at: string;
}

export interface SessionRecord {
  id: string;
  exercise: CanonicalExerciseId;
  exercise_name?: string;
  therapy_plan: string | null;
  status: 'in_progress' | 'completed' | 'aborted';
  target_reps: number;
  completed_reps: number;
  started_at: string;
  ended_at: string | null;
  review_required: boolean;
  summary_metrics?: Record<string, any>;
}

export interface CreateSessionPayload {
  exercise_id: CanonicalExerciseId;
  therapy_plan_id?: string | null;
  target_reps?: number;
}

export interface SymptomReportPayload {
  transcript: string;
  pain_score: number | null;
  difficulty: string;
  body_area: string;
  patient_confirmed: boolean;
  language: 'ml' | 'en';
}

export interface SymptomRecord extends SymptomReportPayload {
  id: string;
  session_id: string;
  reported_at: string;
}

export interface SafetyEvaluationRequest {
  session_id: string;
  pain_score?: number | null;
  worsening_pain?: boolean;
  unreliable_measurement_streak?: number;
  reported_symptoms?: string[];
}

export interface SafetyEvaluationResponse {
  review_required: boolean;
  reasons: string[];
  measurement_reliable: boolean;
  feedback: string[];
  urgent_alert: boolean;
}

export interface ClinicianReviewItem {
  id: string;
  session_id: string;
  patient_identifier: string;
  exercise: CanonicalExerciseId;
  created_at: string;
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  severity: 'routine' | 'warning' | 'urgent';
  flag_reasons: string[];
  safety_feedback: string[];
  latest_pain_score?: number | null;
  completed_reps?: number;
  measurements_count?: number;
}

export interface ResolveReviewPayload {
  clinician_notes: string;
  resolution_action: string;
}

export interface VoiceTranscriptionResponse {
  text: string;
  language: string;
  confidence: number;
  provider: string;
  extracted_symptoms?: {
    pain_detected: boolean;
    suggested_pain_score: number | null;
    suggested_difficulty: string;
    body_area: string;
  };
}

export interface VoiceSpeakResponse {
  audio_url: string | null;
  audio_base64: string | null;
  mime_type: string;
  provider: string;
  fallback_text: string;
}

export interface ProgressSummaryResponse {
  total_sessions: number;
  completed_exercises: Record<CanonicalExerciseId, {
    sessions_count: number;
    total_reps: number;
    average_primary_angle?: number;
  }>;
  pain_trend: Array<{ date: string; pain_score: number | null }>;
  flagged_sessions_count: number;
}

/**
 * Vision Contracts and MediaPipe Joint Types
 * Authoritative source: vision-contracts/schemas/movement-result.schema.json
 */

export type CanonicalExerciseId = 'bodyweight_squat' | 'shoulder_flexion';

export interface JointAngles {
  left_knee?: number | null;
  right_knee?: number | null;
  left_hip?: number | null;
  right_hip?: number | null;
  left_shoulder?: number | null;
  right_shoulder?: number | null;
  [jointName: string]: number | null | undefined;
}

export type MovementPhase = 'idle' | 'eccentric' | 'inflection' | 'concentric' | 'completed' | 'unreliable';

export interface MovementResult {
  exercise: CanonicalExerciseId;
  repetitions: number;
  joint_angles: JointAngles;
  measurement_reliable: boolean;
  visibility: Record<string, number>;
  movement_checks: string[];
  current_phase?: MovementPhase;
  captured_at: string; // ISO-8601 UTC timestamp
}

export interface ExerciseBiomechanicalParameters {
  exercise_id: CanonicalExerciseId;
  inflection_threshold: number; // e.g. 100 deg knee for squat, 120 deg shoulder for arm raise
  reset_threshold: number;      // e.g. 160 deg knee for squat, 30 deg shoulder for arm raise
  min_visibility_threshold: number; // e.g. 0.65
}

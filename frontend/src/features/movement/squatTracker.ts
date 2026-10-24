import { Landmark, calculateAngle, checkVisibility, getVisibility } from './geometry';
import { MovementResult, MovementPhase } from '../../types/vision';

export interface SquatConfig {
  inflectionAngle: number; // Demo threshold (e.g. 100 deg)
  standingAngle: number;   // Stand reset threshold (e.g. 160 deg)
  minVisibility: number;   // Visibility cutoff (e.g. 0.65)
}

export const DEFAULT_SQUAT_CONFIG: SquatConfig = {
  inflectionAngle: 100.0,
  standingAngle: 160.0,
  minVisibility: 0.65,
};

// Required MediaPipe indices for squat: 23 (L Hip), 24 (R Hip), 25 (L Knee), 26 (R Knee), 27 (L Ankle), 28 (R Ankle)
export const SQUAT_REQUIRED_LANDMARKS = [23, 24, 25, 26, 27, 28];

export class SquatTracker {
  private config: SquatConfig;
  private currentPhase: MovementPhase = 'idle';
  private repCount = 0;
  private reachedInflection = false;

  constructor(config: Partial<SquatConfig> = {}) {
    this.config = { ...DEFAULT_SQUAT_CONFIG, ...config };
  }

  public reset(): void {
    this.currentPhase = 'idle';
    this.repCount = 0;
    this.reachedInflection = false;
  }

  public getRepCount(): number {
    return this.repCount;
  }

  public setRepCount(reps: number): void {
    this.repCount = reps;
  }

  public discardIncompleteMovement(): void {
    this.currentPhase = 'idle';
    this.reachedInflection = false;
  }

  public processFrame(landmarks: Landmark[] | null | undefined): MovementResult {
    const timestamp = new Date().toISOString();
    const safeLandmarks = Array.isArray(landmarks) ? landmarks : [];
    const visibilityCheck = checkVisibility(landmarks, SQUAT_REQUIRED_LANDMARKS, this.config.minVisibility);

    if (!Array.isArray(landmarks) || landmarks.length < 29 || !visibilityCheck.reliable) {
      this.discardIncompleteMovement();
      return {
        exercise: 'bodyweight_squat',
        repetitions: this.repCount,
        joint_angles: {
          left_knee: null,
          right_knee: null,
          left_hip: null,
          right_hip: null,
        },
        measurement_reliable: false,
        visibility: {
          left_knee: getVisibility(safeLandmarks[25]),
          right_knee: getVisibility(safeLandmarks[26]),
          left_hip: getVisibility(safeLandmarks[23]),
          right_hip: getVisibility(safeLandmarks[24]),
        },
        movement_checks: visibilityCheck.missingIndices.length > 0 ? ['low_visibility_legs'] : ['invalid_landmarks'],
        current_phase: 'unreliable',
        captured_at: timestamp,
      };
    }

    const leftKneeAngle = calculateAngle(safeLandmarks[23], safeLandmarks[25], safeLandmarks[27]);
    const rightKneeAngle = calculateAngle(safeLandmarks[24], safeLandmarks[26], safeLandmarks[28]);

    if (!Number.isFinite(leftKneeAngle) || !Number.isFinite(rightKneeAngle)) {
      this.discardIncompleteMovement();
      return {
        exercise: 'bodyweight_squat',
        repetitions: this.repCount,
        joint_angles: {
          left_knee: null,
          right_knee: null,
        },
        measurement_reliable: false,
        visibility: {
          left_knee: getVisibility(safeLandmarks[25]),
          right_knee: getVisibility(safeLandmarks[26]),
          left_hip: getVisibility(safeLandmarks[23]),
          right_hip: getVisibility(safeLandmarks[24]),
        },
        movement_checks: ['invalid_landmarks'],
        current_phase: 'unreliable',
        captured_at: timestamp,
      };
    }

    const avgKneeAngle = Math.round(((leftKneeAngle + rightKneeAngle) / 2) * 10) / 10;
    const leftHipAngle = calculateAngle(safeLandmarks[11] ?? safeLandmarks[23], safeLandmarks[23], safeLandmarks[25]);
    const rightHipAngle = calculateAngle(safeLandmarks[12] ?? safeLandmarks[24], safeLandmarks[24], safeLandmarks[26]);

    const movementChecks: string[] = [];

    if (Math.abs(leftKneeAngle - rightKneeAngle) > 20) {
      movementChecks.push('asymmetrical_knee_flexion');
    }

    if (avgKneeAngle >= this.config.standingAngle) {
      if (this.reachedInflection) {
        this.repCount += 1;
        this.currentPhase = 'completed';
        this.reachedInflection = false;
      } else if (this.currentPhase !== 'completed') {
        this.currentPhase = 'idle';
      }
    } else if (avgKneeAngle <= this.config.inflectionAngle) {
      this.currentPhase = 'inflection';
      this.reachedInflection = true;
    } else if (this.reachedInflection && avgKneeAngle > this.config.inflectionAngle) {
      this.currentPhase = 'concentric';
    } else if (!this.reachedInflection && avgKneeAngle < this.config.standingAngle) {
      this.currentPhase = 'eccentric';
    }

    return {
      exercise: 'bodyweight_squat',
      repetitions: this.repCount,
      joint_angles: {
        left_knee: leftKneeAngle,
        right_knee: rightKneeAngle,
        left_hip: Number.isFinite(leftHipAngle) ? leftHipAngle : null,
        right_hip: Number.isFinite(rightHipAngle) ? rightHipAngle : null,
      },
      measurement_reliable: true,
      visibility: {
        left_knee: getVisibility(safeLandmarks[25]),
        right_knee: getVisibility(safeLandmarks[26]),
        left_hip: getVisibility(safeLandmarks[23]),
        right_hip: getVisibility(safeLandmarks[24]),
      },
      movement_checks: movementChecks,
      current_phase: this.currentPhase,
      captured_at: timestamp,
    };
  }
}

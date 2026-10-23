import { Landmark, calculateAngle, checkVisibility } from './geometry';
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

  public processFrame(landmarks: Landmark[]): MovementResult {
    const timestamp = new Date().toISOString();
    const visibilityCheck = checkVisibility(landmarks, SQUAT_REQUIRED_LANDMARKS, this.config.minVisibility);

    // If visibility is compromised, return unreliable result without penalizing user
    if (!visibilityCheck.reliable || landmarks.length < 29) {
      return {
        exercise: 'bodyweight_squat',
        repetitions: this.repCount,
        joint_angles: {
          left_knee: null,
          right_knee: null,
        },
        measurement_reliable: false,
        visibility: {
          left_knee: landmarks[25]?.visibility ?? 0,
          right_knee: landmarks[26]?.visibility ?? 0,
          left_hip: landmarks[23]?.visibility ?? 0,
          right_hip: landmarks[24]?.visibility ?? 0,
        },
        movement_checks: ['low_visibility_legs'],
        current_phase: 'unreliable',
        captured_at: timestamp,
      };
    }

    // Compute joint angles
    const leftKneeAngle = calculateAngle(landmarks[23], landmarks[25], landmarks[27]);
    const rightKneeAngle = calculateAngle(landmarks[24], landmarks[26], landmarks[28]);
    const avgKneeAngle = Math.round(((leftKneeAngle + rightKneeAngle) / 2) * 10) / 10;

    const leftHipAngle = calculateAngle(landmarks[11] || landmarks[23], landmarks[23], landmarks[25]);
    const rightHipAngle = calculateAngle(landmarks[12] || landmarks[24], landmarks[24], landmarks[26]);

    const movementChecks: string[] = [];

    // Check knee caving / difference between knees
    if (Math.abs(leftKneeAngle - rightKneeAngle) > 20) {
      movementChecks.push('asymmetrical_knee_flexion');
    }

    // State machine transitions
    if (avgKneeAngle >= this.config.standingAngle) {
      if (this.currentPhase === 'concentric' && this.reachedInflection) {
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
        left_hip: leftHipAngle,
        right_hip: rightHipAngle,
      },
      measurement_reliable: true,
      visibility: {
        left_knee: landmarks[25]?.visibility ?? 1.0,
        right_knee: landmarks[26]?.visibility ?? 1.0,
        left_hip: landmarks[23]?.visibility ?? 1.0,
        right_hip: landmarks[24]?.visibility ?? 1.0,
      },
      movement_checks: movementChecks,
      current_phase: this.currentPhase,
      captured_at: timestamp,
    };
  }
}

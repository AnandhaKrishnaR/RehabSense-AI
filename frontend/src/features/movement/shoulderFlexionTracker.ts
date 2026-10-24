import { Landmark, calculateAngle, checkVisibility, getVisibility } from './geometry';
import { MovementResult, MovementPhase } from '../../types/vision';

export interface ShoulderFlexionConfig {
  peakAngle: number;    // Demo peak target (e.g. 120 deg)
  restingAngle: number; // Arm at side threshold (e.g. 30 deg)
  minVisibility: number;// Landmark visibility cutoff (e.g. 0.65)
}

export const DEFAULT_SHOULDER_CONFIG: ShoulderFlexionConfig = {
  peakAngle: 120.0,
  restingAngle: 30.0,
  minVisibility: 0.65,
};

// Required MediaPipe indices: 11 (L Shoulder), 12 (R Shoulder), 13 (L Elbow), 14 (R Elbow), 23 (L Hip), 24 (R Hip)
export const SHOULDER_REQUIRED_LANDMARKS = [11, 12, 13, 14, 23, 24];

export class ShoulderFlexionTracker {
  private config: ShoulderFlexionConfig;
  private currentPhase: MovementPhase = 'idle';
  private repCount = 0;
  private reachedPeak = false;
  private activeArm: 'left' | 'right' | 'both' = 'both';

  constructor(config: Partial<ShoulderFlexionConfig> = {}, activeArm: 'left' | 'right' | 'both' = 'both') {
    this.config = { ...DEFAULT_SHOULDER_CONFIG, ...config };
    this.activeArm = activeArm;
  }

  public reset(): void {
    this.currentPhase = 'idle';
    this.repCount = 0;
    this.reachedPeak = false;
  }

  public getRepCount(): number {
    return this.repCount;
  }

  public setRepCount(reps: number): void {
    this.repCount = reps;
  }

  public processFrame(landmarks: Landmark[] | null | undefined): MovementResult {
    const timestamp = new Date().toISOString();
    const safeLandmarks = Array.isArray(landmarks) ? landmarks : [];
    const visibilityCheck = checkVisibility(landmarks, SHOULDER_REQUIRED_LANDMARKS, this.config.minVisibility);

    if (!Array.isArray(landmarks) || landmarks.length < 25 || !visibilityCheck.reliable) {
      return {
        exercise: 'shoulder_flexion',
        repetitions: this.repCount,
        joint_angles: {
          left_shoulder: null,
          right_shoulder: null,
        },
        measurement_reliable: false,
        visibility: {
          left_shoulder: getVisibility(safeLandmarks[11]),
          right_shoulder: getVisibility(safeLandmarks[12]),
          left_elbow: getVisibility(safeLandmarks[13]),
          right_elbow: getVisibility(safeLandmarks[14]),
        },
        movement_checks: visibilityCheck.missingIndices.length > 0 ? ['low_visibility_arms'] : ['invalid_landmarks'],
        current_phase: 'unreliable',
        captured_at: timestamp,
      };
    }

    const leftShoulderAngle = calculateAngle(safeLandmarks[23], safeLandmarks[11], safeLandmarks[13]);
    const rightShoulderAngle = calculateAngle(safeLandmarks[24], safeLandmarks[12], safeLandmarks[14]);

    if (!Number.isFinite(leftShoulderAngle) || !Number.isFinite(rightShoulderAngle)) {
      return {
        exercise: 'shoulder_flexion',
        repetitions: this.repCount,
        joint_angles: {
          left_shoulder: null,
          right_shoulder: null,
        },
        measurement_reliable: false,
        visibility: {
          left_shoulder: getVisibility(safeLandmarks[11]),
          right_shoulder: getVisibility(safeLandmarks[12]),
          left_elbow: getVisibility(safeLandmarks[13]),
          right_elbow: getVisibility(safeLandmarks[14]),
        },
        movement_checks: ['invalid_landmarks'],
        current_phase: 'unreliable',
        captured_at: timestamp,
      };
    }

    let trackingAngle = 0;
    if (this.activeArm === 'left') {
      trackingAngle = leftShoulderAngle;
    } else if (this.activeArm === 'right') {
      trackingAngle = rightShoulderAngle;
    } else {
      trackingAngle = Math.max(leftShoulderAngle, rightShoulderAngle);
    }

    const movementChecks: string[] = [];

    if (trackingAngle <= this.config.restingAngle) {
      if (this.currentPhase === 'concentric' && this.reachedPeak) {
        this.repCount += 1;
        this.currentPhase = 'completed';
        this.reachedPeak = false;
      } else if (this.currentPhase !== 'completed') {
        this.currentPhase = 'idle';
      }
    } else if (trackingAngle >= this.config.peakAngle) {
      this.currentPhase = 'inflection';
      this.reachedPeak = true;
    } else if (this.reachedPeak && trackingAngle < this.config.peakAngle) {
      this.currentPhase = 'concentric';
    } else if (!this.reachedPeak && trackingAngle > this.config.restingAngle) {
      this.currentPhase = 'eccentric';
    }

    return {
      exercise: 'shoulder_flexion',
      repetitions: this.repCount,
      joint_angles: {
        left_shoulder: leftShoulderAngle,
        right_shoulder: rightShoulderAngle,
      },
      measurement_reliable: true,
      visibility: {
        left_shoulder: getVisibility(safeLandmarks[11]),
        right_shoulder: getVisibility(safeLandmarks[12]),
        left_elbow: getVisibility(safeLandmarks[13]),
        right_elbow: getVisibility(safeLandmarks[14]),
      },
      movement_checks: movementChecks,
      current_phase: this.currentPhase,
      captured_at: timestamp,
    };
  }
}

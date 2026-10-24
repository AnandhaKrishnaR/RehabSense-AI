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

const LEFT_SHOULDER_LANDMARKS = [11, 13, 23];
const RIGHT_SHOULDER_LANDMARKS = [12, 14, 24];

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

  public discardIncompleteMovement(): void {
    this.currentPhase = 'idle';
    this.reachedPeak = false;
  }

  public processFrame(landmarks: Landmark[] | null | undefined): MovementResult {
    const timestamp = new Date().toISOString();
    const safeLandmarks = Array.isArray(landmarks) ? landmarks : [];
    const requiredLandmarks = this.activeArm === 'left'
      ? LEFT_SHOULDER_LANDMARKS
      : this.activeArm === 'right'
        ? RIGHT_SHOULDER_LANDMARKS
        : SHOULDER_REQUIRED_LANDMARKS;
    const visibilityCheck = checkVisibility(landmarks, requiredLandmarks, this.config.minVisibility);
    const leftVisibility = checkVisibility(landmarks, LEFT_SHOULDER_LANDMARKS, this.config.minVisibility);
    const rightVisibility = checkVisibility(landmarks, RIGHT_SHOULDER_LANDMARKS, this.config.minVisibility);

    const leftAngle = leftVisibility.reliable
      ? calculateAngle(safeLandmarks[23], safeLandmarks[11], safeLandmarks[13])
      : Number.NaN;
    const rightAngle = rightVisibility.reliable
      ? calculateAngle(safeLandmarks[24], safeLandmarks[12], safeLandmarks[14])
      : Number.NaN;
    const leftShoulderAngle = Number.isFinite(leftAngle) ? leftAngle : null;
    const rightShoulderAngle = Number.isFinite(rightAngle) ? rightAngle : null;
    const measurementReliable = this.activeArm === 'left'
      ? leftShoulderAngle !== null
      : this.activeArm === 'right'
        ? rightShoulderAngle !== null
        : leftShoulderAngle !== null && rightShoulderAngle !== null;

    if (!measurementReliable) {
      this.discardIncompleteMovement();
      return {
        exercise: 'shoulder_flexion',
        repetitions: this.repCount,
        joint_angles: {
          left_shoulder: leftShoulderAngle,
          right_shoulder: rightShoulderAngle,
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

    const trackingAngle = this.activeArm === 'left'
      ? leftAngle
      : this.activeArm === 'right'
        ? rightAngle
        : Math.max(leftAngle, rightAngle);

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

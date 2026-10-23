# Vision Contracts & Computer Vision Specification

This directory holds the authoritative contracts and schemas for Member 2's computer vision pipeline.

## Contract Specification: Movement Result

The frontend pose engine analyzes MediaPipe Pose landmarks frame-by-frame and produces a `MovementResult` adhering to `schemas/movement-result.schema.json`.

```typescript
export interface JointAngles {
  left_knee?: number | null;
  right_knee?: number | null;
  left_hip?: number | null;
  right_hip?: number | null;
  left_shoulder?: number | null;
  right_shoulder?: number | null;
  [jointName: string]: number | null | undefined;
}

export interface MovementResult {
  exercise: 'bodyweight_squat' | 'shoulder_flexion';
  repetitions: number;
  joint_angles: JointAngles;
  measurement_reliable: boolean;
  visibility: Record<string, number>;
  movement_checks: string[];
  current_phase?: 'idle' | 'eccentric' | 'inflection' | 'concentric' | 'completed' | 'unreliable';
  captured_at: string; // ISO-8601
}
```

## Joint Calculations and Geometric Definitions

### 1. Bodyweight Squat (`bodyweight_squat`)
- **Key Landmarks**:
  - Left Hip: `23`, Left Knee: `25`, Left Ankle: `27`
  - Right Hip: `24`, Right Knee: `26`, Right Ankle: `28`
- **Knee Angle Calculation**:
  Angle at vertex $B$ (Knee) between vector $\vec{BA}$ (Knee to Hip) and $\vec{BC}$ (Knee to Ankle):
  $$\theta = \arccos\left(\frac{\vec{BA} \cdot \vec{BC}}{\|\vec{BA}\| \|\vec{BC}\|}\right) \times \frac{180}{\pi}$$
  - Full upright stand: $\sim 170^\circ - 180^\circ$
  - Demonstration target depth: $\le 100^\circ$
- **Repetition State Machine**:
  - `STANDING`: Knee angle $> 160^\circ$
  - `DESCENDING`: Angle decreasing from $160^\circ$ toward $100^\circ$
  - `INFLECTION`: Angle reaches $\le 100^\circ$ (with reliable tracking)
  - `ASCENDING`: Angle increasing from inflection toward $160^\circ$
  - `REP_COMPLETED`: Reaches $> 160^\circ$ after inflection -> Rep counter incremented by 1.

### 2. Shoulder Flexion (`shoulder_flexion`)
- **Key Landmarks**:
  - Left Shoulder: `11`, Left Elbow: `13`, Left Hip: `23`
  - Right Shoulder: `12`, Right Elbow: `14`, Right Hip: `24`
- **Arm Raise Angle Calculation**:
  Angle at vertex $S$ (Shoulder) between vector $\vec{SH}$ (Shoulder to Hip / Vertical trunk) and $\vec{SE}$ (Shoulder to Elbow):
  $$\phi = \arccos\left(\frac{\vec{SH} \cdot \vec{SE}}{\|\vec{SH}\| \|\vec{SE}\|}\right) \times \frac{180}{\pi}$$
  - Arm at side: $\le 25^\circ$
  - Demonstration peak target: $\ge 120^\circ$
- **Repetition State Machine**:
  - `RESTING`: Angle $\le 30^\circ$
  - `RAISING`: Angle ascending smoothly
  - `PEAK`: Angle $\ge 120^\circ$
  - `LOWERING`: Angle returning to resting
  - `REP_COMPLETED`: Reaches $\le 30^\circ$ after peak -> Rep counter incremented by 1.

## Reliability and Unreliable Landmark Handling
- **Visibility Threshold**: Default `MIN_VISIBILITY = 0.65`.
- If either knee or hip visibility drops below `0.65` during squat tracking, the frame is marked `measurement_reliable: false` and adds check `low_visibility_knee` or `low_visibility_hip`.
- **Golden Rule**: **An unreliable measurement is NEVER interpreted as poor patient performance or a failed repetition.** The rep counter freezes and prompts the user to adjust camera position or lighting.

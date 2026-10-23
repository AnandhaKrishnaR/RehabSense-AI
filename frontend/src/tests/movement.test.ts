import { describe, it, expect } from 'vitest';
import { calculateAngle, checkVisibility, Landmark } from '../features/movement/geometry';
import { SquatTracker } from '../features/movement/squatTracker';
import { ShoulderFlexionTracker } from '../features/movement/shoulderFlexionTracker';

describe('Movement Geometry and Calculations', () => {
  it('calculates a 90-degree right angle accurately', () => {
    const a: Landmark = { x: 0, y: 1 };
    const b: Landmark = { x: 0, y: 0 };
    const c: Landmark = { x: 1, y: 0 };
    const angle = calculateAngle(a, b, c);
    expect(angle).toBe(90.0);
  });

  it('calculates a 180-degree straight line angle', () => {
    const a: Landmark = { x: 0, y: 1 };
    const b: Landmark = { x: 0, y: 0 };
    const c: Landmark = { x: 0, y: -1 };
    const angle = calculateAngle(a, b, c);
    expect(angle).toBe(180.0);
  });

  it('correctly detects low landmark visibility', () => {
    const landmarks: Landmark[] = [
      { x: 0, y: 0, visibility: 0.9 },
      { x: 0, y: 0, visibility: 0.4 }, // below 0.65 threshold
    ];
    const check = checkVisibility(landmarks, [0, 1], 0.65);
    expect(check.reliable).toBe(false);
    expect(check.missingIndices).toContain(1);
  });
});

describe('SquatTracker State Machine', () => {
  function makeSquatLandmarks(kneeAngleDegrees: number, visibility = 0.95): Landmark[] {
    const arr: Landmark[] = [];
    for (let i = 0; i < 33; i++) {
      arr.push({ x: 0, y: 0, visibility });
    }
    // Left Hip (23), Knee (25), Ankle (27)
    arr[23] = { x: 0.5, y: 0.5, visibility };
    arr[24] = { x: 0.5, y: 0.5, visibility };
    arr[25] = { x: 0.5, y: 0.7, visibility };
    arr[26] = { x: 0.5, y: 0.7, visibility };

    // Set ankle position to form desired angle
    const angleRad = (kneeAngleDegrees * Math.PI) / 180.0;
    arr[27] = {
      x: 0.5 + Math.sin(Math.PI - angleRad) * 0.2,
      y: 0.7 + Math.cos(Math.PI - angleRad) * 0.2,
      visibility,
    };
    arr[28] = { ...arr[27] };
    return arr;
  }

  it('increments repetition only upon full valid cycle: standing -> inflection -> return to standing', () => {
    const tracker = new SquatTracker({ inflectionAngle: 100.0, standingAngle: 160.0 });
    expect(tracker.getRepCount()).toBe(0);

    // 1. Initial stand (170 deg)
    let res = tracker.processFrame(makeSquatLandmarks(170));
    expect(res.current_phase).toBe('idle');
    expect(tracker.getRepCount()).toBe(0);

    // 2. Descending (130 deg)
    res = tracker.processFrame(makeSquatLandmarks(130));
    expect(res.current_phase).toBe('eccentric');
    expect(tracker.getRepCount()).toBe(0);

    // 3. Inflection depth achieved (95 deg <= 100 deg)
    res = tracker.processFrame(makeSquatLandmarks(95));
    expect(res.current_phase).toBe('inflection');
    expect(tracker.getRepCount()).toBe(0);

    // 4. Ascending back up (140 deg)
    res = tracker.processFrame(makeSquatLandmarks(140));
    expect(res.current_phase).toBe('concentric');
    expect(tracker.getRepCount()).toBe(0);

    // 5. Returned to standing (165 deg >= 160 deg) -> Rep completed!
    res = tracker.processFrame(makeSquatLandmarks(165));
    expect(res.current_phase).toBe('completed');
    expect(tracker.getRepCount()).toBe(1);
    expect(res.repetitions).toBe(1);
  });

  it('does NOT count repetition if inflection depth was not reached', () => {
    const tracker = new SquatTracker({ inflectionAngle: 100.0, standingAngle: 160.0 });

    // Descend only to 120 deg (partial squat)
    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(120));
    // Return to standing
    const res = tracker.processFrame(makeSquatLandmarks(165));

    expect(tracker.getRepCount()).toBe(0);
    expect(res.current_phase).toBe('idle');
  });

  it('marks frame unreliable and freezes rep count when landmarks are occluded', () => {
    const tracker = new SquatTracker();
    // Occluded knees (visibility 0.3)
    const occluded = makeSquatLandmarks(95, 0.3);
    const res = tracker.processFrame(occluded);

    expect(res.measurement_reliable).toBe(false);
    expect(res.movement_checks).toContain('low_visibility_legs');
    expect(tracker.getRepCount()).toBe(0);
  });
});

describe('ShoulderFlexionTracker State Machine', () => {
  function makeShoulderLandmarks(armAngleDegrees: number, visibility = 0.95): Landmark[] {
    const arr: Landmark[] = [];
    for (let i = 0; i < 33; i++) {
      arr.push({ x: 0, y: 0, visibility });
    }
    // L Hip 23, L Shoulder 11, L Elbow 13
    arr[23] = { x: 0.5, y: 0.7, visibility };
    arr[24] = { x: 0.5, y: 0.7, visibility };
    arr[11] = { x: 0.5, y: 0.4, visibility };
    arr[12] = { x: 0.5, y: 0.4, visibility };

    const angleRad = (armAngleDegrees * Math.PI) / 180.0;
    arr[13] = {
      x: 0.5 + Math.sin(angleRad) * 0.25,
      y: 0.4 + Math.cos(angleRad) * 0.25,
      visibility,
    };
    arr[14] = { ...arr[13] };
    return arr;
  }

  it('increments repetition when arm is raised to peak and lowered back to side', () => {
    const tracker = new ShoulderFlexionTracker({ peakAngle: 120.0, restingAngle: 30.0 });
    expect(tracker.getRepCount()).toBe(0);

    // 1. Resting at side (20 deg)
    let res = tracker.processFrame(makeShoulderLandmarks(20));
    expect(res.current_phase).toBe('idle');

    // 2. Raising arm (80 deg)
    res = tracker.processFrame(makeShoulderLandmarks(80));
    expect(res.current_phase).toBe('eccentric');

    // 3. Peak reached (125 deg >= 120 deg)
    res = tracker.processFrame(makeShoulderLandmarks(125));
    expect(res.current_phase).toBe('inflection');

    // 4. Lowering arm (60 deg)
    res = tracker.processFrame(makeShoulderLandmarks(60));
    expect(res.current_phase).toBe('concentric');

    // 5. Rest reached (25 deg <= 30 deg) -> Rep completed!
    res = tracker.processFrame(makeShoulderLandmarks(25));
    expect(res.current_phase).toBe('completed');
    expect(tracker.getRepCount()).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateAngle, checkVisibility, Landmark } from '../features/movement/geometry';
import { SquatTracker } from '../features/movement/squatTracker';
import { ShoulderFlexionTracker } from '../features/movement/shoulderFlexionTracker';
import { formatAverageKneeAngle } from '../features/movement/angleDisplay';
import {
  isNewVideoFrame,
  isVideoFrameStale,
  resolvePoseFrameSource,
  VIDEO_FRAME_STALE_TIMEOUT_MS,
} from '../features/movement/videoFrameUtils';

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

  it('rejects missing, non-finite, and out-of-range visibility values', () => {
    for (const visibility of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
      const check = checkVisibility([{ x: 0, y: 0, visibility }], [0], 0.65);

      expect(check.reliable).toBe(false);
      expect(check.minFoundVisibility).toBe(0);
      expect(check.missingIndices).toContain(0);
    }
  });

  it('rejects degenerate geometry and non-finite coordinates', () => {
    const a: Landmark = { x: 0, y: 0 };
    const b: Landmark = { x: 0, y: 0 };
    const c: Landmark = { x: 0, y: 0 };
    expect(Number.isNaN(calculateAngle(a, b, c))).toBe(true);

    expect(checkVisibility(undefined, [0, 1], 0.65).reliable).toBe(false);
  });

  it('processes only newer video frames and selects demo data only when explicitly enabled', () => {
    expect(isNewVideoFrame(1, null)).toBe(true);
    expect(isNewVideoFrame(1, 1)).toBe(false);
    expect(isNewVideoFrame(0.9, 1)).toBe(false);
    expect(isNewVideoFrame(Number.NaN, 1)).toBe(false);
    expect(isVideoFrameStale(1500, null)).toBe(false);
    expect(isVideoFrameStale(1000 + VIDEO_FRAME_STALE_TIMEOUT_MS - 1, 1000)).toBe(false);
    expect(isVideoFrameStale(1000 + VIDEO_FRAME_STALE_TIMEOUT_MS, 1000)).toBe(true);

    expect(resolvePoseFrameSource(false, false, false)).toBe('unavailable');
    expect(resolvePoseFrameSource(false, true, false)).toBe('unavailable');
    expect(resolvePoseFrameSource(false, true, true)).toBe('live');
    expect(resolvePoseFrameSource(true, false, false)).toBe('demo');
  });

  it('formats the average knee angle only when both measurements are finite', () => {
    expect(formatAverageKneeAngle(150, 170)).toBe('160°');
    expect(formatAverageKneeAngle(150.2, 169.5)).toBe('159.9°');

    for (const unavailable of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatAverageKneeAngle(unavailable, 170)).toBe('--°');
      expect(formatAverageKneeAngle(150, unavailable)).toBe('--°');
    }
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

  it('counts a repetition when a valid frame returns directly from inflection to standing', () => {
    const tracker = new SquatTracker({ inflectionAngle: 100.0, standingAngle: 160.0 });

    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(95));
    const result = tracker.processFrame(makeSquatLandmarks(170));

    expect(result.current_phase).toBe('completed');
    expect(result.repetitions).toBe(1);
  });

  it('counts consecutive complete squats independently', () => {
    const tracker = new SquatTracker({ inflectionAngle: 100.0, standingAngle: 160.0 });

    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(95));
    tracker.processFrame(makeSquatLandmarks(140));
    expect(tracker.processFrame(makeSquatLandmarks(170)).repetitions).toBe(1);

    tracker.processFrame(makeSquatLandmarks(130));
    tracker.processFrame(makeSquatLandmarks(95));
    tracker.processFrame(makeSquatLandmarks(140));
    const result = tracker.processFrame(makeSquatLandmarks(170));

    expect(result.current_phase).toBe('completed');
    expect(result.repetitions).toBe(2);
  });

  it('does not count repeated static squat frames', () => {
    const tracker = new SquatTracker();
    const staticPeak = makeSquatLandmarks(95);

    for (let i = 0; i < 120; i++) {
      const result = tracker.processFrame(staticPeak);
      expect(result.repetitions).toBe(0);
    }
  });

  it('does not complete a squat when the camera frame becomes stale', () => {
    const tracker = new SquatTracker();
    tracker.processFrame(makeSquatLandmarks(95));
    const lastFrameAt = 1000;
    const now = lastFrameAt + VIDEO_FRAME_STALE_TIMEOUT_MS;

    if (isVideoFrameStale(now, lastFrameAt)) tracker.discardIncompleteMovement();
    const result = tracker.processFrame(makeSquatLandmarks(170));

    expect(result.repetitions).toBe(0);
    expect(result.current_phase).toBe('idle');
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

  it('discards an incomplete squat after missing landmarks', () => {
    const tracker = new SquatTracker();
    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(95));

    const missing = tracker.processFrame(null);
    expect(missing.measurement_reliable).toBe(false);
    expect(missing.movement_checks).toContain('low_visibility_legs');
    expect(missing.repetitions).toBe(0);

    const completed = tracker.processFrame(makeSquatLandmarks(170));
    expect(completed.repetitions).toBe(0);
    expect(completed.current_phase).toBe('idle');
  });

  it('discards an incomplete squat after a low-visibility frame', () => {
    const tracker = new SquatTracker();
    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(95));

    expect(tracker.processFrame(makeSquatLandmarks(140, 0.3)).measurement_reliable).toBe(false);
    const result = tracker.processFrame(makeSquatLandmarks(170));
    expect(result.repetitions).toBe(0);
    expect(result.current_phase).toBe('idle');
  });

  it('discards an incomplete squat after invalid knee geometry', () => {
    const tracker = new SquatTracker();
    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(95));
    const invalid = makeSquatLandmarks(140);
    invalid[27] = { ...invalid[25] };
    invalid[28] = { ...invalid[26] };

    expect(tracker.processFrame(invalid).measurement_reliable).toBe(false);
    const result = tracker.processFrame(makeSquatLandmarks(170));
    expect(result.repetitions).toBe(0);
    expect(result.current_phase).toBe('idle');
  });

  it('handles missing landmark arrays without changing the repetition count', () => {
    const tracker = new SquatTracker();
    tracker.setRepCount(2);

    for (const landmarks of [undefined, null]) {
      const res = tracker.processFrame(landmarks);
      expect(res.measurement_reliable).toBe(false);
      expect(res.repetitions).toBe(2);
      expect(tracker.getRepCount()).toBe(2);
    }
  });

  it('preserves the repetition count when knee angles are invalid', () => {
    const tracker = new SquatTracker();
    tracker.setRepCount(2);
    const landmarks = makeSquatLandmarks(95);
    landmarks[23] = { ...landmarks[25] };
    landmarks[27] = { ...landmarks[25] };

    const res = tracker.processFrame(landmarks);

    expect(res.measurement_reliable).toBe(false);
    expect(res.movement_checks).toContain('invalid_landmarks');
    expect(res.repetitions).toBe(2);
    expect(tracker.getRepCount()).toBe(2);
  });

  it('resets repetitions and movement phase', () => {
    const tracker = new SquatTracker();
    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(95));
    tracker.processFrame(makeSquatLandmarks(140));
    tracker.processFrame(makeSquatLandmarks(170));

    tracker.reset();

    expect(tracker.getRepCount()).toBe(0);
    expect(tracker.processFrame(makeSquatLandmarks(170)).current_phase).toBe('idle');
    expect(tracker.getRepCount()).toBe(0);

    tracker.processFrame(makeSquatLandmarks(95));
    tracker.processFrame(makeSquatLandmarks(140));
    expect(tracker.processFrame(makeSquatLandmarks(170)).repetitions).toBe(1);
  });

  it('preserves the completed count while discarding an incomplete squat', () => {
    const tracker = new SquatTracker();
    tracker.setRepCount(3);
    tracker.processFrame(makeSquatLandmarks(95));

    tracker.discardIncompleteMovement();

    expect(tracker.getRepCount()).toBe(3);
    expect(tracker.processFrame(makeSquatLandmarks(170)).repetitions).toBe(3);
  });
});

describe('ShoulderFlexionTracker State Machine', () => {
  function makeShoulderLandmarks(
    armAngleDegrees: number,
    visibility = 0.95,
    rightArmAngleDegrees = armAngleDegrees
  ): Landmark[] {
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
    const rightAngleRad = (rightArmAngleDegrees * Math.PI) / 180.0;
    arr[14] = {
      x: 0.5 - Math.sin(rightAngleRad) * 0.25,
      y: 0.4 + Math.cos(rightAngleRad) * 0.25,
      visibility,
    };
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

  it('counts consecutive complete shoulder raises', () => {
    const tracker = new ShoulderFlexionTracker();

    for (let repetition = 1; repetition <= 2; repetition++) {
      tracker.processFrame(makeShoulderLandmarks(20));
      tracker.processFrame(makeShoulderLandmarks(130));
      tracker.processFrame(makeShoulderLandmarks(60));
      const result = tracker.processFrame(makeShoulderLandmarks(20));
      expect(result.repetitions).toBe(repetition);
    }
  });

  it('does not count repeated static shoulder-flexion frames', () => {
    const tracker = new ShoulderFlexionTracker();
    const staticPeak = makeShoulderLandmarks(130);

    for (let i = 0; i < 120; i++) {
      const result = tracker.processFrame(staticPeak);
      expect(result.repetitions).toBe(0);
    }
  });

  it('does not complete a shoulder raise when the camera frame becomes stale', () => {
    const tracker = new ShoulderFlexionTracker();
    tracker.processFrame(makeShoulderLandmarks(130));
    const lastFrameAt = 1000;
    const now = lastFrameAt + VIDEO_FRAME_STALE_TIMEOUT_MS;

    if (isVideoFrameStale(now, lastFrameAt)) tracker.discardIncompleteMovement();
    const result = tracker.processFrame(makeShoulderLandmarks(20));

    expect(result.repetitions).toBe(0);
    expect(result.current_phase).toBe('idle');
  });

  it('discards an incomplete shoulder raise after an unreliable frame', () => {
    const tracker = new ShoulderFlexionTracker();
    tracker.processFrame(makeShoulderLandmarks(20));
    tracker.processFrame(makeShoulderLandmarks(130));

    expect(tracker.processFrame(null).measurement_reliable).toBe(false);
    const result = tracker.processFrame(makeShoulderLandmarks(20));

    expect(result.repetitions).toBe(0);
    expect(result.current_phase).toBe('idle');
  });

  it('discards an incomplete shoulder raise after invalid selected-arm geometry', () => {
    const tracker = new ShoulderFlexionTracker({}, 'left');
    tracker.processFrame(makeShoulderLandmarks(20));
    tracker.processFrame(makeShoulderLandmarks(130));
    const invalid = makeShoulderLandmarks(80);
    invalid[13] = { ...invalid[11] };

    expect(tracker.processFrame(invalid).measurement_reliable).toBe(false);
    const result = tracker.processFrame(makeShoulderLandmarks(20));
    expect(result.repetitions).toBe(0);
    expect(result.current_phase).toBe('idle');
  });

  it('preserves the completed count while discarding an incomplete shoulder raise', () => {
    const tracker = new ShoulderFlexionTracker();
    tracker.setRepCount(2);
    tracker.processFrame(makeShoulderLandmarks(130));

    tracker.discardIncompleteMovement();

    expect(tracker.getRepCount()).toBe(2);
    expect(tracker.processFrame(makeShoulderLandmarks(20)).repetitions).toBe(2);
  });

  it('handles missing landmark arrays without changing the repetition count', () => {
    const tracker = new ShoulderFlexionTracker();
    tracker.setRepCount(2);

    for (const landmarks of [undefined, null]) {
      const res = tracker.processFrame(landmarks);
      expect(res.measurement_reliable).toBe(false);
      expect(res.repetitions).toBe(2);
      expect(tracker.getRepCount()).toBe(2);
    }
  });

  it('tracks the left arm when right-arm landmarks are occluded', () => {
    const tracker = new ShoulderFlexionTracker({}, 'left');
    const landmarks = makeShoulderLandmarks(80);
    [12, 14, 24].forEach((index) => { landmarks[index].visibility = 0.3; });

    const result = tracker.processFrame(landmarks);

    expect(result.measurement_reliable).toBe(true);
    expect(result.joint_angles.left_shoulder).toBe(80);
    expect(result.joint_angles.right_shoulder).toBeNull();
  });

  it('tracks the right arm when left-arm landmarks are occluded', () => {
    const tracker = new ShoulderFlexionTracker({}, 'right');
    const landmarks = makeShoulderLandmarks(80, 0.95, 95);
    [11, 13, 23].forEach((index) => { landmarks[index].visibility = 0.3; });

    const result = tracker.processFrame(landmarks);

    expect(result.measurement_reliable).toBe(true);
    expect(result.joint_angles.left_shoulder).toBeNull();
    expect(result.joint_angles.right_shoulder).toBe(95);
  });

  it('requires both arm measurements to be valid in both-arm mode', () => {
    for (const occludedIndices of [[12, 14, 24], [11, 13, 23]]) {
      const tracker = new ShoulderFlexionTracker();
      const landmarks = makeShoulderLandmarks(80);
      occludedIndices.forEach((index) => { landmarks[index].visibility = 0.3; });

      const result = tracker.processFrame(landmarks);

      expect(result.measurement_reliable).toBe(false);
      expect(result.current_phase).toBe('unreliable');
      expect(result.repetitions).toBe(0);
    }
  });

  it('uses the maximum valid angle to track movement in both-arm mode', () => {
    const tracker = new ShoulderFlexionTracker();
    const result = tracker.processFrame(makeShoulderLandmarks(80, 0.95, 125));

    expect(result.measurement_reliable).toBe(true);
    expect(result.joint_angles.left_shoulder).toBe(80);
    expect(result.joint_angles.right_shoulder).toBe(125);
    expect(result.current_phase).toBe('inflection');
  });

  it('keeps the selected-arm angle when unselected-arm geometry is invalid', () => {
    const tracker = new ShoulderFlexionTracker({}, 'left');
    const landmarks = makeShoulderLandmarks(80);
    landmarks[24] = { ...landmarks[12] };

    const result = tracker.processFrame(landmarks);

    expect(result.measurement_reliable).toBe(true);
    expect(result.joint_angles.left_shoulder).toBe(80);
    expect(result.joint_angles.right_shoulder).toBeNull();
  });

  it('reports an invalid selected-arm angle as null without counting a repetition', () => {
    const tracker = new ShoulderFlexionTracker({}, 'left');
    tracker.processFrame(makeShoulderLandmarks(20));
    const invalidPeak = makeShoulderLandmarks(125);
    invalidPeak[23] = { ...invalidPeak[11] };
    const invalidResult = tracker.processFrame(invalidPeak);

    expect(invalidResult.measurement_reliable).toBe(false);
    expect(invalidResult.joint_angles.left_shoulder).toBeNull();
    expect(invalidResult.repetitions).toBe(0);

    const restingResult = tracker.processFrame(makeShoulderLandmarks(20));
    expect(restingResult.repetitions).toBe(0);
    expect(tracker.getRepCount()).toBe(0);
  });

  it('does not count a partial repetition that never reaches the peak', () => {
    const tracker = new ShoulderFlexionTracker({}, 'left');

    tracker.processFrame(makeShoulderLandmarks(20));
    tracker.processFrame(makeShoulderLandmarks(100));
    const result = tracker.processFrame(makeShoulderLandmarks(20));

    expect(result.current_phase).toBe('idle');
    expect(result.repetitions).toBe(0);
  });

  it('preserves the repetition count when shoulder angles are invalid', () => {
    const tracker = new ShoulderFlexionTracker();
    tracker.setRepCount(2);
    const landmarks = makeShoulderLandmarks(125);
    landmarks[23] = { ...landmarks[11] };
    landmarks[13] = { ...landmarks[11] };

    const res = tracker.processFrame(landmarks);

    expect(res.measurement_reliable).toBe(false);
    expect(res.movement_checks).toContain('invalid_landmarks');
    expect(res.repetitions).toBe(2);
    expect(tracker.getRepCount()).toBe(2);
  });

  it('handles truncated landmarks and non-finite selected-arm coordinates safely', () => {
    const tracker = new ShoulderFlexionTracker({}, 'left');
    const truncatedResult = tracker.processFrame(makeShoulderLandmarks(80).slice(0, 23));
    expect(truncatedResult.measurement_reliable).toBe(false);
    expect(truncatedResult.joint_angles.left_shoulder).toBeNull();

    const invalidCoordinates = makeShoulderLandmarks(80);
    invalidCoordinates[13].x = Number.NaN;
    const invalidResult = tracker.processFrame(invalidCoordinates);
    expect(invalidResult.measurement_reliable).toBe(false);
    expect(invalidResult.joint_angles.left_shoulder).toBeNull();
  });
});

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
import { getMovementCoachMessage, getMovementCoachStartMessage, MOVEMENT_COACH_MESSAGES } from '../features/voice/movementVoiceCoach';

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
    expect(check.lowVisibilityIndices).toContain(1);
  });

  it('rejects missing, non-finite, and out-of-range visibility values', () => {
    for (const visibility of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
      const check = checkVisibility([{ x: 0, y: 0, visibility }], [0], 0.65);

      expect(check.reliable).toBe(false);
      expect(check.minFoundVisibility).toBe(0);
      expect(check.invalidVisibilityIndices).toContain(0);
    }
  });

  it('rejects degenerate geometry and non-finite coordinates', () => {
    const a: Landmark = { x: 0, y: 0 };
    const b: Landmark = { x: 0, y: 0 };
    const c: Landmark = { x: 0, y: 0 };
    expect(Number.isNaN(calculateAngle(a, b, c))).toBe(true);

    const missing = checkVisibility(undefined, [0, 1], 0.65);
    expect(missing.reliable).toBe(false);
    expect(missing.missingIndices).toEqual([0, 1]);

    const invalidCoordinates = checkVisibility([{ x: Number.NaN, y: 0, visibility: 0.9 }], [0], 0.65);
    expect(invalidCoordinates.reliable).toBe(false);
    expect(invalidCoordinates.invalidCoordinateIndices).toEqual([0]);
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
    expect(res.movement_checks).toContain('insufficient_squat_depth');
  });

  it('reports insufficient depth only when a shallow descent returns to standing', () => {
    const tracker = new SquatTracker({ inflectionAngle: 100.0, standingAngle: 160.0 });

    expect(tracker.processFrame(makeSquatLandmarks(170)).movement_checks).not.toContain('insufficient_squat_depth');
    const descending = tracker.processFrame(makeSquatLandmarks(120));
    expect(descending.current_phase).toBe('eccentric');
    expect(descending.movement_checks).not.toContain('insufficient_squat_depth');

    const returned = tracker.processFrame(makeSquatLandmarks(165));
    expect(returned.current_phase).toBe('idle');
    expect(returned.movement_checks).toContain('insufficient_squat_depth');
    expect(returned.repetitions).toBe(0);
  });

  it('does not report insufficient depth after a full-depth squat', () => {
    const tracker = new SquatTracker({ inflectionAngle: 100.0, standingAngle: 160.0 });

    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(95));
    const returned = tracker.processFrame(makeSquatLandmarks(165));

    expect(returned.repetitions).toBe(1);
    expect(returned.movement_checks).not.toContain('insufficient_squat_depth');
  });

  it('does not report insufficient depth during static standing', () => {
    const tracker = new SquatTracker();

    for (let frame = 0; frame < 5; frame++) {
      const result = tracker.processFrame(makeSquatLandmarks(170));
      expect(result.movement_checks).not.toContain('insufficient_squat_depth');
      expect(result.repetitions).toBe(0);
    }
  });

  it('does not report insufficient depth when an attempt has unreliable input', () => {
    const tracker = new SquatTracker({ inflectionAngle: 100.0, standingAngle: 160.0 });

    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(120));
    const unreliable = tracker.processFrame(makeSquatLandmarks(140, 0.3));
    expect(unreliable.measurement_reliable).toBe(false);
    expect(unreliable.movement_checks).not.toContain('insufficient_squat_depth');

    const returned = tracker.processFrame(makeSquatLandmarks(165));
    expect(returned.repetitions).toBe(0);
    expect(returned.movement_checks).not.toContain('insufficient_squat_depth');
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
    expect(res.current_phase).toBe('unreliable');
    expect(tracker.getRepCount()).toBe(0);
  });

  it('discards an incomplete squat after missing landmarks', () => {
    const tracker = new SquatTracker();
    tracker.processFrame(makeSquatLandmarks(170));
    tracker.processFrame(makeSquatLandmarks(95));

    const missing = tracker.processFrame(null);
    expect(missing.measurement_reliable).toBe(false);
    expect(missing.movement_checks).toContain('missing_landmarks');
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

  const squatReliabilityFailures: Array<{
    name: string;
    check: string;
    invalidate: (landmarks: Landmark[]) => void;
  }> = [
    {
      name: 'missing landmarks',
      check: 'missing_landmarks',
      invalidate: (landmarks) => { delete landmarks[23]; },
    },
    {
      name: 'low visibility',
      check: 'low_visibility_legs',
      invalidate: (landmarks) => { landmarks[23].visibility = 0.3; },
    },
    {
      name: 'invalid coordinates',
      check: 'invalid_coordinates',
      invalidate: (landmarks) => { landmarks[23].x = Number.NaN; },
    },
    {
      name: 'invalid geometry',
      check: 'invalid_landmarks',
      invalidate: (landmarks) => {
        landmarks[27] = { ...landmarks[25] };
        landmarks[28] = { ...landmarks[26] };
      },
    },
  ];

  for (const failure of squatReliabilityFailures) {
    it(`reports ${failure.name} and discards an in-progress squat`, () => {
      const tracker = new SquatTracker();
      tracker.processFrame(makeSquatLandmarks(170));
      tracker.processFrame(makeSquatLandmarks(130));

      const invalid = makeSquatLandmarks(140);
      failure.invalidate(invalid);
      const result = tracker.processFrame(invalid);

      expect(result.measurement_reliable).toBe(false);
      expect(result.current_phase).toBe('unreliable');
      expect(result.movement_checks).toContain(failure.check);
      expect(result.movement_checks).not.toContain('insufficient_squat_depth');
      expect(result.repetitions).toBe(0);

      const returned = tracker.processFrame(makeSquatLandmarks(170));
      expect(returned.repetitions).toBe(0);
      expect(returned.current_phase).toBe('idle');
      expect(returned.movement_checks).not.toContain('insufficient_squat_depth');
    });
  }

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
    expect(res.movement_checks).not.toContain('incomplete_shoulder_raise');
  });

  it('reports an incomplete raise when a reliable attempt returns to rest before the peak', () => {
    const tracker = new ShoulderFlexionTracker({ peakAngle: 120.0, restingAngle: 30.0 });

    tracker.processFrame(makeShoulderLandmarks(20));
    const raising = tracker.processFrame(makeShoulderLandmarks(80));
    expect(raising.current_phase).toBe('eccentric');
    expect(raising.movement_checks).not.toContain('incomplete_shoulder_raise');

    const returned = tracker.processFrame(makeShoulderLandmarks(25));
    expect(returned.current_phase).toBe('idle');
    expect(returned.movement_checks).toContain('incomplete_shoulder_raise');
    expect(returned.repetitions).toBe(0);
  });

  it('does not report incomplete raises during static resting frames', () => {
    const tracker = new ShoulderFlexionTracker();

    for (let frame = 0; frame < 5; frame++) {
      const result = tracker.processFrame(makeShoulderLandmarks(20));
      expect(result.movement_checks).not.toContain('incomplete_shoulder_raise');
      expect(result.repetitions).toBe(0);
    }
  });

  it('does not report shoulder asymmetry for similar angles', () => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 20 });

    const result = tracker.processFrame(makeShoulderLandmarks(80, 0.95, 80));

    expect(result.measurement_reliable).toBe(true);
    expect(result.movement_checks).not.toContain('asymmetrical_shoulder_flexion');
  });

  it('does not report shoulder asymmetry for a difference below the configured threshold', () => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 25 });

    const result = tracker.processFrame(makeShoulderLandmarks(80, 0.95, 100));

    expect(result.movement_checks).not.toContain('asymmetrical_shoulder_flexion');
  });

  it('reports shoulder asymmetry when the difference exceeds the configured threshold', () => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 20 });

    const result = tracker.processFrame(makeShoulderLandmarks(70, 0.95, 95));

    expect(result.measurement_reliable).toBe(true);
    expect(result.movement_checks).toContain('asymmetrical_shoulder_flexion');
  });

  it.each([
    ['left', 11],
    ['right', 12],
  ] as const)('does not report shoulder asymmetry when the %s side is missing', (_side, missingIndex) => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 10 });
    const landmarks = makeShoulderLandmarks(60, 0.95, 120);
    delete landmarks[missingIndex];

    const result = tracker.processFrame(landmarks);

    expect(result.measurement_reliable).toBe(false);
    expect(result.movement_checks).toContain('missing_landmarks');
    expect(result.movement_checks).not.toContain('asymmetrical_shoulder_flexion');
  });

  it('does not report shoulder asymmetry when either side has low visibility', () => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 10 });
    const landmarks = makeShoulderLandmarks(60, 0.95, 120);
    landmarks[14].visibility = 0.3;

    const result = tracker.processFrame(landmarks);

    expect(result.measurement_reliable).toBe(false);
    expect(result.movement_checks).toContain('low_visibility_arms');
    expect(result.movement_checks).not.toContain('asymmetrical_shoulder_flexion');
  });

  it.each([
    ['invalid coordinates', (landmarks: Landmark[]) => { landmarks[13].x = Number.NaN; }, 'invalid_coordinates'],
    ['invalid visibility', (landmarks: Landmark[]) => { landmarks[14].visibility = Number.NaN; }, 'invalid_visibility'],
  ])('does not report shoulder asymmetry for %s', (_failure, invalidate, expectedCheck) => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 10 });
    const landmarks = makeShoulderLandmarks(60, 0.95, 120);
    invalidate(landmarks);

    const result = tracker.processFrame(landmarks);

    expect(result.measurement_reliable).toBe(false);
    expect(result.movement_checks).toContain(expectedCheck);
    expect(result.movement_checks).not.toContain('asymmetrical_shoulder_flexion');
  });

  it('does not report shoulder asymmetry when either side has degenerate angle geometry', () => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 10 });
    const landmarks = makeShoulderLandmarks(60, 0.95, 120);
    landmarks[13] = { ...landmarks[11] };

    const result = tracker.processFrame(landmarks);

    expect(result.measurement_reliable).toBe(false);
    expect(result.movement_checks).toContain('invalid_landmarks');
    expect(result.movement_checks).not.toContain('asymmetrical_shoulder_flexion');
  });

  it('preserves reliability feedback without emitting shoulder asymmetry for an unreliable side', () => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 10 });
    const landmarks = makeShoulderLandmarks(60, 0.95, 120);
    landmarks[23].visibility = 0.2;

    const result = tracker.processFrame(landmarks);

    expect(result.measurement_reliable).toBe(false);
    expect(result.movement_checks).toContain('low_visibility_arms');
    expect(result.movement_checks).not.toContain('asymmetrical_shoulder_flexion');
    expect(result.current_phase).toBe('unreliable');
  });

  it('does not alter shoulder repetition counting when asymmetry feedback is present', () => {
    const tracker = new ShoulderFlexionTracker({ asymmetryThreshold: 20 });

    tracker.processFrame(makeShoulderLandmarks(20, 0.95, 20));
    const raising = tracker.processFrame(makeShoulderLandmarks(80, 0.95, 70));
    expect(raising.repetitions).toBe(0);
    expect(raising.current_phase).toBe('eccentric');

    const peak = tracker.processFrame(makeShoulderLandmarks(130, 0.95, 100));
    expect(peak.movement_checks).toContain('asymmetrical_shoulder_flexion');
    expect(peak.repetitions).toBe(0);
    expect(peak.current_phase).toBe('inflection');

    const lowering = tracker.processFrame(makeShoulderLandmarks(60, 0.95, 45));
    expect(lowering.repetitions).toBe(0);
    expect(lowering.current_phase).toBe('concentric');

    const returned = tracker.processFrame(makeShoulderLandmarks(20, 0.95, 20));
    expect(returned.repetitions).toBe(1);
    expect(returned.current_phase).toBe('completed');
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
    tracker.processFrame(makeShoulderLandmarks(80));

    const unreliable = tracker.processFrame(null);
    expect(unreliable.measurement_reliable).toBe(false);
    expect(unreliable.movement_checks).not.toContain('incomplete_shoulder_raise');
    const result = tracker.processFrame(makeShoulderLandmarks(20));

    expect(result.repetitions).toBe(0);
    expect(result.current_phase).toBe('idle');
    expect(result.movement_checks).not.toContain('incomplete_shoulder_raise');
  });

  const shoulderReliabilityFailures: Array<{
    name: string;
    check: string;
    invalidate: (landmarks: Landmark[]) => void;
  }> = [
    {
      name: 'missing landmarks',
      check: 'missing_landmarks',
      invalidate: (landmarks) => { delete landmarks[11]; },
    },
    {
      name: 'low visibility',
      check: 'low_visibility_arms',
      invalidate: (landmarks) => { landmarks[11].visibility = 0.3; },
    },
    {
      name: 'invalid coordinates',
      check: 'invalid_coordinates',
      invalidate: (landmarks) => { landmarks[11].x = Number.NaN; },
    },
    {
      name: 'invalid geometry',
      check: 'invalid_landmarks',
      invalidate: (landmarks) => {
        landmarks[13] = { ...landmarks[11] };
        landmarks[14] = { ...landmarks[12] };
      },
    },
  ];

  for (const failure of shoulderReliabilityFailures) {
    it(`reports ${failure.name} and discards an in-progress shoulder raise`, () => {
      const tracker = new ShoulderFlexionTracker();
      tracker.processFrame(makeShoulderLandmarks(20));
      tracker.processFrame(makeShoulderLandmarks(80));

      const invalid = makeShoulderLandmarks(90);
      failure.invalidate(invalid);
      const result = tracker.processFrame(invalid);

      expect(result.measurement_reliable).toBe(false);
      expect(result.current_phase).toBe('unreliable');
      expect(result.movement_checks).toContain(failure.check);
      expect(result.movement_checks).not.toContain('incomplete_shoulder_raise');
      expect(result.repetitions).toBe(0);

      const returned = tracker.processFrame(makeShoulderLandmarks(20));
      expect(returned.repetitions).toBe(0);
      expect(returned.current_phase).toBe('idle');
      expect(returned.movement_checks).not.toContain('incomplete_shoulder_raise');
    });
  }

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

describe('Malayalam Movement Voice Coach', () => {
  it('announces exercise setup instructions', () => {
    expect(MOVEMENT_COACH_MESSAGES.bodyweight_squat.start).toContain('കാലുകൾ');
    expect(MOVEMENT_COACH_MESSAGES.shoulder_flexion.start).toContain('കൈ');
  });

  it('uses English cues when English speech is selected', () => {
    expect(getMovementCoachStartMessage('bodyweight_squat', 'en-IN')).toContain('Let us begin');
    expect(getMovementCoachMessage(
      'shoulder_flexion',
      'eccentric',
      0,
      'idle',
      0,
      true,
      [],
      {},
      'en-IN',
    )).toContain('Raise your arm slowly');
  });

  it('announces phase transitions and completed repetitions', () => {
    expect(getMovementCoachMessage(
      'bodyweight_squat',
      'eccentric',
      0,
      'idle',
      0,
      true,
    )).toContain('താഴേക്ക്');

    expect(getMovementCoachMessage(
      'shoulder_flexion',
      'completed',
      5,
      'concentric',
      4,
      true,
    )).toContain('5');
  });

  it('announces unreliable tracking only once until tracking recovers', () => {
    expect(getMovementCoachMessage('bodyweight_squat', 'unreliable', 0, 'idle', 0, false)).toContain('ചലനം');
    expect(getMovementCoachMessage('bodyweight_squat', 'unreliable', 0, 'unreliable', 0, false)).toBeNull();
  });

  it('coaches the patient to slow down when movement checks fail', () => {
    expect(getMovementCoachMessage(
      'bodyweight_squat',
      'eccentric',
      0,
      'idle',
      0,
      true,
      ['asymmetrical_knee_flexion'],
    )).toContain('പതുക്കെ');
  });
});

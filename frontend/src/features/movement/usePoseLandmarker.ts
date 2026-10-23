import { useState, useEffect, useRef, useCallback } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { CanonicalExerciseId, MovementResult } from '../../types/vision';
import { SquatTracker } from './squatTracker';
import { ShoulderFlexionTracker } from './shoulderFlexionTracker';
import { Landmark } from './geometry';

export interface UsePoseLandmarkerOptions {
  exerciseId: CanonicalExerciseId;
  onMovementResult?: (result: MovementResult) => void;
  enabled?: boolean;
}

export function usePoseLandmarker({ exerciseId, onMovementResult, enabled = true }: UsePoseLandmarkerOptions) {
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [lastResult, setLastResult] = useState<MovementResult | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const squatTrackerRef = useRef(new SquatTracker());
  const shoulderTrackerRef = useRef(new ShoulderFlexionTracker());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const simStepRef = useRef<number>(0);

  // Reset trackers on exercise change
  useEffect(() => {
    squatTrackerRef.current.reset();
    shoulderTrackerRef.current.reset();
    setLastResult(null);
  }, [exerciseId]);

  // Initialize MediaPipe PoseLandmarker
  useEffect(() => {
    let active = true;

    async function loadLandmarker() {
      try {
        setIsModelLoading(true);
        setModelError(null);

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (!active) return;

        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (active) {
          landmarkerRef.current = landmarker;
          setIsModelLoading(false);
        }
      } catch (err: any) {
        console.warn('[RehabSense Vision] MediaPipe WebGL initialization notice:', err.message);
        if (active) {
          setModelError('MediaPipe model running in fallback/simulated kinematic mode.');
          setIsModelLoading(false);
          setIsSimulated(true);
        }
      }
    }

    loadLandmarker();

    return () => {
      active = false;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // Frame processing loop
  const processFrame = useCallback(() => {
    if (!enabled) return;

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (landmarker && video && video.readyState >= 2 && !isSimulated) {
      try {
        const startTimeMs = performance.now();
        const results = landmarker.detectForVideo(video, startTimeMs);

        if (results.landmarks && results.landmarks.length > 0) {
          const rawLandmarks = results.landmarks[0] as Landmark[];
          let res: MovementResult;

          if (exerciseId === 'bodyweight_squat') {
            res = squatTrackerRef.current.processFrame(rawLandmarks);
          } else {
            res = shoulderTrackerRef.current.processFrame(rawLandmarks);
          }

          setLastResult(res);
          onMovementResult?.(res);
        }
      } catch (err) {
        // Continue loop without crashing
      }
    } else if (isSimulated && enabled) {
      // Synthetic kinematic demonstration stream
      simStepRef.current = (simStepRef.current + 1) % 120;
      const progress = simStepRef.current / 120; // 0 to 1
      const sinWave = (Math.sin(progress * Math.PI * 2 - Math.PI / 2) + 1) / 2; // 0 to 1

      let res: MovementResult;
      const ts = new Date().toISOString();

      if (exerciseId === 'bodyweight_squat') {
        // Knee angle oscillates between 170 (standing) and 90 (squat depth)
        const kneeAngle = Math.round(170 - sinWave * 80);
        const dummyLandmarks: Landmark[] = Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.95 });
        // L Hip 23, L Knee 25, L Ankle 27
        const rad = (kneeAngle * Math.PI) / 180;
        dummyLandmarks[23] = { x: 0.5, y: 0.4, visibility: 0.95 };
        dummyLandmarks[24] = { x: 0.5, y: 0.4, visibility: 0.95 };
        dummyLandmarks[25] = { x: 0.5, y: 0.65, visibility: 0.95 };
        dummyLandmarks[26] = { x: 0.5, y: 0.65, visibility: 0.95 };
        dummyLandmarks[27] = { x: 0.5 + Math.sin(Math.PI - rad) * 0.2, y: 0.65 + Math.cos(Math.PI - rad) * 0.2, visibility: 0.95 };
        dummyLandmarks[28] = { ...dummyLandmarks[27] };

        res = squatTrackerRef.current.processFrame(dummyLandmarks);
      } else {
        // Arm angle oscillates between 20 (resting) and 130 (peak raise)
        const armAngle = Math.round(20 + sinWave * 110);
        const dummyLandmarks: Landmark[] = Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.95 });
        const rad = (armAngle * Math.PI) / 180;
        dummyLandmarks[23] = { x: 0.5, y: 0.7, visibility: 0.95 };
        dummyLandmarks[24] = { x: 0.5, y: 0.7, visibility: 0.95 };
        dummyLandmarks[11] = { x: 0.5, y: 0.4, visibility: 0.95 };
        dummyLandmarks[12] = { x: 0.5, y: 0.4, visibility: 0.95 };
        dummyLandmarks[13] = { x: 0.5 + Math.sin(rad) * 0.25, y: 0.4 + Math.cos(rad) * 0.25, visibility: 0.95 };
        dummyLandmarks[14] = { ...dummyLandmarks[13] };

        res = shoulderTrackerRef.current.processFrame(dummyLandmarks);
      }

      setLastResult(res);
      onMovementResult?.(res);
    }

    requestRef.current = requestAnimationFrame(processFrame);
  }, [enabled, exerciseId, isSimulated, onMovementResult]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [processFrame]);

  // Start webcam
  const startCamera = async (videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      videoElement.srcObject = stream;
      await videoElement.play();
      setCameraActive(true);
      setIsSimulated(false);
    } catch (err: any) {
      console.warn('[RehabSense Vision] Webcam access not granted or unavailable, switching to demo mode:', err.message);
      setIsSimulated(true);
      setCameraActive(true);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  return {
    isModelLoading,
    modelError,
    cameraActive,
    isSimulated,
    lastResult,
    startCamera,
    stopCamera,
    setSimulationMode: setIsSimulated,
  };
}

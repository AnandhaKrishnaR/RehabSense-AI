import { useState, useEffect, useRef, useCallback } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { CanonicalExerciseId, MovementResult } from '../../types/vision';
import { SquatTracker } from './squatTracker';
import { ShoulderFlexionTracker } from './shoulderFlexionTracker';
import { Landmark } from './geometry';
import { isNewVideoFrame, isVideoFrameStale, resolvePoseFrameSource } from './videoFrameUtils';

export interface UsePoseLandmarkerOptions {
  exerciseId: CanonicalExerciseId;
  onMovementResult?: (result: MovementResult) => void;
  onLandmarks?: (landmarks: Landmark[] | null) => void;
  enabled?: boolean;
}

export function usePoseLandmarker({ exerciseId, onMovementResult, onLandmarks, enabled = true }: UsePoseLandmarkerOptions) {
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [lastResult, setLastResult] = useState<MovementResult | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const squatTrackerRef = useRef(new SquatTracker());
  const shoulderTrackerRef = useRef(new ShoulderFlexionTracker());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<number | null>(null);
  const simStepRef = useRef<number>(0);
  const lastProcessedVideoTimeRef = useRef<number | null>(null);
  const lastProcessedVideoAtRef = useRef<number | null>(null);
  const staleFrameReportedRef = useRef(false);

  const resetTracking = useCallback(() => {
    squatTrackerRef.current.reset();
    shoulderTrackerRef.current.reset();
    simStepRef.current = 0;
    lastProcessedVideoTimeRef.current = null;
    lastProcessedVideoAtRef.current = null;
    staleFrameReportedRef.current = false;
    setLastResult(null);
    setTrackingError(null);
  }, []);

  const setSimulationMode = useCallback((enabled: boolean) => {
    resetTracking();
    setCameraError(null);
    setIsSimulated(enabled);
  }, [resetTracking]);

  // Reset trackers on exercise change
  useEffect(() => {
    resetTracking();
  }, [exerciseId, resetTracking]);

  useEffect(() => {
    if (!enabled) {
      squatTrackerRef.current.discardIncompleteMovement();
      shoulderTrackerRef.current.discardIncompleteMovement();
    }
  }, [enabled]);

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
          setModelError(null);
          setIsModelLoading(false);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[RehabSense Vision] MediaPipe initialization failed:', message);
        if (active) {
          setModelError(message);
          setIsModelLoading(false);
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
    if (!enabled) {
      onLandmarks?.(null);
      return;
    }

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    let currentLandmarks: Landmark[] | null = null;
    let hasNewLandmarks = false;
    const frameSource = resolvePoseFrameSource(
      isSimulated,
      !!video && video.readyState >= 2,
      !!landmarker
    );

    if (frameSource === 'live' && landmarker && video) {
      const now = performance.now();
      if (isNewVideoFrame(video.currentTime, lastProcessedVideoTimeRef.current)) {
        if (isVideoFrameStale(now, lastProcessedVideoAtRef.current)) {
          squatTrackerRef.current.discardIncompleteMovement();
          shoulderTrackerRef.current.discardIncompleteMovement();
        }
        lastProcessedVideoTimeRef.current = video.currentTime;
        lastProcessedVideoAtRef.current = now;
        staleFrameReportedRef.current = false;
        hasNewLandmarks = true;
        try {
          const results = landmarker.detectForVideo(video, now);
          currentLandmarks = results.landmarks?.[0] as Landmark[] | undefined ?? null;
          const res = exerciseId === 'bodyweight_squat'
            ? squatTrackerRef.current.processFrame(currentLandmarks)
            : shoulderTrackerRef.current.processFrame(currentLandmarks);
          setLastResult(res);
          onMovementResult?.(res);
          setTrackingError(null);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          const res = exerciseId === 'bodyweight_squat'
            ? squatTrackerRef.current.processFrame(null)
            : shoulderTrackerRef.current.processFrame(null);
          setLastResult(res);
          onMovementResult?.(res);
          setTrackingError(message);
        }
      } else if (!staleFrameReportedRef.current && isVideoFrameStale(now, lastProcessedVideoAtRef.current)) {
        staleFrameReportedRef.current = true;
        hasNewLandmarks = true;
        const res = exerciseId === 'bodyweight_squat'
          ? squatTrackerRef.current.processFrame(null)
          : shoulderTrackerRef.current.processFrame(null);
        setLastResult(res);
        onMovementResult?.(res);
        setTrackingError('No new camera frames received.');
      }
    } else if (frameSource === 'demo' && enabled) {
      // Synthetic kinematic demonstration stream
      hasNewLandmarks = true;
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
        currentLandmarks = dummyLandmarks;

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
        currentLandmarks = dummyLandmarks;

        res = shoulderTrackerRef.current.processFrame(dummyLandmarks);
      }

      setLastResult(res);
      onMovementResult?.(res);
      setTrackingError(null);
    }

    if (hasNewLandmarks) onLandmarks?.(currentLandmarks);
    requestRef.current = requestAnimationFrame(processFrame);
  }, [enabled, exerciseId, isSimulated, onLandmarks, onMovementResult]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [processFrame]);

  // Start webcam
  const startCamera = async (videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    setCameraError(null);
    setTrackingError(null);
    setIsSimulated(false);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      videoElement.srcObject = stream;
      await videoElement.play();
      setCameraActive(true);
    } catch (err: unknown) {
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement.srcObject === stream) videoElement.srcObject = null;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[RehabSense Vision] Webcam initialization failed:', message);
      setCameraActive(false);
      setCameraError(message);
    }
  };

  const stopCamera = () => {
    onLandmarks?.(null);
    lastProcessedVideoTimeRef.current = null;
    lastProcessedVideoAtRef.current = null;
    staleFrameReportedRef.current = false;
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
    cameraError,
    trackingError,
    lastResult,
    resetTracking,
    startCamera,
    stopCamera,
    setSimulationMode,
  };
}

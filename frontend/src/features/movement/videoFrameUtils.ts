export type PoseFrameSource = 'live' | 'demo' | 'unavailable';
export const VIDEO_FRAME_STALE_TIMEOUT_MS = 1000;

export function resolvePoseFrameSource(
  demoMode: boolean,
  cameraReady: boolean,
  poseModelReady: boolean
): PoseFrameSource {
  if (demoMode) return 'demo';
  return cameraReady && poseModelReady ? 'live' : 'unavailable';
}

export function isNewVideoFrame(currentTime: number, lastProcessedTime: number | null): boolean {
  return Number.isFinite(currentTime) && (lastProcessedTime === null || currentTime > lastProcessedTime);
}

export function isVideoFrameStale(now: number, lastProcessedAt: number | null): boolean {
  return lastProcessedAt !== null && now - lastProcessedAt >= VIDEO_FRAME_STALE_TIMEOUT_MS;
}

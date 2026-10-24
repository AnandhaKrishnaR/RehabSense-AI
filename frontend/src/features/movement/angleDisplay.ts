export function formatAverageKneeAngle(
  leftAngle: number | null | undefined,
  rightAngle: number | null | undefined
): string {
  if (typeof leftAngle !== 'number' || !Number.isFinite(leftAngle)
    || typeof rightAngle !== 'number' || !Number.isFinite(rightAngle)) {
    return '--°';
  }

  return `${Math.round(((leftAngle + rightAngle) / 2) * 10) / 10}°`;
}

/**
 * Pure geometric functions for MediaPipe landmark joint angle calculations.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export function getVisibility(landmark: Landmark | undefined): number {
  const visibility = landmark?.visibility;
  return isFiniteNumber(visibility) && visibility >= 0 && visibility <= 1 ? visibility : 0;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasValidCoordinates(point: Partial<Landmark> | undefined): point is Landmark {
  return !!point && isFiniteNumber(point.x) && isFiniteNumber(point.y);
}

/**
 * Calculates the interior angle in degrees at vertex B formed by rays BA and BC.
 * Uses 2D or 3D Euclidean vector dot product.
 * Returns angle in degrees between 0.0 and 180.0.
 */
export function calculateAngle(a: Landmark | undefined, b: Landmark | undefined, c: Landmark | undefined, use3D = false): number {
  if (!hasValidCoordinates(a) || !hasValidCoordinates(b) || !hasValidCoordinates(c)) {
    return Number.NaN;
  }

  if (use3D && (!isFiniteNumber(a.z) || !isFiniteNumber(b.z) || !isFiniteNumber(c.z))) {
    return Number.NaN;
  }

  const ba = {
    x: a.x - b.x,
    y: a.y - b.y,
    z: use3D ? (a.z ?? 0) - (b.z ?? 0) : 0,
  };

  const bc = {
    x: c.x - b.x,
    y: c.y - b.y,
    z: use3D ? (c.z ?? 0) - (b.z ?? 0) : 0,
  };

  const dotProduct = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);

  if (!Number.isFinite(dotProduct) || !Number.isFinite(magBA) || !Number.isFinite(magBC) || magBA === 0 || magBC === 0) {
    return Number.NaN;
  }

  const cosine = Math.max(-1.0, Math.min(1.0, dotProduct / (magBA * magBC)));
  const angleRad = Math.acos(cosine);
  const angleDeg = (angleRad * 180.0) / Math.PI;

  return Math.round(angleDeg * 10) / 10;
}

/**
 * Checks whether all required landmark indices meet the minimum visibility threshold.
 */
export function checkVisibility(
  landmarks: Landmark[] | null | undefined,
  requiredIndices: number[],
  minThreshold = 0.65
): {
  reliable: boolean;
  minFoundVisibility: number;
  missingIndices: number[];
  lowVisibilityIndices: number[];
  invalidCoordinateIndices: number[];
  invalidVisibilityIndices: number[];
} {
  let reliable = true;
  let minFoundVisibility = 1.0;
  const missingIndices: number[] = [];
  const lowVisibilityIndices: number[] = [];
  const invalidCoordinateIndices: number[] = [];
  const invalidVisibilityIndices: number[] = [];

  if (!Array.isArray(landmarks)) {
    return {
      reliable: false,
      minFoundVisibility: 0,
      missingIndices: requiredIndices,
      lowVisibilityIndices,
      invalidCoordinateIndices,
      invalidVisibilityIndices,
    };
  }

  for (const idx of requiredIndices) {
    const lm = landmarks[idx];
    if (!lm) {
      reliable = false;
      minFoundVisibility = 0.0;
      missingIndices.push(idx);
      continue;
    }

    if (!hasValidCoordinates(lm)) {
      reliable = false;
      minFoundVisibility = 0.0;
      invalidCoordinateIndices.push(idx);
      continue;
    }

    const vis = lm.visibility;
    if (!isFiniteNumber(vis) || vis < 0 || vis > 1) {
      reliable = false;
      minFoundVisibility = 0.0;
      invalidVisibilityIndices.push(idx);
      continue;
    }

    if (vis < minFoundVisibility) {
      minFoundVisibility = vis;
    }
    if (vis < minThreshold) {
      reliable = false;
      lowVisibilityIndices.push(idx);
    }
  }

  return {
    reliable,
    minFoundVisibility: Math.round(minFoundVisibility * 100) / 100,
    missingIndices,
    lowVisibilityIndices,
    invalidCoordinateIndices,
    invalidVisibilityIndices,
  };
}

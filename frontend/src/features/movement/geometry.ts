/**
 * Pure geometric functions for MediaPipe landmark joint angle calculations.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/**
 * Calculates the interior angle in degrees at vertex B formed by rays BA and BC.
 * Uses 2D or 3D Euclidean vector dot product.
 * Returns angle in degrees between 0.0 and 180.0.
 */
export function calculateAngle(a: Landmark, b: Landmark, c: Landmark, use3D = false): number {
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

  if (magBA === 0 || magBC === 0) {
    return 180.0;
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
  landmarks: Landmark[],
  requiredIndices: number[],
  minThreshold = 0.65
): { reliable: boolean; minFoundVisibility: number; missingIndices: number[] } {
  let reliable = true;
  let minFoundVisibility = 1.0;
  const missingIndices: number[] = [];

  for (const idx of requiredIndices) {
    const lm = landmarks[idx];
    if (!lm) {
      reliable = false;
      minFoundVisibility = 0.0;
      missingIndices.push(idx);
      continue;
    }

    const vis = lm.visibility ?? 1.0;
    if (vis < minFoundVisibility) {
      minFoundVisibility = vis;
    }
    if (vis < minThreshold) {
      reliable = false;
      missingIndices.push(idx);
    }
  }

  return {
    reliable,
    minFoundVisibility: Math.round(minFoundVisibility * 100) / 100,
    missingIndices,
  };
}

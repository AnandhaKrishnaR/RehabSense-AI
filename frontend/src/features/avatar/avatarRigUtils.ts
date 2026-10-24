import * as THREE from 'three';
import { CanonicalExerciseId } from '../../types/vision';

export const DEFAULT_AVATAR_MODEL_PATH = 'frontend/public/assets/rehabsense-avatar.glb';

/**
 * Resolves a model path or URL into a browser-fetchable URL.
 * Normalizes 'frontend/public/' and 'public/' prefixes which are served at '/' by Vite.
 */
export function resolveAvatarModelUrl(pathOrUrl?: string): string {
  const configured = (pathOrUrl || (import.meta as any).env?.VITE_AVATAR_MODEL_URL || DEFAULT_AVATAR_MODEL_PATH).trim();

  // If path starts with frontend/public/, strip frontend/public/
  if (configured.startsWith('frontend/public/')) {
    return '/' + configured.slice('frontend/public/'.length);
  }
  // If path starts with public/, strip public/
  if (configured.startsWith('public/')) {
    return '/' + configured.slice('public/'.length);
  }
  // If already absolute URL or starts with /, return as is
  if (configured.startsWith('/') || configured.startsWith('http://') || configured.startsWith('https://')) {
    return configured;
  }
  // Otherwise prefix with /
  return '/' + configured;
}

export interface HumanoidBones {
  hips?: THREE.Bone;
  spine?: THREE.Bone;
  leftUpLeg?: THREE.Bone;
  rightUpLeg?: THREE.Bone;
  leftLeg?: THREE.Bone;
  rightLeg?: THREE.Bone;
  leftArm?: THREE.Bone;
  rightArm?: THREE.Bone;
  leftForeArm?: THREE.Bone;
  rightForeArm?: THREE.Bone;
  neck?: THREE.Bone;
  head?: THREE.Bone;
}

const BONE_CANDIDATES: Record<keyof HumanoidBones, string[]> = {
  hips: ['hips', 'pelvis', 'mixamorighips', 'root_hips', 'bip01_pelvis'],
  spine: ['spine1', 'spine', 'chest', 'upperchest', 'mixamorigspine1', 'mixamorigspine', 'bip01_spine'],
  leftUpLeg: ['leftupleg', 'leftupperleg', 'leftthigh', 'left_upleg', 'left_thigh', 'mixamorigleftupleg', 'bip01_l_thigh'],
  rightUpLeg: ['rightupleg', 'rightupperleg', 'rightthigh', 'right_upleg', 'right_thigh', 'mixamorigrightupleg', 'bip01_r_thigh'],
  leftLeg: ['leftleg', 'leftlowerleg', 'leftcalf', 'leftknee', 'left_leg', 'left_calf', 'mixamorigleftleg', 'bip01_l_calf'],
  rightLeg: ['rightleg', 'rightlowerleg', 'rightcalf', 'rightknee', 'right_leg', 'right_calf', 'mixamorigrightleg', 'bip01_r_calf'],
  leftArm: ['leftarm', 'leftupperarm', 'left_arm', 'left_upperarm', 'mixamorigleftarm', 'bip01_l_upperarm'],
  rightArm: ['rightarm', 'rightupperarm', 'right_arm', 'right_upperarm', 'mixamorigrightarm', 'bip01_r_upperarm'],
  leftForeArm: ['leftforearm', 'leftlowerarm', 'leftelbow', 'left_forearm', 'mixamorigleftforearm', 'bip01_l_forearm'],
  rightForeArm: ['rightforearm', 'rightlowerarm', 'rightelbow', 'right_forearm', 'mixamorigrightforearm', 'bip01_r_forearm'],
  neck: ['neck', 'mixamorigneck', 'bip01_neck'],
  head: ['head', 'mixamorighead', 'bip01_head'],
};

/**
 * Searches a Three.js scene for bones matching canonical humanoid roles.
 */
export function mapHumanoidBones(root: THREE.Object3D): HumanoidBones {
  const bones: THREE.Bone[] = [];
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone || node.type === 'Bone') {
      bones.push(node as THREE.Bone);
    }
  });

  const result: HumanoidBones = {};

  for (const [key, candidates] of Object.entries(BONE_CANDIDATES) as [keyof HumanoidBones, string[]][]) {
    for (const candidate of candidates) {
      const cleanCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matched = bones.find((bone) => {
        const cleanName = bone.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        // 1. Exact match
        if (cleanName === cleanCandidate) return true;
        // 2. Suffix match (e.g. mixamorig_leftupleg ends with leftupleg)
        if (cleanName.endsWith(cleanCandidate)) return true;
        return false;
      });

      if (matched) {
        result[key] = matched;
        break;
      }
    }
  }

  return result;
}

/**
 * Checks whether the mapped skeleton contains the necessary bones to demonstrate the exercise procedurally.
 */
export function checkRigCompatibility(
  bones: HumanoidBones,
  exerciseId: CanonicalExerciseId
): { isCompatible: boolean; missingBones: string[] } {
  const missingBones: string[] = [];

  if (exerciseId === 'bodyweight_squat') {
    if (!bones.leftUpLeg) missingBones.push('LeftUpLeg');
    if (!bones.rightUpLeg) missingBones.push('RightUpLeg');
    if (!bones.leftLeg) missingBones.push('LeftLeg');
    if (!bones.rightLeg) missingBones.push('RightLeg');
    // Hips is strongly recommended for pelvis drop
    if (!bones.hips) missingBones.push('Hips');
  } else if (exerciseId === 'shoulder_flexion') {
    if (!bones.leftArm) missingBones.push('LeftArm');
    if (!bones.rightArm) missingBones.push('RightArm');
  }

  return {
    isCompatible: missingBones.length === 0,
    missingBones,
  };
}

/**
 * Locates an AnimationClip in the GLB animations array matching the given canonical exercise.
 */
export function findAnimationClip(
  animations: THREE.AnimationClip[] | undefined,
  exerciseId: CanonicalExerciseId
): THREE.AnimationClip | null {
  if (!animations || animations.length === 0) return null;

  const target = exerciseId.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Exact match
  const exact = animations.find(
    (clip) => clip.name.toLowerCase().replace(/[^a-z0-9]/g, '') === target
  );
  if (exact) return exact;

  // 2. Canonical aliases
  if (exerciseId === 'bodyweight_squat') {
    const alias = animations.find((clip) => {
      const n = clip.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return n.includes('squat') || n.includes('bodyweight');
    });
    if (alias) return alias;
  }

  if (exerciseId === 'shoulder_flexion') {
    const alias = animations.find((clip) => {
      const n = clip.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return n.includes('shoulder') || n.includes('flexion') || n.includes('armraise');
    });
    if (alias) return alias;
  }

  return null;
}

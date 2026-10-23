import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_AVATAR_MODEL_PATH,
  resolveAvatarModelUrl,
  mapHumanoidBones,
  checkRigCompatibility,
  findAnimationClip,
  HumanoidBones,
} from '../features/avatar/avatarRigUtils';

describe('Avatar Model URL Resolution', () => {
  it('defaults to frontend/public/assets/rehabsense-avatar.glb normalized to /assets/rehabsense-avatar.glb', () => {
    expect(DEFAULT_AVATAR_MODEL_PATH).toBe('frontend/public/assets/rehabsense-avatar.glb');
    expect(resolveAvatarModelUrl()).toBe('/assets/rehabsense-avatar.glb');
  });

  it('normalizes paths prefixed with frontend/public/', () => {
    expect(resolveAvatarModelUrl('frontend/public/assets/rehabsense-avatar.glb')).toBe('/assets/rehabsense-avatar.glb');
    expect(resolveAvatarModelUrl('frontend/public/custom/avatar.glb')).toBe('/custom/avatar.glb');
  });

  it('normalizes paths prefixed with public/', () => {
    expect(resolveAvatarModelUrl('public/assets/rehabsense-avatar.glb')).toBe('/assets/rehabsense-avatar.glb');
  });

  it('preserves already absolute paths and URLs', () => {
    expect(resolveAvatarModelUrl('/assets/custom.glb')).toBe('/assets/custom.glb');
    expect(resolveAvatarModelUrl('https://example.com/character.glb')).toBe('https://example.com/character.glb');
  });
});

describe('Avatar Rig Bone Mapping & Compatibility', () => {
  function createMockSkeleton(boneNames: string[]): THREE.Group {
    const group = new THREE.Group();
    for (const name of boneNames) {
      const bone = new THREE.Bone();
      bone.name = name;
      group.add(bone);
    }
    return group;
  }

  it('correctly maps standard Mixamo bone names', () => {
    const scene = createMockSkeleton([
      'mixamorig:Hips',
      'mixamorig:Spine',
      'mixamorig:LeftUpLeg',
      'mixamorig:LeftLeg',
      'mixamorig:RightUpLeg',
      'mixamorig:RightLeg',
      'mixamorig:LeftArm',
      'mixamorig:RightArm',
      'mixamorig:LeftForeArm',
      'mixamorig:RightForeArm',
    ]);

    const bones = mapHumanoidBones(scene);
    expect(bones.hips?.name).toBe('mixamorig:Hips');
    expect(bones.leftUpLeg?.name).toBe('mixamorig:LeftUpLeg');
    expect(bones.leftLeg?.name).toBe('mixamorig:LeftLeg');
    expect(bones.rightUpLeg?.name).toBe('mixamorig:RightUpLeg');
    expect(bones.rightLeg?.name).toBe('mixamorig:RightLeg');
    expect(bones.leftArm?.name).toBe('mixamorig:LeftArm');
    expect(bones.rightArm?.name).toBe('mixamorig:RightArm');
  });

  it('correctly maps ReadyPlayerMe / standard humanoid bone names', () => {
    const scene = createMockSkeleton([
      'Hips',
      'Spine',
      'LeftUpLeg',
      'LeftLeg',
      'RightUpLeg',
      'RightLeg',
      'LeftArm',
      'RightArm',
    ]);

    const bones = mapHumanoidBones(scene);
    expect(bones.hips?.name).toBe('Hips');
    expect(bones.leftUpLeg?.name).toBe('LeftUpLeg');
    expect(bones.leftLeg?.name).toBe('LeftLeg');
    expect(bones.leftArm?.name).toBe('LeftArm');
    expect(bones.rightArm?.name).toBe('RightArm');
  });

  it('evaluates squat compatibility correctly', () => {
    const scene = createMockSkeleton([
      'Hips',
      'LeftUpLeg',
      'LeftLeg',
      'RightUpLeg',
      'RightLeg',
    ]);
    const bones = mapHumanoidBones(scene);
    const squatCheck = checkRigCompatibility(bones, 'bodyweight_squat');
    expect(squatCheck.isCompatible).toBe(true);
    expect(squatCheck.missingBones).toHaveLength(0);

    // Missing right leg
    const partialBones: HumanoidBones = { ...bones, rightLeg: undefined };
    const failedSquatCheck = checkRigCompatibility(partialBones, 'bodyweight_squat');
    expect(failedSquatCheck.isCompatible).toBe(false);
    expect(failedSquatCheck.missingBones).toContain('RightLeg');
  });

  it('evaluates shoulder flexion compatibility correctly', () => {
    const scene = createMockSkeleton(['LeftArm', 'RightArm']);
    const bones = mapHumanoidBones(scene);
    const shoulderCheck = checkRigCompatibility(bones, 'shoulder_flexion');
    expect(shoulderCheck.isCompatible).toBe(true);

    const missingArms: HumanoidBones = { leftArm: bones.leftArm };
    const failedCheck = checkRigCompatibility(missingArms, 'shoulder_flexion');
    expect(failedCheck.isCompatible).toBe(false);
    expect(failedCheck.missingBones).toContain('RightArm');
  });
});

describe('Animation Clip Resolution', () => {
  it('locates clips by exact canonical name or case-insensitive match', () => {
    const clips = [
      new THREE.AnimationClip('bodyweight_squat', 1.0, []),
      new THREE.AnimationClip('shoulder_flexion', 1.0, []),
    ];

    expect(findAnimationClip(clips, 'bodyweight_squat')?.name).toBe('bodyweight_squat');
    expect(findAnimationClip(clips, 'shoulder_flexion')?.name).toBe('shoulder_flexion');
  });

  it('locates clips by common alias if exact name is missing', () => {
    const clips = [
      new THREE.AnimationClip('Squat_Exercise', 1.0, []),
      new THREE.AnimationClip('Shoulder_ArmRaise', 1.0, []),
    ];

    expect(findAnimationClip(clips, 'bodyweight_squat')?.name).toBe('Squat_Exercise');
    expect(findAnimationClip(clips, 'shoulder_flexion')?.name).toBe('Shoulder_ArmRaise');
  });

  it('returns null if animation clip is missing', () => {
    const clips = [
      new THREE.AnimationClip('idle', 1.0, []),
      new THREE.AnimationClip('walk', 1.0, []),
    ];

    expect(findAnimationClip(clips, 'bodyweight_squat')).toBeNull();
    expect(findAnimationClip(clips, 'shoulder_flexion')).toBeNull();
  });
});

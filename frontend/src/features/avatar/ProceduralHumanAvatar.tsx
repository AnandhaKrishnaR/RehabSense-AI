import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CanonicalExerciseId, JointAngles } from '../../types/vision';

export type AvatarPostureMode = 'auto' | 'standing' | 'side_lying';

export interface ProceduralHumanAvatarProps {
  exerciseId: CanonicalExerciseId;
  isPlaying: boolean;
  speed: number;
  liveAngles?: JointAngles | null;
  mirror: boolean;
  replayKey: number;
  postureMode?: AvatarPostureMode;
}

export function ProceduralHumanAvatar({
  exerciseId,
  isPlaying,
  speed,
  liveAngles,
  mirror,
  replayKey,
  postureMode = 'standing',
}: ProceduralHumanAvatarProps) {
  // Articulation group refs
  const bodyGroupRef = useRef<THREE.Group>(null);
  const spineRef = useRef<THREE.Group>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const leftUpperLegRef = useRef<THREE.Group>(null);
  const rightUpperLegRef = useRef<THREE.Group>(null);
  const leftLowerLegRef = useRef<THREE.Group>(null);
  const rightLowerLegRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Group>(null);
  const rightFootRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftForeArmRef = useRef<THREE.Group>(null);
  const rightForeArmRef = useRef<THREE.Group>(null);

  const timeRef = useRef<number>(0);

  useEffect(() => {
    timeRef.current = 0;
  }, [exerciseId, replayKey, postureMode]);

  useFrame((_, delta) => {
    if (!isPlaying && !liveAngles) return;

    if (isPlaying) {
      timeRef.current += delta * speed * 1.8;
    }
    const cycle = (Math.sin(timeRef.current) + 1) / 2; // 0 to 1

    // 1. SIDE-LYING MAT POSTURE (Matches the uploaded reference picture)
    if (postureMode === 'side_lying') {
      if (bodyGroupRef.current) {
        // Position body lying on side atop the blue exercise mat
        bodyGroupRef.current.position.set(0.1, 0.28, 0);
        bodyGroupRef.current.rotation.set(0, 0, Math.PI / 2);
      }
      if (spineRef.current) {
        spineRef.current.rotation.set(0, 0, 0);
      }
      if (headGroupRef.current) {
        // Head tilted slightly resting on hand
        headGroupRef.current.rotation.set(0, 0, -0.25);
      }

      // Bottom arm (Right arm in rotated space) resting on mat supporting head
      if (rightArmRef.current) {
        rightArmRef.current.rotation.set(-0.2, 0, 1.4);
      }
      if (rightForeArmRef.current) {
        rightForeArmRef.current.rotation.set(0, 0, -1.9);
      }

      // Top arm (Left arm) resting hand forward on the mat for balance
      if (leftArmRef.current) {
        leftArmRef.current.rotation.set(0.8, -0.4, 0.3);
      }
      if (leftForeArmRef.current) {
        leftForeArmRef.current.rotation.set(-0.5, 0, 0.2);
      }

      // Bottom leg (Right leg) resting on mat with slight knee bend for stability
      if (rightUpperLegRef.current) {
        rightUpperLegRef.current.rotation.set(0.2, 0, 0.1);
      }
      if (rightLowerLegRef.current) {
        rightLowerLegRef.current.rotation.set(0.4, 0, 0);
      }

      // Top leg (Left leg): Demonstrates active side leg abduction / hip raise from the picture
      const legAbductRad = cycle * THREE.MathUtils.degToRad(35);
      if (leftUpperLegRef.current) {
        // Lateral leg raise upward away from mat
        leftUpperLegRef.current.rotation.set(-0.05, 0, legAbductRad);
      }
      if (leftLowerLegRef.current) {
        leftLowerLegRef.current.rotation.set(0, 0, 0);
      }
      return;
    }

    // 2. STANDING EXERCISE BIOMECHANICS (Squats & Shoulder Flexion)
    if (bodyGroupRef.current) {
      bodyGroupRef.current.rotation.set(0, 0, 0);
    }

    if (exerciseId === 'bodyweight_squat') {
      // Bodyweight Squat Kinematics
      const kneeFlexionRad = liveAngles?.left_knee != null
        ? THREE.MathUtils.degToRad(180 - liveAngles.left_knee)
        : cycle * THREE.MathUtils.degToRad(75);

      const hipFlexionRad = kneeFlexionRad * 0.85;
      const pelvisDrop = (kneeFlexionRad / 1.3) * 0.42;

      // Grounded pelvis drop above mat
      if (bodyGroupRef.current) {
        bodyGroupRef.current.position.set(0, 1.02 - pelvisDrop, 0);
      }
      // Torso lean forward to maintain center of balance
      if (spineRef.current) {
        spineRef.current.rotation.set(hipFlexionRad * 0.45, 0, 0);
      }
      // Keep head aligned comfortably looking forward
      if (headGroupRef.current) {
        headGroupRef.current.rotation.set(-hipFlexionRad * 0.35, 0, 0);
      }
      // Thighs flex forward
      if (leftUpperLegRef.current && rightUpperLegRef.current) {
        leftUpperLegRef.current.rotation.set(-hipFlexionRad, 0, 0);
        rightUpperLegRef.current.rotation.set(-hipFlexionRad, 0, 0);
      }
      // Knees bend backward
      if (leftLowerLegRef.current && rightLowerLegRef.current) {
        leftLowerLegRef.current.rotation.set(kneeFlexionRad * 1.18, 0, 0);
        rightLowerLegRef.current.rotation.set(kneeFlexionRad * 1.18, 0, 0);
      }
      // Feet stay flat on the exercise mat
      if (leftFootRef.current && rightFootRef.current) {
        leftFootRef.current.rotation.set(-kneeFlexionRad * 0.18, 0, 0);
        rightFootRef.current.rotation.set(-kneeFlexionRad * 0.18, 0, 0);
      }
      // Arms elevate forward for clinical balance
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.set(-hipFlexionRad * 0.88 - 0.15, 0, -Math.PI / 2);
        rightArmRef.current.rotation.set(-hipFlexionRad * 0.88 - 0.15, 0, Math.PI / 2);
      }
      if (leftForeArmRef.current && rightForeArmRef.current) {
        leftForeArmRef.current.rotation.set(-0.15, 0, 0);
        rightForeArmRef.current.rotation.set(-0.15, 0, 0);
      }
    } else {
      // Shoulder Flexion (Arm Raise) Kinematics
      const armElevationRad = liveAngles?.left_shoulder != null
        ? THREE.MathUtils.degToRad(liveAngles.left_shoulder)
        : cycle * THREE.MathUtils.degToRad(120);

      // Neutral standing posture on mat
      if (bodyGroupRef.current) bodyGroupRef.current.position.set(0, 1.02, 0);
      if (spineRef.current) spineRef.current.rotation.set(0, 0, 0);
      if (headGroupRef.current) headGroupRef.current.rotation.set(0, 0, 0);
      if (leftUpperLegRef.current) leftUpperLegRef.current.rotation.set(0, 0, 0);
      if (rightUpperLegRef.current) rightUpperLegRef.current.rotation.set(0, 0, 0);
      if (leftLowerLegRef.current) leftLowerLegRef.current.rotation.set(0, 0, 0);
      if (rightLowerLegRef.current) rightLowerLegRef.current.rotation.set(0, 0, 0);
      if (leftFootRef.current) leftFootRef.current.rotation.set(0, 0, 0);
      if (rightFootRef.current) rightFootRef.current.rotation.set(0, 0, 0);

      // Arms elevate smoothly forward and up
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.set(0, 0, -Math.PI / 2 - armElevationRad);
        rightArmRef.current.rotation.set(0, 0, Math.PI / 2 + armElevationRad);
      }
      if (leftForeArmRef.current && rightForeArmRef.current) {
        leftForeArmRef.current.rotation.set(0, 0, 0);
        rightForeArmRef.current.rotation.set(0, 0, 0);
      }
    }
  });

  const materials = useMemo(() => {
    const skin = new THREE.MeshPhysicalMaterial({ color: '#d8b99a', roughness: 0.48, clearcoat: 0.12 });
    const hair = new THREE.MeshPhysicalMaterial({ color: '#5a3b2d', roughness: 0.82 });
    const shirt = new THREE.MeshPhysicalMaterial({ color: '#08a979', roughness: 0.32, clearcoat: 0.24 });
    const pants = new THREE.MeshPhysicalMaterial({ color: '#1f2d49', roughness: 0.52 });
    const shoes = new THREE.MeshPhysicalMaterial({ color: '#e1e7ea', roughness: 0.62 });
    const mat = new THREE.MeshStandardMaterial({
      color: '#dfe6e9',
      roughness: 0.9,
    });
    return {
      skin,
      hair,
      shirt,
      pants,
      shoes,
      shoeSole: shoes,
      glasses: hair,
      lenses: skin,
      eyeWhite: new THREE.MeshStandardMaterial({ color: '#f8f7f2', roughness: 0.5 }),
      eyePupil: new THREE.MeshStandardMaterial({ color: '#172334', roughness: 0.35 }),
      lips: new THREE.MeshStandardMaterial({ color: '#70413b', roughness: 0.6 }),
      mat,
    };
  }, []);

  return (
    <group scale={mirror ? [-1, 1, 1] : [1, 1, 1]}>
      <group position={[0, 0, 0]}>
        <mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.mat}>
          <planeGeometry args={[200, 200]} />
        </mesh>
        <mesh position={[0, 0.008, 0]} material={materials.mat}>
          <cylinderGeometry args={[0.92, 0.92, 0.035, 64]} />
        </mesh>
      </group>

      {/* Root Pelvis & Body Assembly */}
      <group ref={bodyGroupRef} position={[0, 1.02, 0]}>
        {/* Pelvis / Leggings Hip */}
        <mesh position={[0, 0, 0]} scale={[0.22, 0.14, 0.18]} material={materials.pants}>
          <sphereGeometry args={[1, 32, 32]} />
        </mesh>

        {/* Torso & Spine Assembly */}
        <group ref={spineRef} position={[0, 0.1, 0]}>
          {/* Smooth capsule-like torso */}
          <mesh position={[0, 0.25, 0]} scale={[0.25, 0.43, 0.19]} material={materials.shirt}>
            <sphereGeometry args={[1, 32, 32]} />
          </mesh>

          {/* Neck & Head Group */}
          <group ref={headGroupRef} position={[0, 0.45, 0]}>
            {/* Neck */}
            <mesh position={[0, 0.045, 0]} scale={[0.075, 0.1, 0.075]} material={materials.skin}>
              <sphereGeometry args={[1, 24, 24]} />
            </mesh>

            <mesh position={[0, 0.2, 0]} material={materials.skin}>
              <sphereGeometry args={[0.27, 40, 40]} />
            </mesh>

            <group position={[0, 0.2, 0]}>
              <group position={[-0.14, 0, 0]}>
                <mesh material={materials.skin}>
                  <sphereGeometry args={[0.03, 16, 16]} />
                </mesh>
              </group>
              <group position={[0.14, 0, 0]}>
                <mesh material={materials.skin}>
                  <sphereGeometry args={[0.03, 16, 16]} />
                </mesh>
              </group>

              <group position={[0, 0.025, 0.247]}>
                <mesh position={[-0.075, 0, 0]} material={materials.eyeWhite}>
                  <sphereGeometry args={[0.032, 16, 16]} />
                </mesh>
                <mesh position={[-0.075, 0, 0.025]} material={materials.eyePupil}>
                  <sphereGeometry args={[0.018, 16, 16]} />
                </mesh>
                <mesh position={[0.075, 0, 0]} material={materials.eyeWhite}>
                  <sphereGeometry args={[0.032, 16, 16]} />
                </mesh>
                <mesh position={[0.075, 0, 0.025]} material={materials.eyePupil}>
                  <sphereGeometry args={[0.018, 16, 16]} />
                </mesh>
              </group>

              <mesh position={[0, -0.025, 0.265]} material={materials.skin}>
                <sphereGeometry args={[0.025, 16, 16]} />
              </mesh>

              <mesh position={[0, -0.075, 0.256]} rotation={[0, 0, Math.PI]} material={materials.lips}>
                <torusGeometry args={[0.024, 0.005, 8, 16, Math.PI]} />
              </mesh>

              <group position={[0, 0, 0]}>
                <mesh position={[0, 0.08, 0]} scale={[1.02, 0.78, 1.02]} material={materials.hair}>
                  <sphereGeometry args={[0.275, 40, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
                </mesh>
              </group>
            </group>
          </group>

          {/* Left Arm Assembly */}
          <group ref={leftArmRef} position={[-0.26, 0.38, 0]} rotation={[0, 0, -Math.PI / 2]}>
            {/* Shoulder */}
            <mesh material={materials.shirt}>
              <sphereGeometry args={[0.07, 16, 16]} />
            </mesh>
            {/* Upper Arm (White short sleeve) */}
            <mesh position={[0, -0.11, 0]} scale={[0.07, 0.15, 0.07]} material={materials.shirt}>
              <sphereGeometry args={[1, 24, 24]} />
            </mesh>

            {/* Left Forearm & Hand */}
            <group ref={leftForeArmRef} position={[0, -0.22, 0]}>
              {/* Forearm (Skin tone) */}
              <mesh position={[0, -0.12, 0]} scale={[0.052, 0.16, 0.052]} material={materials.skin}>
                <sphereGeometry args={[1, 24, 24]} />
              </mesh>
              {/* Hand */}
              <mesh position={[0, -0.26, 0]} scale={[0.85, 1.2, 0.65]} material={materials.skin}>
                <sphereGeometry args={[0.045, 16, 16]} />
              </mesh>
            </group>
          </group>

          {/* Right Arm Assembly */}
          <group ref={rightArmRef} position={[0.26, 0.38, 0]} rotation={[0, 0, Math.PI / 2]}>
            {/* Shoulder */}
            <mesh material={materials.shirt}>
              <sphereGeometry args={[0.07, 16, 16]} />
            </mesh>
            {/* Upper Arm (White short sleeve) */}
            <mesh position={[0, -0.11, 0]} scale={[0.07, 0.15, 0.07]} material={materials.shirt}>
              <sphereGeometry args={[1, 24, 24]} />
            </mesh>

            {/* Right Forearm & Hand */}
            <group ref={rightForeArmRef} position={[0, -0.22, 0]}>
              {/* Forearm (Skin tone) */}
              <mesh position={[0, -0.12, 0]} scale={[0.052, 0.16, 0.052]} material={materials.skin}>
                <sphereGeometry args={[1, 24, 24]} />
              </mesh>
              {/* Hand */}
              <mesh position={[0, -0.26, 0]} scale={[0.85, 1.2, 0.65]} material={materials.skin}>
                <sphereGeometry args={[0.045, 16, 16]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Left Leg Assembly (Rose-Pink Leggings) */}
        <group ref={leftUpperLegRef} position={[-0.12, -0.06, 0]}>
          <mesh material={materials.pants}>
            <sphereGeometry args={[0.08, 16, 16]} />
          </mesh>
          {/* Thigh (Pink) */}
          <mesh position={[0, -0.2, 0]} scale={[0.08, 0.23, 0.08]} material={materials.pants}>
            <sphereGeometry args={[1, 24, 24]} />
          </mesh>

          {/* Knee & Lower Leg */}
          <group ref={leftLowerLegRef} position={[0, -0.4, 0]}>
            <mesh material={materials.pants}>
              <sphereGeometry args={[0.066, 16, 16]} />
            </mesh>
            {/* Shin/Calf (Pink) */}
            <mesh position={[0, -0.2, 0]} scale={[0.065, 0.22, 0.065]} material={materials.pants}>
              <sphereGeometry args={[1, 24, 24]} />
            </mesh>

            {/* Foot & White Slip-on Sneaker (from reference image) */}
            <group ref={leftFootRef} position={[0, -0.4, 0.04]}>
                <mesh position={[0, -0.015, 0.045]} scale={[1.2, 0.9, 1.8]} material={materials.shoes}>
                  <sphereGeometry args={[0.07, 20, 20]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Right Leg Assembly (Rose-Pink Leggings) */}
        <group ref={rightUpperLegRef} position={[0.12, -0.06, 0]}>
          <mesh material={materials.pants}>
            <sphereGeometry args={[0.08, 16, 16]} />
          </mesh>
          {/* Thigh (Pink) */}
          <mesh position={[0, -0.2, 0]} scale={[0.08, 0.23, 0.08]} material={materials.pants}>
            <sphereGeometry args={[1, 24, 24]} />
          </mesh>

          {/* Knee & Lower Leg */}
          <group ref={rightLowerLegRef} position={[0, -0.4, 0]}>
            <mesh material={materials.pants}>
              <sphereGeometry args={[0.066, 16, 16]} />
            </mesh>
            {/* Shin/Calf (Pink) */}
            <mesh position={[0, -0.2, 0]} scale={[0.065, 0.22, 0.065]} material={materials.pants}>
              <sphereGeometry args={[1, 24, 24]} />
            </mesh>

            {/* Foot & White Slip-on Sneaker (from reference image) */}
            <group ref={rightFootRef} position={[0, -0.4, 0.04]}>
              <mesh position={[0, -0.015, 0.045]} scale={[1.2, 0.9, 1.8]} material={materials.shoes}>
                <sphereGeometry args={[0.07, 20, 20]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

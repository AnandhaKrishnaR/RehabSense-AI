import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CanonicalExerciseId, JointAngles } from '../../types/vision';
import { Play, Pause, RotateCcw, FastForward, Eye } from 'lucide-react';

interface AvatarModelProps {
  exerciseId: CanonicalExerciseId;
  isPlaying: boolean;
  speed: number;
  liveAngles?: JointAngles | null;
  mirror: boolean;
}

function MannequinModel({ exerciseId, isPlaying, speed, liveAngles, mirror }: AvatarModelProps) {
  // References to limbs for forward kinematics
  const bodyGroupRef = useRef<THREE.Group>(null);
  const leftUpperLegRef = useRef<THREE.Group>(null);
  const rightUpperLegRef = useRef<THREE.Group>(null);
  const leftLowerLegRef = useRef<THREE.Group>(null);
  const rightLowerLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const spineRef = useRef<THREE.Group>(null);

  const timeRef = useRef<number>(0);

  useFrame((_, delta) => {
    if (!isPlaying && !liveAngles) return;

    if (isPlaying) {
      timeRef.current += delta * speed * 1.8;
    }
    const cycle = (Math.sin(timeRef.current) + 1) / 2; // 0 to 1

    if (exerciseId === 'bodyweight_squat') {
      // Kinematics for squat
      // Knee flexion: 0 (standing) to ~80 degrees flexion
      const kneeFlexionRad = liveAngles?.left_knee != null
        ? THREE.MathUtils.degToRad(180 - liveAngles.left_knee)
        : cycle * THREE.MathUtils.degToRad(75);

      const hipFlexionRad = kneeFlexionRad * 0.85;
      const pelvisDrop = (kneeFlexionRad / 1.3) * 0.45;

      if (bodyGroupRef.current) {
        bodyGroupRef.current.position.y = -pelvisDrop;
      }
      if (spineRef.current) {
        // Slight forward torso lean for balance
        spineRef.current.rotation.x = hipFlexionRad * 0.5;
      }
      if (leftUpperLegRef.current && rightUpperLegRef.current) {
        leftUpperLegRef.current.rotation.x = -hipFlexionRad;
        rightUpperLegRef.current.rotation.x = -hipFlexionRad;
      }
      if (leftLowerLegRef.current && rightLowerLegRef.current) {
        leftLowerLegRef.current.rotation.x = kneeFlexionRad * 1.2;
        rightLowerLegRef.current.rotation.x = kneeFlexionRad * 1.2;
      }
      // Arms extended forward for balance during squat
      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.x = -hipFlexionRad * 0.9 - 0.2;
        rightArmRef.current.rotation.x = -hipFlexionRad * 0.9 - 0.2;
      }
    } else {
      // Kinematics for Shoulder Flexion (Arm Raise)
      const armElevationRad = liveAngles?.left_shoulder != null
        ? THREE.MathUtils.degToRad(liveAngles.left_shoulder)
        : cycle * THREE.MathUtils.degToRad(120);

      // Reset leg/body positions
      if (bodyGroupRef.current) bodyGroupRef.current.position.y = 0;
      if (spineRef.current) spineRef.current.rotation.x = 0;
      if (leftUpperLegRef.current) leftUpperLegRef.current.rotation.x = 0;
      if (rightUpperLegRef.current) rightUpperLegRef.current.rotation.x = 0;
      if (leftLowerLegRef.current) leftLowerLegRef.current.rotation.x = 0;
      if (rightLowerLegRef.current) rightLowerLegRef.current.rotation.x = 0;

      if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.x = -armElevationRad;
        rightArmRef.current.rotation.x = -armElevationRad;
      }
    }
  });

  // Materials
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: '#0284c7',
    roughness: 0.35,
    metalness: 0.1,
  });
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    roughness: 0.2,
    metalness: 0.3,
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: '#e0f2fe',
    roughness: 0.3,
    metalness: 0.1,
  });

  return (
    <group scale={mirror ? [-1, 1, 1] : [1, 1, 1]}>
      {/* Root Pelvis Group */}
      <group ref={bodyGroupRef} position={[0, 1.2, 0]}>
        {/* Pelvis */}
        <mesh material={jointMaterial}>
          <boxGeometry args={[0.38, 0.16, 0.22]} />
        </mesh>

        {/* Spine & Torso Group */}
        <group ref={spineRef} position={[0, 0.08, 0]}>
          <mesh position={[0, 0.25, 0]} material={skinMaterial}>
            <cylinderGeometry args={[0.16, 0.18, 0.5, 16]} />
          </mesh>

          {/* Chest & Shoulders */}
          <mesh position={[0, 0.55, 0]} material={jointMaterial}>
            <boxGeometry args={[0.52, 0.18, 0.24]} />
          </mesh>

          {/* Neck & Head */}
          <mesh position={[0, 0.72, 0]} material={jointMaterial}>
            <cylinderGeometry args={[0.07, 0.08, 0.14, 16]} />
          </mesh>
          <mesh position={[0, 0.92, 0]} material={headMaterial}>
            <sphereGeometry args={[0.15, 24, 24]} />
          </mesh>

          {/* Left Arm Assembly */}
          <group ref={leftArmRef} position={[-0.32, 0.55, 0]}>
            <mesh material={jointMaterial}>
              <sphereGeometry args={[0.08, 16, 16]} />
            </mesh>
            <mesh position={[0, -0.22, 0]} material={skinMaterial}>
              <cylinderGeometry args={[0.06, 0.05, 0.38, 16]} />
            </mesh>
            <mesh position={[0, -0.42, 0]} material={jointMaterial}>
              <sphereGeometry args={[0.06, 16, 16]} />
            </mesh>
            <mesh position={[0, -0.62, 0]} material={skinMaterial}>
              <cylinderGeometry args={[0.05, 0.04, 0.34, 16]} />
            </mesh>
          </group>

          {/* Right Arm Assembly */}
          <group ref={rightArmRef} position={[0.32, 0.55, 0]}>
            <mesh material={jointMaterial}>
              <sphereGeometry args={[0.08, 16, 16]} />
            </mesh>
            <mesh position={[0, -0.22, 0]} material={skinMaterial}>
              <cylinderGeometry args={[0.06, 0.05, 0.38, 16]} />
            </mesh>
            <mesh position={[0, -0.42, 0]} material={jointMaterial}>
              <sphereGeometry args={[0.06, 16, 16]} />
            </mesh>
            <mesh position={[0, -0.62, 0]} material={skinMaterial}>
              <cylinderGeometry args={[0.05, 0.04, 0.34, 16]} />
            </mesh>
          </group>
        </group>

        {/* Left Leg Assembly */}
        <group ref={leftUpperLegRef} position={[-0.16, -0.08, 0]}>
          <mesh material={jointMaterial}>
            <sphereGeometry args={[0.08, 16, 16]} />
          </mesh>
          <mesh position={[0, -0.25, 0]} material={skinMaterial}>
            <cylinderGeometry args={[0.08, 0.06, 0.45, 16]} />
          </mesh>
          {/* Knee */}
          <group ref={leftLowerLegRef} position={[0, -0.48, 0]}>
            <mesh material={jointMaterial}>
              <sphereGeometry args={[0.07, 16, 16]} />
            </mesh>
            <mesh position={[0, -0.25, 0]} material={skinMaterial}>
              <cylinderGeometry args={[0.06, 0.05, 0.45, 16]} />
            </mesh>
            {/* Foot */}
            <mesh position={[0, -0.5, 0.08]} material={jointMaterial}>
              <boxGeometry args={[0.1, 0.06, 0.22]} />
            </mesh>
          </group>
        </group>

        {/* Right Leg Assembly */}
        <group ref={rightUpperLegRef} position={[0.16, -0.08, 0]}>
          <mesh material={jointMaterial}>
            <sphereGeometry args={[0.08, 16, 16]} />
          </mesh>
          <mesh position={[0, -0.25, 0]} material={skinMaterial}>
            <cylinderGeometry args={[0.08, 0.06, 0.45, 16]} />
          </mesh>
          {/* Knee */}
          <group ref={rightLowerLegRef} position={[0, -0.48, 0]}>
            <mesh material={jointMaterial}>
              <sphereGeometry args={[0.07, 16, 16]} />
            </mesh>
            <mesh position={[0, -0.25, 0]} material={skinMaterial}>
              <cylinderGeometry args={[0.06, 0.05, 0.45, 16]} />
            </mesh>
            {/* Foot */}
            <mesh position={[0, -0.5, 0.08]} material={jointMaterial}>
              <boxGeometry args={[0.1, 0.06, 0.22]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

export interface PhysiotherapyAvatarProps {
  exerciseId: CanonicalExerciseId;
  liveAngles?: JointAngles | null;
  height?: string | number;
}

export function PhysiotherapyAvatar({ exerciseId, liveAngles, height = 360 }: PhysiotherapyAvatarProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [mirror, setMirror] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* 3D Canvas Area */}
      <div style={{
        height: typeof height === 'number' ? `${height}px` : height,
        width: '100%',
        borderRadius: '10px',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 100%)',
        position: 'relative',
      }}>
        <Canvas camera={{ position: [0, 1.4, 2.8], fov: 45 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 5, 4]} intensity={1.2} castShadow />
          <directionalLight position={[-3, 2, -2]} intensity={0.5} />
          <gridHelper args={[6, 12, '#bae6fd', '#e2e8f0']} position={[0, 0, 0]} />

          <MannequinModel
            exerciseId={exerciseId}
            isPlaying={isPlaying}
            speed={speed}
            liveAngles={liveAngles}
            mirror={mirror}
          />
          <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2 + 0.05} minDistance={1.8} maxDistance={4.5} />
        </Canvas>

        {/* Demo Mode Badge Overlay */}
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(4px)',
          padding: '0.25rem 0.65rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#0369a1',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          3D Biomechanical Demonstration
        </div>
      </div>

      {/* Interactive Controls Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.65rem 0.5rem 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause Demo' : 'Play Demo'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
            onClick={() => setMirror(!mirror)}
            title="Mirror perspective"
          >
            <Eye size={14} /> {mirror ? 'Normal' : 'Mirror'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Speed:</span>
          {[0.5, 1.0, 1.5].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                background: speed === s ? '#0284c7' : '#e2e8f0',
                color: speed === s ? '#ffffff' : '#334155',
                border: 'none',
                borderRadius: '4px',
                padding: '0.2rem 0.5rem',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

import React, { Component, Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { CanonicalExerciseId, JointAngles } from '../../types/vision';
import {
  DEFAULT_AVATAR_MODEL_PATH,
  resolveAvatarModelUrl,
  mapHumanoidBones,
  checkRigCompatibility,
  findAnimationClip,
  HumanoidBones,
} from './avatarRigUtils';
import { ProceduralHumanAvatar, AvatarPostureMode } from './ProceduralHumanAvatar';
import {
  Play,
  Pause,
  RotateCcw,
  Eye,
  AlertTriangle,
  Info,
  CheckCircle2,
  HelpCircle,
  FileCode,
  X,
  Activity,
} from 'lucide-react';

interface AvatarModelProps {
  exerciseId: CanonicalExerciseId;
  isPlaying: boolean;
  speed: number;
  liveAngles?: JointAngles | null;
  mirror: boolean;
  replayKey: number;
}

/**
 * Plays pre-baked embedded animation clip from the loaded GLB.
 */
function ClipActionPlayer({
  scene,
  clip,
  isPlaying,
  speed,
  replayKey,
}: {
  scene: THREE.Object3D;
  clip: THREE.AnimationClip;
  isPlaying: boolean;
  speed: number;
  replayKey: number;
}) {
  const { actions } = useAnimations([clip], scene);
  const action = actions[clip.name];

  useEffect(() => {
    if (!action) return;
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveTimeScale(speed);
    action.fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [action, replayKey]);

  useEffect(() => {
    if (action) {
      action.paused = !isPlaying;
      action.timeScale = speed;
    }
  }, [action, isPlaying, speed]);

  return null;
}

/**
 * Drives the loaded avatar's skeleton procedurally when pre-baked animation clips are missing.
 */
function ProceduralSkeletalDriver({
  bones,
  exerciseId,
  isPlaying,
  speed,
  liveAngles,
  replayKey,
}: {
  bones: HumanoidBones;
  exerciseId: CanonicalExerciseId;
  isPlaying: boolean;
  speed: number;
  liveAngles?: JointAngles | null;
  replayKey: number;
}) {
  const timeRef = useRef<number>(0);

  // Store rest transforms of bones once
  const restTransforms = useMemo(() => {
    const map = new Map<THREE.Bone, { pos: THREE.Vector3; quat: THREE.Quaternion }>();
    Object.values(bones).forEach((bone) => {
      if (bone) {
        map.set(bone, {
          pos: bone.position.clone(),
          quat: bone.quaternion.clone(),
        });
      }
    });
    return map;
  }, [bones]);

  // Reset clock on exercise switch or replay
  useEffect(() => {
    timeRef.current = 0;
  }, [exerciseId, replayKey]);

  // Restore rest poses on unmount
  useEffect(() => {
    return () => {
      restTransforms.forEach((rest, bone) => {
        bone.position.copy(rest.pos);
        bone.quaternion.copy(rest.quat);
      });
    };
  }, [restTransforms]);

  useFrame((_, delta) => {
    if (!isPlaying && !liveAngles) return;

    if (isPlaying) {
      timeRef.current += delta * speed * 1.8;
    }
    const cycle = (Math.sin(timeRef.current) + 1) / 2;

    const qThigh = new THREE.Quaternion();
    const qKnee = new THREE.Quaternion();
    const qSpine = new THREE.Quaternion();
    const qArm = new THREE.Quaternion();

    if (exerciseId === 'bodyweight_squat') {
      const kneeFlexionRad = liveAngles?.left_knee != null
        ? THREE.MathUtils.degToRad(180 - liveAngles.left_knee)
        : cycle * THREE.MathUtils.degToRad(75);

      const hipFlexionRad = kneeFlexionRad * 0.85;
      const pelvisDrop = (kneeFlexionRad / 1.3) * 0.45;

      // Hips drop
      if (bones.hips) {
        const rest = restTransforms.get(bones.hips);
        if (rest) bones.hips.position.y = rest.pos.y - pelvisDrop;
      }

      // Torso lean
      if (bones.spine) {
        const rest = restTransforms.get(bones.spine);
        if (rest) {
          qSpine.setFromAxisAngle(new THREE.Vector3(1, 0, 0), hipFlexionRad * 0.45);
          bones.spine.quaternion.copy(rest.quat).multiply(qSpine);
        }
      }

      // Hip flexion (thighs forward)
      qThigh.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -hipFlexionRad);
      if (bones.leftUpLeg) {
        const rest = restTransforms.get(bones.leftUpLeg);
        if (rest) bones.leftUpLeg.quaternion.copy(rest.quat).multiply(qThigh);
      }
      if (bones.rightUpLeg) {
        const rest = restTransforms.get(bones.rightUpLeg);
        if (rest) bones.rightUpLeg.quaternion.copy(rest.quat).multiply(qThigh);
      }

      // Knee flexion (lower legs backward)
      qKnee.setFromAxisAngle(new THREE.Vector3(1, 0, 0), kneeFlexionRad * 1.15);
      if (bones.leftLeg) {
        const rest = restTransforms.get(bones.leftLeg);
        if (rest) bones.leftLeg.quaternion.copy(rest.quat).multiply(qKnee);
      }
      if (bones.rightLeg) {
        const rest = restTransforms.get(bones.rightLeg);
        if (rest) bones.rightLeg.quaternion.copy(rest.quat).multiply(qKnee);
      }

      // Counter-balance arms forward
      qArm.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -hipFlexionRad * 0.85);
      if (bones.leftArm) {
        const rest = restTransforms.get(bones.leftArm);
        if (rest) bones.leftArm.quaternion.copy(rest.quat).multiply(qArm);
      }
      if (bones.rightArm) {
        const rest = restTransforms.get(bones.rightArm);
        if (rest) bones.rightArm.quaternion.copy(rest.quat).multiply(qArm);
      }
    } else {
      // Shoulder Flexion (Arm Raise)
      const armElevationRad = liveAngles?.left_shoulder != null
        ? THREE.MathUtils.degToRad(liveAngles.left_shoulder)
        : cycle * THREE.MathUtils.degToRad(120);

      // Reset lower body & torso to rest pose
      if (bones.hips) {
        const rest = restTransforms.get(bones.hips);
        if (rest) {
          bones.hips.position.copy(rest.pos);
          bones.hips.quaternion.copy(rest.quat);
        }
      }
      if (bones.spine) {
        const rest = restTransforms.get(bones.spine);
        if (rest) bones.spine.quaternion.copy(rest.quat);
      }
      if (bones.leftUpLeg) {
        const rest = restTransforms.get(bones.leftUpLeg);
        if (rest) bones.leftUpLeg.quaternion.copy(rest.quat);
      }
      if (bones.rightUpLeg) {
        const rest = restTransforms.get(bones.rightUpLeg);
        if (rest) bones.rightUpLeg.quaternion.copy(rest.quat);
      }
      if (bones.leftLeg) {
        const rest = restTransforms.get(bones.leftLeg);
        if (rest) bones.leftLeg.quaternion.copy(rest.quat);
      }
      if (bones.rightLeg) {
        const rest = restTransforms.get(bones.rightLeg);
        if (rest) bones.rightLeg.quaternion.copy(rest.quat);
      }

      // Raise arms upward
      qArm.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -armElevationRad);
      if (bones.leftArm) {
        const rest = restTransforms.get(bones.leftArm);
        if (rest) bones.leftArm.quaternion.copy(rest.quat).multiply(qArm);
      }
      if (bones.rightArm) {
        const rest = restTransforms.get(bones.rightArm);
        if (rest) bones.rightArm.quaternion.copy(rest.quat).multiply(qArm);
      }
    }
  });

  return null;
}

/**
 * Loads and orchestrates the rigged GLB model.
 */
function RiggedAvatar({
  modelUrl,
  exerciseId,
  isPlaying,
  speed,
  liveAngles,
  mirror,
  replayKey,
  onDiagnostics,
  postureMode,
}: AvatarModelProps & {
  modelUrl: string;
  postureMode: AvatarPostureMode;
  onDiagnostics: (diagnostics: {
    hasRig: boolean;
    hasClip: boolean;
    clipName?: string;
    isProceduralFallback: boolean;
    missingBones?: string[];
    availableClips: string[];
  }) => void;
}) {
  const { scene, animations } = useGLTF(modelUrl);

  // Compute model bounding box for automatic scale and grounding
  const bounds = useMemo(() => new THREE.Box3().setFromObject(scene), [scene]);
  const modelHeight = Math.max(bounds.max.y - bounds.min.y, 0.001);
  const modelScale = 2.35 / modelHeight;

  // Find animations and bones
  const matchingClip = useMemo(() => findAnimationClip(animations, exerciseId), [animations, exerciseId]);
  const bones = useMemo(() => mapHumanoidBones(scene), [scene]);
  const rigCheck = useMemo(() => checkRigCompatibility(bones, exerciseId), [bones, exerciseId]);
  const hasBonesInScene = useMemo(() => !!scene.getObjectByProperty('type', 'Bone'), [scene]);

  // Report diagnostics up to parent UI
  useEffect(() => {
    onDiagnostics({
      hasRig: hasBonesInScene && rigCheck.isCompatible,
      hasClip: !!matchingClip,
      clipName: matchingClip?.name,
      isProceduralFallback: !matchingClip && rigCheck.isCompatible,
      missingBones: rigCheck.isCompatible ? undefined : rigCheck.missingBones,
      availableClips: animations.map((a) => a.name),
    });
  }, [matchingClip, rigCheck, hasBonesInScene, animations, onDiagnostics]);

  // If the model has no compatible rig and no clip, fall back to procedural human avatar
  if (!matchingClip && (!hasBonesInScene || !rigCheck.isCompatible)) {
    return (
      <ProceduralHumanAvatar
        exerciseId={exerciseId}
        isPlaying={isPlaying}
        speed={speed}
        liveAngles={liveAngles}
        mirror={mirror}
        replayKey={replayKey}
        postureMode={postureMode}
      />
    );
  }

  return (
    <group
      scale={[mirror ? -modelScale : modelScale, modelScale, modelScale]}
      position={[
        (-(bounds.min.x + bounds.max.x) * modelScale) / 2,
        -bounds.min.y * modelScale,
        (-(bounds.min.z + bounds.max.z) * modelScale) / 2,
      ]}
    >
      <primitive object={scene} />

      {matchingClip ? (
        <ClipActionPlayer
          scene={scene}
          clip={matchingClip}
          isPlaying={isPlaying}
          speed={speed}
          replayKey={replayKey}
        />
      ) : (
        <ProceduralSkeletalDriver
          bones={bones}
          exerciseId={exerciseId}
          isPlaying={isPlaying}
          speed={speed}
          liveAngles={liveAngles}
          replayKey={replayKey}
        />
      )}
    </group>
  );
}

class AvatarLoadBoundary extends Component<
  {
    children: React.ReactNode;
    fallback: React.ReactNode;
    onError: (err: Error) => void;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface PhysiotherapyAvatarProps {
  exerciseId: CanonicalExerciseId;
  liveAngles?: JointAngles | null;
  height?: string | number;
  modelUrl?: string;
}

export function PhysiotherapyAvatar({
  exerciseId,
  liveAngles,
  height = 360,
  modelUrl,
}: PhysiotherapyAvatarProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [mirror, setMirror] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [postureMode, setPostureMode] = useState<AvatarPostureMode>('standing');

  // Model URL resolution
  const resolvedModelUrl = useMemo(() => resolveAvatarModelUrl(modelUrl), [modelUrl]);

  // Model file status check
  const [modelStatus, setModelStatus] = useState<'checking' | 'found' | 'missing' | 'error'>('checking');
  const [modelErrorMessage, setModelErrorMessage] = useState<string | null>(null);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);

  // Rig diagnostics
  const [diagnostics, setDiagnostics] = useState<{
    hasRig: boolean;
    hasClip: boolean;
    clipName?: string;
    isProceduralFallback: boolean;
    missingBones?: string[];
    availableClips: string[];
  }>({
    hasRig: false,
    hasClip: false,
    isProceduralFallback: false,
    availableClips: [],
  });

  // Verify file existence via lightweight fetch probe
  useEffect(() => {
    let active = true;
    setModelStatus('checking');
    setModelErrorMessage(null);

    async function probeModelUrl() {
      try {
        const response = await fetch(resolvedModelUrl, { method: 'HEAD' });
        if (!active) return;
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && !contentType.includes('text/html')) {
          setModelStatus('found');
        } else {
          setModelStatus('missing');
        }
      } catch {
        if (!active) return;
        try {
          const getRes = await fetch(resolvedModelUrl, { headers: { Range: 'bytes=0-0' } });
          if (!active) return;
          const contentType = getRes.headers.get('content-type') || '';
          if ((getRes.ok || getRes.status === 206) && !contentType.includes('text/html')) {
            setModelStatus('found');
            return;
          }
        } catch {
          // ignore
        }
        setModelStatus('missing');
      }
    }

    probeModelUrl();
    return () => {
      active = false;
    };
  }, [resolvedModelUrl]);

  const proceduralFallback = (
    <ProceduralHumanAvatar
      exerciseId={exerciseId}
      isPlaying={isPlaying}
      speed={speed}
      liveAngles={liveAngles}
      mirror={mirror}
      replayKey={replayKey}
      postureMode={postureMode}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* 3D Canvas Area */}
      <div
        style={{
          height: typeof height === 'number' ? `${height}px` : height,
          width: '100%',
          borderRadius: '10px',
          overflow: 'hidden',
          background: '#24262a',
          position: 'relative',
        }}
      >
        <Canvas camera={{ position: postureMode === 'side_lying' ? [0, 1.25, 3.2] : [0, 1.8, 3.5], fov: 38 }}>
          {/* Warm Studio Lighting for 3D Aesthetic */}
          <color attach="background" args={['#24262a']} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[3, 5, 4]} intensity={2.1} castShadow />
          <directionalLight position={[-3, 2, 2]} intensity={0.9} color="#8fcaff" />
          <pointLight position={[0, 2, -2]} intensity={0.5} color="#d8eaff" />
          {modelStatus === 'found' ? (
            <AvatarLoadBoundary
              key={resolvedModelUrl}
              fallback={proceduralFallback}
              onError={(err) => {
                setModelStatus('error');
                setModelErrorMessage(err.message || 'GLTF model parsing failed.');
              }}
            >
              <Suspense fallback={proceduralFallback}>
                <RiggedAvatar
                  modelUrl={resolvedModelUrl}
                  exerciseId={exerciseId}
                  isPlaying={isPlaying}
                  speed={speed}
                  liveAngles={liveAngles}
                  mirror={mirror}
                  replayKey={replayKey}
                  onDiagnostics={setDiagnostics}
                  postureMode={postureMode}
                />
              </Suspense>
            </AvatarLoadBoundary>
          ) : (
            proceduralFallback
          )}

          <OrbitControls
            target={postureMode === 'side_lying' ? [0, 0.3, 0] : [0, 1.05, 0]}
            enablePan={false}
            maxPolarAngle={Math.PI / 2 + 0.05}
            minDistance={1.4}
            maxDistance={4.2}
          />
        </Canvas>

        {/* Live Status Badge Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(6px)',
            padding: '0.3rem 0.65rem',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#0369a1',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          {postureMode === 'side_lying' ? (
            <>
              <Activity size={13} color="#db2777" /> Mat Exercise: Side-Lying Hip Abduction
            </>
          ) : (
            <>
              <CheckCircle2 size={13} color="#0d9488" /> Glossy Blue Exercise Avatar
            </>
          )}
        </div>

        {/* Diagnostics & Setup Info Pill */}
        <button
          onClick={() => setShowDiagnosticsModal(true)}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'rgba(255, 255, 255, 0.92)',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '0.25rem 0.55rem',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            cursor: 'pointer',
          }}
          title="Inspect 3D Avatar rig and model specifications"
        >
          <HelpCircle size={13} /> Avatar Rig & Info
        </button>
      </div>

      {/* Warnings & Placeholder Notice Box */}
      {modelStatus === 'found' && !diagnostics.hasClip && diagnostics.isProceduralFallback && (
        <div
          style={{
            marginTop: '0.5rem',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
            fontSize: '0.78rem',
            color: '#166534',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px', color: '#15803d' }} />
          <div>
            <strong>Procedural Rig Active</strong>: Model loaded, but animation clip{' '}
            <code>{exerciseId}</code> was not embedded. Driving avatar skeleton procedurally.
          </div>
        </div>
      )}

      {/* Interactive Controls Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.5rem 0',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
            onClick={() => setReplayKey((key) => key + 1)}
            title="Replay exercise demonstration"
            aria-label="Replay exercise demonstration"
          >
            <RotateCcw size={13} /> Replay
          </button>
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause Demo' : 'Play Demo'}
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
            onClick={() => setMirror(!mirror)}
            title="Mirror perspective"
          >
            <Eye size={13} /> {mirror ? 'Normal' : 'Mirror'}
          </button>

          {/* Side-Lying Mat Exercise vs Standing Toggle */}
          <button
            className="btn btn-outline"
            style={{
              padding: '0.35rem 0.6rem',
              fontSize: '0.78rem',
              background: postureMode === 'side_lying' ? '#fdf2f8' : '#f8fafc',
              borderColor: postureMode === 'side_lying' ? '#f472b6' : 'var(--border)',
              color: postureMode === 'side_lying' ? '#be185d' : 'inherit',
              fontWeight: postureMode === 'side_lying' ? 600 : 400,
            }}
            onClick={() => setPostureMode((p) => (p === 'standing' ? 'side_lying' : 'standing'))}
            title="Toggle between Standing Form and Mat Side-Lying Leg Raise"
          >
            <Activity size={13} /> {postureMode === 'standing' ? 'Mat Pose (Photo)' : 'Standing Form'}
          </button>

        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
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
                padding: '0.2rem 0.45rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Diagnostics / Setup Modal */}
      {showDiagnosticsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
          onClick={() => setShowDiagnosticsModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '560px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileCode size={20} color="#0284c7" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  3D Avatar Diagnostics & Setup
                </h3>
              </div>
              <button
                onClick={() => setShowDiagnosticsModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
              <h4 style={{ margin: '0 0 0.35rem', color: '#0f172a', fontSize: '0.92rem' }}>
                Active Avatar Display
              </h4>
              <ul style={{ margin: '0 0 1rem', paddingLeft: '1.2rem' }}>
                <li>
                  <strong>Avatar Style</strong>:{' '}
                  Glossy blue toy-like humanoid
                </li>
                <li>
                  <strong>Active Posture</strong>:{' '}
                  {postureMode === 'standing'
                    ? `Standing Biomechanics (${exerciseId})`
                    : 'Side-Lying Mat Exercise (Hip Abduction)'}
                </li>
                <li>
                  <strong>Configured GLB Path</strong>:{' '}
                  <code>{DEFAULT_AVATAR_MODEL_PATH}</code>
                </li>
              </ul>

              <h4 style={{ margin: '0 0 0.35rem', color: '#0f172a', fontSize: '0.92rem' }}>
                Custom GLB Support
              </h4>
              <p style={{ margin: '0 0 0.5rem' }}>
                To load an external 3D model, place a rigged humanoid <code>.glb</code> file at{' '}
                <code>frontend/public/assets/rehabsense-avatar.glb</code>. RehabSense AI will automatically detect it and drive its skeleton.
              </p>

              <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowDiagnosticsModal(false)}
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

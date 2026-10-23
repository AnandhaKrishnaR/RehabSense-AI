# RehabSense AI — Assets Specification

This directory holds static models, audio assets, and documentation for 3D rigs and multimedia.

---

## 3D Avatar Asset Specification

- **File Format**: Standard `GLTF 2.0` (`.glb` binary or `.gltf` with textures).
- **Default File Path**: `frontend/public/assets/rehabsense-avatar.glb` (served by Vite at `/assets/rehabsense-avatar.glb`).
- **Configurability**: Configurable via `VITE_AVATAR_MODEL_URL` in `.env` or the `modelUrl` prop on `<PhysiotherapyAvatar />`.
- **Supported Exercises**:
  1. `bodyweight_squat`: Biomechanical squat demonstration with knee flexion, hip flexion, and forward arm balance.
  2. `shoulder_flexion`: Forward/upward arm raise demonstration within safe clinical range.
- **Animation Clips**:
  - Embedded animation clips named `bodyweight_squat` and `shoulder_flexion` (or canonical aliases like `Squat`, `ShoulderFlexion`).
  - The active clip loops while playing. Real-time controls include speed multipliers (0.5x, 1.0x, 1.5x), play/pause, replay, and mirror perspective.
- **Target Rig Structure**: Standard humanoid bone hierarchy (Mixamo / ReadyPlayerMe / standard GLTF Humanoid compatible):
  - Root: `Hips`
  - Spine: `Spine`, `Spine1`, `Spine2`
  - Lower Body: `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `RightUpLeg`, `RightLeg`, `RightFoot`
  - Upper Body: `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `RightShoulder`, `RightArm`, `RightForeArm`, `RightHand`
  - Head: `Neck`, `Head`
- **Fallback & Resilience Strategy**:
  1. **Embedded Clip Mode**: If the loaded GLB has the animation clip for the active exercise, it plays the clip with full user playback controls.
  2. **Procedural Skeletal Rig Fallback**: If a rigged GLB is loaded but lacks the specific animation clip, RehabSense AI displays a visible warning and automatically drives the avatar's skeleton procedurally using Three.js bone kinematics.
  3. **Biomechanical Procedural Model**: If no GLB model file is found, or if the loaded model lacks a compatible skeleton, RehabSense AI shows a clear setup placeholder and displays an interactive articulated anatomical mannequin.

---

## Malayalam Voice Audio Assets

- Audio snippets or synthesized prompts for fallback demo mode are kept lightweight (`.wav` or `.mp3`).
- All audio is decoded client-side using Web Audio API or HTML5 Audio elements.

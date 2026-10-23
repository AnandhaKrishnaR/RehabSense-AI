# RehabSense AI — Assets Specification

This directory holds static models, audio assets, and documentation for 3D rigs and multimedia.

---

## 3D Avatar Asset Specification

- **File Format**: Standard `GLTF 2.0` (`.glb` binary or `.gltf` with textures).
- **Target Rig Structure**: Standard humanoid bone hierarchy (Humanoid naming convention compatible with Mixamo / ReadyPlayerMe):
  - `Hips`
  - `Spine`, `Spine1`, `Spine2`
  - `LeftUpLeg`, `LeftLeg`, `LeftFoot`
  - `RightUpLeg`, `RightLeg`, `RightFoot`
  - `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`
  - `RightShoulder`, `RightArm`, `RightForeArm`, `RightHand`
  - `Neck`, `Head`
- **Fallback / Procedural Rig**:
  In the event that an external `.glb` model is not bundled or fails to load, `frontend/src/features/avatar/` provides a Three.js procedural articulated anatomical mannequin that performs the squat and shoulder flexion kinematics with smooth inverse kinematics/joint rotations.

---

## Malayalam Voice Audio Assets

- Audio snippets or synthesized prompts for fallback demo mode are kept lightweight (`.wav` or `.mp3`).
- All audio is decoded client-side using Web Audio API or HTML5 Audio elements.

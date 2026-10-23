# RehabSense AI - 3D Avatar Assets

Place your rigged 3D avatar GLB file here:

- **Default Filename**: `rehabsense-avatar.glb` (served at `/assets/rehabsense-avatar.glb`)
- **Format**: Standard GLTF 2.0 binary (`.glb`)
- **Required Skeleton**: Standard humanoid bone hierarchy (Mixamo / ReadyPlayerMe compatible):
  - Root: `Hips`
  - Spine: `Spine`, `Spine1`, `Spine2`
  - Legs: `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `RightUpLeg`, `RightLeg`, `RightFoot`
  - Arms: `LeftShoulder`, `LeftArm`, `LeftForeArm`, `LeftHand`, `RightShoulder`, `RightArm`, `RightForeArm`, `RightHand`
  - Head: `Neck`, `Head`
- **Supported Exercise Animation Clips**:
  - `bodyweight_squat`
  - `shoulder_flexion`
- **Fallback Modes**:
  1. **Procedural Skeletal Rig**: If the GLB has humanoid bones but lacks the pre-baked animation clips, RehabSense AI procedurally animates the loaded model's skeleton.
  2. **Biomechanical Procedural Model**: If no GLB is provided or the model lacks a compatible skeleton, RehabSense AI displays an articulated procedural anatomical guide.

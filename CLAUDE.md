# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**gs-edit** is a web-based 3D application that combines Gaussian Splatting (3DGS) point clouds with VRM (Virtual Reality Model) characters to create animated rigged avatars. The system processes PLY files containing Gaussian splats and binds them to VRM character skeletons, enabling real-time animation of photorealistic 3D scans.

## Core Technology Stack

- **Three.js** (v0.170.0): 3D rendering engine
- **Gaussian Splats 3D**: Custom library for rendering Gaussian splatting point clouds (`lib/gaussian-splats-3d.module.js`)
- **@pixiv/three-vrm** (v2.1.0): VRM character model support
- **TensorFlow.js + Pose Detection**: Used for automated pose estimation during preprocessing
- **JSZip**: For GVRM file format (zipped archive containing VRM + PLY + metadata)

## Architecture

### Directory Structure

```
gvrm-format/          # GVRM file format handlers and core algorithms
  ├── gvrm.js         # Main GVRM class, load/save/update logic
  ├── vrm.js          # VRM character management
  ├── gs.js           # Gaussian splatting viewer wrapper
  ├── ply.js          # PLY file parser
  └── utils.js        # Utilities (pose operations, visualization, PMC)

apps/                 # Application-specific modules
  ├── preprocess/     # Preprocessing pipeline
  │   ├── preprocess.js    # Main preprocessing orchestration
  │   ├── preprocess_gl.js # GPU-accelerated splat assignment
  │   ├── pose.js          # Pose detection wrapper
  │   ├── check.js         # Validation and error checking
  │   └── utils_gl.js      # WebGL utilities
  ├── avatarworld/    # Avatar World demo application
  │   ├── main.js          # Entry point for avatar world
  │   ├── walker.js        # Autonomous avatar walking behavior
  │   ├── scene.js         # Scene creation (sky, floor, houses)
  │   └── index.html       # Avatar world HTML page
  ├── fps.js          # FPS counter
  └── vr.js           # VR mode support

lib/                  # Third-party libraries (TensorFlow.js, pose detection, Three.js modules)
  └── gaussian-vrm.min.js  # Minified GVRM library for distribution
assets/               # Sample GVRM files, FBX animations, default configurations
examples/             # Example usage (simple-viewer.html)
main.js               # Main application entry point
index.html            # Main HTML page
server.js             # HTTPS development server
error.js              # Error logging and reporting utilities
```

### Key Concepts

**GVRM Format**: A proprietary format (`.gvrm` files) that packages:
- `model.vrm`: VRM character model
- `model.ply`: Gaussian splat point cloud (PLY format)
- `data.json`: Binding metadata including:
  - `splatVertexIndices`: Maps each splat to nearest VRM mesh vertex
  - `splatBoneIndices`: Maps each splat to VRM skeleton bone
  - `splatRelativePoses`: Relative positions of splats to their bound vertices
  - `boneOperations`: Pose adjustments applied to VRM skeleton
  - `modelScale`: Scale factor applied to VRM model

**PMC (Points/Mesh/Capsules)**: Visualization helpers showing:
- Points: VRM mesh vertices in world space
- Mesh: VRM mesh wireframe
- Capsules: Bone visualizations for debugging splat assignments

**Dynamic Scene Sorting**: Splats are split into multiple Three.js scenes, grouped by bone or vertex indices, to optimize rendering and enable per-bone transformations.

## Development Commands

### Running the Application

**Prerequisites**:
- Node.js and npm installed
- Express.js: `npm install -g express` (or install locally)

**SSL Certificate Setup** (required for HTTPS):
```bash
# Generate self-signed certificates
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
mkdir -p .server
mv *.pem .server/
```

**Start Development Server**:
```bash
# Start HTTPS development server (required for WebRTC and some browser features)
node server.js
# Access at https://localhost:8080
```

**Applications**:
- Main editor: `https://localhost:8080/`
- Simple viewer: `https://localhost:8080/examples/simple-viewer.html`
- Avatar World demo: `https://localhost:8080/apps/avatarworld/`

### Loading Files

**URL Parameters** (main.js):
- `?gs=<path>` - Load PLY file for preprocessing
- `?gvrm=<path>` - Load existing GVRM file
- `?stage=<0|1|2|3>` - Skip preprocessing stages (for debugging)
- `?vr` - Enable VR mode
- `?gpu` - Use GPU-accelerated preprocessing
- `?nobg` - Remove background splats
- `?nocheck` - Skip validation checks
- `?saveply` - Save processed PLY alongside GVRM
- `?customtype=<float>` - Custom shader material type
- `?size=<width>,<height>` - Canvas size override

**Note**: VRM model is fixed to `./assets/sotai.vrm`. VRM scale is automatically calculated from the Gaussian splat height.

**File Selection**: If no `gs` or `gvrm` parameter provided, UI prompts for file selection (supports drag-and-drop for `.ply` or `.gvrm` files).

### Keyboard Controls (main.js:272-328)

- **Space**: Pause/play animation
- **V**: Update PMC (Points/Mesh/Capsules) visualization
- **C**: Cycle splat color modes (empty/assign/original)
- **X**: Toggle VRM mesh visibility
- **G**: Cycle through sample GVRM files
- **A**: Cycle through sample FBX animations
- **P**: Toggle point cloud rendering mode
- **Drag & Drop**: Load FBX animation files

## Preprocessing Pipeline

The preprocessing pipeline (app/preprocess/preprocess.js) converts a PLY Gaussian splat scan + VRM model into a GVRM file:

### Pipeline Stages (controlled by `?stage=` parameter)

**Stage 0** (default): Full preprocessing
1. **cleanSplats()**: Segment foreground character from background using height/radius detection
2. **Pose estimation**: Detect character orientation using TensorFlow pose detection
3. **Auto-alignment**: Align VRM model to Gaussian splat using detected pose
4. **Bone operations**: Calculate A-pose adjustments from detected keypoints
5. **Validation**: Multi-angle pose verification (finalCheck)
6. **Splat assignment**: Bind splats to bones and vertices (CPU or GPU)

**Stage 1**: Skip cleaning, use existing cleaned PLY
**Stage 2**: Skip cleaning and pose detection
**Stage 3**: Skip all auto-detection, use manual parameters

### Preprocessing Functions (preprocess.js)

- `cleanSplats()` (line 221): Foreground/background segmentation using circular search regions
- `findBestAngleInRange()` (line 577): Camera rotation sweep for pose detection
- `moveCameraAndDetect()` (line 649): Capture and analyze pose from specific angle
- `assignSplatsToBones()` (line 14): CPU method - assigns splats to nearest bone capsule
- `assignSplatsToPoints()` (line 86): CPU method - assigns splats to nearest VRM vertex
- `assignSplatsToBonesGL()` (preprocess_gl.js): GPU-accelerated bone assignment
- `assignSplatsToPointsGL()` (preprocess_gl.js): GPU-accelerated vertex assignment

### Error Handling

Preprocessing can fail with specific error IDs (search for `[ErrorID N]` in preprocess.js):
- **ErrorID 1**: Pose detection failure at specific angle
- **ErrorID 2**: Failed to detect initial character direction
- **ErrorID 3**: Ground detection failure (knees below detected floor)
- **ErrorID 4**: A-pose validation failure (hands bent inside)
- **ErrorID 5**: No vertices found in centroid calculation
- **ErrorID 6**: Target detection failure in height calculation

The system automatically retries once with adjusted hints before saving an error log file.

## Material System

### Custom Shader Injection (gvrm.js:533-776)

The `gsCustomizeMaterial()` function modifies Gaussian splat shader to enable skeletal animation:

1. Injects VRM mesh data as textures (positions, normals, skinning weights)
2. Adds bone matrices from VRM skeleton
3. Computes skinned splat positions using relative poses
4. Applies rotation to splat covariance matrices for proper splatting

**Key shader modifications**:
- Vertex shader receives mesh vertex index per splat
- Looks up skinning data and applies bone transforms
- Calculates relative rotation using quaternions
- Updates splat center and covariance for rendering

## Runtime Update Loop

**main.js:335-365** - Main animation loop:
```javascript
gvrm.update()  // Updates VRM animation and splat positions
  └─ updateByBones()  // Repositions splat scenes based on bone transforms
  └─ character.update()  // Updates VRM mixer and humanoid
```

**GVRM.updateByBones()** (gvrm.js:315-353):
- Iterates through VRM skeleton bones
- Calculates midpoint positions between parent and child bones
- Updates corresponding splat scene positions
- Does NOT update rotations (handled by shader)

## Testing and Validation

**Final Check** (preprocess.js:1115-1260):
- Tests from 11 camera angles (-75° to +75°)
- Compares VRM capsule screen positions to pose detection keypoints
- Validates head, hands, and feet alignment
- Fails if 3 or more angles exceed threshold (default: 0.15 normalized screen units)

## Common Development Tasks

### Adding New Bone Operations

Edit `assets/default.json` - bone operations format:
```json
{
  "boneName": "leftUpperArm",
  "position": { "x": -0.04, "y": 0, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 60 }
}
```

Applied in `Utils.applyBoneOperations()` (utils.js:24-52)

### Modifying Splat Assignment Algorithm

- **CPU version**: Edit `assignSplatsToBones()` / `assignSplatsToPoints()` in preprocess.js
- **GPU version**: Edit compute shaders in preprocess_gl.js
- Toggle with `?gpu` URL parameter

### Debugging Splat Bindings

1. Load GVRM file
2. Press **V** to show PMC capsules (colored by bone)
3. Press **C** to cycle splat colors (shows bone assignments)
4. Check console for `splatBoneIndices` / `splatVertexIndices` arrays

### Adding New Animation Sources

- **FBX animations**: Place in `assets/` and update `fbxFiles` array (main.js:154-165)
- **GVRM samples**: Update `gvrmFiles` array (main.js:147-152)
- **Runtime loading**: Drag & drop FBX files onto page

## Important Implementation Notes

### Coordinate Systems

- **VRM**: Y-up, right-handed
- **Gaussian Splats**: Inherits from PLY file (typically matches VRM)
- **Screen space**: Used for pose detection validation (normalized by height)

### Performance Considerations

- Splat count affects preprocessing time (typically 100K-500K splats)
- GPU preprocessing significantly faster (`?gpu` parameter)
- Dynamic scene sorting enables ~60 FPS with proper bone grouping
- Background splats rendered at 1/12 opacity to reduce overdraw

### Known Limitations

- A-pose required for preprocessing (arms spread, legs straight)
- Single character per scene (multi-character not supported)
- VRM model must have standard humanoid bone names
- Some VRM models require `skinnedMeshIndex` adjustment (gvrm.js:19-24)

## File Format Specifications

**GVRM (ZIP archive)**:
- `model.vrm` - Standard VRM 1.0 file
- `model.ply` - Gaussian splat PLY (position, color, covariance)
- `data.json` - Metadata with binding information

**PLY Format**: Standard 3DGS PLY with properties:
- Position: `x`, `y`, `z`
- Scale/rotation: Spherical harmonics and covariance data
- Color: RGB + opacity

## WebRTC Support (VR Mode)

The application includes WebRTC signaling UI (hidden by default):
- Session-based peer connection
- Configured in index.html:134-153
- Implementation in apps/vr.js

## Library Distribution

**Minified Library**: `lib/gaussian-vrm.min.js` provides a standalone GVRM library for use in external projects.

**CDN Usage** (see examples/simple-viewer.html):
```javascript
"imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
  "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@2.1.0/lib/three-vrm.module.js",
  "gaussian-splats-3d": "https://naruya.github.io/gs-edit/lib/gaussian-splats-3d.module.js",
  "jszip": "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm",
  "gvrm": "https://naruya.github.io/gs-edit/lib/gaussian-vrm.min.js"
}
```

## Avatar World Demo

The `apps/avatarworld/` directory contains a demo application showcasing multiple autonomous GVRM avatars:
- **Walker.js**: Implements autonomous walking behavior with random direction changes
- **Scene.js**: Creates 3D environment (sky, procedural houses, particle floor effects)
- Features multiple GVRM avatars walking independently in a shared scene
- Demonstrates GVRM's capability for multi-character scenes and character AI

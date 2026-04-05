# BailarCon Project Knowledge Base

BailarCon is a high-performance, **100% offline, pose-driven rhythm game** built with Vanilla JavaScript and Google MediaPipe. It transforms body movements into game inputs, allowing players to play through rhythm maps (beatmaps) using their physical presence.

## 🎯 Project Vision
- **Total Privacy/Offline**: No CDNs, no external tracking, and no internet required once downloaded.
- **Low Latency**: Optimized AI inference for real-time responsiveness.
- **Physical Integration**: A rhythm game where the "controller" is the player's entire body.

## 🏗️ Core Architecture
- **AI Engine**: `@mediapipe/tasks-vision` utilizing a local `pose_landmarker.task` (Lite model) for fast, concurrent pose detection.
- **WASM Core**: Local WebAssembly binaries for MediaPipe, ensuring zero-dependency runtime.
- **Rendering**: High-performance HTML5 Canvas with custom animation loops.
- **Modular Logic**:
    - `main.js`: Main game loop, AI lifecycle, and gesture detection.
    - `beatmap.js`: Data structure for rhythm maps and difficulty levels.
    - `style.css`: Modern "Glassmorphism" UI and responsive design.

## ✨ Key Features
### 1. Pose-Driven Mechanics
- **Target Mapping**: Hits are registered when specific body landmarks (hands, feet) collide with game objects in 3D-to-2D projected space.
- **Skeletal Stabilization**: Implements weighted LERP smoothing to eliminate jitter from raw AI landmarks.
- **Body-Relative Scaling**: Objects are positioned relative to the player's core (shoulders/hips) rather than fixed screen coordinates, adapting to different camera distances.

### 2. Gameplay Elements
- **Circles**: Timing-based targets that require a "hit" within a precise window.
- **Sliders**: Continuous path-following targets that track motion over time.
- **Motion Trails**: Visual paths following the player's hands and feet for enhanced feedback.

### 3. Gesture-Controlled UI
- **Swipe Navigation**: Left/Right swipes for menu browsing and result screen dismissal.
- **Dwell Selection**: "Hover-to-select" mechanism using hand position, eliminating the need for mouse/touch.
- **Mirror Logic**: Intelligent mirroring of camera feed and gestures for intuitive user interaction.

## 📜 Development History (Major Milestones)
1. **Local AI Core**: Migration from CDNs to fully local `.task` and `.wasm` files.
2. **Inference Optimization**: Implementation of the "Lite" model and GPU delegation to achieve <30ms latency.
3. **Stabilization Layer**: Introduction of global landmark smoothing to fix "shaking" skeletons.
4. **Interactive Lobby**: Building the glass-card menu system with gesture-based scrolling and selection.
5. **Rhythm Logic**: Implementation of slider paths and perfect/good/miss timing windows.

## 🛠️ Technical Specifications
- **Model**: Pose Landmarker (Lite)
- **Model Complexity**: `0`
- **Minimum Confidence**: `0.1` (Tuned for speed)
- **Resolution**: Adaptive (up to 720p)

---
*Created on 2026-04-05*

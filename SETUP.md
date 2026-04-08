# BailarCon AR Rhythm Game — Setup Guide

This project is a real-time AR rhythm game. A Python pose-tracking server captures your body movements via webcam and streams them to the Godot 4 game engine over UDP.

---

## System Requirements

| Component | Requirement |
|---|---|
| OS | Windows 10/11, macOS 12+, or Linux |
| Python | 3.10 or higher |
| Godot | 4.x **.NET version** (see below) |
| Webcam | Any USB or built-in webcam |

---

## Step 1 — Install Godot 4 (.NET)

> The standard Godot download does **not** include .NET support. You must download the .NET variant.

1. Go to: https://godotengine.org/download/
2. Download **Godot Engine – .NET** for your platform (look for the `.NET` badge)
3. Extract the zip. No installer needed — just run the executable.
4. On first launch, you may be prompted to install the .NET SDK (6.0 or later):
   - Windows: https://dotnet.microsoft.com/download
   - macOS/Linux: use your package manager or the link above

---

## Step 2 — Install Python Dependencies

### Option A — Using conda (recommended if you have Anaconda/Miniconda)

```bash
conda create -n ar_game python=3.10 -y
conda activate ar_game
pip install -r pose_server/requirements.txt
```

### Option B — Using plain pip (no conda)

```bash
pip install -r pose_server/requirements.txt
```

The `requirements.txt` installs:

| Package | Version | Purpose |
|---|---|---|
| `mediapipe` | >=0.10.0 | Full-body pose landmark detection |
| `opencv-python` | >=4.8.0 | Webcam capture and preview window |

> **Tested environment (ar_game conda env):**
> mediapipe 0.10.9, opencv-python 4.9.0.80, numpy 2.2.6, Python 3.10

---

## Step 3 — Open the Project in Godot

1. Launch Godot 4 (.NET)
2. Click **Import** → navigate to this repository folder → select `project.godot`
3. Wait for the project to import and build C# assemblies
4. If prompted about missing .NET SDK, install it (see Step 1)
5. Press **F5** or click **Run Project** (▶)

---

## Step 4 — Start the Pose Server

Open a terminal in this repository folder and run:

```bash
# Windows
pose_server\start.bat

# macOS / Linux
python pose_server/pose_server.py
```

Or manually:

```bash
cd pose_server
python pose_server.py
```

A webcam preview window will open. You should see:
- Skeleton overlay on your body
- `FPS: xx  UDP→5000` in the top-left corner

The game will automatically detect the stream — the skeleton in-game will start following your movements within 2 seconds.

### pose_server.py options

| Flag | Default | Description |
|---|---|---|
| `--cam N` | `0` | Webcam index (try `1` if default doesn't open) |
| `--port N` | `5000` | UDP port (must match Godot's ListenPort) |
| `--no-preview` | off | Disable preview window for better performance |

Example:
```bash
python pose_server.py --cam 1 --no-preview
```

---

## Running Order

Start **both** in this order for best results:

```
1. Start Godot game (press F5 in editor, or run the exported binary)
2. Start pose_server.py in a terminal
```

The game has a built-in 2-second timeout fallback — if the pose server isn't running, the skeleton uses animated mock data and gameplay still works (for testing).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Unable to open zip archive` | Godot can't find a required asset — reimport the project |
| `Cannot open camera 0` | Try `--cam 1` or check that no other app is using the webcam |
| Skeleton doesn't move | Confirm pose_server is running and the terminal shows `UDP→5000` |
| C# build errors | Install .NET SDK 6.0+ and restart Godot |
| `mediapipe` install fails | Use Python 3.10 — mediapipe 0.10.x doesn't support 3.12+ |

---

## Architecture Overview

```
Webcam
  └── pose_server.py (Python / MediaPipe)
        └── UDP JSON packets → 127.0.0.1:5000
              └── PoseTracker.cs (Godot C# background thread)
                    └── GameEventManager.EmitSkeletonUpdated()
                          ├── SkeletonRenderer.cs  (draws hand/foot trails)
                          └── HittingBoxController.cs  (hit detection)
```

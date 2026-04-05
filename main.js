// BAILARCON - TOTAL LOCAL CORE
// 100% Offline: No CDNs, No Internet required.

import { PoseLandmarker, FilesetResolver } from "./vision_bundle.js";
import { sampleBeatmap } from "./beatmap.js";

const SCREENS = { LOBBY: 'lobby', PLAYING: 'playing', RESULTS: 'results' };
const TARGET_MAP = {
    'HAND': [15, 16, 19, 20], // Wrists, Index fingers
    'FOOT': [27, 28, 31, 32]  // Ankles, Toes
};
const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Shoulders and Arms
    [11, 23], [12, 24], [23, 24], // Torso
    [23, 25], [25, 27], [24, 26], [26, 28] // Legs
];

class Circle {
    constructor(data, game) {
        this.data = data;
        this.game = game;
        this.hit = false;
        this.missed = false;
        this.radius = 60;
        this.startTime = data.time - 800; // 800ms approach time
    }

    update(currentTime) {
        if (this.hit || this.missed) return;
        if (currentTime > this.data.time + 100) { this.missed = true; this.game.handleMiss(); }
    }

    draw(ctx, currentTime) {
        if (this.hit || this.missed) return;
        const progress = (currentTime - this.startTime) / 800;
        if (progress < 0) return;

        const alpha = Math.min(1, progress * 4);
        const approachRadius = this.radius * (1 + 2 * (1 - progress));

        // Background / Target
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 15;
        const color = this.data.target === 'HAND' ? '#00ffff' : '#ff00ff';
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;

        // SCALE DRAWING COORDINATES
        const cx = (this.data.x / 1000) * this.game.canvas.width;
        const cy = (this.data.y / 1000) * this.game.canvas.height;

        ctx.beginPath();
        ctx.arc(cx, cy, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Approach Circle
        ctx.lineWidth = 2;
        ctx.beginPath();
        const aRadius = Math.max(this.radius, approachRadius);
        ctx.arc(cx, cy, aRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

class Slider {
    constructor(data, game) {
        this.data = data;
        this.game = game;
        this.hit = false; this.missed = false;
        this.radius = 60;
        this.startTime = data.time - 800;
        this.points = data.points || [];
    }

    update(currentTime) {
        if (this.hit || this.missed) return;
        if (currentTime > this.data.time + this.data.duration + 100) { this.missed = true; }
    }

    draw(ctx, currentTime) {
        if (this.hit || this.missed) return;
        const totalDuration = this.data.duration;
        const elapsed = currentTime - this.data.time;
        const progress = (currentTime - this.startTime) / 800;
        if (progress < 0) return;

        ctx.save();
        ctx.shadowBlur = 15;
        const color = this.data.target === 'HAND' ? '#00ffff' : '#ff00ff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 10;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Draw Path
        if (this.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo((this.points[0].x / 1000) * this.game.canvas.width, (this.points[0].y / 1000) * this.game.canvas.height);
            for (let i = 1; i < this.points.length; i++) {
                ctx.lineTo((this.points[i].x / 1000) * this.game.canvas.width, (this.points[i].y / 1000) * this.game.canvas.height);
            }
            ctx.stroke();
        }

        // Draw Ball
        if (elapsed > 0 && elapsed < totalDuration) {
            const ballPosRaw = this.getPointAt(elapsed / totalDuration);
            const bx = (ballPosRaw.x / 1000) * this.game.canvas.width;
            const by = (ballPosRaw.y / 1000) * this.game.canvas.height;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(bx, by, this.radius, 0, Math.PI * 2); ctx.fill();
        }

        // Approach Circle
        if (elapsed < 0) {
            const approachRadius = this.radius * (1 + 2 * (1 - progress));
            ctx.lineWidth = 2;
            const ax = (this.points[0].x / 1000) * this.game.canvas.width;
            const ay = (this.points[0].y / 1000) * this.game.canvas.height;
            ctx.beginPath(); ctx.arc(ax, ay, Math.max(this.radius, approachRadius), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }

    getPointAt(t) {
        t = Math.max(0, Math.min(1, t));
        const segments = this.points.length - 1;
        const segment = Math.floor(t * segments);
        const localT = (t * segments) % 1;
        const p1 = this.points[segment], p2 = this.points[segment + 1] || p1;
        return { x: p1.x + (p2.x - p1.x) * localT, y: p1.y + (p2.y - p1.y) * localT };
    }
}

class Game {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.statusMsg = document.getElementById('status-msg');
        this.scoreEl = document.getElementById('score');
        this.comboEl = document.getElementById('combo');
        this.accuracyEl = document.getElementById('accuracy');
        this.startScreen = document.getElementById('start-screen');
        this.errorBoxEl = document.getElementById('error-box');

        this.score = 0;
        this.combo = 0;
        this.hits = 0;
        this.totalObjects = 0;
        this._debugMsg = "LOADING...";
        this.screen = SCREENS.LOBBY;

        this.poseLandmarker = null;
        this.landmarks = null;
        this.objects = [];
        this.activeObjects = [];
        this.gameStartTime = 0;
        this.trails = { 15: [], 16: [], 27: [], 28: [] }; // Step 2: Trail history
        this.smoothLandmarks = []; // Step 3.1: Global Stabilization
        this.latency = 0; // Step 3: Performance benchmark

        // Phase 3: Gesture History
        this.handVelocity = { 15: { vx: 0, vy: 0, vz: 0 }, 16: { vx: 0, vy: 0, vz: 0 } };
        this.handPath = { 15: [], 16: [] }; // Last 30 frames for circle detection
        this.lastGesture = "NONE";
        this.gestureTime = 0;

        window.onerror = (m, u, l) => { this.showError(`FATAL: ${m} @ ${u}:${l}`); return false; };
        this.init();
    }

    showError(msg) {
        if (this.errorBoxEl) {
            this.errorBoxEl.textContent = msg;
            this.errorBoxEl.style.display = 'block';
        }
    }

    get debugMsg() { return this._debugMsg; }
    set debugMsg(v) { this._debugMsg = v; if (this.statusMsg) this.statusMsg.textContent = v; }

    async init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();

        try {
            this.video.srcObject = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 }
            });
            this.video.onloadedmetadata = () => { this.video.play(); this.resize(); this.startAI(); };
        } catch (err) { this.debugMsg = "CAMERA FAIL: " + err.message; }
    }

    async startAI() {
        this.debugMsg = "LOADING LOCAL AI ENGINE...";
        try {
            // STEP 1: LOAD WASM FROM LOCAL ./wasm/ FOLDER
            const resolver = await FilesetResolver.forVisionTasks("./wasm");

            this.debugMsg = "LOADING POSE MODEL (LOCAL)...";
            // STEP 2: LOAD MODEL FROM LOCAL ./pose_landmarker.task
            this.poseLandmarker = await PoseLandmarker.createFromOptions(resolver, {
                baseOptions: {
                    modelAssetPath: `./pose_landmarker.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numPoses: 1,
                minPoseDetectionConfidence: 0.1,
                minPoseTrackingConfidence: 0.1,
                minPresenceConfidence: 0.1,
                outputSegmentationMasks: false,
                modelComplexity: 0 // LITE MODEL (Speed focus)
            });

            this.debugMsg = "LOCAL AI ONLINE.";
            this.objects = sampleBeatmap.objects.map(o => o.type === 'slider' ? new Slider(o, this) : new Circle(o, this));
            this.activeObjects = [];
            this.screen = SCREENS.LOBBY;
            this.startScreen.style.display = 'none';
            this.processLoop();
        } catch (err) {
            this.showError("AI START FAIL: " + err.message);
            console.error(err);
        }
    }

    startGame() {
        console.log("GAME STARTING...");
        this.screen = SCREENS.PLAYING;
        this.startScreen.style.display = 'none';
        this.gameStartTime = performance.now();
        this.score = 0; this.combo = 0; this.hits = 0; this.totalObjects = 0;
        this.objects = sampleBeatmap.objects.map(o => o.type === 'slider' ? new Slider(o, this) : new Circle(o, this));
        this.activeObjects = [];
    }

    processLoop() {
        const loop = () => {
            const now = performance.now();
            if (this.video.readyState >= 2 && this.poseLandmarker && !this.video.paused) {
                const res = this.poseLandmarker.detectForVideo(this.video, now);
                this.latency = Math.round(performance.now() - now);
                this.landmarks = res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;

                if (this.landmarks) {
                    this.detectGestures();
                }

                if (this.screen === SCREENS.LOBBY && this.lastGesture === "STIR") {
                    this.startGame();
                }

                if (this.screen === SCREENS.PLAYING) {
                    const gameTime = now - this.gameStartTime;

                    while (this.objects.length > 0 && (this.objects[0].startTime || 0) <= gameTime) {
                        this.activeObjects.push(this.objects.shift());
                    }

                    this.activeObjects.forEach(obj => {
                        obj.update(gameTime);
                        if (!obj.hit && !obj.missed && this.landmarks) {
                            const indices = TARGET_MAP[obj.data.target] || [];

                            // SCALE COORDINATES from 1000x1000 beatmap space to canvas
                            const targetX = (obj.data.x / 1000) * this.canvas.width;
                            const targetY = (obj.data.y / 1000) * this.canvas.height;

                            let currentX = targetX, currentY = targetY;
                            if (obj.getPointAt) {
                                const elapsed = gameTime - obj.data.time;
                                if (elapsed > 0) {
                                    const ballPos = obj.getPointAt(elapsed / obj.data.duration);
                                    currentX = (ballPos.x / 1000) * this.canvas.width;
                                    currentY = (ballPos.y / 1000) * this.canvas.height;
                                }
                            }

                            for (let idx of indices) {
                                const lm = this.landmarks[idx];
                                if (lm && lm.visibility > 0.1) { // Lowered limit for better feel
                                    const px = (1 - lm.x) * this.canvas.width;
                                    const py = lm.y * this.canvas.height;
                                    const dist = Math.hypot(px - currentX, py - currentY);
                                    if (dist < obj.radius * 2) {
                                        if (obj.getPointAt) {
                                            if (Math.random() < 0.2) this.handleHit(obj, true);
                                        } else this.handleHit(obj);
                                        break;
                                    }
                                }
                            }
                        }
                    });
                    this.activeObjects = this.activeObjects.filter(o => !o.hit && !o.missed);
                }
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    handleHit(obj, isSliderTick = false) {
        if (!isSliderTick) obj.hit = true;
        this.score += isSliderTick ? 10 : 300;
        if (!isSliderTick) { this.combo++; this.hits++; this.totalObjects++; }
        this.updateHUD();
    }

    handleMiss() {
        this.combo = 0;
        this.totalObjects++;
        this.updateHUD();
    }

    updateHUD() {
        if (this.scoreEl) this.scoreEl.textContent = this.score.toString().padStart(8, '0');
        if (this.comboEl) this.comboEl.textContent = this.combo;
        const acc = this.totalObjects > 0 ? (this.hits / this.totalObjects * 100).toFixed(2) : "100.00";
        if (this.accuracyEl) this.accuracyEl.textContent = acc + "%";
    }

    resize() {
        if (this.video.videoWidth) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
        } else {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const now = performance.now();

        this.ctx.fillStyle = "#00ff00";
        this.ctx.font = "bold 16px monospace";
        this.ctx.textAlign = "left";
        const vState = this.video.readyState >= 2 ? "READY" : "WAITING";
        const vTime = this.video.currentTime.toFixed(2);
        this.ctx.fillText(`${this.debugMsg} | VIDEO: ${vState} (${vTime}s) | SCREEN: ${this.screen.toUpperCase()}`, 20, 30);

        if (this.landmarks) {
            this.stabilizeSkeleton();
            this.updateTrails();
            const rawCount = this.landmarks.length;
            const trailCount = this.trails[15].length;
            this.ctx.fillStyle = 'white';
            this.ctx.fillText(`AI: ${rawCount} LM | LATENCY: ${this.latency}ms | BUF: ${trailCount} | ${this.canvas.width}x${this.canvas.height}`, 20, 60);

            // Phase 3: Gesture HUD
            const isActive = (Date.now() - this.gestureTime < 1000);
            this.ctx.fillStyle = isActive ? '#00ff00' : '#444444';
            this.ctx.font = "bold 30px monospace";
            this.ctx.fillText(`GESTURE: ${isActive ? this.lastGesture : "NONE"}`, 20, 100);

            this.drawTrails();
            this.drawSkeleton();
            this.drawBoundingBox();
        } else {
            this.smoothLandmarks = []; // Reset if tracking lost
            this.ctx.fillStyle = '#ff00ff';
            this.ctx.font = "bold 20px monospace";
            this.ctx.textAlign = "center";
            this.ctx.fillText("AI ONLINE - LOOKING FOR PERSON...", this.canvas.width / 2, 80);
        }
        requestAnimationFrame(() => this.animate());
    }

    drawSkeleton() {
        this.ctx.lineWidth = 5;
        this.ctx.strokeStyle = '#ff0000'; // High contrast RED

        // Use STABILIZED landmarks
        const lms = this.smoothLandmarks;
        if (lms.length < 33) return;

        POSE_CONNECTIONS.forEach(([i, j]) => {
            const lm1 = lms[i], lm2 = lms[j];
            if (lm1 && lm2) {
                this.ctx.beginPath();
                this.ctx.moveTo(lm1.x, lm1.y);
                this.ctx.lineTo(lm2.x, lm2.y);
                this.ctx.stroke();
            }
        });

        this.ctx.fillStyle = '#ffff00';
        [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(idx => {
            const lm = lms[idx];
            if (lm) {
                this.ctx.beginPath(); this.ctx.arc(lm.x, lm.y, 8, 0, Math.PI * 2); this.ctx.fill();
            }
        });
    }

    drawBoundingBox() {
        if (this.smoothLandmarks.length < 33) return;
        let minX = this.canvas.width, minY = this.canvas.height, maxX = 0, maxY = 0;
        this.smoothLandmarks.forEach(lm => {
            minX = Math.min(minX, lm.x);
            minY = Math.min(minY, lm.y);
            maxX = Math.max(maxX, lm.x);
            maxY = Math.max(maxY, lm.y);
        });

        this.ctx.strokeStyle = this.lastGesture === 'STIR' ? '#00ff00' : 'white';
        this.ctx.lineWidth = this.lastGesture === 'STIR' ? 5 : 2;
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    }

    stabilizeSkeleton() {
        const LERP = 0.25; // Smoothing factor
        if (!this.landmarks) return;

        if (this.smoothLandmarks.length < 33) {
            this.smoothLandmarks = this.landmarks.map(lm => ({
                x: (1 - lm.x) * this.canvas.width,
                y: lm.y * this.canvas.height
            }));
        } else {
            for (let i = 0; i < 33; i++) {
                const targetX = (1 - this.landmarks[i].x) * this.canvas.width;
                const targetY = this.landmarks[i].y * this.canvas.height;
                this.smoothLandmarks[i].x += (targetX - this.smoothLandmarks[i].x) * LERP;
                this.smoothLandmarks[i].y += (targetY - this.smoothLandmarks[i].y) * LERP;
            }
        }
    }

    updateTrails() {
        [15, 16, 27, 28].forEach(idx => {
            const lm = this.smoothLandmarks[idx];
            if (lm) {
                this.trails[idx].unshift({ x: lm.x, y: lm.y });
                if (this.trails[idx].length > 40) this.trails[idx].pop();
            } else {
                this.trails[idx] = [];
            }
        });
    }

    detectGestures() {
        const hands = [16];
        hands.forEach(idx => {
            const lm = this.landmarks[idx];
            if (!lm) return;

            this.handPath[idx].unshift({ x: lm.x, y: lm.y });
            if (this.handPath[idx].length > 30) this.handPath[idx].pop();

            if (this.lastPos && this.lastPos[idx]) {
                const dx = lm.x - this.lastPos[idx].x;
                const dy = lm.y - this.lastPos[idx].y;

                this.handVelocity[idx].vx = this.handVelocity[idx].vx * 0.8 + dx * 0.2;
                this.handVelocity[idx].vy = this.handVelocity[idx].vy * 0.8 + dy * 0.2;

                // TUNED SENSITIVITY: 10-frame window for snappier swipes
                const SWIPE_VEL = 0.04;
                const SWIPE_DIST = 0.1;

                if (Math.abs(this.handVelocity[idx].vx) > SWIPE_VEL) {
                    const samplePoint = this.handPath[idx][9] || this.handPath[idx][this.handPath[idx].length - 1];
                    const totalX = lm.x - samplePoint.x;
                    if (Math.abs(totalX) > SWIPE_DIST) {
                        // MIRROR FIX: Moving toward 0 (Left on camera) is "Right" for mirrored user
                        this.triggerGesture(totalX < 0 ? "SWIPE RIGHT" : "SWIPE LEFT");
                    }
                }

                if (Math.abs(this.handVelocity[idx].vy) > SWIPE_VEL) {
                    const samplePoint = this.handPath[idx][9] || this.handPath[idx][this.handPath[idx].length - 1];
                    const totalY = lm.y - samplePoint.y;
                    if (Math.abs(totalY) > SWIPE_DIST) {
                        this.triggerGesture(totalY > 0 ? "SWIPE DOWN" : "SWIPE UP");
                    }
                }
            }

            // STIRRING DETECTION (Circle)
            if (this.handPath[idx].length === 30) {
                let minX = 1, maxX = 0, minY = 1, maxY = 0;
                this.handPath[idx].forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
                const w = maxX - minX, h = maxY - minY;
                // If it's a "box" roughly square and not too tiny
                if (w > 0.05 && h > 0.05 && Math.abs(w - h) < 0.1) {
                    // Check if points wrap around center (simple heuristic: total distance vs radius)
                    let totalDist = 0;
                    for (let i = 0; i < 29; i++) {
                        totalDist += Math.hypot(this.handPath[idx][i].x - this.handPath[idx][i + 1].x, this.handPath[idx][i].y - this.handPath[idx][i + 1].y);
                    }
                    const perimeter = Math.PI * (w + h) / 2;
                    if (totalDist > perimeter * 0.8 && totalDist < perimeter * 2.0) {
                        this.triggerGesture("STIR");
                    }
                }
            }
        });

        this.lastPos = {
            15: { x: this.landmarks[15].x, y: this.landmarks[15].y, z: this.landmarks[15].z },
            16: { x: this.landmarks[16].x, y: this.landmarks[16].y, z: this.landmarks[16].z }
        };
    }

    triggerGesture(name) {
        // Cooldown: Don't trigger multiple in 200ms
        if (Date.now() - this.gestureTime < 200) return;

        this.lastGesture = name;
        this.gestureTime = Date.now();
        console.log("GESTURE DETECTED:", name);
    }

    drawTrails() {
        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        [15, 16, 27, 28].forEach(idx => {
            const history = this.trails[idx];
            if (history.length < 2) return;

            const color = [15, 16].includes(idx) ? '#00ffff' : '#ff00ff';

            // Pass 1: Massive Outer Glow - Faster Fade (Power 3)
            this.ctx.lineWidth = 40;
            this.ctx.shadowBlur = 30;
            this.ctx.shadowColor = color;
            this.renderPath(history, color, 0.4, 3.0);

            // Pass 2: Bright Inner Core - Faster Fade (Power 2)
            this.ctx.lineWidth = 12;
            this.ctx.shadowBlur = 0;
            this.renderPath(history, '#ffffff', 0.8, 2.0);
        });
        this.ctx.restore();
    }

    renderPath(history, color, baseAlpha, power = 1) {
        for (let i = 0; i < history.length - 1; i++) {
            const p1 = history[i], p2 = history[i + 1];
            // Non-linear fade for smoother "tail"
            const alpha = Math.pow(1 - (i / history.length), power) * baseAlpha;
            this.ctx.globalAlpha = alpha;
            this.ctx.strokeStyle = color;
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        }
    }
}

new Game();

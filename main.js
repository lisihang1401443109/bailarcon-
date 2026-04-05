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
                    delegate: "CPU"
                },
                runningMode: "VIDEO",
                numPoses: 1,
                minPoseDetectionConfidence: 0.1,
                minPoseTrackingConfidence: 0.1,
                minPresenceConfidence: 0.1
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
                this.landmarks = res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;

                if (this.screen === SCREENS.LOBBY && this.landmarks && this.landmarks.length > 0) {
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
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.video.videoWidth) {
            const vA = this.video.videoWidth / this.video.videoHeight;
            const wA = window.innerWidth / window.innerHeight;
            if (wA > vA) { this.canvas.width = window.innerHeight * vA; }
            else { this.canvas.height = window.innerWidth / vA; }
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const now = performance.now();

        // HEARTBEAT
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 10;
        this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "#00ff00";
        this.ctx.font = "bold 16px monospace";
        this.ctx.textAlign = "left";
        const vState = this.video.readyState >= 2 ? "READY" : "WAITING";
        const vTime = this.video.currentTime.toFixed(2);
        this.ctx.fillText(`${this.debugMsg} | VIDEO: ${vState} (${vTime}s) | SCREEN: ${this.screen.toUpperCase()}`, 20, 30);

        if (this.landmarks) {
            const rawCount = this.landmarks.length;
            this.ctx.fillStyle = 'white';
            this.ctx.fillText(`AI QUALITY: ${rawCount} LANDMARKS | CANVAS: ${this.canvas.width}x${this.canvas.height}`, 20, 60);
            this.drawSkeleton();
            this.drawBoundingBox();
        } else {
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

        // Draw Connections - NO VISIBILITY GATES for testing
        POSE_CONNECTIONS.forEach(([i, j]) => {
            const lm1 = this.landmarks[i], lm2 = this.landmarks[j];
            if (lm1 && lm2) {
                this.ctx.beginPath();
                this.ctx.moveTo(lm1.x * this.canvas.width, lm1.y * this.canvas.height);
                this.ctx.lineTo(lm2.x * this.canvas.width, lm2.y * this.canvas.height);
                this.ctx.stroke();
            }
        });

        // Draw BIG joints
        this.ctx.fillStyle = '#ffff00';
        [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(idx => {
            const lm = this.landmarks[idx];
            if (lm) {
                const px = lm.x * this.canvas.width;
                const py = lm.y * this.canvas.height;
                this.ctx.beginPath(); this.ctx.arc(px, py, 8, 0, Math.PI * 2); this.ctx.fill();
            }
        });
    }

    drawBoundingBox() {
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        this.landmarks.forEach(lm => {
            minX = Math.min(minX, lm.x);
            minY = Math.min(minY, lm.y);
            maxX = Math.max(maxX, lm.x);
            maxY = Math.max(maxY, lm.y);
        });

        const bx = minX * this.canvas.width;
        const by = minY * this.canvas.height;
        const bw = (maxX - minX) * this.canvas.width;
        const bh = (maxY - minY) * this.canvas.height;

        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(bx, by, bw, bh);
    }
}

new Game();

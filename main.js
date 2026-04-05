// BAILARCON - TOTAL LOCAL CORE
// 100% Offline: No CDNs, No Internet required.

import { HandLandmarker, FilesetResolver } from "./vision_bundle.js";
import { sampleBeatmap, maps } from "./beatmap.js";

const SCREENS = { LOBBY: 'lobby', PLAYING: 'playing', RESULTS: 'results' };
const TARGET_MAP = {
    'HAND': [15, 16, 19, 20], // Wrists, Index fingers
    'FOOT': [27, 28, 31, 32]  // Ankles, Toes
};
const HAND_SKELETON_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],           // thumb
    [0,5],[5,6],[6,7],[7,8],           // index
    [5,9],[9,10],[10,11],[11,12],       // middle
    [9,13],[13,14],[14,15],[15,16],     // ring
    [13,17],[0,17],[17,18],[18,19],[19,20] // pinky + palm closure
];

class Circle {
    constructor(data, game) {
        this.data = data;
        this.game = game;
        this.hit = false;
        this.missed = false;
        this.radius = 60;
        this.startTime = data.time - 1500; // Increased to 1500ms for better readability
    }

    update(currentTime) {
        if (this.hit || this.missed) return;

        // Expiration Check
        if (currentTime > this.data.time + 200) {
            this.missed = true;
            this.game.handleMiss();
            return;
        }

        // Hit Detection Logic: Within timing window
        const timeDiff = Math.abs(currentTime - this.data.time);
        if (timeDiff <= 150) {
            const targetIndices = TARGET_MAP[this.data.target];
            const { x: targetX, y: targetY } = this.game.getRelativePos(this.data.x, this.data.y);

            const isHit = targetIndices.some(idx => {
                const lm = this.game.smoothLandmarks[idx];
                if (!lm) return false;
                const dist = Math.hypot(lm.x - targetX, lm.y - targetY);
                return dist < 80;
            });

            if (isHit) {
                this.hit = true;
                const result = timeDiff < 80 ? 'PERFECT' : 'GOOD';
                this.game.handleHit(result, { x: targetX, y: targetY });
            }
        }
    }

    draw(ctx, currentTime) {
        if (this.hit || this.missed) return;
        const progress = (currentTime - this.startTime) / 1500;
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
        const { x: cx, y: cy } = this.game.getRelativePos(this.data.x, this.data.y);

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
        this.startTime = data.time - 1500;
        this.points = data.points || [];
    }

    update(currentTime) {
        if (this.hit || this.missed) return;

        // Expiration Check
        if (currentTime > this.data.time + this.data.duration + 200) {
            this.missed = true;
            return;
        }

        // Active State Check (During the slide duration)
        if (currentTime >= this.data.time && currentTime <= this.data.time + this.data.duration) {
            const headP = this.getPointAt(currentTime);
            const { x: targetX, y: targetY } = this.game.getRelativePos(headP.x, headP.y);

            const targetIndices = TARGET_MAP[this.data.target];
            const isTouching = targetIndices.some(idx => {
                const lm = this.game.smoothLandmarks[idx];
                if (!lm) return false;
                return Math.hypot(lm.x - targetX, lm.y - targetY) < 100;
            });

            if (isTouching) {
                // Sliders grant continuous score/combo? 
                // For now, let's just mark it as "hit" at the end if followed well.
                this.isCurrentlyTracking = true;
            } else {
                this.isCurrentlyTracking = false;
            }
        }

        // Final Judgment
        if (currentTime > this.data.time + this.data.duration) {
            this.hit = true;
            this.game.handleHit('PERFECT', { x: 512, y: 384 }); // Default center feedback
        }
    }

    draw(ctx, currentTime) {
        if (this.hit || this.missed) return;
        const totalDuration = this.data.duration;
        const elapsed = currentTime - this.data.time;
        const progress = (currentTime - this.startTime) / 1500;
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
            const startP = this.game.getRelativePos(this.points[0].x, this.points[0].y);
            ctx.moveTo(startP.x, startP.y);
            for (let i = 1; i < this.points.length; i++) {
                const p = this.game.getRelativePos(this.points[i].x, this.points[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }

        // Draw Ball
        if (elapsed > 0 && elapsed < totalDuration) {
            const ballPosRaw = this.getPointAt(elapsed / totalDuration);
            const { x: bx, y: by } = this.game.getRelativePos(ballPosRaw.x, ballPosRaw.y);
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(bx, by, this.radius, 0, Math.PI * 2); ctx.fill();
        }

        // Approach Circle
        if (elapsed < 0) {
            const approachRadius = this.radius * (1 + 2 * (1 - progress));
            ctx.lineWidth = 2;
            const { x: ax, y: ay } = this.game.getRelativePos(this.points[0].x, this.points[0].y);
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

        this.handLandmarker = null;
        this.handResult = null;
        this.landmarks = null;
        this.objects = [];
        this.activeObjects = [];
        // State
        this.gameStartTime = 0;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.hits = 0; // Count of non-misses
        this.totalObjectsCount = 0;
        this.hitFeedback = []; // {text, color, x, y, time}
        this.lastObjectTime = 0;

        this.trails = { 15: [], 16: [] }; // Step 2: Trail history (hands only)
        this.smoothLandmarks = []; // Step 3.1: Global Stabilization
        this.latency = 0; // Step 3: Performance benchmark

        // Phase 3 & 4: Control & Menu State
        this.handVelocity = { 15: { vx: 0, vy: 0, vz: 0 }, 16: { vx: 0, vy: 0, vz: 0 } };
        this.handPath = { 15: [], 16: [] };
        this.lastGesture = "NONE";
        this.gestureTime = 0;

        this.selectedMapIdx = 0;
        this.dwellTime = 0;
        this.dwellIdx = -1;
        this.maps = maps;

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
            // Lower resolution on mobile reduces GPU decode cost and speeds up pose detection.
            // Capping frameRate at 30 avoids processing frames faster than MediaPipe can handle.
            const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            const camW = isMobile ? 480 : 640;
            const camH = isMobile ? 360 : 480;
            this.video.srcObject = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: camW }, height: { ideal: camH }, frameRate: { ideal: 30, max: 30 } }
            });
            this.video.onloadedmetadata = () => { this.video.play(); this.resize(); this.startAI(); };
        } catch (err) { this.debugMsg = "CAMERA FAIL: " + err.message; }
    }

    async startAI() {
        this.debugMsg = "LOADING LOCAL AI ENGINE...";
        try {
            // STEP 1: LOAD WASM FROM LOCAL ./wasm/ FOLDER
            const resolver = await FilesetResolver.forVisionTasks("./wasm");

            this.debugMsg = "LOADING HAND MODEL (LOCAL)...";
            // STEP 2: LOAD HandLandmarker — purpose-built for hands, much faster on mobile
            this.handLandmarker = await HandLandmarker.createFromOptions(resolver, {
                baseOptions: {
                    modelAssetPath: `./hand_landmarker.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
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
        const selectedMap = this.maps[this.selectedMapIdx];
        console.log(`STARTING MAP: ${selectedMap.title}`);
        this.screen = SCREENS.PLAYING;
        // ...
        this.gameStartTime = performance.now();
        this.score = 0; this.combo = 0; this.hits = 0; this.totalObjects = 0;
        this.objects = sampleBeatmap.objects.map(o => o.type === 'slider' ? new Slider(o, this) : new Circle(o, this));
        this.activeObjects = [];
    }

    processLoop() {
        let lastVideoTime = -1; // Track processed video frames to avoid reprocessing the same frame
        const loop = () => {
            const now = performance.now();
            if (this.video.readyState >= 2 && this.handLandmarker && !this.video.paused) {
                // Only run pose detection when the video has a genuinely new frame.
                // video.currentTime only advances when the camera produces a new frame (~30fps),
                // so skipping duplicate timestamps cuts ~half the GPU work at 60fps rAF.
                if (this.video.currentTime !== lastVideoTime) {
                    lastVideoTime = this.video.currentTime;
                    const res = this.handLandmarker.detectForVideo(this.video, now);
                    this.latency = Math.round(performance.now() - now);
                    this.handResult = (res.landmarks && res.landmarks.length > 0) ? res : null;
                    this.landmarks = this.handResult ? this._buildLandmarkProxy(this.handResult) : null;
                }

                if (this.landmarks) {
                    this.detectGestures();
                }

                if (this.screen === SCREENS.LOBBY) {
                    this.updateMenuLogic();
                }

                if (this.screen === SCREENS.PLAYING) {
                    const gameTime = now - this.gameStartTime;

                    while (this.objects.length > 0 && (this.objects[0].startTime || 0) <= gameTime) {
                        this.activeObjects.push(this.objects.shift());
                    }

                    this.activeObjects.forEach(obj => {
                        obj.update(gameTime);
                    });
                    this.activeObjects = this.activeObjects.filter(o => !o.hit && !o.missed);

                    // Game Completion Check
                    if (gameTime > this.lastObjectTime + 1500) {
                        this.screen = SCREENS.RESULTS;
                    }
                }

                if (this.screen === SCREENS.RESULTS) {
                    if (this.lastGesture === "SWIPE RIGHT") {
                        this.screen = SCREENS.LOBBY;
                        this.lastGesture = "NONE";
                    }
                }
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    _buildLandmarkProxy(res) {
        // Maps HandLandmarker output (2 hands × 21 landmarks) into the sparse
        // smoothLandmarks indices the rest of the game already uses.
        //
        // Handedness inversion: the game flips X via (1 - lm.x), so the model's
        // perspective is mirrored relative to what the player sees:
        //   label='Left'  → camera-left → canvas-RIGHT after flip → user's RIGHT hand → slots [16],[20]
        //   label='Right' → camera-right → canvas-LEFT after flip → user's LEFT hand  → slots [15],[19]
        const proxy = [];
        for (let i = 0; i < res.landmarks.length; i++) {
            const hand21 = res.landmarks[i];
            const label = res.handednesses[i][0].categoryName;
            if (label === 'Left') {     // user's right hand
                proxy[16] = hand21[0];  // wrist
                proxy[20] = hand21[8];  // index fingertip
            } else {                    // user's left hand
                proxy[15] = hand21[0];
                proxy[19] = hand21[8];
            }
        }
        return (proxy[15] || proxy[16]) ? proxy : null;
    }

    handleHit(result, pos) {
        if (result === 'PERFECT') this.score += 300 * (1 + this.combo * 0.1);
        else if (result === 'GOOD') this.score += 100 * (1 + this.combo * 0.1);

        this.combo++;
        this.hits++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.hitFeedback.push({
            text: result,
            color: result === 'PERFECT' ? '#ffff00' : '#00ffff',
            x: pos.x,
            y: pos.y,
            time: Date.now()
        });
    }

    handleMiss() {
        this.combo = 0;
        this.hitFeedback.push({
            text: "MISS",
            color: "#ff3333",
            x: 512, y: 384, // Center for misses
            time: Date.now()
        });
    }

    updateHUD() {
        if (this.scoreEl) this.scoreEl.textContent = this.score.toString().padStart(8, '0');
        if (this.comboEl) this.comboEl.textContent = this.combo;
        const acc = this.totalObjects > 0 ? (this.hits / this.totalObjects * 100).toFixed(2) : "100.00";
        if (this.accuracyEl) this.accuracyEl.textContent = acc + "%";
    }

    getRelativePos(bx, by) {
        // Fixed screen-center reference — no body calibration needed.
        // Works immediately on any device at any distance from the camera.
        // Play zone is centered at 45% height, spanning 65% of canvas height.
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height * 0.45;
        const reachScale = this.canvas.height * 0.65;
        return {
            x: centerX + (bx - 500) * (reachScale / 1000),
            y: centerY + (by - 500) * (reachScale / 1000)
        };
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

            if (this.screen === SCREENS.LOBBY) {
                this.drawMenu();
            }
            if (this.screen === SCREENS.RESULTS) {
                this.drawResults();
            }

            if (this.screen === SCREENS.PLAYING) {
                const gameTime = now - this.gameStartTime;

                // Spawn new objects (800ms lead time)
                while (this.objects.length > 0 && this.objects[0].data.time <= gameTime + 800) {
                    this.activeObjects.push(this.objects.shift());
                }

                // Update and Draw active objects
                this.activeObjects.forEach(obj => {
                    obj.update(gameTime);
                    obj.draw(this.ctx, gameTime);
                });

                this.activeObjects = this.activeObjects.filter(o => !o.hit && !o.missed);

                // Completion Check
                if (gameTime > this.lastObjectTime + 1500) {
                    this.screen = SCREENS.RESULTS;
                }
            }

            const rawCount = this.handResult ? this.handResult.landmarks.length : 0;
            const trailCount = this.trails[15].length;
            this.ctx.fillStyle = 'white';
            this.ctx.fillText(`AI: ${rawCount} HANDS | LATENCY: ${this.latency}ms | BUF: ${trailCount} | ${this.canvas.width}x${this.canvas.height}`, 20, 60);

            // HUD: Score & Combo
            this.ctx.font = "bold 40px Outfit";
            this.ctx.textAlign = "right";
            this.ctx.fillStyle = "white";
            this.ctx.fillText(Math.floor(this.score).toString().padStart(7, '0'), this.canvas.width - 40, 60);
            this.ctx.font = "bold 60px Outfit";
            this.ctx.fillStyle = this.combo > 10 ? "#ffff00" : "white";
            this.ctx.fillText(`${this.combo}x`, this.canvas.width - 40, 130);
            this.ctx.textAlign = "left";

            // Hit Feedback
            this.hitFeedback = this.hitFeedback.filter(f => Date.now() - f.time < 800);
            this.hitFeedback.forEach(f => {
                const age = (Date.now() - f.time) / 800;
                this.ctx.save();
                this.ctx.globalAlpha = 1 - age;
                this.ctx.fillStyle = f.color;
                this.ctx.font = `bold ${30 + (1 - age) * 20}px Outfit`;
                this.ctx.textAlign = "center";
                this.ctx.fillText(f.text, f.x, f.y - (age * 50));
                this.ctx.restore();
            });

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
            this.handResult = null;
            this.ctx.fillStyle = '#ff00ff';
            this.ctx.font = "bold 20px monospace";
            this.ctx.textAlign = "center";
            this.ctx.fillText("AI ONLINE - LOOKING FOR PERSON...", this.canvas.width / 2, 80);
        }
        requestAnimationFrame(() => this.animate());
    }

    drawSkeleton() {
        if (!this.handResult) return;

        // Draw 21-point hand skeleton for each detected hand from raw result.
        // Raw result is used (not smoothLandmarks) so visual feedback is instant.
        this.handResult.landmarks.forEach((hand21, hi) => {
            const isRight = this.handResult.handednesses[hi][0].categoryName === 'Left';
            this.ctx.strokeStyle = isRight ? '#00ffff' : '#ff00ff';
            this.ctx.lineWidth = 3;

            HAND_SKELETON_CONNECTIONS.forEach(([i, j]) => {
                const x1 = (1 - hand21[i].x) * this.canvas.width, y1 = hand21[i].y * this.canvas.height;
                const x2 = (1 - hand21[j].x) * this.canvas.width, y2 = hand21[j].y * this.canvas.height;
                this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.stroke();
            });

            this.ctx.fillStyle = '#ffff00';
            hand21.forEach((lm, idx) => {
                const px = (1 - lm.x) * this.canvas.width, py = lm.y * this.canvas.height;
                const r = (idx === 0 || idx === 8) ? 10 : 5; // bigger dot at wrist + index tip
                this.ctx.beginPath(); this.ctx.arc(px, py, r, 0, Math.PI * 2); this.ctx.fill();
            });
        });
    }

    updateMenuLogic() {
        if (this.lastGesture === "SWIPE LEFT") { // Moving toward higher index
            this.selectedMapIdx = Math.min(this.selectedMapIdx + 1, this.maps.length - 1);
            this.lastGesture = "NONE";
        }
        if (this.lastGesture === "SWIPE RIGHT") { // Moving toward lower index
            this.selectedMapIdx = Math.max(this.selectedMapIdx - 1, 0);
            this.lastGesture = "NONE";
        }

        // Dwell Logic: Check which box is hovered
        const rh = this.smoothLandmarks[16];
        if (rh) {
            let foundHover = -1;
            const cardWidth = 300;
            const spacing = 40;
            const centerX = this.canvas.width / 2;
            const startX = centerX - (this.selectedMapIdx * (cardWidth + spacing));

            this.maps.forEach((map, i) => {
                const itemX = startX + (i * (cardWidth + spacing));
                const itemY = this.canvas.height / 2 - 100;

                if (rh.x > itemX && rh.x < itemX + cardWidth && rh.y > itemY && rh.y < itemY + 200) {
                    foundHover = i;
                }
            });

            if (foundHover !== -1 && foundHover === this.dwellIdx) {
                this.dwellTime += 16;
                if (this.dwellTime >= 1000) { // Reduced to 1s
                    this.startGame();
                    this.dwellTime = 0;
                }
            } else {
                this.dwellIdx = foundHover;
                this.dwellTime = 0;
            }
        }
    }

    drawMenu() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const cardWidth = 300;
        const cardHeight = 200;
        const spacing = 40;

        // Smooth horizontal scrolling (interpolating toward target index)
        if (this.currentScroll === undefined) this.currentScroll = this.selectedMapIdx;
        this.currentScroll += (this.selectedMapIdx - this.currentScroll) * 0.1;

        const startX = centerX - (this.currentScroll * (cardWidth + spacing)) - (cardWidth / 2);

        this.ctx.fillStyle = "white";
        this.ctx.font = "bold 32px Outfit";
        this.ctx.textAlign = "center";
        this.ctx.fillText("SWIPE LEFT/RIGHT TO BROWSE | HOVER TO SELECT", centerX, centerY - 250);
        this.ctx.textAlign = "left";

        this.maps.forEach((map, i) => {
            const isSelected = i === this.selectedMapIdx;
            const isHovered = i === this.dwellIdx;
            const itemX = startX + (i * (cardWidth + spacing));
            const itemY = centerY - 100;

            // Distance Fade
            const distFromCenter = Math.abs(centerX - (itemX + cardWidth / 2));
            const opacity = Math.max(0.2, 1 - (distFromCenter / (this.canvas.width / 2)));

            this.ctx.save();
            this.ctx.globalAlpha = opacity;

            // Card BG
            this.ctx.fillStyle = isHovered ? "rgba(0, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.1)";
            this.ctx.strokeStyle = isSelected ? "#00ffff" : "rgba(255,255,255,0.3)";
            this.ctx.lineWidth = isSelected ? 5 : 2;

            if (isSelected) {
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = "#00ffff";
            }

            this.ctx.beginPath();
            this.ctx.roundRect ? this.ctx.roundRect(itemX, itemY, cardWidth, cardHeight, 20) : this.ctx.rect(itemX, itemY, cardWidth, cardHeight);
            this.ctx.fill(); this.ctx.stroke();

            // Text
            this.ctx.fillStyle = isSelected ? "#00ffff" : "white";
            this.ctx.font = "bold 24px Outfit";
            this.ctx.fillText(map.title, itemX + 20, itemY + 50);

            this.ctx.font = "16px Outfit";
            this.ctx.fillText(map.artist, itemX + 20, itemY + 80);

            this.ctx.fillStyle = isSelected ? "#00ffff" : "#aaaaaa";
            this.ctx.font = "bold 18px Outfit";
            this.ctx.fillText(`${map.difficulty}`, itemX + 20, itemY + 140);
            this.ctx.fillText(`${map.bpm} BPM`, itemX + 20, itemY + 170);

            this.ctx.restore();
        });

        // Dwell Progress Ring around Right Hand
        const rh = this.smoothLandmarks[16];
        if (rh && this.dwellTime > 0) {
            const progress = this.dwellTime / 1500;
            this.ctx.beginPath();
            this.ctx.arc(rh.x, rh.y, 50, 0, Math.PI * 2);
            this.ctx.strokeStyle = "rgba(255,255,255,0.4)";
            this.ctx.lineWidth = 6;
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(rh.x, rh.y, 50, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * progress));
            this.ctx.strokeStyle = "#00ff00";
            this.ctx.lineWidth = 6;
            this.ctx.stroke();

            this.ctx.fillStyle = "white";
            this.ctx.font = "bold 14px Outfit";
            this.ctx.textAlign = "center";
            this.ctx.fillText(Math.round(progress * 100) + "%", rh.x, rh.y + 7);
            this.ctx.textAlign = "left";
        }
    }

    drawResults() {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        this.ctx.fillStyle = "rgba(0,0,0,0.8)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#00ffff";
        this.ctx.font = "bold 60px Outfit";
        this.ctx.fillText("STAGE CLEAR", cx, cy - 200);

        this.ctx.fillStyle = "white";
        this.ctx.font = "bold 100px Outfit";
        this.ctx.fillText(Math.floor(this.score).toString(), cx, cy - 50);

        this.ctx.font = "bold 30px Outfit";
        this.ctx.fillStyle = "#aaaaaa";
        this.ctx.fillText(`MAX COMBO: ${this.maxCombo}`, cx, cy + 50);
        this.ctx.fillText(`ACCURACY: ${Math.round((this.hits / this.totalObjectsCount) * 100)}%`, cx, cy + 100);

        this.ctx.fillStyle = "#00ff00";
        this.ctx.font = "bold 24px Outfit";
        this.ctx.fillText("SWIPE RIGHT TO RETURN TO LOBBY", cx, cy + 250);

        this.ctx.textAlign = "left";
    }

    drawBoundingBox() {
        if (!this.handResult) return;
        let minX = this.canvas.width, minY = this.canvas.height, maxX = 0, maxY = 0;
        this.handResult.landmarks.forEach(hand21 => {
            hand21.forEach(lm => {
                const px = (1 - lm.x) * this.canvas.width, py = lm.y * this.canvas.height;
                minX = Math.min(minX, px); minY = Math.min(minY, py);
                maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
            });
        });

        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    }

    stabilizeSkeleton() {
        const LERP = 0.4;
        if (!this.landmarks) return;

        // Only smooth the 4 slots the game uses: wrists (15,16) + index tips (19,20).
        // Per-slot null checks handle the case where only one hand is visible.
        for (const i of [15, 16, 19, 20]) {
            const raw = this.landmarks[i];
            if (!raw) { this.smoothLandmarks[i] = null; continue; }
            const tx = (1 - raw.x) * this.canvas.width;
            const ty = raw.y * this.canvas.height;
            if (!this.smoothLandmarks[i]) {
                this.smoothLandmarks[i] = { x: tx, y: ty };
            } else {
                this.smoothLandmarks[i].x += (tx - this.smoothLandmarks[i].x) * LERP;
                this.smoothLandmarks[i].y += (ty - this.smoothLandmarks[i].y) * LERP;
            }
        }
    }

    updateTrails() {
        [15, 16].forEach(idx => {
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

                // Reduced decay from 0.8→0.65 so velocity responds faster to new movement
                this.handVelocity[idx].vx = this.handVelocity[idx].vx * 0.65 + dx * 0.35;
                this.handVelocity[idx].vy = this.handVelocity[idx].vy * 0.65 + dy * 0.35;

                // TUNED SENSITIVITY: 10-frame window for snappier swipes
                const SWIPE_VEL = 0.02; // More sensitive
                const SWIPE_DIST = 0.07; // More sensitive

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
                    const totalY = lm.y * this.canvas.height - samplePoint.y * this.canvas.height;
                    const SWIPE_DIST_PX = 100;
                    if (Math.abs(totalY) > SWIPE_DIST_PX) {
                        this.triggerGesture(totalY > 0 ? "SWIPE DOWN" : "SWIPE UP");
                    }
                }
            }
        });

        // Save current positions for next frame delta (guard: hand may not be visible)
        this.lastPos = this.lastPos || {};
        if (this.landmarks[15]) this.lastPos[15] = { x: this.landmarks[15].x, y: this.landmarks[15].y, z: this.landmarks[15].z || 0 };
        if (this.landmarks[16]) this.lastPos[16] = { x: this.landmarks[16].x, y: this.landmarks[16].y, z: this.landmarks[16].z || 0 };
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

        [15, 16].forEach(idx => {
            const history = this.trails[idx];
            if (history.length < 2) return;

            const color = '#00ffff';

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

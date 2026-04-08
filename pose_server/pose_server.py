"""
pose_server.py — MediaPipe 姿态追踪 UDP 发送端

功能：
  1. 打开本地摄像头
  2. 每帧用 MediaPipe Pose 提取 4 个关节坐标（左右腕、左右踝）
  3. 坐标归一化至 [0.0, 1.0]，X 轴镜像翻转（与 Godot 前端显示一致）
  4. 打包为 JSON，通过 UDP 发送至 Godot（默认 127.0.0.1:5000）

运行：
  python pose_server.py
  python pose_server.py --cam 1          # 指定摄像头索引
  python pose_server.py --port 5001      # 指定端口
  python pose_server.py --no-preview     # 关闭预览窗口（提升性能）

依赖：
  pip install -r requirements.txt
"""

import argparse
import json
import socket
import sys
import time

import cv2
import mediapipe as mp

# ─── MediaPipe Pose 关节索引 ─────────────────────────────────────────────────
# 参考：https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
LANDMARK = {
    "LEFT_WRIST":  15,
    "RIGHT_WRIST": 16,
    "LEFT_ANKLE":  27,
    "RIGHT_ANKLE": 28,
}

# ─── 置信度阈值：低于此值的关节视为不可见，保留上一帧坐标 ─────────────────────
VISIBILITY_THRESHOLD = 0.50


def parse_args():
    p = argparse.ArgumentParser(description="MediaPipe → UDP Pose Server")
    p.add_argument("--cam",        type=int,  default=0,         help="摄像头索引（默认 0）")
    p.add_argument("--port",       type=int,  default=5000,      help="UDP 目标端口（默认 5000）")
    p.add_argument("--host",       type=str,  default="127.0.0.1", help="UDP 目标地址")
    p.add_argument("--width",      type=int,  default=640,       help="采集分辨率宽（默认 640）")
    p.add_argument("--height",     type=int,  default=480,       help="采集分辨率高（默认 480）")
    p.add_argument("--no-preview", action="store_true",          help="关闭 OpenCV 预览窗口")
    return p.parse_args()


def make_fallback() -> dict:
    """当某帧完全无法检测时，返回屏幕中央安全默认值"""
    return {
        "lw": [0.25, 0.40],
        "rw": [0.75, 0.40],
        "la": [0.35, 0.80],
        "ra": [0.65, 0.80],
    }


def extract_joints(landmarks, prev: dict) -> dict:
    """
    从 MediaPipe landmark 列表中提取 4 个关节的归一化坐标。

    坐标处理：
      - X 轴镜像：x = 1.0 - landmark.x
        （MediaPipe 以摄像头原始帧为参考，Godot 前端对视频做了水平镜像，
         因此 X 必须翻转才能与玩家看到的画面对齐）
      - Y 轴不变
      - 值钳制在 [0.02, 0.98]，避免超出屏幕边缘

    visibility < VISIBILITY_THRESHOLD 时，保留上一帧坐标（平滑过渡）。
    """
    result = {}
    key_map = {
        "lw": LANDMARK["LEFT_WRIST"],
        "rw": LANDMARK["RIGHT_WRIST"],
        "la": LANDMARK["LEFT_ANKLE"],
        "ra": LANDMARK["RIGHT_ANKLE"],
    }

    for key, idx in key_map.items():
        lm = landmarks[idx]

        if lm.visibility >= VISIBILITY_THRESHOLD:
            x = round(max(0.02, min(0.98, 1.0 - lm.x)), 4)  # 镜像 + 钳制
            y = round(max(0.02, min(0.98, lm.y)),        4)
            result[key] = [x, y]
        else:
            # 关节不可见：沿用上一帧，防止突变
            result[key] = prev.get(key, make_fallback()[key])

    return result


def main():
    args = parse_args()

    # ── 摄像头初始化 ──────────────────────────────────────────────────────────
    cap = cv2.VideoCapture(args.cam)
    if not cap.isOpened():
        print(f"[ERROR] 无法打开摄像头 {args.cam}", file=sys.stderr)
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    cap.set(cv2.CAP_PROP_FPS, 30)

    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[INFO] 摄像头已开启：{actual_w}x{actual_h} @ cam={args.cam}")

    # ── UDP 套接字 ────────────────────────────────────────────────────────────
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    target = (args.host, args.port)
    print(f"[INFO] UDP 目标：{args.host}:{args.port}")

    # ── MediaPipe Pose ────────────────────────────────────────────────────────
    mp_pose    = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils

    prev_joints = make_fallback()
    frame_count = 0
    fps_time    = time.time()

    with mp_pose.Pose(
        model_complexity=0,           # 0=Lite（最快）, 1=Full, 2=Heavy
        smooth_landmarks=True,        # 关节平滑，减少抖动
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:

        print("[INFO] MediaPipe Pose 已就绪，开始发送数据…（按 Q 退出）")

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("[WARN] 读帧失败，跳过", file=sys.stderr)
                continue

            # MediaPipe 要求 RGB 输入
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            results = pose.process(rgb)
            rgb.flags.writeable = True

            # ── 提取关节 & 发送 ──────────────────────────────────────────────
            if results.pose_landmarks:
                joints = extract_joints(results.pose_landmarks.landmark, prev_joints)
            else:
                joints = prev_joints  # 未检测到人时保持上一帧

            prev_joints = joints

            packet = json.dumps(joints, separators=(",", ":")).encode("utf-8")
            sock.sendto(packet, target)

            # ── 可视化预览 ───────────────────────────────────────────────────
            if not args.no_preview:
                if results.pose_landmarks:
                    mp_drawing.draw_landmarks(
                        frame,
                        results.pose_landmarks,
                        mp_pose.POSE_CONNECTIONS,
                        mp_drawing.DrawingSpec(color=(0, 255, 255), thickness=2, circle_radius=3),
                        mp_drawing.DrawingSpec(color=(255, 0, 255), thickness=2),
                    )

                # 在预览窗口标注 4 个目标关节
                h, w = frame.shape[:2]
                labels = {
                    "LW": joints["lw"], "RW": joints["rw"],
                    "LA": joints["la"], "RA": joints["ra"],
                }
                for label, (nx, ny) in labels.items():
                    # 注意：预览窗口 X 不镜像（直接显示原始帧），所以反转回来
                    px = int((1.0 - nx) * w)
                    py = int(ny * h)
                    cv2.circle(frame, (px, py), 10, (0, 255, 0), -1)
                    cv2.putText(frame, label, (px + 12, py),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)

                # FPS 计数
                frame_count += 1
                elapsed = time.time() - fps_time
                if elapsed >= 1.0:
                    fps = frame_count / elapsed
                    frame_count = 0
                    fps_time = time.time()
                    cv2.putText(frame, f"FPS: {fps:.1f}  UDP→{args.port}",
                                (10, 30), cv2.FONT_HERSHEY_SIMPLEX,
                                0.7, (0, 200, 255), 2)

                cv2.imshow("PoseServer Preview (Q=Quit)", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    cap.release()
    sock.close()
    cv2.destroyAllWindows()
    print("[INFO] PoseServer 已退出。")


if __name__ == "__main__":
    main()

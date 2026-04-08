# 前端开发指引：渲染、VFX 与 UI (Godot Frontend)

## 1. 目标与技术栈
* **技术栈**：Godot 4 节点树, `Line2D` / `GPUParticles2D`, Tween 动画, C#。
* **职责**：作为“纯展示层”，监听 `GameEventManager` 发出的信号，更新屏幕节点位置，播放炫酷特效。前端不参与任何碰撞距离计算。

## 2. 核心模块开发任务

### 任务 1：骨架与能量轨迹 (`SkeletonRenderer.cs`)
* 创建 4 个 Node2D（代表左手、右手、左脚、右脚）。
* 订阅 `GameEventManager.Instance.OnSkeletonUpdated` 事件。
* **坐标转换**：在回调中，将收到的 `JointData` 归一化坐标乘以 `GetViewportRect().Size`，更新这 4 个 Node2D 的 `GlobalPosition`。
* **能量轨迹特效**：为这 4 个节点挂载 `Line2D` 节点，或者 `GPUParticles2D` 节点。配置粒子拖尾效果（发光、随时间缩小、颜色渐变）。
* **骨架连线显示**：实现一个 `bool ShowSkeleton` 开关。如果开启，在 `_Draw()` 中使用 `DrawLine` 将关节点连接起来。

### 任务 2：Hitting Box 视觉表现 (`HittingBoxController.cs`)
* 制作一个 Hitting Box 的预制体 (Scene/Prefab)。
* 订阅 `OnBoxSpawned` 事件。触发时，在指定的坐标 (归一化转实际坐标) `Instantiate` 这个预制体。使用 Godot 的 `Tween` 节点播放 Box 出现的“放大+呼吸闪烁”动画。
* 订阅 `OnHitSuccess` 事件：找到对应的 Box 实例，**停止呼吸动画，播放一个炫酷的粒子爆裂特效 (Particle Burst)**，然后使用 `QueueFree()` 销毁。
* 订阅 `OnHitMissed` 事件：播放一个“逐渐变暗并掉落”的动画，然后销毁。

### 任务 3：UI 控制面板
* 创建一个简单的 CanvasLayer UI。
* 包含一个 CheckBox 绑定到 `ShowSkeleton` 变量。
* 包含一个 OptionButton 用于切换 `GameMode` (HITTING / FREE)。
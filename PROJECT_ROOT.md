# AR 节奏游戏全局架构与接口契约 (Godot 4 + C#)

## 1. 项目简介
本项目是一款跨平台的 AR 节奏体感游戏 Demo。项目采用 **Godot 4.x (.NET 版本)** 进行开发。
前后端逻辑完全使用 **C#** 编写，前端视觉呈现使用 Godot 节点树与特效系统。前后端通过 Godot C# 的 `[Signal]` 或原生 C# `event` 进行彻底解耦。

## 2. 核心数据结构 (Shared Models)
在项目中创建一个全局静态类或命名空间来存放核心数据模型：

```csharp
public enum GameMode {
    HITTING, // 判定模式：生成 Hitting Box 并检测碰撞
    FREE     // 自由模式：仅展示能量轨迹，无判定
}

// 归一化坐标结构体 (0.0f 到 1.0f)
public struct JointData {
    public Vector2 LeftWrist;
    public Vector2 RightWrist;
    public Vector2 LeftAnkle;
    public Vector2 RightAnkle;
}
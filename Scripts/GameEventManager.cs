using Godot;
using System;

/// <summary>
/// 核心事件总线 — 全局 Autoload 单例
///
/// 配置方法（Godot 编辑器）：
///   Project → Project Settings → Autoload
///   → 添加 Scripts/GameEventManager.cs，Node Name 设为 "GameEventManager"
///
/// 使用方式：
///   订阅：GameEventManager.Instance.OnSkeletonUpdated += MyHandler;
///   发布：GameEventManager.Instance.EmitSkeletonUpdated(jointData);
/// </summary>
public partial class GameEventManager : Node
{
    // ─────────────────────────────────────────
    //  单例访问点
    // ─────────────────────────────────────────
    public static GameEventManager Instance { get; private set; }

    // ─────────────────────────────────────────
    //  骨骼追踪事件
    // ─────────────────────────────────────────

    /// <summary>每帧骨骼关节坐标更新（由 AI 后端发布）</summary>
    public event Action<JointData> OnSkeletonUpdated;

    // ─────────────────────────────────────────
    //  Hitting Box 生命周期事件
    // ─────────────────────────────────────────

    /// <summary>
    /// 新 Box 生成（由游戏逻辑后端发布）
    /// int  : boxId       — Box 唯一标识
    /// Vector2 : position — 归一化坐标 (0~1)
    /// string  : target   — 目标关节名称，如 "RightWrist"
    /// </summary>
    public event Action<int, Vector2, string> OnBoxSpawned;

    /// <summary>
    /// 命中成功（由碰撞判定后端发布）
    /// int    : boxId  — 对应 Box 的唯一标识
    /// string : result — "PERFECT" 或 "GOOD"
    /// </summary>
    public event Action<int, string> OnHitSuccess;

    /// <summary>
    /// 命中失败 / 超时（由碰撞判定后端发布）
    /// int : boxId — 对应 Box 的唯一标识
    /// </summary>
    public event Action<int> OnHitMissed;

    // ─────────────────────────────────────────
    //  游戏状态事件
    // ─────────────────────────────────────────

    /// <summary>游戏模式切换（HITTING ↔ FREE）</summary>
    public event Action<GameMode> OnGameModeChanged;

    /// <summary>
    /// 分数 / 连击更新
    /// int : score — 当前总分
    /// int : combo — 当前连击数
    /// </summary>
    public event Action<int, int> OnScoreUpdated;

    // ─────────────────────────────────────────
    //  Godot 生命周期
    // ─────────────────────────────────────────
    public override void _Ready()
    {
        if (Instance != null)
        {
            GD.PrintErr("[GameEventManager] 重复实例，自动销毁。请确认 Autoload 只配置了一次。");
            QueueFree();
            return;
        }
        Instance = this;
        GD.Print("[GameEventManager] 初始化完成，事件总线就绪。");
    }

    // ─────────────────────────────────────────
    //  发布方法（供后端各模块调用）
    // ─────────────────────────────────────────

    public void EmitSkeletonUpdated(JointData data)
        => OnSkeletonUpdated?.Invoke(data);

    public void EmitBoxSpawned(int boxId, Vector2 position, string target)
        => OnBoxSpawned?.Invoke(boxId, position, target);

    public void EmitHitSuccess(int boxId, string result)
        => OnHitSuccess?.Invoke(boxId, result);

    public void EmitHitMissed(int boxId)
        => OnHitMissed?.Invoke(boxId);

    public void EmitGameModeChanged(GameMode mode)
        => OnGameModeChanged?.Invoke(mode);

    public void EmitScoreUpdated(int score, int combo)
        => OnScoreUpdated?.Invoke(score, combo);
}

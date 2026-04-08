using Godot;
using System.Collections.Generic;

/// <summary>
/// 骨架 + 能量轨迹渲染器（前端纯展示层）
///
/// 职责：
///   1. 订阅 GameEventManager.OnSkeletonUpdated，将归一化坐标转为屏幕坐标
///   2. 更新 4 个关节节点（Node2D）的位置
///   3. 向 4 条 Line2D 追加轨迹点，形成能量拖尾
///   4. 当 ShowSkeleton = true 时，在 _Draw() 中绘制骨骼连线
///
/// 场景树推荐结构：
///   SkeletonRenderer (Node2D + 此脚本)
///   ├── LeftWristNode   (Node2D)
///   ├── RightWristNode  (Node2D)
///   ├── LeftAnkleNode   (Node2D)
///   ├── RightAnkleNode  (Node2D)
///   ├── TrailLeftWrist  (Line2D)
///   ├── TrailRightWrist (Line2D)
///   ├── TrailLeftAnkle  (Line2D)
///   └── TrailRightAnkle (Line2D)
/// </summary>
public partial class SkeletonRenderer : Node2D
{
    // ─────────────────────────────────────────
    //  Inspector — 关节 Node2D（用于定位）
    // ─────────────────────────────────────────

    [Export] public Node2D LeftWristNode  { get; set; }
    [Export] public Node2D RightWristNode { get; set; }
    [Export] public Node2D LeftAnkleNode  { get; set; }
    [Export] public Node2D RightAnkleNode { get; set; }

    // ─────────────────────────────────────────
    //  Inspector — 能量轨迹 Line2D（拖尾特效）
    // ─────────────────────────────────────────

    [Export] public Line2D TrailLeftWrist  { get; set; }
    [Export] public Line2D TrailRightWrist { get; set; }
    [Export] public Line2D TrailLeftAnkle  { get; set; }
    [Export] public Line2D TrailRightAnkle { get; set; }

    // ─────────────────────────────────────────
    //  Inspector — 行为参数
    // ─────────────────────────────────────────

    /// <summary>是否显示骨骼连线（可在运行时通过 UI 开关切换）</summary>
    [Export] public bool ShowSkeleton { get; set; } = true;

    /// <summary>轨迹最多保留的历史点数（越大拖尾越长）</summary>
    [Export] public int TrailMaxPoints { get; set; } = 30;

    // ─────────────────────────────────────────
    //  私有状态：当前关节屏幕坐标（供 _Draw 使用）
    // ─────────────────────────────────────────
    private Vector2 _leftWristPos;
    private Vector2 _rightWristPos;
    private Vector2 _leftAnklePos;
    private Vector2 _rightAnklePos;

    // ─────────────────────────────────────────
    //  Godot 生命周期
    // ─────────────────────────────────────────
    public override void _Ready()
    {
        // 订阅骨骼数据事件
        if (GameEventManager.Instance != null)
            GameEventManager.Instance.OnSkeletonUpdated += _OnSkeletonUpdated;
        else
            GD.PrintErr("[SkeletonRenderer] GameEventManager 未找到，请确认已配置 Autoload。");

        // Line2D 初始化：清空旧点、关闭闭合，由代码动态追加点
        _InitTrail(TrailLeftWrist);
        _InitTrail(TrailRightWrist);
        _InitTrail(TrailLeftAnkle);
        _InitTrail(TrailRightAnkle);
    }

    public override void _ExitTree()
    {
        // 场景销毁时取消订阅，防止野引用
        if (GameEventManager.Instance != null)
            GameEventManager.Instance.OnSkeletonUpdated -= _OnSkeletonUpdated;
    }

    /// <summary>_Draw() 用于绘制骨骼连线，由 QueueRedraw() 每帧触发</summary>
    public override void _Draw()
    {
        if (!ShowSkeleton) return;

        var lineColor  = new Color(1f, 1f, 1f, 0.45f); // 半透明白色
        const float lineWidth = 2.0f;

        // 手臂横线（左腕 ↔ 右腕，视为肩膀连线的简化表示）
        DrawLine(_leftWristPos, _rightWristPos, lineColor, lineWidth);

        // 左侧纵线（左腕 ↔ 左踝）
        DrawLine(_leftWristPos, _leftAnklePos, lineColor, lineWidth);

        // 右侧纵线（右腕 ↔ 右踝）
        DrawLine(_rightWristPos, _rightAnklePos, lineColor, lineWidth);

        // 脚踝横线（左踝 ↔ 右踝）
        DrawLine(_leftAnklePos, _rightAnklePos, lineColor, lineWidth);

        // 关节点：稍亮的实心圆
        var dotColor = new Color(1f, 1f, 1f, 0.85f);
        DrawCircle(_leftWristPos,  6f, dotColor);
        DrawCircle(_rightWristPos, 6f, dotColor);
        DrawCircle(_leftAnklePos,  6f, dotColor);
        DrawCircle(_rightAnklePos, 6f, dotColor);
    }

    // ─────────────────────────────────────────
    //  事件回调：每帧由 PoseTracker 触发
    // ─────────────────────────────────────────
    private void _OnSkeletonUpdated(JointData data)
    {
        Vector2 viewportSize = GetViewportRect().Size;

        // 归一化坐标 → 实际屏幕像素坐标
        _leftWristPos  = data.LeftWrist  * viewportSize;
        _rightWristPos = data.RightWrist * viewportSize;
        _leftAnklePos  = data.LeftAnkle  * viewportSize;
        _rightAnklePos = data.RightAnkle * viewportSize;

        // 更新关节 Node2D 的位置（供子节点 / 粒子系统跟随）
        if (LeftWristNode  != null) LeftWristNode.GlobalPosition  = _leftWristPos;
        if (RightWristNode != null) RightWristNode.GlobalPosition = _rightWristPos;
        if (LeftAnkleNode  != null) LeftAnkleNode.GlobalPosition  = _leftAnklePos;
        if (RightAnkleNode != null) RightAnkleNode.GlobalPosition = _rightAnklePos;

        // 追加轨迹点（拖尾）
        _AppendTrailPoint(TrailLeftWrist,  _leftWristPos);
        _AppendTrailPoint(TrailRightWrist, _rightWristPos);
        _AppendTrailPoint(TrailLeftAnkle,  _leftAnklePos);
        _AppendTrailPoint(TrailRightAnkle, _rightAnklePos);

        // 触发 _Draw() 重绘骨骼连线
        QueueRedraw();
    }

    // ─────────────────────────────────────────
    //  轨迹工具方法
    // ─────────────────────────────────────────

    private static void _InitTrail(Line2D trail)
    {
        if (trail == null) return;
        trail.ClearPoints();
        trail.Closed = false;
    }

    /// <summary>
    /// 向 Line2D 头部插入新点，超出 TrailMaxPoints 则移除尾部旧点。
    /// Line2D 的点顺序：index 0 = 最新（最亮头部），末尾 = 最旧（透明尾部）。
    /// </summary>
    private void _AppendTrailPoint(Line2D trail, Vector2 newPoint)
    {
        if (trail == null) return;

        // 头部插入：AddPoint(point, index=0) 插在最前
        trail.AddPoint(newPoint, 0);

        // 裁剪超长尾巴
        while (trail.GetPointCount() > TrailMaxPoints)
            trail.RemovePoint(trail.GetPointCount() - 1);
    }
}

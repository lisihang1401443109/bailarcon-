using Godot;

/// <summary>
/// 游戏模式枚举
/// </summary>
public enum GameMode
{
    HITTING,  // 判定模式：生成 Hitting Box 并检测碰撞
    FREE      // 自由模式：仅展示能量轨迹，无判定
}

/// <summary>
/// 骨骼关节归一化坐标结构体
/// 所有坐标均为 0.0f ~ 1.0f，相对于视口尺寸
/// 使用时乘以 GetViewportRect().Size 转为实际像素坐标
/// </summary>
public struct JointData
{
    public Vector2 LeftWrist;
    public Vector2 RightWrist;
    public Vector2 LeftAnkle;
    public Vector2 RightAnkle;
}

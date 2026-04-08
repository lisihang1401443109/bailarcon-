using Godot;
using System.Collections.Generic;

/// <summary>
/// 打击目标控制器（游戏逻辑层）— 第五阶段完整版
///
/// 职责：
///   1. 订阅 OnSkeletonUpdated，实时缓存最新关节坐标
///   2. 订阅 OnGameModeChanged，FREE 模式下暂停生成
///   3. 定时生成 HittingBox 节点（AddChild），最多 MaxActiveBoxes 个
///   4. 每帧检测每个 Box 与对应关节的像素距离
///      - 距离 < HitRadius * 0.5  → "PERFECT!"
///      - 距离 < HitRadius        → "GREAT!"
///      - Box.NormPos.Y > 1.0     → "MISS"
///   5. 直接调用 UIController 的公开方法更新分数/连击/反馈
///   6. 同时通过 GameEventManager 广播，保持架构解耦
/// </summary>
public partial class HittingBoxController : Node2D
{
    // ─────────────────────────────────────────
    //  Inspector 参数
    // ─────────────────────────────────────────

    /// <summary>直接引用 UIController，用于调用 AddScore / ResetCombo</summary>
    [Export] public UIController UI { get; set; }

    /// <summary>每隔多少秒生成一个新 Box</summary>
    [Export] public float SpawnInterval { get; set; } = 1.8f;

    /// <summary>Box 下落速度（归一化单位/秒）</summary>
    [Export] public float FallSpeed { get; set; } = 0.22f;

    /// <summary>判定半径（像素）。距离 < 此值 = GREAT!，< 0.5 倍 = PERFECT!</summary>
    [Export] public float HitRadius { get; set; } = 62f;

    /// <summary>屏幕上同时存在的最大 Box 数</summary>
    [Export] public int MaxActiveBoxes { get; set; } = 2;

    // ─────────────────────────────────────────
    //  内部状态
    // ─────────────────────────────────────────

    private readonly List<HittingBox> _activeBoxes = [];
    private int      _nextId      = 0;
    private float    _spawnTimer  = 0f;
    private GameMode _mode        = GameMode.HITTING;
    private JointData _joints;

    private static readonly string[] JointNames =
        { "LeftWrist", "RightWrist", "LeftAnkle", "RightAnkle" };

    // ─────────────────────────────────────────
    //  Godot 生命周期
    // ─────────────────────────────────────────
    public override void _Ready()
    {
        var gem = GameEventManager.Instance;
        if (gem != null)
        {
            gem.OnSkeletonUpdated  += _OnSkeletonUpdated;
            gem.OnGameModeChanged  += _OnGameModeChanged;
        }
        else
        {
            GD.PrintErr("[HittingBoxController] GameEventManager 未找到。");
        }
    }

    public override void _ExitTree()
    {
        var gem = GameEventManager.Instance;
        if (gem != null)
        {
            gem.OnSkeletonUpdated  -= _OnSkeletonUpdated;
            gem.OnGameModeChanged  -= _OnGameModeChanged;
        }
    }

    public override void _Process(double delta)
    {
        // FREE 模式：不生成、不判定，只让已有 Box 继续下落直到销毁
        if (_mode == GameMode.FREE)
        {
            PruneJudgedBoxes();
            return;
        }

        float dt = (float)delta;
        Vector2 viewport = GetViewportRect().Size;

        // ── 定时生成 ─────────────────────────────────────────────
        _spawnTimer += dt;
        if (_spawnTimer >= SpawnInterval && _activeBoxes.Count < MaxActiveBoxes)
        {
            SpawnBox();
            _spawnTimer = 0f;
        }

        // ── 逐帧判定 ─────────────────────────────────────────────
        for (int i = _activeBoxes.Count - 1; i >= 0; i--)
        {
            var box = _activeBoxes[i];
            if (box == null || !IsInstanceValid(box) || box.Judged)
            {
                _activeBoxes.RemoveAt(i);
                continue;
            }

            // 超出底部 → MISS
            if (box.NormPos.Y > 1.05f)
            {
                RegisterMiss(box);
                _activeBoxes.RemoveAt(i);
                continue;
            }

            // 碰撞检测
            Vector2 jointScreen = GetJointScreenPos(box.TargetJoint, viewport);
            Vector2 boxScreen   = box.NormPos * viewport;
            float   dist        = boxScreen.DistanceTo(jointScreen);

            if (dist < HitRadius)
            {
                string result = dist < HitRadius * 0.5f ? "PERFECT!" : "GREAT!";
                RegisterHit(box, result);
                _activeBoxes.RemoveAt(i);
            }
        }
    }

    // ─────────────────────────────────────────
    //  生成
    // ─────────────────────────────────────────

    private void SpawnBox()
    {
        string joint = JointNames[GD.RandRange(0, JointNames.Length - 1)];

        float spawnX = joint switch
        {
            "LeftWrist"  or "LeftAnkle"  => (float)GD.RandRange(0.10, 0.45),
            "RightWrist" or "RightAnkle" => (float)GD.RandRange(0.55, 0.90),
            _                            => (float)GD.RandRange(0.10, 0.90)
        };

        var box = new HittingBox
        {
            BoxId       = _nextId++,
            TargetJoint = joint,
            NormPos     = new Vector2(spawnX, -0.05f),
            FallSpeed   = FallSpeed,
        };

        AddChild(box);
        _activeBoxes.Add(box);

        GameEventManager.Instance?.EmitBoxSpawned(box.BoxId, box.NormPos, box.TargetJoint);
    }

    // ─────────────────────────────────────────
    //  命中 / 失误处理
    // ─────────────────────────────────────────

    private void RegisterHit(HittingBox box, string result)
    {
        box.MarkJudged();

        int points = result == "PERFECT!" ? 300 : 100;

        // 直接调用 UIController（立即反馈）
        UI?.AddScore(points);
        if (UI != null)
            ShowFeedback(result, result == "PERFECT!"
                ? new Color(1f, 0.95f, 0f)    // 金黄
                : new Color(0f, 1f,  0.85f));  // 青绿

        // 广播事件（前端特效层可订阅）
        GameEventManager.Instance?.EmitHitSuccess(box.BoxId, result);

        // 延迟销毁（留一帧让 MarkJudged 的清空绘制生效）
        box.QueueFree();
    }

    private void RegisterMiss(HittingBox box)
    {
        box.MarkJudged();
        UI?.ResetCombo();
        ShowFeedback("MISS", new Color(1f, 0.22f, 0.22f));

        GameEventManager.Instance?.EmitHitMissed(box.BoxId);
        box.QueueFree();
    }

    // ─────────────────────────────────────────
    //  工具
    // ─────────────────────────────────────────

    /// <summary>将归一化关节坐标转为屏幕像素坐标</summary>
    private Vector2 GetJointScreenPos(string joint, Vector2 viewport)
    {
        Vector2 norm = joint switch
        {
            "LeftWrist"  => _joints.LeftWrist,
            "RightWrist" => _joints.RightWrist,
            "LeftAnkle"  => _joints.LeftAnkle,
            "RightAnkle" => _joints.RightAnkle,
            _            => Vector2.Zero
        };
        return norm * viewport;
    }

    /// <summary>转发反馈文字到 UIController（避免 UIController 重复监听同一事件）</summary>
    private void ShowFeedback(string text, Color color)
    {
        if (UI?.FeedbackLabel == null) return;
        UI.FeedbackLabel.Text     = text;
        UI.FeedbackLabel.Modulate = color;
        UI.FeedbackLabel.Visible  = true;
    }

    private void PruneJudgedBoxes()
    {
        for (int i = _activeBoxes.Count - 1; i >= 0; i--)
        {
            var box = _activeBoxes[i];
            if (box == null || !IsInstanceValid(box) || box.Judged || box.NormPos.Y > 1.05f)
            {
                if (box != null && IsInstanceValid(box) && !box.Judged)
                    box.QueueFree();
                _activeBoxes.RemoveAt(i);
            }
        }
    }

    // ─────────────────────────────────────────
    //  事件回调
    // ─────────────────────────────────────────
    private void _OnSkeletonUpdated(JointData data) => _joints = data;
    private void _OnGameModeChanged(GameMode mode)   => _mode  = mode;
}

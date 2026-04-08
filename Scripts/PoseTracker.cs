using Godot;
using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;

/// <summary>
/// 姿态追踪后端 — UDP 接收版（替换 Mock）
///
/// 数据流：
///   Python pose_server.py → UDP 127.0.0.1:5000
///     → 后台线程解析 JSON → _latestSnapshot (volatile)
///       → _Process() 主线程读取 → EmitSkeletonUpdated
///
/// 线程安全：
///   后台线程只写 _latestSnapshot（volatile 引用原子替换）和
///   _lastPacketTick（volatile long，Interlocked 写）。
///   主线程只读这两个字段。全程无 lock，无 Godot API 跨线程调用。
/// </summary>
public partial class PoseTracker : Node
{
    // ─────────────────────────────────────────
    //  Inspector 参数
    // ─────────────────────────────────────────

    [Export] public int   ListenPort              { get; set; } = 5000;
    [Export] public bool  FallbackToMockOnTimeout { get; set; } = true;
    [Export] public float TimeoutSeconds          { get; set; } = 2.0f;

    // ─────────────────────────────────────────
    //  线程共享：关节快照
    //  class（引用类型）+ volatile 保证引用赋值对主线程立即可见
    // ─────────────────────────────────────────
    private sealed class Snap
    {
        public float LwX, LwY, RwX, RwY, LaX, LaY, RaX, RaY;
    }

    private volatile Snap _latestSnapshot = new()
    {
        LwX = 0.25f, LwY = 0.40f,
        RwX = 0.75f, RwY = 0.40f,
        LaX = 0.38f, LaY = 0.82f,
        RaX = 0.62f, RaY = 0.82f,
    };

    // ─────────────────────────────────────────
    //  线程共享：上次收包时间
    //  用 System.Environment.TickCount64（纯系统调用，不涉及 Godot API）
    //  Interlocked.Read/Write 保证 64 位原子访问
    // ─────────────────────────────────────────
    private long _lastPacketTick = 0L; // 0 = 从未收到

    // ─────────────────────────────────────────
    //  私有成员
    // ─────────────────────────────────────────
    private UdpClient    _udp;
    private Thread       _thread;
    private volatile bool _running;
    private double       _mockTime;

    // ─────────────────────────────────────────
    //  Godot 生命周期
    // ─────────────────────────────────────────
    public override void _Ready()
    {
        try
        {
            _udp = new UdpClient(ListenPort);
            _udp.Client.ReceiveTimeout = 300; // ms，防止线程永久阻塞
        }
        catch (Exception ex)
        {
            GD.PrintErr($"[PoseTracker] 无法绑定 UDP 端口 {ListenPort}：{ex.Message}");
            GD.PrintErr("[PoseTracker] 将只使用 Mock 数据运行。");
            return;
        }

        _running = true;
        _thread  = new Thread(ReceiveLoop)
        {
            IsBackground = true,
            Name = "PoseTracker_UDP"
        };
        _thread.Start();
        GD.Print($"[PoseTracker] UDP 监听启动，端口 {ListenPort}，等待 Python…");
    }

    public override void _Process(double delta)
    {
        // ── 判断是否超时 ──────────────────────────────────────────
        long lastTick = Interlocked.Read(ref _lastPacketTick);
        bool neverReceived = lastTick == 0L;
        bool timedOut = neverReceived ||
            (System.Environment.TickCount64 - lastTick) > (long)(TimeoutSeconds * 1000);

        JointData data;

        if (timedOut && FallbackToMockOnTimeout)
        {
            _mockTime += delta;
            data = Mock(_mockTime);
        }
        else
        {
            _mockTime = 0;
            Snap s    = _latestSnapshot; // volatile 读，拿到最新引用
            data      = new JointData
            {
                LeftWrist  = new Vector2(s.LwX, s.LwY),
                RightWrist = new Vector2(s.RwX, s.RwY),
                LeftAnkle  = new Vector2(s.LaX, s.LaY),
                RightAnkle = new Vector2(s.RaX, s.RaY),
            };
        }

        GameEventManager.Instance?.EmitSkeletonUpdated(data);
    }

    public override void _ExitTree()
    {
        _running = false;
        try { _udp?.Close(); } catch { }
        _thread?.Join(800);
        GD.Print("[PoseTracker] UDP 已关闭。");
    }

    // ─────────────────────────────────────────
    //  后台线程：只做 Receive + 解析，绝不调用 Godot API
    // ─────────────────────────────────────────
    private void ReceiveLoop()
    {
        var ep = new IPEndPoint(IPAddress.Any, 0);
        while (_running)
        {
            byte[] buf;
            try
            {
                buf = _udp.Receive(ref ep);
            }
            catch (SocketException ex) when (ex.SocketErrorCode == SocketError.TimedOut)
            {
                continue; // 超时正常，继续等
            }
            catch
            {
                if (_running) GD.PrintErr("[PoseTracker] UDP 接收中断。");
                break;
            }

            try
            {
                using var doc  = JsonDocument.Parse(buf);
                var root       = doc.RootElement;
                var lw = root.GetProperty("lw");
                var rw = root.GetProperty("rw");
                var la = root.GetProperty("la");
                var ra = root.GetProperty("ra");

                // 原子替换快照引用（volatile 写）
                _latestSnapshot = new Snap
                {
                    LwX = lw[0].GetSingle(), LwY = lw[1].GetSingle(),
                    RwX = rw[0].GetSingle(), RwY = rw[1].GetSingle(),
                    LaX = la[0].GetSingle(), LaY = la[1].GetSingle(),
                    RaX = ra[0].GetSingle(), RaY = ra[1].GetSingle(),
                };

                // 记录收包时间（纯系统 API，线程安全）
                Interlocked.Exchange(ref _lastPacketTick, System.Environment.TickCount64);
            }
            catch (Exception ex)
            {
                GD.PrintErr($"[PoseTracker] JSON 解析失败：{ex.Message} | {Encoding.UTF8.GetString(buf)}");
            }
        }
    }

    // ─────────────────────────────────────────
    //  Mock 数据（仅断线时使用）
    // ─────────────────────────────────────────
    private static JointData Mock(double t)
    {
        float f = (float)t;
        const float a = 0.13f;
        return new JointData
        {
            LeftWrist  = C(new Vector2(0.28f + Mathf.Sin(f * 1.3f) * a, 0.40f + Mathf.Cos(f * 1.1f) * a)),
            RightWrist = C(new Vector2(0.72f - Mathf.Sin(f * 1.3f) * a, 0.40f + Mathf.Cos(f * 1.1f) * a)),
            LeftAnkle  = C(new Vector2(0.38f + Mathf.Sin(f * 0.8f) * a * 0.5f, 0.80f)),
            RightAnkle = C(new Vector2(0.62f - Mathf.Sin(f * 0.8f) * a * 0.5f, 0.80f)),
        };
    }

    private static Vector2 C(Vector2 v) =>
        new(Mathf.Clamp(v.X, 0.05f, 0.95f), Mathf.Clamp(v.Y, 0.05f, 0.95f));
}

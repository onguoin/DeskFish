using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Serialization;

namespace DeskFrame.Host;

internal sealed class DesktopWindowOverlayController : IDisposable
{
    private const int GwlStyle = -16;
    private const int GwlExStyle = -20;
    private const long WsCaption = 0x00C00000L;
    private const long WsThickFrame = 0x00040000L;
    private const long WsMinimizeBox = 0x00020000L;
    private const long WsMaximizeBox = 0x00010000L;
    private const long WsExTopmost = 0x00000008L;
    private const long WsExToolWindow = 0x00000080L;
    private const uint GaRoot = 2;
    private const uint GwOwner = 4;
    private const uint SwpFrameChanged = 0x0020;
    private const uint SwpShowWindow = 0x0040;
    private const uint SwpNoOwnerZOrder = 0x0200;
    private const uint SwpNoActivate = 0x0010;
    private const int SwHide = 0;
    private const int SwShowNoActivate = 4;
    private static readonly nint HwndTopmost = new(-1);
    private static readonly nint HwndNoTopmost = new(-2);

    private readonly object _gate = new();
    private readonly System.Threading.Timer _cursorTimer;
    private nint _selectedWindow;
    private WindowSnapshot? _snapshot;
    private PixelRect _overlayRect;
    private nint _returnWindow;
    private string? _sessionId;
    private bool _active;
    private bool _visible;
    private bool _autoHide = true;
    private DateTimeOffset _autoHideAfter;
    private DateTimeOffset _suppressShowUntil;
    private bool _disposed;

    public DesktopWindowOverlayController()
    {
        _cursorTimer = new System.Threading.Timer(CheckCursor, null, 80, 80);
    }

    public event EventHandler? SelectionChanged;

    public DesktopWindowStatus Status
    {
        get
        {
            lock (_gate)
            {
                EnsureSelectedWindowStillExistsLocked();
                return new DesktopWindowStatus(
                    _selectedWindow != 0,
                    _active,
                    _visible,
                    _selectedWindow == 0 ? null : DescribeWindow(_selectedWindow, true));
            }
        }
    }

    public IReadOnlyList<DesktopWindowItem> ListWindows()
    {
        var selected = SelectedHandle;
        var currentProcessId = Environment.ProcessId;
        var windows = new List<DesktopWindowItem>();
        EnumWindows((handle, _) =>
        {
            GetWindowThreadProcessId(handle, out var processId);
            if (processId == 0 || processId == currentProcessId) return true;
            if (GetAncestor(handle, GaRoot) != handle || GetWindow(handle, GwOwner) != 0) return true;
            if (!IsWindowVisible(handle) && handle != selected) return true;
            var extendedStyle = GetWindowLongPtr(handle, GwlExStyle).ToInt64();
            if ((extendedStyle & WsExToolWindow) != 0 && handle != selected) return true;
            var item = DescribeWindow(handle, handle == selected);
            if (item is not null) windows.Add(item);
            return true;
        }, 0);
        return windows
            .OrderByDescending(item => item.Selected)
            .ThenBy(item => item.ProcessName, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(item => item.Title, StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
    }

    public bool TrySelectWindow(nint handle, out string message)
    {
        var root = GetAncestor(handle, GaRoot);
        if (root != 0) handle = root;
        var item = DescribeWindow(handle, true);
        if (item is null)
        {
            message = "没有识别到可用的顶层窗口";
            return false;
        }
        GetWindowThreadProcessId(handle, out var processId);
        if (processId == Environment.ProcessId)
        {
            message = "不能把 DeskFish 自己作为贴片窗口";
            return false;
        }

        lock (_gate)
        {
            if (_selectedWindow != handle) RestoreWindowLocked();
            _selectedWindow = handle;
            _sessionId = null;
        }
        SelectionChanged?.Invoke(this, EventArgs.Empty);
        message = $"已锁定 {item.ProcessName} · {item.Title}";
        return true;
    }

    public bool TrySelectWindowAt(Point screenPoint, out string message)
    {
        var handle = WindowFromPoint(new NativePoint(screenPoint.X, screenPoint.Y));
        if (handle != 0) return TrySelectWindow(handle, out message);
        message = "没有识别到可用的顶层窗口";
        return false;
    }

    public void ClearSelection()
    {
        lock (_gate)
        {
            RestoreWindowLocked();
            _selectedWindow = 0;
            _sessionId = null;
        }
        SelectionChanged?.Invoke(this, EventArgs.Empty);
    }

    public DesktopOverlayResult UpdateOverlay(DesktopOverlayRequest request)
    {
        lock (_gate)
        {
            EnsureSelectedWindowStillExistsLocked();
            if (!request.Active)
            {
                if (_active && !string.IsNullOrWhiteSpace(request.SessionId)
                    && !string.IsNullOrWhiteSpace(_sessionId)
                    && !string.Equals(request.SessionId, _sessionId, StringComparison.Ordinal))
                {
                    return ResultLocked(true, "已忽略过期页面的释放请求");
                }
                RestoreWindowLocked();
                return ResultLocked(true, "窗口贴片已释放");
            }
            if (_selectedWindow == 0) return ResultLocked(false, "请先在 DeskFish.exe 中选择或拖入一个游戏窗口");
            if (_active && !string.IsNullOrWhiteSpace(_sessionId)
                && !string.IsNullOrWhiteSpace(request.SessionId)
                && !string.Equals(request.SessionId, _sessionId, StringComparison.Ordinal)
                && !request.Claim)
            {
                return ResultLocked(true, "已忽略过期页面的位置更新");
            }
            if (!TryNormalizeRect(request, out var rect))
            {
                if (request.Visible is false)
                {
                    HideOverlayLocked(false);
                    return ResultLocked(true, "网页区域不在视口内，窗口贴片已隐藏");
                }
                return ResultLocked(false, "网页替换区域尺寸无效");
            }

            _active = true;
            _autoHide = request.AutoHide;
            _overlayRect = rect;
            _sessionId = request.SessionId;
            try
            {
                if (request.Visible is true)
                {
                    if (DateTimeOffset.UtcNow < _suppressShowUntil)
                        return ResultLocked(true, "窗口贴片暂时隐藏");
                    ShowOverlayLocked();
                }
                else if (request.Visible is false)
                {
                    HideOverlayLocked(false);
                }
                else if (_visible)
                {
                    PositionOverlayLocked();
                }
                return ResultLocked(true, _visible ? "窗口贴片正在显示" : "窗口贴片等待悬停");
            }
            catch (Win32Exception error)
            {
                HideOverlayLocked(false);
                return ResultLocked(false, $"窗口操作失败：{error.Message}");
            }
        }
    }

    public void HideOverlayAndReturnFocus()
    {
        lock (_gate)
        {
            _suppressShowUntil = DateTimeOffset.UtcNow.AddMilliseconds(900);
            HideOverlayLocked(true);
        }
    }

    private nint SelectedHandle
    {
        get { lock (_gate) return _selectedWindow; }
    }

    private void ShowOverlayLocked()
    {
        if (_selectedWindow == 0 || !IsWindow(_selectedWindow)) return;
        _snapshot ??= CaptureSnapshot(_selectedWindow);
        var foreground = GetForegroundWindow();
        if (foreground != 0 && foreground != _selectedWindow) _returnWindow = foreground;

        var style = GetWindowLongPtr(_selectedWindow, GwlStyle).ToInt64();
        var cleanStyle = style & ~(WsCaption | WsThickFrame | WsMinimizeBox | WsMaximizeBox);
        if (style != cleanStyle) SetWindowLongChecked(_selectedWindow, GwlStyle, (nint)cleanStyle);
        ShowWindowAsync(_selectedWindow, SwShowNoActivate);
        PositionOverlayLocked();
        _visible = true;
        _autoHideAfter = DateTimeOffset.UtcNow.AddMilliseconds(350);
    }

    private void PositionOverlayLocked()
    {
        if (!SetWindowPos(
                _selectedWindow,
                HwndTopmost,
                _overlayRect.Left,
                _overlayRect.Top,
                _overlayRect.Width,
                _overlayRect.Height,
                SwpFrameChanged | SwpShowWindow | SwpNoOwnerZOrder | SwpNoActivate))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    private void HideOverlayLocked(bool emergency)
    {
        if (_selectedWindow == 0 || !_visible) return;
        ShowWindowAsync(_selectedWindow, SwHide);
        SetWindowPos(_selectedWindow, HwndNoTopmost, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
        _visible = false;
        if (emergency) _autoHideAfter = DateTimeOffset.MaxValue;
        if (_returnWindow != 0 && IsWindow(_returnWindow)) SetForegroundWindow(_returnWindow);
    }

    private void RestoreWindowLocked()
    {
        if (_selectedWindow != 0 && _snapshot is not null && IsWindow(_selectedWindow))
        {
            SetWindowLongPtr(_selectedWindow, GwlStyle, _snapshot.Style);
            SetWindowLongPtr(_selectedWindow, GwlExStyle, _snapshot.ExtendedStyle);
            var placement = _snapshot.Placement;
            SetWindowPlacement(_selectedWindow, ref placement);
            SetWindowPos(_selectedWindow, _snapshot.WasTopmost ? HwndTopmost : HwndNoTopmost, 0, 0, 0, 0,
                0x0001 | 0x0002 | 0x0010 | SwpFrameChanged);
            ShowWindowAsync(_selectedWindow, _snapshot.WasVisible ? _snapshot.Placement.ShowCommand : SwHide);
        }
        _snapshot = null;
        _active = false;
        _visible = false;
        _overlayRect = default;
        _returnWindow = 0;
        _sessionId = null;
    }

    private void EnsureSelectedWindowStillExistsLocked()
    {
        if (_selectedWindow == 0 || IsWindow(_selectedWindow)) return;
        _selectedWindow = 0;
        _snapshot = null;
        _active = false;
        _visible = false;
        _sessionId = null;
    }

    private void CheckCursor(object? _)
    {
        lock (_gate)
        {
            if (!_active || !_visible || !_autoHide || DateTimeOffset.UtcNow < _autoHideAfter) return;
            if (!GetCursorPos(out var point)) return;
            if (!_overlayRect.Contains(point.X, point.Y))
            {
                HideOverlayLocked(false);
            }
        }
    }

    private DesktopOverlayResult ResultLocked(bool ok, string message) => new(
        ok,
        message,
        _selectedWindow != 0,
        _active,
        _visible,
        _selectedWindow == 0 ? null : DescribeWindow(_selectedWindow, true));

    private static bool TryNormalizeRect(DesktopOverlayRequest request, out PixelRect rect)
    {
        rect = default;
        if (request.Width < 48 || request.Height < 32) return false;
        var width = Math.Clamp(request.Width, 48, 8192);
        var height = Math.Clamp(request.Height, 32, 8192);
        rect = new PixelRect(
            Math.Clamp(request.Left, -32768, 32768),
            Math.Clamp(request.Top, -32768, 32768),
            width,
            height);
        return true;
    }

    private static WindowSnapshot CaptureSnapshot(nint handle)
    {
        var placement = new WindowPlacement { Length = Marshal.SizeOf<WindowPlacement>() };
        if (!GetWindowPlacement(handle, ref placement)) throw new Win32Exception(Marshal.GetLastWin32Error());
        var style = GetWindowLongPtr(handle, GwlStyle);
        var extendedStyle = GetWindowLongPtr(handle, GwlExStyle);
        return new WindowSnapshot(placement, style, extendedStyle, IsWindowVisible(handle), (extendedStyle.ToInt64() & WsExTopmost) != 0);
    }

    private static void SetWindowLongChecked(nint handle, int index, nint value)
    {
        Marshal.SetLastPInvokeError(0);
        var previous = SetWindowLongPtr(handle, index, value);
        var error = Marshal.GetLastPInvokeError();
        if (previous == 0 && error != 0) throw new Win32Exception(error);
    }

    private static DesktopWindowItem? DescribeWindow(nint handle, bool selected)
    {
        if (handle == 0 || !IsWindow(handle)) return null;
        var length = GetWindowTextLength(handle);
        if (length <= 0) return null;
        var titleBuffer = new StringBuilder(Math.Min(length + 1, 1024));
        GetWindowText(handle, titleBuffer, titleBuffer.Capacity);
        var title = titleBuffer.ToString().Trim();
        if (title.Length == 0) return null;
        GetWindowThreadProcessId(handle, out var processId);
        string processName;
        try { processName = Process.GetProcessById(unchecked((int)processId)).ProcessName; }
        catch { processName = $"PID {processId}"; }
        return new DesktopWindowItem
        {
            Handle = $"0x{handle.ToInt64():X}",
            NativeHandle = handle,
            ProcessId = unchecked((int)processId),
            ProcessName = processName,
            Title = title,
            Selected = selected
        };
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _cursorTimer.Dispose();
        lock (_gate) RestoreWindowLocked();
    }

    private sealed record WindowSnapshot(
        WindowPlacement Placement,
        nint Style,
        nint ExtendedStyle,
        bool WasVisible,
        bool WasTopmost);

    private readonly record struct PixelRect(int Left, int Top, int Width, int Height)
    {
        public bool Contains(int x, int y) => x >= Left && x < Left + Width && y >= Top && y < Top + Height;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;

        public NativePoint(int x, int y)
        {
            X = x;
            Y = y;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WindowPlacement
    {
        public int Length;
        public int Flags;
        public int ShowCommand;
        public NativePoint MinPosition;
        public NativePoint MaxPosition;
        public NativeRect NormalPosition;
    }

    private delegate bool EnumWindowsCallback(nint window, nint parameter);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumWindows(EnumWindowsCallback callback, nint parameter);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindow(nint window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(nint window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(nint window, StringBuilder text, int maximumCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(nint window);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint window, out uint processId);

    [DllImport("user32.dll")]
    private static extern nint GetWindow(nint window, uint command);

    [DllImport("user32.dll")]
    private static extern nint GetAncestor(nint window, uint flags);

    [DllImport("user32.dll")]
    private static extern nint WindowFromPoint(NativePoint point);

    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(nint window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetCursorPos(out NativePoint point);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern nint GetWindowLongPtr(nint window, int index);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern nint SetWindowLongPtr(nint window, int index, nint value);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(nint window, nint insertAfter, int x, int y, int width, int height, uint flags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindowAsync(nint window, int command);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowPlacement(nint window, ref WindowPlacement placement);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPlacement(nint window, [In] ref WindowPlacement placement);
}

internal sealed class DesktopWindowItem
{
    public required string Handle { get; init; }
    public required int ProcessId { get; init; }
    public required string ProcessName { get; init; }
    public required string Title { get; init; }
    public required bool Selected { get; init; }
    [JsonIgnore] public nint NativeHandle { get; init; }
    [JsonIgnore] public string DisplayName => $"{ProcessName} · {Title}";
    public override string ToString() => DisplayName;
}

internal sealed record DesktopWindowStatus(
    bool Selected,
    bool Active,
    bool Visible,
    DesktopWindowItem? Window);

internal sealed record DesktopOverlayRequest(
    bool Active,
    bool? Visible,
    int Left,
    int Top,
    int Width,
    int Height,
    bool AutoHide = true,
    string? SessionId = null,
    bool Claim = false);

internal sealed record DesktopOverlayResult(
    bool Ok,
    string Message,
    bool Selected,
    bool Active,
    bool Visible,
    DesktopWindowItem? Window);

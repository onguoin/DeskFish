using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;

namespace DeskFrame.Host;

internal sealed class MainForm : Form
{
    private const int HotkeyId = 0x4446;
    private const int WmHotkey = 0x0312;
    private const uint ModAlt = 0x0001;
    private const uint ModShift = 0x0004;
    private const int VkLButton = 0x01;
    private static readonly Color Abyss = Color.FromArgb(255, 255, 255);
    private static readonly Color Deep = Color.FromArgb(241, 249, 247);
    private static readonly Color Panel = Color.FromArgb(239, 250, 248);
    private static readonly Color Line = Color.FromArgb(204, 228, 223);
    private static readonly Color Mint = Color.FromArgb(19, 52, 57);
    private static readonly Color Mist = Color.FromArgb(96, 120, 123);
    private static readonly Color Teal = Color.FromArgb(58, 183, 167);
    private static readonly Color Coral = Color.FromArgb(255, 126, 96);
    private const string GitHubUrl = "https://github.com/onguoin/DeskFish";

    private readonly NotifyIcon _tray;
    private readonly DesktopWindowOverlayController _desktopWindows;
    private readonly ComboBox _windowPicker;
    private readonly Label _windowStatus;
    private readonly WindowDropTarget _windowDropTarget;
    private readonly System.Windows.Forms.Timer _windowPollTimer;
    private bool _leftMouseWasDown;
    private nint _dragCandidate;
    private bool _reallyExit;

    public MainForm(BridgeServer server)
    {
        _desktopWindows = server.DesktopWindows;
        Text = "DeskFish · 本地内容与桌面窗口贴片";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        ClientSize = new Size(640, 604);
        MinimumSize = Size;
        MaximumSize = Size;
        BackColor = Abyss;
        ForeColor = Mint;
        Font = new Font("Microsoft YaHei UI", 9F);
        MaximizeBox = false;
        AutoScaleMode = AutoScaleMode.Dpi;
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;

        var rail = new Panel
        {
            BackColor = Teal,
            Location = new Point(0, 0),
            Size = new Size(5, ClientSize.Height),
            Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left
        };
        var logo = new PictureBox
        {
            Image = Icon.ToBitmap(),
            SizeMode = PictureBoxSizeMode.Zoom,
            Location = new Point(31, 25),
            Size = new Size(58, 58)
        };
        var eyebrow = Label("STEALTH DESK COMPANION", 105, 19, 330, 25, 9F, FontStyle.Bold, Teal);
        eyebrow.Font = new Font("Cascadia Mono", 8.5F, FontStyle.Bold);
        var title = Label("DeskFish", 102, 43, 340, 52, 24F, FontStyle.Bold, Mint);
        title.Font = new Font("Bahnschrift", 24F, FontStyle.Bold);
        var version = Label($"v{BridgeServer.Version}", 492, 27, 110, 30, 9F, FontStyle.Bold, Mist);
        version.TextAlign = ContentAlignment.MiddleRight;
        var subtitle = Label("本地漫画、小说与直播引擎 · 只监听这台电脑", 105, 95, 430, 27, 9F, FontStyle.Regular, Mist);

        var wake = new Panel { BackColor = Coral, Location = new Point(31, 128), Size = new Size(94, 3) };
        var wakeTail = new Panel { BackColor = Color.FromArgb(48, 113, 108), Location = new Point(125, 129), Size = new Size(477, 1) };

        var statusCard = new Panel
        {
            BackColor = Panel,
            Location = new Point(31, 148),
            Size = new Size(571, 128)
        };
        var statusStripe = new Panel
        {
            BackColor = server.IsRunning ? Teal : Coral,
            Location = new Point(0, 0),
            Size = new Size(3, statusCard.Height)
        };
        var status = Label(server.IsRunning ? "●  本地服务运行正常" : "●  本地服务尚未启动", 20, 10, 310, 32, 11F, FontStyle.Bold, server.IsRunning ? Teal : Coral);
        var endpoint = Label(BridgeServer.Endpoint, 20, 43, 260, 28, 9F, FontStyle.Regular, Mint);
        endpoint.Font = new Font("Cascadia Mono", 9F);
        var sources = Label(server.SourceSummary, 20, 70, 530, 27, 8.5F, FontStyle.Regular, Mist);
        sources.AutoEllipsis = true;
        var cache = Label("漫画预读前后各 5 页 · 虎牙短时 HLS 代理 · 元数据 14 天清理", 20, 96, 530, 27, 8F, FontStyle.Regular, Mist);
        statusCard.Controls.AddRange([statusStripe, status, endpoint, sources, cache]);

        var windowCard = new Panel
        {
            BackColor = Color.White,
            Location = new Point(31, 294),
            Size = new Size(571, 176),
            BorderStyle = BorderStyle.FixedSingle
        };
        var windowTitle = Label("窗口贴片", 18, 8, 120, 26, 10.5F, FontStyle.Bold, Mint);
        var windowHelp = Label("先选择游戏窗口，再在扩展里把“桌面游戏窗口”放进图片区域", 124, 8, 425, 26, 7.8F, FontStyle.Regular, Mist);
        windowHelp.TextAlign = ContentAlignment.MiddleRight;
        _windowPicker = new ComboBox
        {
            Location = new Point(18, 40),
            Size = new Size(365, 32),
            DropDownStyle = ComboBoxStyle.DropDownList,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Microsoft YaHei UI", 8.5F),
            BackColor = Deep,
            ForeColor = Mint
        };
        _windowPicker.SelectionChangeCommitted += (_, _) => SelectWindowFromList();
        var refreshButton = SmallButton("刷新窗口", 393, 39, 76);
        refreshButton.Click += (_, _) => RefreshDesktopWindows();
        var releaseButton = SmallButton("释放", 477, 39, 70);
        releaseButton.Click += (_, _) =>
        {
            _desktopWindows.ClearSelection();
            RefreshDesktopWindows();
        };
        _windowStatus = Label("尚未锁定窗口", 18, 75, 529, 20, 7.8F, FontStyle.Regular, Mist);
        _windowStatus.AutoEllipsis = true;
        _windowDropTarget = new WindowDropTarget { Location = new Point(18, 103), Size = new Size(529, 58) };
        windowCard.Controls.AddRange([windowTitle, windowHelp, _windowPicker, refreshButton, releaseButton, _windowStatus, _windowDropTarget]);

        var openButton = ActionButton("打开状态页", 31, 490, 160, primary: true);
        openButton.Click += (_, _) => OpenUrl(BridgeServer.Endpoint);
        var hideButton = ActionButton("隐藏到托盘", 205, 490, 160);
        hideButton.Click += (_, _) => HideToTray(true);
        var exitButton = ActionButton("退出服务", 379, 490, 160);
        exitButton.Click += (_, _) => ExitApplication();

        var github = new LinkLabel
        {
            Text = "GitHub · DeskFish  ↗",
            Location = new Point(31, 554),
            Size = new Size(190, 28),
            Font = new Font("Cascadia Mono", 8.5F, FontStyle.Bold),
            LinkColor = Teal,
            ActiveLinkColor = Coral,
            VisitedLinkColor = Teal,
            LinkBehavior = LinkBehavior.HoverUnderline,
            Cursor = Cursors.Hand
        };
        github.LinkClicked += (_, _) => OpenUrl(GitHubUrl);
        var hint = Label("Alt+Shift+G 紧急隐藏贴片 · 关闭窗口仍在托盘运行", 225, 554, 377, 28, 8F, FontStyle.Regular, Mist);
        hint.TextAlign = ContentAlignment.MiddleRight;

        Controls.AddRange([rail, logo, eyebrow, title, version, subtitle, wake, wakeTail, statusCard, windowCard, openButton, hideButton, exitButton, github, hint]);

        var trayMenu = new ContextMenuStrip
        {
            BackColor = Deep,
            ForeColor = Mint,
            Font = Font
        };
        trayMenu.Items.Add("显示 DeskFish", null, (_, _) => RestoreFromTray());
        trayMenu.Items.Add("打开状态页", null, (_, _) => OpenUrl(BridgeServer.Endpoint));
        trayMenu.Items.Add("GitHub · DeskFish", null, (_, _) => OpenUrl(GitHubUrl));
        trayMenu.Items.Add(new ToolStripSeparator());
        trayMenu.Items.Add("退出", null, (_, _) => ExitApplication());
        _tray = new NotifyIcon
        {
            Icon = Icon,
            Text = "DeskFish 本地引擎与窗口贴片",
            ContextMenuStrip = trayMenu,
            Visible = true
        };
        _tray.DoubleClick += (_, _) => RestoreFromTray();
        FormClosing += OnFormClosing;
        Resize += (_, _) =>
        {
            if (WindowState == FormWindowState.Minimized) HideToTray(false);
        };

        _desktopWindows.SelectionChanged += OnDesktopWindowSelectionChanged;
        _windowPollTimer = new System.Windows.Forms.Timer { Interval = 75 };
        _windowPollTimer.Tick += PollWindowDropTarget;
        _windowPollTimer.Start();
        RefreshDesktopWindows();
    }

    private static Label Label(string text, int x, int y, int width, int height, float size, FontStyle style, Color color) => new()
    {
        Text = text,
        Location = new Point(x, y),
        Size = new Size(width, height),
        Font = new Font("Microsoft YaHei UI", size, style),
        ForeColor = color,
        BackColor = Color.Transparent,
        TextAlign = ContentAlignment.MiddleLeft
    };

    private Button ActionButton(string text, int x, int y, int width, bool primary = false)
    {
        var button = new Button
        {
            Text = text,
            Location = new Point(x, y),
            Size = new Size(width, 45),
            FlatStyle = FlatStyle.Flat,
            BackColor = primary ? Teal : Panel,
            ForeColor = primary ? Color.White : Mint,
            Cursor = Cursors.Hand,
            TabStop = true,
            Font = new Font(Font.FontFamily, 9.5F, FontStyle.Bold)
        };
        button.FlatAppearance.BorderColor = primary ? Teal : Line;
        button.FlatAppearance.MouseOverBackColor = primary ? Color.FromArgb(42, 164, 149) : Color.FromArgb(226, 245, 241);
        button.FlatAppearance.MouseDownBackColor = primary ? Color.FromArgb(34, 143, 130) : Color.FromArgb(214, 238, 233);
        return button;
    }

    private Button SmallButton(string text, int x, int y, int width)
    {
        var button = ActionButton(text, x, y, width);
        button.Size = new Size(width, 31);
        button.Font = new Font(Font.FontFamily, 8F, FontStyle.Bold);
        return button;
    }

    private void RefreshDesktopWindows()
    {
        if (IsDisposed) return;
        var status = _desktopWindows.Status;
        var windows = _desktopWindows.ListWindows();
        _windowPicker.BeginUpdate();
        _windowPicker.Items.Clear();
        foreach (var item in windows) _windowPicker.Items.Add(item);
        _windowPicker.SelectedItem = windows.FirstOrDefault(item => item.Selected);
        _windowPicker.EndUpdate();
        _windowStatus.Text = status.Window is null
            ? "尚未锁定窗口 · 把窗口拖到下方，或从列表选择"
            : $"已锁定  {status.Window.ProcessName} · {status.Window.Title}";
        _windowStatus.ForeColor = status.Window is null ? Mist : Teal;
    }

    private void SelectWindowFromList()
    {
        if (_windowPicker.SelectedItem is not DesktopWindowItem item) return;
        _desktopWindows.TrySelectWindow(item.NativeHandle, out var message);
        _windowStatus.Text = message;
        RefreshDesktopWindows();
    }

    private void PollWindowDropTarget(object? sender, EventArgs eventArgs)
    {
        if (!Visible)
        {
            TopMost = false;
            return;
        }
        var pressed = (GetAsyncKeyState(VkLButton) & 0x8000) != 0;
        var point = Cursor.Position;
        var inside = _windowDropTarget.RectangleToScreen(_windowDropTarget.ClientRectangle).Contains(point);
        _windowDropTarget.Armed = pressed && inside;

        if (pressed && !_leftMouseWasDown)
        {
            var foreground = GetForegroundWindow();
            _dragCandidate = foreground != 0 && foreground != Handle ? foreground : 0;
        }
        if (pressed && inside) TopMost = true;
        if (!pressed && _leftMouseWasDown)
        {
            if (inside)
            {
                var candidate = _dragCandidate;
                if (candidate == 0 || candidate == Handle)
                {
                    candidate = WindowFromPoint(new NativePoint(point.X, point.Y));
                }
                if (_desktopWindows.TrySelectWindow(candidate, out var message))
                {
                    _windowStatus.Text = message;
                    RefreshDesktopWindows();
                    Activate();
                }
                else
                {
                    _windowStatus.Text = message;
                    _windowStatus.ForeColor = Coral;
                }
            }
            _dragCandidate = 0;
        }
        if (!pressed) TopMost = false;
        _leftMouseWasDown = pressed;
    }

    private void OnDesktopWindowSelectionChanged(object? sender, EventArgs eventArgs)
    {
        if (IsDisposed || !IsHandleCreated) return;
        BeginInvoke(RefreshDesktopWindows);
    }

    private static void OpenUrl(string url) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

    private void HideToTray(bool notify)
    {
        Hide();
        ShowInTaskbar = false;
        if (!notify) return;
        _tray.BalloonTipTitle = "DeskFish 仍在运行";
        _tray.BalloonTipText = "Edge 扩展可继续使用本地漫画与小说来源。";
        _tray.ShowBalloonTip(1800);
    }

    private void RestoreFromTray()
    {
        ShowInTaskbar = true;
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void ExitApplication()
    {
        _reallyExit = true;
        _tray.Visible = false;
        Close();
    }

    protected override void OnHandleCreated(EventArgs eventArgs)
    {
        base.OnHandleCreated(eventArgs);
        RegisterHotKey(Handle, HotkeyId, ModAlt | ModShift, (uint)Keys.G);
    }

    protected override void OnHandleDestroyed(EventArgs eventArgs)
    {
        UnregisterHotKey(Handle, HotkeyId);
        base.OnHandleDestroyed(eventArgs);
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == WmHotkey && message.WParam.ToInt32() == HotkeyId)
        {
            _desktopWindows.HideOverlayAndReturnFocus();
            return;
        }
        base.WndProc(ref message);
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        if (_reallyExit) return;
        eventArgs.Cancel = true;
        HideToTray(true);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _windowPollTimer.Dispose();
            _desktopWindows.SelectionChanged -= OnDesktopWindowSelectionChanged;
            _tray.Dispose();
        }
        base.Dispose(disposing);
    }

    [StructLayout(LayoutKind.Sequential)]
    private readonly record struct NativePoint(int X, int Y);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int virtualKey);

    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern nint WindowFromPoint(NativePoint point);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(nint window, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(nint window, int id);
}

using System.Diagnostics;
using System.Drawing;

namespace DeskFrame.Host;

internal sealed class MainForm : Form
{
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
    private bool _reallyExit;

    public MainForm(BridgeServer server)
    {
        Text = "DeskFish · 本地漫画引擎";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        ClientSize = new Size(640, 410);
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
        var subtitle = Label("本地通用漫画引擎 · 只监听这台电脑", 105, 95, 390, 27, 9F, FontStyle.Regular, Mist);

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
        var cache = Label("漫画页内存：当前页前后各 5 页 · 离开窗口即释放 · 元数据缓存 14 天自动清理", 20, 96, 530, 27, 8F, FontStyle.Regular, Mist);
        statusCard.Controls.AddRange([statusStripe, status, endpoint, sources, cache]);

        var openButton = ActionButton("打开状态页", 31, 296, 160, primary: true);
        openButton.Click += (_, _) => OpenUrl(BridgeServer.Endpoint);
        var hideButton = ActionButton("隐藏到托盘", 205, 296, 160);
        hideButton.Click += (_, _) => HideToTray(true);
        var exitButton = ActionButton("退出服务", 379, 296, 160);
        exitButton.Click += (_, _) => ExitApplication();

        var github = new LinkLabel
        {
            Text = "GitHub · DeskFish  ↗",
            Location = new Point(31, 360),
            Size = new Size(190, 28),
            Font = new Font("Cascadia Mono", 8.5F, FontStyle.Bold),
            LinkColor = Teal,
            ActiveLinkColor = Coral,
            VisitedLinkColor = Teal,
            LinkBehavior = LinkBehavior.HoverUnderline,
            Cursor = Cursors.Hand
        };
        github.LinkClicked += (_, _) => OpenUrl(GitHubUrl);
        var hint = Label("关闭窗口不会退出，DeskFish 会继续在托盘运行", 245, 360, 357, 28, 8F, FontStyle.Regular, Mist);
        hint.TextAlign = ContentAlignment.MiddleRight;

        Controls.AddRange([rail, logo, eyebrow, title, version, subtitle, wake, wakeTail, statusCard, openButton, hideButton, exitButton, github, hint]);

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
            Text = "DeskFish 本地漫画引擎",
            ContextMenuStrip = trayMenu,
            Visible = true
        };
        _tray.DoubleClick += (_, _) => RestoreFromTray();
        FormClosing += OnFormClosing;
        Resize += (_, _) =>
        {
            if (WindowState == FormWindowState.Minimized) HideToTray(false);
        };
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

    private static void OpenUrl(string url) => Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

    private void HideToTray(bool notify)
    {
        Hide();
        ShowInTaskbar = false;
        if (!notify) return;
        _tray.BalloonTipTitle = "DeskFish 仍在运行";
        _tray.BalloonTipText = "Edge 扩展可继续使用本地漫画源。";
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

    private void OnFormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        if (_reallyExit) return;
        eventArgs.Cancel = true;
        HideToTray(true);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _tray.Dispose();
        base.Dispose(disposing);
    }
}

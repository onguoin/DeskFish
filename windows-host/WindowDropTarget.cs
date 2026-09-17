using System.ComponentModel;
using System.Drawing.Drawing2D;

namespace DeskFrame.Host;

internal sealed class WindowDropTarget : Control
{
    private static readonly Color Teal = Color.FromArgb(58, 183, 167);
    private static readonly Color Mint = Color.FromArgb(19, 52, 57);
    private static readonly Color Mist = Color.FromArgb(96, 120, 123);
    private static readonly Color Soft = Color.FromArgb(239, 250, 248);
    private bool _armed;

    public WindowDropTarget()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        Cursor = Cursors.Cross;
        BackColor = Soft;
        Size = new Size(535, 58);
    }

    [Browsable(false)]
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public bool Armed
    {
        get => _armed;
        set
        {
            if (_armed == value) return;
            _armed = value;
            Invalidate();
        }
    }

    protected override void OnPaint(PaintEventArgs eventArgs)
    {
        base.OnPaint(eventArgs);
        var graphics = eventArgs.Graphics;
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var border = ClientRectangle;
        border.Inflate(-1, -1);
        using var pen = new Pen(Armed ? Teal : Color.FromArgb(167, 207, 199), Armed ? 2F : 1F)
        {
            DashStyle = DashStyle.Dash
        };
        graphics.DrawRoundedRectangle(pen, border, 8);

        var center = new Point(30, Height / 2);
        using var ring = new Pen(Teal, 2F);
        graphics.DrawEllipse(ring, center.X - 9, center.Y - 9, 18, 18);
        graphics.DrawLine(ring, center.X - 13, center.Y, center.X + 13, center.Y);
        graphics.DrawLine(ring, center.X, center.Y - 13, center.X, center.Y + 13);

        using var titleFont = new Font("Microsoft YaHei UI", 9F, FontStyle.Bold);
        TextRenderer.DrawText(
            graphics,
            Armed ? "松开鼠标，识别这个窗口" : "把游戏窗口拖到这里松开",
            titleFont,
            new Rectangle(54, 8, Width - 66, 22),
            Mint,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        using var noteFont = new Font("Microsoft YaHei UI", 7.5F);
        TextRenderer.DrawText(
            graphics,
            "也可以用上方列表选择 · 支持窗口化和无边框游戏",
            noteFont,
            new Rectangle(54, 30, Width - 66, 18),
            Mist,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }
}

internal static class GraphicsExtensions
{
    public static void DrawRoundedRectangle(this Graphics graphics, Pen pen, Rectangle bounds, int radius)
    {
        var diameter = radius * 2;
        using var path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        graphics.DrawPath(pen, path);
    }
}

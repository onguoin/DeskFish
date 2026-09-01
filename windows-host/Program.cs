namespace DeskFrame.Host;

internal static class Program
{
    private const string MutexName = "Local\\DeskFrame.LocalMangaEngine.v1";

    [STAThread]
    private static void Main()
    {
        using var singleInstance = new Mutex(true, MutexName, out var createdNew);
        if (!createdNew)
        {
            MessageBox.Show("DeskFish 本地漫画引擎已经在运行。", "DeskFish", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        var server = new BridgeServer();
        try
        {
            server.StartAsync().GetAwaiter().GetResult();
            Application.Run(new MainForm(server));
        }
        catch (Exception error)
        {
            MessageBox.Show($"本地漫画引擎启动失败：\n\n{error.Message}", "DeskFish", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            server.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
    }
}

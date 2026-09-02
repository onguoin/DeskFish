namespace DeskFrame.Host;

internal static class Program
{
    private const string DefaultMutexName = "Local\\DeskFrame.LocalMangaEngine.v1";

    [STAThread]
    private static void Main()
    {
        var mutexName = Environment.GetEnvironmentVariable("DESKFISH_MUTEX_NAME") ?? DefaultMutexName;
        using var singleInstance = new Mutex(true, mutexName, out var createdNew);
        if (!createdNew)
        {
            MessageBox.Show("DeskFish 本地阅读引擎已经在运行。", "DeskFish", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        var server = new BridgeServer();
        try
        {
            server.StartAsync().GetAwaiter().GetResult();
            if (Environment.GetEnvironmentVariable("DESKFISH_HEADLESS") == "1")
            {
                using var stopped = new ManualResetEventSlim(false);
                Console.CancelKeyPress += (_, eventArgs) =>
                {
                    eventArgs.Cancel = true;
                    stopped.Set();
                };
                stopped.Wait();
            }
            else
            {
                Application.Run(new MainForm(server));
            }
        }
        catch (Exception error)
        {
            MessageBox.Show($"本地阅读引擎启动失败：\n\n{error.Message}", "DeskFish", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            server.DisposeAsync().AsTask().GetAwaiter().GetResult();
        }
    }
}

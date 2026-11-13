using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

// Windows 10+ includes .NET Framework 4.x. This small entry point keeps the
// model-bearing Inno payload intact and installs the signed VC runtime only
// when the target machine is missing a sufficiently recent x64 runtime.
internal static class SetupBootstrap
{
    private const string CoreName = "__CORE_NAME__";
    private const string RuntimeSha256 = "__RUNTIME_SHA256__";
    private static readonly string[] Slices = { __SLICES__ };
    private static string LogPath = Path.Combine(Path.GetTempPath(), "EnglishLearning-setup-bootstrap.log");

    private static void Log(string text)
    {
        try { File.AppendAllText(LogPath, DateTime.UtcNow.ToString("o") + " " + text + Environment.NewLine, Encoding.UTF8); }
        catch { }
    }

    private static bool RuntimeReady()
    {
        using (RegistryKey machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64))
        using (RegistryKey key = machine.OpenSubKey(@"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"))
        {
            if (key == null || Convert.ToInt32(key.GetValue("Installed", 0)) != 1) return false;
            string raw = Convert.ToString(key.GetValue("Version", "")).TrimStart('v', 'V');
            Version version;
            if (!Version.TryParse(raw, out version) || version < new Version(14, 40)) return false;
            string system = Environment.GetFolderPath(Environment.SpecialFolder.System);
            return new[] { "msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll" }.All(name => File.Exists(Path.Combine(system, name)));
        }
    }

    private static string Hash(string path)
    {
        using (SHA256 algorithm = SHA256.Create())
        using (FileStream file = File.OpenRead(path))
            return BitConverter.ToString(algorithm.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
    }

    private static string Quote(string value)
    {
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char item in value)
        {
            if (item == '\\') { slashes++; continue; }
            if (item == '"') { result.Append('\\', slashes * 2 + 1); result.Append(item); }
            else { result.Append('\\', slashes); result.Append(item); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"'); return result.ToString();
    }

    [STAThread]
    private static int Main(string[] args)
    {
        bool silent = args.Any(value => value.Equals("/VERYSILENT", StringComparison.OrdinalIgnoreCase));
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string core = Path.Combine(root, "files", CoreName);
            string runtime = Path.Combine(root, "prerequisites", "vc_redist.x64.exe");
            if (!File.Exists(core) || Slices.Any(name => !File.Exists(Path.Combine(root, "files", name))))
                throw new IOException("安装文件不完整。请将整个安装文件夹一并复制，保留 files 和 prerequisites 子文件夹。\nInstallation files are missing. Copy the complete distribution folder.");
            if (!File.Exists(runtime) || Hash(runtime) != RuntimeSha256)
                throw new IOException("微软运行库文件缺失或损坏，请重新获取完整安装包。\nThe Microsoft runtime package is missing or damaged.");
            bool ready = RuntimeReady();
            Log("VC runtime ready=" + ready);
            if (args.Length == 2 && args[0] == "--check-runtime")
            {
                File.WriteAllText(args[1], "{\"runtimeReady\":" + (ready ? "true" : "false") + ",\"runtimeHashValid\":true,\"payloadPresent\":true}", Encoding.UTF8);
                return ready ? 0 : 1;
            }
            if (!ready)
            {
                // An interactive Microsoft wizard presents its own license terms.
                // Never silently accept those terms or automatically restart Windows.
                if (silent) throw new InvalidOperationException("VC++ 运行库需要先由用户安装。请正常双击安装程序，按照微软安装窗口完成安装后重试。\nInstall the Microsoft VC++ runtime interactively before running silent setup.");
                ProcessStartInfo prerequisite = new ProcessStartInfo(runtime, "/install /norestart");
                prerequisite.UseShellExecute = true; prerequisite.Verb = "runas";
                using (Process process = Process.Start(prerequisite))
                {
                    process.WaitForExit();
                    Log("Microsoft runtime installer exit=" + process.ExitCode);
                    if (process.ExitCode == 3010)
                    {
                        MessageBox.Show("微软运行库更新需要重启。请保存工作并重启电脑，再次运行本安装程序。\nRestart Windows after saving your work, then run this installer again.", "English Learning", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return 3010;
                    }
                    if (process.ExitCode != 0 && process.ExitCode != 1638)
                        throw new InvalidOperationException("微软运行库未完成安装（退出代码 " + process.ExitCode + "）。\nMicrosoft runtime installation did not complete.");
                }
                if (!RuntimeReady()) throw new InvalidOperationException("微软运行库尚未就绪，请完成其安装后重试。\nComplete the Microsoft VC++ runtime installation, then try again.");
            }
            ProcessStartInfo setup = new ProcessStartInfo(core, string.Join(" ", args.Select(Quote)));
            setup.UseShellExecute = true; setup.WorkingDirectory = Path.GetDirectoryName(core);
            using (Process process = Process.Start(setup))
            {
                process.WaitForExit(); Log("Application installer exit=" + process.ExitCode); return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            Log(error.ToString());
            if (!silent) MessageBox.Show(error.Message, "English Learning 安装 / Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}

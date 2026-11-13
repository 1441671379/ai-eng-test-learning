"""Add an offline Microsoft-runtime check without recompressing model data."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        while data := stream.read(4 * 1024 * 1024):
            result.update(data)
    return result.hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def finish_distribution(release):
    output = Path(release["output"])
    report = Path(release["report"])
    if release.get("entryPoint"):
        return release
    core = next(item for item in release["artifacts"] if item["file"].endswith("-Setup.exe"))
    redist = HERE / "installer/prerequisites/vc_redist.x64.exe"
    verification = json.loads((redist.parent / "verification.json").read_text(encoding="utf-8-sig"))
    assert verification["signature"] == "Valid" and "O=Microsoft Corporation" in verification["publisher"]
    assert digest(redist) == verification["sha256"].lower()
    files = output / "files"
    files.mkdir(exist_ok=True)
    artifacts = []
    for item in release["artifacts"]:
        source = output / item["file"]
        target = files / item["file"]
        if source.exists() and not target.exists():
            source.rename(target)
        assert target.is_file() and target.stat().st_size == item["bytes"]
        artifacts.append({**item, "file": "files/" + item["file"]})
    prerequisites = output / "prerequisites"
    prerequisites.mkdir(exist_ok=True)
    shipped_redist = prerequisites / redist.name
    shutil.copy2(redist, shipped_redist)
    artifacts.append({"file": "prerequisites/" + redist.name, "bytes": shipped_redist.stat().st_size, "sha256": verification["sha256"].lower()})
    slices = [item["file"].removeprefix("files/") for item in artifacts if item["file"].endswith(".bin")]
    source = (HERE / "installer/SetupBootstrap.cs").read_text(encoding="utf-8")
    source = source.replace("__CORE_NAME__", core["file"]).replace("__RUNTIME_SHA256__", verification["sha256"].lower())
    source = source.replace("__SLICES__", ", ".join(json.dumps(name) for name in slices))
    generated = report / "SetupBootstrap.generated.cs"
    generated.write_text(source, encoding="utf-8-sig")
    compiler = Path(os.environ["WINDIR"]) / "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
    launcher = output / core["file"]
    subprocess.run([str(compiler), "/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/reference:System.Windows.Forms.dll", "/out:" + str(launcher), str(generated)], check=True)
    artifacts.insert(0, {"file": launcher.name, "bytes": launcher.stat().st_size, "sha256": digest(launcher)})
    check = report / "bootstrap-check.json"
    subprocess.run([str(launcher), "--check-runtime", str(check)], check=True, timeout=30)
    assert json.loads(check.read_text(encoding="utf-8-sig")) == {"runtimeReady": True, "runtimeHashValid": True, "payloadPresent": True}
    release.update(entryPoint=launcher.name, coreInstaller="files/" + core["file"], artifacts=artifacts,
                   installerBytes=sum(item["bytes"] for item in artifacts), microsoftRuntime=verification,
                   runtimeBootstrap="checks x64 VC runtime, uses the included Microsoft-signed interactive installer only if missing; no automatic restart")
    write(output / "RELEASE.json", {key: value for key, value in release.items() if key not in {"source", "report", "output"}})
    write(report / "release.json", release)
    write(HERE / "dist/latest.json", release)
    (output / "SHA256SUMS.txt").write_text("".join(f"{item['sha256']}  {item['file']}\n" for item in artifacts), encoding="utf-8")
    (output / "安装说明.txt").write_text(
        f"English Learning {release['version']} Windows x64\n\n"
        f"双击本文件夹最外层的 {launcher.name} 开始安装。\n"
        "请分享、复制整个文件夹，并保留 files、prerequisites 子文件夹的名称和全部内容。\n"
        "不要只发送最外层的小 .exe；真正的模型安装数据位于 files 文件夹内。\n\n"
        f"全部安装文件合计：{release['installerBytes']/1e9:.2f} GB（{release['installerBytes']/1024**3:.2f} GiB）。\n"
        f"应用解压后：约 {release['sourceBytes']/1e9:.2f} GB。录音、音频缓存另外占用空间。\n"
        "可自行选择安装目录。默认安装到当前用户的 Programs 文件夹。\n"
        "安装入口检查 Microsoft VC++ x64 运行库；如果缺少，会打开随包附带的微软原版安装程序，按其提示完成后继续。\n"
        "运行库安装可能需要管理员授权；软件本体按用户安装。不会自动重启电脑。\n"
        "本机已具备合适运行库时会直接进入应用安装向导。\n"
        "软件附带 Python、Node、本地语音模型及四种音色，不携带本地 LLM。建议使用兼容的 NVIDIA 显卡驱动。\n"
        "首次使用材料生成、写作批改、AI 对话时，在设置中填写自己的外部语言模型 API。\n"
        "不含制作者的 API Key、学习记录或个人录音。卸载保留 %APPDATA%\\EnglishLearningDesktop 下的学习数据与设置。\n\n"
        "这是一份尚未数字签名的测试发布，Windows 可能提示未知发布者。\n"
        "已提供 SHA256SUMS.txt，可校验传输后的所有安装程序和数据文件。\n"
        "完成安装后可删除这整个安装文件夹；不要删除已安装的应用目录。\n",
        encoding="utf-8-sig")
    print(json.dumps({"entryPoint": str(launcher), "GB": round(release["installerBytes"] / 1e9, 3), "artifacts": len(artifacts), "runtimeCheck": "ready; Microsoft package signature/hash verified"}, ensure_ascii=False), flush=True)
    return release


if __name__ == "__main__":
    finish_distribution(json.loads((HERE / "dist/latest.json").read_text(encoding="utf-8")))

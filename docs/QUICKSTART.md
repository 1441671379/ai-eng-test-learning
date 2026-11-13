# Windows 安装与首次使用

## 下载和安装

1. 打开 [v0.3.1 下载页](https://github.com/1441671379/ai-eng-test-learning/releases/tag/v0.3.1)，在 **Assets** 中下载这三个文件：
   - [EnglishLearning-0.3.1-Windows-x64-1-Setup.zip](https://github.com/1441671379/ai-eng-test-learning/releases/download/v0.3.1/EnglishLearning-0.3.1-Windows-x64-1-Setup.zip)
   - [EnglishLearning-0.3.1-Windows-x64-2-Data.zip](https://github.com/1441671379/ai-eng-test-learning/releases/download/v0.3.1/EnglishLearning-0.3.1-Windows-x64-2-Data.zip)
   - [EnglishLearning-0.3.1-Windows-x64-3-Data.zip](https://github.com/1441671379/ai-eng-test-learning/releases/download/v0.3.1/EnglishLearning-0.3.1-Windows-x64-3-Data.zip)
2. 将三个 ZIP **全部解压到同一个新文件夹**。例如先创建 `D:\EnglishLearning-Setup`，对每个 ZIP 点“全部提取”，都选择这个位置。允许合并 `files` 子文件夹；不要分别解压到三个不同目录，也不要直接在 ZIP 里启动。
3. 确认解压后的结构如下，运行最外层 `EnglishLearning-0.3.1-Windows-x64-Setup.exe`，按向导选择安装位置：

```text
EnglishLearning-Setup/
  EnglishLearning-0.3.1-Windows-x64-Setup.exe
  files/
    EnglishLearning-0.3.1-Windows-x64-Setup.exe
    EnglishLearning-0.3.1-Windows-x64-Setup-1.bin
    EnglishLearning-0.3.1-Windows-x64-Setup-2.bin
  prerequisites/
    vc_redist.x64.exe
```

安装入口会检查 VC++ 运行库，缺少时打开随包附带的微软安装程序。软件本体按当前 Windows 用户安装，无需另装 Python、Node.js、Git 或 CUDA Toolkit。

发布页自动提供的 `Source code (zip)` / `Source code (tar.gz)` 是源码，不是上述安装文件。三个 ZIP 是一套安装程序，少下载任何一个都无法安装。分开下载是为满足 GitHub 单个附件的大小限制，并不需要分卷解压工具。

## 运行条件

- Windows 10 2004 及更新版本的 **x64 系统**，或 Windows 11 x64；此包不支持 macOS、Linux 或 Windows ARM64 原生运行。
- 安装后的应用约占 10 GB；请再为下载文件、解压临时文件、录音和缓存留出空间。具体下载大小见发布页。
- 建议使用兼容的 NVIDIA 显卡并安装驱动；没有可用显卡时走 CPU，语音处理会较慢。最低内存与显存要求及不同电脑兼容性仍在验证。
- 首次启动加载语音模型可能需要几分钟。此版为**未数字签名的测试版**；仅从官方发布页下载，系统若拦截，请先核对来源与校验值，不要关闭安全软件。

## 首次使用

1. 从开始菜单或桌面打开 **English Learning**，等待后台服务就绪。
2. 在 **设置 → 模型设置** 中填写自己的服务地址、模型名称和 API Key。可以选择 DeepSeek 或兼容接口；密钥由用户自己提供，调用费用由所选服务商收取。可在设置中切换中英文界面。
3. 自由选择听、说、读、写、单词或知识库。初次可以先导入一本预置词书，或在阅读里输入话题生成练习。
4. 口语练习需要麦克风；若无法录音，在 Windows 设置的“隐私和安全性 → 麦克风”中允许桌面应用访问。

语音识别、发音评分和 Kokoro 示范朗读在本机运行；文章生成、作文批改和 AI 对话需要联网，相关文字会发送给所选模型服务。分数仅用于学习参考。

## 内容和数据

- 已附：五本公开词书、离线 ECDICT 公共词典、所需本地语音模型、四种 Kokoro 音色及运行环境。
- 未附：个人导入的四六级 Anki 词书、完整 Oxford／Pearson 来源课程包、本地 LLM、制作者的学习记录或 API Key。知识库会显示课程未安装，可参阅[资源准备说明](PUBLIC-RESOURCES.md)。
- 自己的记录和设置位于 `%APPDATA%\EnglishLearningDesktop`；关闭再打开可继续学习，升级和卸载会保留此目录。安装完成后可删除下载及解压用的安装文件夹。

## 常见问题

- **提示缺少安装数据**：检查三个 ZIP 是否都已解压到同一位置，以及上面的两个 `.bin` 是否位于 `files` 中。
- **语音服务启动失败**：先查看应用提供的日志入口，检查显卡驱动及磁盘空间；将去除个人内容的错误信息提交到 [Issues](https://github.com/1441671379/ai-eng-test-learning/issues)。请勿上传 API Key、个人数据库或私人录音。
- **生成文章或批改失败**：核对模型地址、模型名、API Key、网络与服务商余额；源码仓库和安装程序均不赠送模型 API 额度。

可选校验：下载发布页的 `SHA256SUMS.txt`，在 PowerShell 中运行 `Get-FileHash .\下载的文件名.zip -Algorithm SHA256`，与对应条目比较。

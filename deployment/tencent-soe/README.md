# 腾讯智聆口语评测对照实验

入口：应用“说”页的“测评对照实验（1）”，路径 `/speaking/tencent-comparison`。结构沿用句子发音练习：目标文本 / 示范 → 底部录音与导入 → 整体结果 → 点击目标词 → 本地与腾讯的逐词、逐音素证据 → 片段回听与重练。录制停止后自动提交，导入录音后手动提交。句子模式限 30 词以内，单词纠错模式每次一个词；数字写成英文单词，每次最多 30 秒。录音会发送到腾讯云，说明显示在提交区。原表格视图仍可用 `?view=raw` 打开。

本次结果通过 `?record=<记录 ID>` 保留，刷新或从实验历史打开时恢复目标文本、模式和结果。历史样本缺少新音素字段时，从原始响应只读补充明细；不重写 SQLite 内的原样本，也不重新计算历史分数。

## 架构核对与边界

原实验页面已转为正式 `/speaking`，当前共享 `lib/experiments`、公共语音服务和原实验 SQLite。早期 `deployment/experiments/README.md` 记录的是历史架构，不能作为当前接入依据。

本入口使用独立 `/api/experiments/tencent-comparison`、`lib/experiments/tencent-comparison` 和独立数据库。只读取当前学习者的时间配对设置快照；只调用语音服务 `/experiments/time-alignment` 并使用既有 `sentenceTimeAssessment` 适配本地结果。不会写入正式 `sessions`、学习记录或练习恢复状态，没有修改 `/assess`、正式评分 API、算法及默认阈值。

先持久化输入与录音，再并发请求两个服务；每个服务在短事务中独立合并结果。失败、超时、未配置均保留样本和另一侧结果。进程中断时，尚未完成的一侧可能保留 `pending`，页面明确提示；再次提交创建新记录，不覆盖原样本，不自动重试可能收费的腾讯请求。

## 已核对的腾讯接口

默认采用与用户现有“腾讯云语音工作台”一致的 **WebSocket 录音评测**：`wss://soe.cloud.tencent.com/soe/api/<AppID>`，使用 AppID、SecretId、SecretKey 和 HMAC-SHA1 URL 签名。已逐项核对工作台的 Go SDK：`voice_format=1`（WAV）、`server_engine_type=16k_en`、`eval_mode=1`、`text_mode=0`、`sentence_info_enabled=0`、`rec_mode=1`。握手成功后只发送一次整份 WAV，再发送 `{"type":"end"}`；只在收到 `final=1` 时采纳最终结果。签名 URL、SecretId 和 Token 不进入请求记录或日志。

实验（1）另提供 WebSocket `eval_mode=4` 单词音素纠错。句子模式与纠错模式的请求快照分别保存，不混合量纲：句子模式整体及音素准确度为百分制；纠错模式整体及音素分按一分制换算到 0–100，单词准确度仍为百分制，并导出原值与量纲。纠错模式的完整度留空。依据：[句子模式](https://cloud.tencent.com/document/product/1774/107387)、[单词音素纠错模式](https://cloud.tencent.com/document/product/1774/107390)。基础版 HTTP 只提供原有句子模式。

依据：[腾讯 WebSocket 接口文档](https://cloud.tencent.com/document/product/1774/107497)、[官方 Go SDK](https://github.com/TencentCloud/tencentcloud-speech-sdk-go)。原始握手、结果、错误 JSON 按收到的顺序保存为 `rawResponse` 内的换行分隔文本，分项继续使用同一适配器。握手 HTTP 状态为 101；WS 的 `message_id`（或 `voice_id`）保存在 `requestId`。

严格度仍为成人默认 `score_coeff=4`，每次写入请求快照；用户提供的工作台固定为 1，二者会影响分数，不能直接当作相同评分条件。可用环境变量调整为相同严格度。

历史基础版 HTTP 适配器保留，以 `ENGLISH_TENCENT_SOE_PROTOCOL=http` 显式启用：`https://soe.tencentcloudapi.com`、`TransmitOralProcessWithInit`、`2018-07-24`，TC3-HMAC-SHA256。参数为 `WorkMode=1`、`EvalMode=1`、`ServerType=0`、`VoiceFileType=2`，只采纳 `Status=Finished`。基础版 HTTP 与工作台的 WebSocket 是不同接入路径；前者返回 `AuthFailure.AccountUnavailable` 不代表后者不可用。错误信息明确提示这种差异，不自动回退或重复发起云请求。历史记录的接口、失败状态与原始响应不被重写。

HTTP 参考：[基础版接口](https://cloud.tencent.com/document/product/884/32605)、[TC3 签名](https://cloud.tencent.com/document/product/884/30657)、[返回字段](https://cloud.tencent.com/document/api/884/19320)。`SoeAppId` 是可选业务应用 ID，与账号 AppID 不同。

## 配置

页面提供 **AppID、SECRET_ID、SECRET_KEY** 三个输入栏，点击“保存 API 配置”后立即生效，不必重启。两项密钥均不回显；同时留空保留已配置的密钥，更换时需同时填写。默认 WebSocket 接入下 AppID 必填并参与鉴权；不会把账号 AppID 错误地发送为业务 `SoeAppId`。

页面配置按当前学习者单独保存，优先于环境变量。凭证通过 Windows DPAPI `CurrentUser` 加密，保存在 `ENGLISH_DATA_DIR/settings/tencent-soe/<SHA256(学习者 ID)>.json`；不写入对照记录、浏览器存储或导出。读取失败会明确报错并停用腾讯请求，不会悄悄改用另一套环境密钥。保存本身不会调用腾讯 API。点击“清除页面保存的配置”后恢复环境变量配置。

与既有模型密钥策略一致，页面密钥保存仅支持 Windows；其他系统仍可通过服务端环境变量接入。新填入一对密钥时不会沿用另一账号原有的临时 Token 或业务 SoeAppId；这两个高级字段仍可通过环境变量配置并在保留原有密钥时沿用。

参考同目录 `.env.example`，把需要的条目填写到 `apps/web/.env.local`，或设置到启动网页 / 桌面应用的进程环境，然后重启相应进程。

| 服务端环境变量 | 用途 |
| --- | --- |
| `ENGLISH_TENCENT_SOE_SECRET_ID` | 必填，云 API SecretId |
| `ENGLISH_TENCENT_SOE_SECRET_KEY` | 必填，云 API SecretKey |
| `ENGLISH_TENCENT_SOE_ACCOUNT_APP_ID` | WebSocket 必填，腾讯账号 AppID |
| `ENGLISH_TENCENT_SOE_PROTOCOL` | 可选，默认 `websocket`；`http` 显式启用基础版旧接口 |
| `ENGLISH_TENCENT_SOE_TOKEN` | 可选，临时凭证 Token |
| `ENGLISH_TENCENT_SOE_APP_ID` | 仅基础版 HTTP 使用，可选 SOE 业务应用 ID |
| `ENGLISH_TENCENT_SOE_SCORE_COEFF` | 可选，1–4，默认 4 |

已保存密钥和 Token 只在服务端解密并生成签名，不回传到页面、SQLite、导出或日志。缺少所需的 AppID / 密钥或严格度无效时，页面显示未配置，腾讯调用次数为零，样本的腾讯状态为 `not_configured`。本地评测仍然运行并保存。不要使用 `NEXT_PUBLIC_` 配置密钥。

## 音频与持久化

浏览器解码录音 / 导入文件，合并声道、重采样到 16 kHz，编码成 16 bit 单声道 PCM WAV。服务端校验完整 WAV 头、实际长度和时长；**同一份校验后的字节**存入本地并送到两个服务。SHA-256 由服务端计算，作为 `audio.id` 与 `audio.sha256`；不依赖文件名作为身份。

数据库：`ENGLISH_DATA_DIR/experiments/tencent-soe/<SHA256(学习者 ID)>.sqlite`。桌面跟随现有 `%APPDATA%/EnglishLearningDesktop` 数据根目录。与正式实验数据库分开。`audio` 表按哈希去重复用 WAV，`comparisons` 保存每次独立请求的 JSON；重复提交同一录音保留不同请求 / SessionId。

每条记录保留：schemaVersion、记录 ID、时间、请求文本、WAV 标识 / 文件名 / 长度 / 时长 / 格式、本地设置与腾讯参数快照、两侧状态 / 耗时 / HTTP 状态 / RequestId / 错误、**原始响应文本**、可比较分项、逐词 / 音素明细及空白人工标注字段。腾讯请求记录不重复存音频，可用 WAV 重建；HTTP 鉴权头和 WebSocket 签名 URL 永不落库。原始响应收到后，即使后续适配失败也会保留。

## 数据解释与导出

| 字段 | 本地 | 腾讯 |
| --- | --- | --- |
| `score` | 既有音素参考分 | SuggestedScore |
| `phonemeMatch` | 音素匹配率 | null |
| `accuracy` | null | PronAccuracy |
| `fluency` | null | PronFluency × 100 |
| `completion` | null | PronCompletion × 100 |
| `coverage` | 已评分词 / 全部词 × 100 | null |
| 单词 `confidence` | 音素识别置信度均值 | null |

所有汇总数值采用 0–100，按请求模式对应的量纲换算；缺失 / 无效 / `-1` 显示为 `null`，超出该量纲的值不会被猜测或修正，原值保留在响应中。本地音素匹配率、腾讯准确度、覆盖率、完整度与置信度有不同定义，不能视为相同指标，不计算校准总分或评分直接差值。

腾讯音素展示 `PhoneInfos` 中的 `ReferencePhone`、`Phone`、`PronAccuracy`、`MatchTag`、`MemBeginTime` / `MemEndTime`、`Stress` / `DetectedStress` 与 `ReferenceLetter`。句子模式可能不返回参考音素，页面显示“未返回”，不以本地词典补齐。重音布尔值按原样展示，句子模式不据此断言重音正确性。`Tone` 为中文声调，当前英语实验标记不适用，原响应与逐词导出仍保留其有效状态及原值。

本地音素展示参考 / 识别符号、配对操作、识别置信度与峰值时刻，缺少可靠的音素起止边界时留空。仅当两侧单词均准确对齐到同一目标词位时展示词起止时间差（本地 − 腾讯）。两侧音标体系不强行统一；腾讯 `MatchTag=0` 也不表示发音准确度满分。

同一 WAV 可按两侧单词区间或腾讯音素区间回听；音频接口支持经过学习者身份校验的单段 HTTP 字节范围请求，避免首次播放无法定位。没有可靠区间时不启用片段回听，可播放完整录音。

逐词结果保留各自索引并通过序列编辑对齐到目标词位（从 0 开始）；额外词的 `targetIndex=null`，替换词标记 `substitution`。原文缺词可能没有对应行，不人为填零。重复词可能有多种等价对齐，需结合时长、原始响应及录音人工核对。词位分词与现有本地服务一致，连字符拆词。腾讯音素与本地音素操作原样导出，不强行转换为同一音标体系。

- JSONL：每行一个完整样本，包含全部请求元数据、原始响应、分项和音素；附字段解释。
- 整句 CSV：每样本一行，包含请求、原始响应和汇总分项。
- 逐词 CSV：每服务每词一行，以 `record_id + provider + target_word_index` 关联。包含音素 JSON、人工标签和备注列。
- 逐音素 CSV：每服务每词每音素一行，包含目标词位、参考 / 实际音素、准确度原值 / 量纲 / 归一值、本地置信度 / 配对操作 / 峰值、腾讯匹配标签 / 起止时间 / 标准与检测重音，以及人工标签与备注列。
- WAV：从记录中逐条回放 / 下载，以哈希关联导出的元数据。JSONL / CSV 不内嵌音频。

页面只显示最新 100 条；“全部”导出覆盖当前学习者的全部记录，不受页面条数限制。CSV 使用 UTF-8 BOM，并转义可能触发表格公式的单元格。人工标签列供导出后填写，目前不提供标注回写。

## 验证与已知限制

2026-10-27：实验（1）补充后，全部 207 项测试通过。补充用例覆盖空参考音素、零时刻、false 重音标记、纠错模式分数量纲、置信度与准确度区分、历史数据只读补充与原分保留、逐音素导出以及回听时间校验。类型检查、定向 ESLint 与生产构建另行保存日志于 `artifacts/comparison-one-*.log`。生产构建报告原有 `word-tts-store` 文件追踪警告，与本入口无关。

WebSocket 补充验收覆盖成功握手后发送同一 WAV、只发送一次、final=1、原始消息保留、错误码、voice_id 不匹配、提前断线、超时、缺少 AppID，以及无最终分项时不把中间句分数当成总分。

**真实腾讯验证已完成一次**：从已有失败样本中读取同一份 5.40 秒 WAV，校验 SHA-256 一致，用本机保存的凭证调用新 WebSocket 适配器，成功返回 8 个单词的最终结果。旧 HTTP 失败记录保持原样。该诊断的原始响应与参数保存在用户数据根目录 `tencent-soe-diagnostics/`，不含密钥和签名 URL；没有自动增加收费重试或改写正式学习记录。

配置栏补充验收：实际 Windows DPAPI 加密 / 解密、重启读取、密钥不回显、学习者隔离、两项留空保留、不完整密钥拒绝、损坏配置停用及清除恢复环境变量均通过。`credentials-acceptance.mjs` 在隔离网页上验证 GET / PUT / DELETE 的身份与同源检查、保存即时生效、刷新读取和脱敏响应；只使用假密钥，没有发起腾讯调用。浏览器另行验证三个输入栏、保存后的空密码框和已配置状态，刷新后保留 AppID 与配置状态，再清除假配置。

隔离 API 验收使用合成 WAV 和本地语音桩，覆盖身份、同源、文本 / WAV 校验、传到本地的 WAV 字节、原始响应、未配置状态、单侧失败、跨学习者隔离、音频下载 / 字节范围定位与四种导出、模式校验及请求快照，以及正式记录未写入。腾讯签名 / 成功 / 错误 / 非最终响应 / 网络失败在单元测试中用固定模拟响应验证。

浏览器已检查 1280 × 720 与 390 × 844 页面，完成导入、浏览器重采样提交、未配置结果、历史重开和 JSONL 下载。截图和合成验收结果在 `artifacts/`。

实验（1）的浏览器验证复用上述真实句子响应到隔离数据根目录，检查双侧单词 / 音素、缺少 ReferencePhone、按音素片段回听与逐音素 CSV 下载；纠错模式的参考 / 实际音素、分数量纲和重音用明确标记的合成夹具验证。`seed-comparison-one-qa.mjs` 仅为本机 QA 复制既有快照，不复制凭证，不发起腾讯调用。**本轮未新增腾讯请求，模式 4 尚未使用真实账户联调。**

尚未开展人工标注或评分质量校准，也未重新打包桌面安装程序。已有正式评分回归测试保持通过。

复现隔离接口验收，在 `apps/web` 启动专用网页进程，避免写入日常数据：

```powershell
$env:ENGLISH_NEXT_DIST_DIR='.next-soe-qa'
$env:ENGLISH_DATA_DIR='C:\path\to\English\deployment\tencent-soe\qa-data'
$env:ENGLISH_SPEECH_URL='http://127.0.0.1:3012'
$env:ENGLISH_TENCENT_SOE_SECRET_ID=''
$env:ENGLISH_TENCENT_SOE_SECRET_KEY=''
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3011
# 在项目根目录另一个终端中：
node deployment/tencent-soe/acceptance.mjs
# 加 --serve 会保留合成本地服务，用于浏览器导入 artifacts/synthetic.wav 验收；输入 test。
```

真实联调时使用正常服务地址和真实朗读，填写已开通对应服务的 AppID 与密钥后提交一次，核对 `voice_id`、`final=1`、保存的 WAV 哈希与原始响应。基础版 HTTP 则核对 `RequestId` / `Status=Finished`。

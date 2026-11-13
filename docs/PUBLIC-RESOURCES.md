# 公开源码与资源准备

本仓库包含六个学习板块及 Windows Electron 构建代码。完整的 Python 环境、模型、安装包及个人学习数据不在 Git 中；仅安装前端依赖可以检查和构建界面，不能启动全部语音功能。

## 已提供的资源

| 资源 | 位置与许可 |
| --- | --- |
| 小学英语、雅思核心、雅思拓展词书及可编辑源词表 | `deployment/vocabulary/books` 与 `book-sources`；来源 qwerty-learner，保留 GPL-3.0 LICENSE |
| 初中、高中词书及可编辑源词表 | 同上；来源 KyleBing/english-vocabulary，保留 BSD-3-Clause KyleBing-LICENSE |
| 美式与英式发音词表 | `services/speech/data/ipa-dict`；美式 MIT、英式 GPL-3.0，详见 ATTRIBUTION.md 及各许可证 |
| 多读法参考目录 | `deployment/word-pronunciations`；保留 CMUDICT 来源与许可证，音频由本地 Kokoro 按需生成 |
| ECDICT 导入程序 | `deployment/dictionary/prepare_dictionary.py`；下载固定版本 CSV 和 LICENSE，校验后生成只读 SQLite 索引 |

词书清单只列这五本公开词书。个人导入的四、六级 Anki 包及其导出数据未提供，可以在单词模块自行导入。可运行 `python deployment/vocabulary/prepare_books.py` 从本仓库保留的公开源词表及上游来源重建五本词书。

## 从前端开始

需要 Node.js 24 和 pnpm。在仓库根目录运行：

```powershell
pnpm --dir apps/web install --frozen-lockfile
pnpm --dir apps/web typecheck
pnpm --dir apps/web test
pnpm --dir apps/web build
```

前端生产检查不要求模型服务。只有在准备好下述模型与公共推理环境后，才运行 `Start-LearningApps.cmd`。外部 LLM 在应用设置中配置，API Key 不应写入源码。

## 本地模型和环境

- 共享推理环境位于 `runtimes/inference-kokoro`，依赖锁为 `deployment/kokoro/requirements.lock.txt`；环境搭建与模型路径见该目录 README 和 `services/README.md`。
- Kokoro 模型与四种音色放到 `deployment/kokoro/models`；所需文件及校验信息见 `deployment/kokoro/assets.json`，音色为 af_heart、am_puck、bf_emma、bm_george。来源为 [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)。
- 语音识别、音素识别及 CTC 时间定位使用本地 `models`。具体模型标识以 `services/speech/speech_transcriber.py`、`phoneme_scorer.py` 和 `ctc_word_alignment.py` 的常量与配置为准；需自行取得对应权重并保留原许可。
- `deployment/bin` 中的 FFmpeg 和 Electron 安装程序所需工具也须自行准备。安装器构建还要求完整运行资源；公开源码目录不是现成安装包。

生成词典索引：

```powershell
python deployment/dictionary/prepare_dictionary.py
```

没有词典索引时，应用仍允许收藏生词，但无法提供完整离线词典释义；参考音频可以由 Kokoro 按需生成。生成材料、批改及对话需要设置外部语言模型。

## 知识库课程包

完整 Oxford／Pearson 来源词表以及基于它们生成的课程包不随公开仓库分发。知识库页面会显示资料未安装的提示；功能代码、进度存储和练习逻辑保留。

自行取得可使用的课程资源后，可通过 `ENGLISH_PHRASES_DIR` 指定包含 `catalog.json`、`lessons.json`、`courses.json` 的目录；格式由 `apps/web/src/lib/phrases.ts` 与 `phrase-catalog.ts` 校验。课程每课包含 6–10 个主题。来源 PDF 导入工具要求显式传入自己的文件路径，不会自动取得出版物。

通用短语测试使用自建的六条测试表达。五项完整来源包核对测试在未安装资料时明确跳过；它们不代替通用存储、复习状态、输入校验和练习测试。

## 许可证

各资源和上游代码保留自己的许可证与来源说明。根目录尚未确定统一的应用代码许可证；不能将所有代码、数据和模型统称为 MIT。公开仓库可见性不改变原资源的使用条件。

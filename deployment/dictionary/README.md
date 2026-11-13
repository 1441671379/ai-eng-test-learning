# ECDICT 公共词典

这是应用只读参考资源，不是课程词书，也不是个人复习数据库。

- 上游：https://github.com/skywind3000/ECDICT
- 固定提交：`bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`
- 输入：基础 `ecdict.csv` 与仓库 `LICENSE`。未采用更大的增强版、`lemma.en.txt` 或上游 Python 运行环境。
- 当前索引：770611 条词条，124486 条明确词形关系，78045184 字节（74.43 MiB）。
- 输入 CSV SHA-256：`1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`。

## 重建

在项目根目录运行：

```powershell
python -X utf8 .\deployment\dictionary\prepare_dictionary.py
```

构建脚本只使用 Python 标准库，从固定提交下载缺少的输入，校验 CSV，构建临时索引，通过 SQLite quick_check 后替换目标。已启动的应用应关闭后再重建；运行进程会缓存只读连接。

`sources/` 是开发时的下载缓存，已从 Git 排除，桌面包不复制它。`ecdict.sqlite`、`manifest.json`、`LICENSE.ECDICT.txt` 是运行资源，勿与个人 `vocabulary/*.sqlite` 混淆。

## 运行与发布

开发环境自动寻找项目 `deployment/dictionary/ecdict.sqlite`，也可通过 `ENGLISH_DICTIONARY_DIR` 指定其父目录。Electron 主进程明确设置该变量；开发模式使用源码目录，正式模式使用 `resources/app/deployment/dictionary`。

`Build-Desktop.ps1 -RefreshUI` 将三项运行资源复制到桌面包，并在 `resources/licenses/ECDICT-MIT.txt` 保留 MIT 声明。库存检查仅豁免这一个已校验的公共 SQLite 文件，仍禁止携带其他个人数据库。索引增加约 74.43 MiB 未压缩资源；安装包压缩后的增量须实际打包测量，本轮没有重做安装程序。

## 查询和补全

`GET /api/dictionary?word=economists` 需要已有学习身份，不产生个人卡片。不传 word 时返回可用性、词条数和固定版本。

- 优先原词；不忽略词组内部标点来做宽松猜测。
- 原词缺失时只使用 `exchange` 已记录的词形关系。唯一候选可补基础义；歧义时返回候选但不自动填入。
- 缩写 US、IT 不静默按 us、it 补全。词形不合并卡片，回退到原形时不借用原形音标。
- 收词及已有个人生词补全只填空字段，保留 ID、原句、来源、暂停状态和 FSRS 进度。新增意义仍是通用词典义，不是经过语境消歧的解释。
- 词典文件不存在、词条缺失或词形歧义时仍允许收藏；用户可以手动编辑或主动调用原有 AI 补全。

词书依旧位于 `deployment/vocabulary/books`；个人学习数据依旧由 `ENGLISH_DATA_DIR` 指向，桌面版默认写入 `%APPDATA%/EnglishLearningDesktop/learning`。查询公共词典不会把几十万词条加入个人复习队列。

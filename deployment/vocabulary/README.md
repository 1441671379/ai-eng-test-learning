# 单词模块与公开词书

单词模块包含单词卡、FSRS 间隔复习、本地生词本、Anki 文本导入、跨板块收词和主动开启的发音练习。示范音频统一使用 Kokoro，个人进度保存在本地学习数据库。

本公开源码包含五本词书：小学、初中、高中、雅思核心、雅思拓展。books/manifest.json 记录来源、词数和 SHA256。小学及雅思资源来自 qwerty-learner，采用 GPL-3.0；初中及高中来自 KyleBing/english-vocabulary，采用 BSD-3-Clause。book-sources/ 保留可编辑源词表和对应许可证。

四、六级 Anki 词书未随源码提供。可以在应用中导入自己的 APKG、CSV、TSV 或 TXT 文本词书；不导入 Anki 卡片模板、媒体或复习历史。同词合并时保留用户进度。

重建五本公开词书：python deployment/vocabulary/prepare_books.py。运行工具需要 httpx；下载缺失源文件时需要网络。它不读取用户下载目录。

生词本与公共 ECDICT 词典独立；没有词典索引时仍可收词，释义可手动补充或使用全局模型生成。完整准备说明见 [公开资源说明](../../docs/PUBLIC-RESOURCES.md)。

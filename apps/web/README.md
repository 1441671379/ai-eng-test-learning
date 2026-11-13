# 英语学习空间 · Web

应用主工程。当前界面包含听、读、写、单词、实验、设置和学习记录；旧“说”及 Cadence / OpenPronounce 的应用代码已移除。

- `pnpm dev` / `pnpm dev:all`：开发网页 / 调用根目录启动器。
- `pnpm typecheck`、`pnpm test`：检查类型、独立服务边界和历史记录兼容。
- `pnpm build`、`pnpm start`：构建并运行 standalone 网页。

新功能使用 `components/speech`、`hooks/speech`、`lib/models`、`lib/services` 等应用公共层。不要重新引入已归档的旧口语实现。数据、服务、备份和启动说明见 [根目录 README](../../README.md)。原 MIT 许可证继续保留于本目录 `LICENSE`。

import { HISTORICAL_SPEAKING_SOURCES } from "./compatibility/legacy";
export const learningModules = [
  { id: "listening", label: "听", name: "听力学习", english: "LISTENING", href: "/listening", ready: true, description: "生成话题听力、听音答题与解析，再围绕内容用英语交流。", planned: [] },
  { id: "speaking", label: "说", name: "口语练习", english: "SPEAKING", href: "/speaking", ready: true, description: "与 AI 交流、练习句子发音和文章朗读，查看逐词反馈。", planned: [] },
  { id: "reading", label: "读", name: "阅读学习", english: "READING", href: "/reading", ready: true, description: "生成话题文章与阅读题，听朗读、查看解析并收藏生词。", planned: [] },
  { id: "writing", label: "写", name: "写作练习", english: "WRITING", href: "/writing", ready: true, description: "逐句批改、雅思四项参考评分、修改后复评与写作历史。", planned: [] },
  { id: "vocabulary", label: "单词", name: "单词记忆", english: "VOCABULARY", href: "/vocabulary", ready: true, description: "翻面回忆、间隔复习、导入 Anki 词书，让生词回到听力、阅读和口语练习中。", planned: [] },
  { id: "knowledge", label: "知识库", name: "知识库", english: "KNOWLEDGE", href: "/knowledge", ready: true, description: "按课程学习搭配与表达，在语境中理解用法并练习运用。", planned: [] },
] as const;
export type LearningModuleId = typeof learningModules[number]["id"];
export const sourceLabels = { [HISTORICAL_SPEAKING_SOURCES.conversation]: "历史口语", [HISTORICAL_SPEAKING_SOURCES.pronunciation]: "历史发音", speech: "发音练习", reading: "阅读练习", listening: "听力练习", vocabulary: "单词卡", writing: "写作练习" } as const;

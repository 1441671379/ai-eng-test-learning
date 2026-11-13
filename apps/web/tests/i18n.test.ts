import test from "node:test";
import assert from "node:assert/strict";
import { parseLocale, translate } from "../src/lib/i18n/index.ts";
import { messages } from "../src/lib/i18n/catalog.ts";
test("UI language accepts only the supported choices and defaults to Chinese", () => {
  assert.equal(parseLocale("en"), "en"); assert.equal(parseLocale("zh-CN"), "zh-CN");
  for (const value of [null, "fr", "en-US", {}, 0]) assert.equal(parseLocale(value), "zh-CN");
});
test("all learning areas and language controls have stable bilingual labels", () => {
  for (const [source, expected] of [["听", "Listening"], ["说", "Speaking"], ["读", "Reading"], ["写", "Writing"], ["单词", "Vocabulary"], ["知识库", "Knowledge"], ["保存界面语言", "Save language"]]) {
    assert.equal(translate(source,"en"), expected); assert.equal(translate(source,"zh-CN"), source);
  }
  assert.equal(translate("Word feedback", "zh-CN"), "逐词反馈");
});
test("whitespace, unfamiliar study content, names and acoustic phones stay intact", () => {
  assert.equal(translate("  说  ","en"), "  Speaking  ");
  for (const value of ["I always looking forward to autumn.", "n oʊ ɾ ɪ s", "My Favorite Season", "张同学", "A new article about trade."]) {
    assert.equal(translate(value, "en"), value); assert.equal(translate(value, "zh-CN"), value);
  }
});
test("file controls and backend readiness messages follow the interface language", () => {
  for (const [source, expected] of [
    ["选择文件", "Choose file"], ["未选择文件", "No file selected"],
    ["本地模型已部署", "Local model installed"],
    ["本地语言模型已就绪。", "Local language model is ready."],
    ["本地语言模型正在预热。", "Local language model is warming up."],
    ["练习录音", "Practice recording"],
    ["录音由你手动停止；完成后可回听或重录。", "Click Stop when you finish recording. You can then replay or record again."],
    ["全局外部模型：deepseek-chat。", "External language model: deepseek-chat."],
  ]) {
    assert.equal(translate(source, "en"), expected);
    assert.equal(translate(source, "zh-CN"), source);
  }
});
test("specific status templates take precedence and preserve inserted filenames and words", () => {
  assert.equal(translate("外部 API · deepseek-chat · 请先填写 API Key", "en"), "External API · deepseek-chat · Enter an API key first");
  assert.equal(translate("已收藏 notice，可在单词模块复习。", "en"), "Saved notice. Review it in Vocabulary.");
  assert.equal(translate("已收藏 trade，可在单词模块补全释义。", "en"), "Saved trade. Add its meaning in Vocabulary.");
  assert.equal(translate("1 / 3 段 · Overall score 83 / 100 · 继续朗读 →", "en"), "1 / 3 segments · Overall score 83 / 100 · Continue reading →");
  assert.equal(translate("全局外部模型：我的本地代理。", "en"), "External language model: 我的本地代理.");
});
test("review system warnings translate without regenerating an assessment", () => {
  const warning = "逐句检查仅完成 12/25 句。未完成部分不能当作没有错误；已保留完成部分的建议，请重新批改或更换模型。";
  assert.equal(translate(warning, "en"), "Only 12 of 25 sentences were checked. Unchecked sentences may still contain errors. Completed suggestions are saved; submit again or choose another model.");
  assert.equal(translate(warning, "zh-CN"), warning);
});
test("reviewed translations retain every interpolation placeholder", () => {
  for (const [source, entry] of Object.entries(messages)) {
    const placeholders = (text: string) => (text.match(/\{\{\d+\}\}/g) || []).sort();
    assert.deepEqual(placeholders(entry.en), placeholders(source), source);
    assert.deepEqual(placeholders(entry["zh-CN"]), placeholders(source), source);
  }
});

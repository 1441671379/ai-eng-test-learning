"use client";

import { UiText, useUiLocale } from "@/components/i18n/UiLocale";

import { readLocalStorage } from "@/lib/browser-storage";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { applyWritingEdits, validateWritingInput, isWritingId, writingWordCount, type WritingDocument, type WritingEdit, type WritingInput, type WritingSummary, type WritingVersion } from "@/lib/writing";
import { WritingReport } from "./WritingReport";
import { PianoIcon } from "@/components/ui/piano-icon";
import { usePracticeSeed, usePracticeCheckpoint, draftString, draftNumber, draftChoice, draftFlag } from "@/components/learning/PracticeContinuity";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options }); const value = await response.json();
  if (!response.ok) throw new Error(value.error || "请求失败，请重试。"); return value;
}
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const fields = (doc: WritingInput) => JSON.stringify([doc.title, doc.mode, doc.prompt, doc.text, doc.assisted === true, doc.parentVersionId || null]);
function blank(): WritingDocument { return { id: crypto.randomUUID(), revision: 0, title: "", mode: "task2", prompt: "", text: "", updatedAt: new Date().toISOString(), versions: [] }; }
function reducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
function MarkedEssay({ version, selected, onLocate }: { version: WritingVersion; selected: string; onLocate: (id: string) => void }) {
  const nodes: ReactNode[] = [], sorted = [...version.review.corrections].sort((a, b) => a.start - b.start);
  let start = 0;
  for (const edit of sorted) {
    if (edit.start < start || version.text.slice(edit.start, edit.end) !== edit.original) continue;
    nodes.push(version.text.slice(start, edit.start));
    nodes.push(<button key={edit.id} id={"writing-mark-" + edit.id} aria-pressed={selected === edit.id} onClick={() => onLocate(edit.id)} title={edit.explanation} className="writing-mark">{edit.original}</button>);
    start = edit.end;
  }
  nodes.push(version.text.slice(start));
  return <div lang="en" className="writing-original-text">{nodes}</div>;
}

export function WritingWorkspace({ userId, initialId }: { userId: string; initialId?: string }) {
  const { locale, dateLocale } = useUiLocale();
  const en = locale === "en", label = (zh: string, english: string) => en ? english : zh;
  const seed = usePracticeSeed("writing", initialId ? `/writing?id=${initialId}` : "/writing");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(draftFlag(seed, "promptOpen"));

  const [panel, setPanel] = useState<"editor" | "annotations" | "feedback">("editor");
  const [doc, setDoc] = useState<WritingDocument | null>(null);
  const [history, setHistory] = useState<WritingSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [topic, setTopic] = useState(draftString(seed, "topic"));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saveStatus, setSaveStatus] = useState("尚未输入");
  const [modelLabel, setModelLabel] = useState("读取全局模型设置中…");
  const [assisted, setAssisted] = useState(false);
  const [parentVersionId, setParentVersionId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(2400);
  const [selectedWord, setSelectedWord] = useState("");
  const [undo, setUndo] = useState<{ text: string; ids: string[] }[]>([]);
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [highlight, setHighlight] = useState("");
  const current = useRef<WritingDocument | null>(null), savedSignature = useRef("");
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const retrySubmission = useRef<{ id: string; revision: number; assisted: boolean; parent: string | null; requestId: string } | null>(null);
  const lineage = useRef({ assisted, parentVersionId });
  const mounted = useRef(true);
  const backupKey = useCallback((id: string) => `english-writing:${userId}:${id}`, [userId]);
  const refresh = useCallback(async () => { const result = await api<{ documents: WritingSummary[] }>("/api/writing"); if (mounted.current) setHistory(result.documents); }, []);
  const update = (patch: Partial<WritingInput>) => {
    if (!current.current) return;
    const next = { ...current.current, ...patch }; current.current = next; setDoc(next); setSaveStatus("有未保存的修改");
    try { localStorage.setItem(backupKey(next.id), JSON.stringify({ ...next, versions: undefined, backupAt: new Date().toISOString(), ...lineage.current })); } catch { /* Server autosave remains available. */ }
  };
  const persist = useCallback(async () => {
    const target = current.current;
    if (!target) return null;
    const operation = saveQueue.current.catch(() => undefined).then(async () => {
      const latest = current.current;
      if (!latest || latest.id !== target.id) return null;
      if (fields(latest) === savedSignature.current) return latest;
      const snapshot = { ...latest };
      if (mounted.current) setSaveStatus("保存中…");
      const result = await api<{ document: WritingDocument }>("/api/writing", json({ ...snapshot, versions: undefined, expectedRevision: snapshot.revision }));
      if (current.current?.id === snapshot.id) {
        savedSignature.current = fields(snapshot);
        const next = { ...current.current, revision: result.document.revision, updatedAt: result.document.updatedAt };
        current.current = next;
        if (mounted.current) { setDoc(next); setSaveStatus(fields(next) === savedSignature.current ? "已保存到本机" : "有未保存的修改"); }
        try {
          if (fields(next) === savedSignature.current) localStorage.removeItem(backupKey(next.id));
          else localStorage.setItem(backupKey(next.id), JSON.stringify({ ...next, versions: undefined, backupAt: new Date().toISOString(), ...lineage.current }));
        } catch { /* The database save succeeded. */ }
        return next;
      }
      return result.document;
    });
    saveQueue.current = operation;
    try { return await operation; } catch (failure) { if (mounted.current) setSaveStatus("保存失败，请重试保存"); throw failure; }
  }, [backupKey]);
  const activate = useCallback((value: WritingDocument) => {
    let next = value, restored = false, priorAssisted = value.assisted === true, priorParent: string | null = value.parentVersionId || null;
    const checkpoint = seed.draft as (WritingInput & { id: string; revision: number }) | undefined;
    if (checkpoint?.id === value.id && checkpoint.revision >= value.revision) {
      try {
        const checked = validateWritingInput(checkpoint);
        next = { ...value, ...checked }; restored = fields(next) !== fields(value);
        priorAssisted = checked.assisted === true; priorParent = checked.parentVersionId || null;
      } catch { /* A malformed UI checkpoint never replaces the saved essay. */ }
    }
    try {
      const raw = JSON.parse(readLocalStorage(backupKey(value.id)) || "null");
      if (!checkpoint && raw && raw.id === value.id && typeof raw.backupAt === "string" && raw.backupAt > value.updatedAt && ["free", "task2"].includes(raw.mode) && typeof raw.text === "string" && typeof raw.title === "string" && typeof raw.prompt === "string") {
        validateWritingInput(raw);
        next = { ...value, text: raw.text, title: raw.title, prompt: raw.prompt, mode: raw.mode, assisted: raw.assisted === true, parentVersionId: raw.parentVersionId };
        restored = true; priorAssisted = raw.assisted === true; priorParent = value.versions.some(v => v.id === raw.parentVersionId) ? raw.parentVersionId : null;
      }
    } catch { /* Ignore unavailable/corrupt browser backups; use the saved document. */ }
    savedSignature.current = fields(value); current.current = next; setDoc(next); setSelectedId(value.versions.at(-1)?.id || "");
    lineage.current = { assisted: priorAssisted, parentVersionId: priorParent }; setAssisted(priorAssisted); setParentVersionId(priorParent);
    setSaveStatus(restored ? "已恢复浏览器中的未保存草稿" : value.revision ? "已保存到本机" : "尚未输入");
    setNotice(restored ? "已恢复上次未保存的修改，将自动保存到本机。" : ""); setUndo([]); setAppliedIds([]); setIgnored([]); setDeadline(null); setSeconds(2400);
    setSelectedWord(""); setPromptOpen(false); setHighlight(value.versions.at(-1)?.review.corrections[0]?.id || "");
    setPanel(value.versions.length && next.text === value.versions.at(-1)?.text && !restored ? "annotations" : "editor"); retrySubmission.current = null;
    if (checkpoint?.id === value.id) {
      const version = draftString(seed, "selectedId"); if (value.versions.some(v => v.id === version)) setSelectedId(version);
      setPanel(draftChoice(seed, "panel", ["editor", "annotations", "feedback"], "editor")); setPromptOpen(draftFlag(seed, "promptOpen"));
      setDeadline(typeof seed.deadline === "number" ? seed.deadline : null); setSeconds(draftNumber(seed, "seconds", 2400)); setHighlight(draftString(seed, "highlight"));
      setAppliedIds(Array.isArray(seed.appliedIds) ? seed.appliedIds.filter((v): v is string => typeof v === "string") : []);
      setIgnored(Array.isArray(seed.ignored) ? seed.ignored.filter((v): v is string => typeof v === "string") : []);
    }
    window.history.replaceState(null, "", `/writing?id=${value.id}`);
  }, [backupKey, seed]);
  usePracticeCheckpoint("writing", doc ? `/writing?id=${doc.id}` : "/writing", { draft: doc ? { id: doc.id, revision: doc.revision, title: doc.title, text: doc.text, prompt: doc.prompt, mode: doc.mode, assisted, parentVersionId } : null, panel, selectedId, topic, promptOpen, deadline, seconds, highlight, appliedIds, ignored }, Boolean(doc && (doc.text || doc.title || doc.prompt)), busy || opening, async () => { await persist(); });

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const result = await api<{ documents: WritingSummary[] }>("/api/writing");
        if (!mounted.current) return; setHistory(result.documents);
        const id = initialId;
        if (id) {
          let unsaved: WritingDocument | null = null;
          if (isWritingId(id) && !result.documents.some(d => d.id === id)) {
            try { const cached = (seed.draft as { id?: string } | undefined)?.id === id ? seed.draft : JSON.parse(readLocalStorage(backupKey(id)) || "null"); if (cached?.id === id) { validateWritingInput(cached); unsaved = { ...blank(), id, updatedAt: "1970-01-01T00:00:00.000Z" }; } } catch { /* Invalid browser backup is ignored. */ }
          }
          const value = unsaved || (await api<{ document: WritingDocument }>(`/api/writing/${encodeURIComponent(id)}`)).document;
          if (mounted.current) activate(value);
        }
        else activate(blank());
      } catch (failure) { if (mounted.current) { setError(failure instanceof Error ? failure.message : "打开写作记录失败。"); activate(blank()); } }
    })();
    void api<{ message: string }>("/api/models/conversation").then(value => { if (mounted.current) setModelLabel(value.message); }).catch(() => { if (mounted.current) setModelLabel("模型状态暂不可用，可在设置中检查连接。"); });
    return () => { mounted.current = false; };
  }, [activate, backupKey, initialId, seed]);
  useEffect(() => {
    if (!doc || fields(doc) === savedSignature.current) return;
    const timer = setTimeout(() => { void persist().catch(failure => { if (mounted.current) setError(failure instanceof Error ? failure.message : "保存失败。"); }); }, 900);
    return () => clearTimeout(timer);
  }, [doc, persist]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => { if (current.current && fields(current.current) !== savedSignature.current) event.preventDefault(); };
    window.addEventListener("beforeunload", listener); return () => window.removeEventListener("beforeunload", listener);
  }, []);
  useEffect(() => {
    if (!deadline) return;
    const tick = () => { const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setSeconds(left); if (!left) { setDeadline(null); setNotice("40 分钟已结束。正文已保留，你可以自行决定何时提交。"); } };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [deadline]);

  const open = async (id?: string) => {
    setOpening(true); setError("");
    try { await persist(); if (id) activate((await api<{ document: WritingDocument }>(`/api/writing/${id}`)).document); else activate(blank()); await refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "打开失败。"); } finally { setOpening(false); }
  };
  const generate = async () => {
    if (!doc) return; setBusy(true); setError("");
    try { const data = await api<{ title: string; prompt: string }>("/api/writing/prompt", json({ topic, mode: doc.mode })); update({ title: data.title, prompt: data.prompt }); setNotice("已生成原创模拟题，请先审题再写作。"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "题目生成失败。"); } finally { setBusy(false); }
  };
  const review = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const snapshot = await persist(); if (!snapshot) throw new Error("请先填写写作内容。");
      if (!retrySubmission.current || retrySubmission.current.id !== snapshot.id || retrySubmission.current.revision !== snapshot.revision || retrySubmission.current.assisted !== assisted || retrySubmission.current.parent !== parentVersionId) {
        retrySubmission.current = { id: snapshot.id, revision: snapshot.revision, assisted, parent: parentVersionId, requestId: crypto.randomUUID() };
      }
      const value = await api<{ document: WritingDocument; version: WritingVersion; recordWarning: string }>(`/api/writing/${snapshot.id}/review`, json({ requestId: retrySubmission.current.requestId, draftRevision: snapshot.revision, assisted, parentVersionId }));
      const next = { ...current.current!, versions: value.document.versions }; current.current = next; setDoc(next); setSelectedId(value.version.id); setIgnored([]); setUndo([]); setAppliedIds([]);
      setNotice(value.recordWarning || "批改已保存。先理解问题，再修改并提交复评。"); setHighlight(value.version.review.corrections[0]?.id || ""); setPanel("annotations");
      document.getElementById("writing-top")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
      window.dispatchEvent(new Event("learning-records-updated")); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "批改失败，草稿已保留。"); } finally { setBusy(false); }
  };
  const version = doc?.versions.find(v => v.id === selectedId), count = writingWordCount(doc?.text || "");
  const revise = () => {
    if (!version || busy) return;
    setUndo(values => [...values, { text: current.current?.text || "", ids: appliedIds }]);
    lineage.current = { assisted: true, parentVersionId: version.id }; setAssisted(true); setParentVersionId(version.id);
    update({ text: version.text, mode: version.mode, prompt: version.prompt, title: version.title, assisted: true, parentVersionId: version.id }); setAppliedIds([]);
    setIgnored([]); setNotice("已将该版本复制到草稿，历史原稿保留。可以自己修改或采用建议，再提交复评。");
    setPanel("editor"); document.getElementById("writing-top")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
    requestAnimationFrame(() => document.getElementById("writing-editor")?.focus({ preventScroll: true }));
  };
  const apply = (edit?: WritingEdit) => {
    if (!version || !doc) return;
    try {
      const expected = applyWritingEdits(version.text, version.review.corrections.filter(e => appliedIds.includes(e.id)));
      if (doc.text !== expected) throw new Error("草稿已经改动，请参考建议自行修改，或重新批改后再采用。");
      const ids = [...new Set([...appliedIds, ...(edit ? [edit.id] : version.review.corrections.filter(e => !ignored.includes(e.id)).map(e => e.id))])];
      const text = applyWritingEdits(version.text, version.review.corrections.filter(e => ids.includes(e.id)));
      setUndo(values => [...values, { text: doc.text, ids: appliedIds }]); setAppliedIds(ids);
      lineage.current = { assisted: true, parentVersionId: version.id }; setAssisted(true); setParentVersionId(version.id);
      update({ text, assisted: true, parentVersionId: version.id }); setPanel("editor"); document.getElementById("writing-top")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" }); setNotice("已应用到草稿，原稿及原评分保留。其他建议可继续手动参考；修改完成后重新批改。");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "无法应用建议。"); }
  };
  const collect = async () => {
    if (!doc || !selectedWord) return;
    try { await persist(); await api("/api/vocabulary/collect", json({ word: selectedWord, source: { module: "writing", resourceId: doc.id } })); setNotice(`已将 ${selectedWord} 加入本地生词库。可到单词模块补充释义并复习。`); setSelectedWord(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "收藏失败。"); }
  };
  const captureWord = () => { const text = window.getSelection()?.toString().trim() || ""; if (/^[A-Za-z][A-Za-z' -]{0,79}$/.test(text) && text.split(/\s+/).length <= 8) setSelectedWord(text); };
  const showPanel = (next: typeof panel) => {
    setPanel(next);
    requestAnimationFrame(() => { const heading = document.getElementById("writing-view-" + next); heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: "start", behavior: "auto" }); });
  };
  const locateIssue = (id: string) => {
    setHighlight(id);
    requestAnimationFrame(() => { const target = document.getElementById("writing-edit-" + id); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }); });
  };
  const locateOriginal = (id: string) => {
    const target = document.getElementById("writing-mark-" + id);
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  };
  if (!doc) return <main className="writing-page"><h1 tabIndex={-1}>{label("写作", "Writing")}</h1><p role="status" className="writing-loading">{label("正在打开本地写作空间…", "Opening your writing workspace…")}</p></main>;
  const disabled = busy || opening;
  const canApply = Boolean(version && doc.text === applyWritingEdits(version.text, version.review.corrections.filter(e => appliedIds.includes(e.id))));
  const corrections = version?.review.corrections ?? [];
  const activeEdit = corrections.find(e => e.id === highlight) || corrections[0];
  const activeIndex = activeEdit ? corrections.indexOf(activeEdit) : -1;
  const chooseVersion = (id: string) => { setSelectedId(id); setIgnored([]); setAppliedIds([]); setHighlight(doc.versions.find(v => v.id === id)?.review.corrections[0]?.id || ""); };
  return <main className="writing-page">
    <header id="writing-top" className="writing-heading"><h1 tabIndex={-1}>{label("写作", "Writing")}</h1><div className="writing-actions"><button className="piano-button" disabled={disabled} onClick={() => void open()}>{label("新建作文", "New essay")}<PianoIcon name="plus" /></button><button className="piano-text-button" aria-expanded={historyOpen} aria-controls="writing-history" disabled={disabled} onClick={() => setHistoryOpen(!historyOpen)}>{label("写作历史", "Writing history")}</button></div></header>
    {historyOpen && <section id="writing-history" className="writing-history" aria-label={label("本地写作历史", "Local writing history")}><h2>{label("本地写作历史", "Local writing history")}</h2>{history.length ? history.map(item => <button key={item.id} disabled={disabled} aria-pressed={doc.id === item.id} onClick={() => { setHistoryOpen(false); void open(item.id); }}><span>{item.title || label("未命名作文", "Untitled essay")}</span><span>{label(item.versionCount + " 稿", item.versionCount + " submissions")} · {new Date(item.updatedAt).toLocaleDateString(dateLocale)}</span></button>) : <p>{label("保存草稿后，会在这里显示。", "Saved drafts appear here.")}</p>}</section>}
    <div className="writing-documentbar">
      <label>{label("当前作文", "Essay")}<select className="piano-field" disabled={disabled} value={history.some(h => h.id === doc.id) ? doc.id : ""} onChange={e => { if (e.target.value) void open(e.target.value); }}><option value="">{label("当前新文章", "Current new essay")}</option>{history.map(h => <option key={h.id} value={h.id}>{h.title || label("未命名作文", "Untitled essay")}</option>)}</select></label>
      <label>{label("批改版本", "Submission")}<select className="piano-field" disabled={disabled || !doc.versions.length} value={selectedId} onChange={e => chooseVersion(e.target.value)}><option value="">{label("尚未批改", "Not reviewed yet")}</option>{doc.versions.map(v => <option key={v.id} value={v.id}>{label("第 " + v.number + " 稿", "Submission " + v.number)} · {label(v.assisted ? "修改稿" : "自主写作", v.assisted ? "Assisted" : "Independent")}{v.review.band === null ? "" : " · " + v.review.band.toFixed(1)}</option>)}</select></label>
      {version && <button className="piano-button piano-button--primary writing-revise" disabled={disabled} onClick={revise}>{label("以此稿开始修改", "Revise this submission")}<PianoIcon name="arrow-right" /></button>}
    </div>
    <nav className="writing-nav" aria-label={label("写作工作区", "Writing workspace")}>{([["editor", label("写作草稿", "Write")], ["annotations", label("原文批注", "Annotated original")], ["feedback", label("评分反馈", "Feedback")]] as const).map(([id, text]) => <button key={id} disabled={disabled} aria-pressed={panel === id} onClick={() => showPanel(id)}>{text}</button>)}</nav>
    {error && <p role="alert" className="writing-notice">{<UiText text={error} />}</p>}
    {notice && <p role="status" className="writing-status"><UiText text={notice} /></p>}
    {busy && <p role="status" className="writing-notice">{label("正在完成模型请求，请保持页面打开。草稿已保留。", "Waiting for the model. Keep this page open; your draft is retained.")}</p>}
    {panel === "editor" && <section className="writing-editor-view" aria-label={label("写作草稿", "Writing draft")}>
      <div className="writing-editor-fields"><label>{label("写作类型", "Writing type")}<select className="piano-field" disabled={disabled || doc.versions.length > 0} value={doc.mode} onChange={e => update({ mode: e.target.value as WritingInput["mode"] })}><option value="task2">{label("雅思 Academic Task 2", "IELTS Academic Task 2")}</option><option value="free">{label("自由写作", "Free writing")}</option></select></label><label>{label("标题", "Title")}<input className="piano-field" maxLength={160} value={doc.title} disabled={disabled} onChange={e => update({ title: e.target.value })} placeholder={label("给这篇文章起个名字", "Give your essay a title")} /></label></div>
      <details className="writing-prompt" open={promptOpen} onToggle={event => setPromptOpen(event.currentTarget.open)}><summary>{label("题目与出题设置", "Question and prompt settings")}<span>{label(doc.prompt ? "已填写题目" : doc.mode === "task2" ? "Task 2 估分需要完整题目" : "可选", doc.prompt ? "Question added" : doc.mode === "task2" ? "A question is needed for a Task 2 estimate" : "Optional")}</span></summary><div className="writing-prompt-content"><div className="writing-prompt-generate"><label>{label("出题话题（可选）", "Prompt topic (optional)")}<input className="piano-field" maxLength={100} value={topic} disabled={disabled} onChange={e => setTopic(e.target.value)} placeholder={label("例如：经济增长与生活质量", "For example: economic growth and quality of life")} /></label><button className="piano-button" disabled={disabled || !topic.trim()} onClick={() => void generate()}>{label("生成练习题", "Generate practice prompt")}</button></div><label>{label("完整题目", "Full question")}<textarea className="piano-field" lang="en" maxLength={3000} disabled={disabled} value={doc.prompt} onChange={e => update({ prompt: e.target.value })} placeholder={label("粘贴题目，或按上方话题生成。", "Paste your question, or generate one from a topic.")} /></label><p>{label(doc.mode === "task2" ? "Task 2 建议至少 250 词、约 40 分钟。参考估分需要完整题目，暂不支持 Task 1。系统出题为原创模拟题。" : "自由写作提供反馈，不换算雅思分数。系统出题为原创模拟题。", doc.mode === "task2" ? "Task 2: aim for at least 250 words in about 40 minutes. A complete question is required for a reference estimate. Task 1 is not available. Generated prompts are original practice questions." : "Free writing receives feedback without an IELTS score. Generated prompts are original practice questions.")}</p></div></details>
      <div className="writing-panel-title"><h2 id="writing-view-editor" tabIndex={-1}><label htmlFor="writing-editor">{label("写作草稿", "Writing draft")}</label></h2><div className="writing-timer"><span aria-label={label("剩余写作时间", "Remaining writing time")}>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</span><button className="piano-text-button" disabled={disabled} onClick={() => { if (deadline) setDeadline(null); else setDeadline(Date.now() + (seconds || 2400) * 1000); }}>{label(deadline ? "暂停计时" : "开始计时", deadline ? "Pause timer" : "Start timer")}</button><button className="piano-text-button" disabled={disabled} onClick={() => { setDeadline(null); setSeconds(2400); }}>{label("重置", "Reset")}</button></div></div>
      <textarea id="writing-editor" lang="en" spellCheck={false} className="piano-field writing-draft" maxLength={16000} disabled={disabled} value={doc.text} onChange={e => update({ text: e.target.value })} onMouseUp={captureWord} placeholder={label("在这里开始写作。提交后再查看批改。", "Start writing here. Review is shown after you submit.")} />
      <div className="writing-draft-meta"><span>{label(count + " 词 · 最多 2000 词 / 16000 字符", count + " words · Up to 2000 words / 16000 characters")}</span><span role="status"><UiText text={saveStatus} /> <button disabled={disabled} className="piano-text-button" onClick={() => { setError(""); void persist().then(() => refresh()).catch(f => setError(f.message)); }}>{label("立即保存", "Save now")}</button></span></div>
      <div className="writing-submit"><label><input type="checkbox" checked={assisted} disabled={disabled} onChange={e => { setAssisted(e.target.checked); lineage.current.assisted = e.target.checked; update({ assisted: e.target.checked }); }} />{label("本稿使用过 AI 建议或范文辅助", "This draft uses AI suggestions or a model essay")}</label><div className="writing-actions"><button disabled={disabled || !undo.length} className="piano-text-button" onClick={() => { const prior = undo.at(-1); if (prior) { update({ text: prior.text }); setAppliedIds(prior.ids); setUndo(values => values.slice(0, -1)); } }}>{label("撤销采用建议", "Undo applied suggestion")}</button><button disabled={disabled || count < 5} className="piano-button piano-button--primary" onClick={() => void review()}>{label(busy ? "模型处理中…" : doc.versions.length ? "提交当前草稿复评" : "提交批改", busy ? "Processing…" : doc.versions.length ? "Submit for reassessment" : "Submit for review")}<PianoIcon name="arrow-right" /></button></div></div>
      {selectedWord && <div className="writing-collector"><span>{selectedWord}</span><button className="piano-text-button" disabled={disabled} onClick={() => void collect()}>{label("加入生词库", "Save to word library")}</button></div>}
    </section>}
    {panel !== "editor" && !version && <section className="writing-empty"><h2 id={"writing-view-" + panel} tabIndex={-1}>{label("先完成一次写作", "Start with your draft")}</h2><p>{label("提交批改后，这里会保存原文、纠错与评分反馈。", "After submission, your original, corrections and assessment stay here.")}</p><button className="piano-button piano-button--primary" disabled={disabled} onClick={() => showPanel("editor")}>{label("返回写作", "Return to writing")}<PianoIcon name="arrow-right" /></button></section>}
    {panel === "annotations" && version && <>
      <div className="writing-scoreline"><span>{label(version.mode === "task2" ? "Task 2 参考" : "自由写作反馈", version.mode === "task2" ? "Task 2 reference" : "Free-writing feedback")}</span>{version.review.band !== null && <strong>{version.review.band.toFixed(1)}<small> / 9</small></strong>}<div>{version.review.criteria.map(c => <span key={c.id}>{c.id} <b>{c.band === null ? "—" : c.band}</b></span>)}</div><button className="piano-text-button" onClick={() => showPanel("feedback")}>{label("查看四项完整报告", "View full assessment")}</button></div>
      {version.review.proofreadingStatus === "partial" && <p className="writing-notice" role="status">{label("逐句检查仅完成 " + version.review.checkedSentences + "/" + version.review.totalSentences + " 句，请结合原文核对。", "Sentence checking completed for " + version.review.checkedSentences + "/" + version.review.totalSentences + " sentences. Check the original alongside the feedback.")}</p>}
      {version.review.assessmentStatus === "unavailable" && <p className="writing-notice" role="status">{label("篇章反馈未完成，当前保留语言纠错，不提供雅思估分。", "The overall assessment is incomplete. Language corrections are retained; no IELTS estimate is available.")}</p>}
      <div className="writing-annotations"><section className="writing-original" onMouseUp={captureWord}><div className="writing-panel-title"><h2 id="writing-view-annotations" tabIndex={-1}>{label("第 " + version.number + " 稿原文", "Submission " + version.number)}</h2><span>{label("已提交原文 · 只读", "Submitted original · Read only")}</span></div><h3 className="writing-essay-title" lang="en">{version.title || label("未命名作文", "Untitled essay")}</h3>{version.prompt && <details className="writing-original-prompt"><summary>{label("查看本稿题目", "Question for this submission")}</summary><p lang="en">{version.prompt}</p></details>}
        <MarkedEssay version={version} selected={activeEdit?.id || ""} onLocate={locateIssue} />
        <div className="writing-original-meta"><span>{label(version.review.wordCount + " 词", version.review.wordCount + " words")} · {label(corrections.length + " 处纠错建议", corrections.length + " corrections")}</span><span>{label(version.assisted ? "修改稿" : "自主写作", version.assisted ? "Assisted revision" : "Independent writing")}</span></div>
        <div className="writing-original-actions"><button disabled={disabled || !selectedWord} className="piano-text-button" onClick={() => void collect()}>{selectedWord ? label("收藏 “" + selectedWord + "”", 'Save "' + selectedWord + '"') : label("选词后加入生词库", "Select text to save a word")}</button><button disabled={disabled || !canApply || !corrections.some(e => !ignored.includes(e.id) && !appliedIds.includes(e.id))} className="piano-text-button" onClick={() => apply()}>{label("采用全部未忽略纠错", "Apply all remaining corrections")}</button></div>
      </section><aside className="writing-margin" aria-label={label("与原文关联的纠错建议", "Corrections linked to the original")}>
        <div className="writing-panel-title"><h2>{label("原文中的建议", "Corrections")}</h2>{activeEdit && <div className="writing-issue-step"><span>{activeIndex + 1} / {corrections.length}</span><button className="piano-icon-button" disabled={disabled || activeIndex <= 0} aria-label={label("上一条建议", "Previous correction")} onClick={() => locateIssue(corrections[activeIndex - 1].id)}><PianoIcon name="arrow-left" /></button><button className="piano-icon-button" disabled={disabled || activeIndex >= corrections.length - 1} aria-label={label("下一条建议", "Next correction")} onClick={() => locateIssue(corrections[activeIndex + 1].id)}><PianoIcon name="arrow-right" /></button></div>}</div>
        <p className="writing-helper">{label("点击原文标记，查看对应原因与修改。", "Select a marked phrase to inspect the correction.")}</p>
        {activeEdit ? <article className="writing-selected-issue" id={"writing-edit-" + activeEdit.id} tabIndex={-1} aria-label={label("选中的纠错建议", "Selected correction")}>
          <div className="writing-issue-meta"><strong>{activeIndex + 1}</strong><span><UiText text={activeEdit.category} /> · {activeEdit.engine === "llm" ? "LLM" : "LanguageTool"}</span>{ignored.includes(activeEdit.id) && <span>{label("已忽略", "Ignored")}</span>}{appliedIds.includes(activeEdit.id) && <span>{label("已采用", "Applied")}</span>}</div>
          <div className="writing-correction-text"><del lang="en">{activeEdit.original}</del><PianoIcon name="arrow-right" /><strong lang="en">{activeEdit.corrected || label("删除这一处", "Remove this text")}</strong></div><p className="writing-explanation">{activeEdit.explanation}</p>
          <div className="writing-actions"><button className="piano-button piano-button--primary" disabled={disabled || !canApply || ignored.includes(activeEdit.id) || appliedIds.includes(activeEdit.id)} onClick={() => apply(activeEdit)}>{label("采用到草稿", "Apply to draft")}</button><button className="piano-button" disabled={disabled} onClick={() => setIgnored(values => values.includes(activeEdit.id) ? values.filter(id => id !== activeEdit.id) : [...values, activeEdit.id])}>{label(ignored.includes(activeEdit.id) ? "恢复建议" : "忽略此建议", ignored.includes(activeEdit.id) ? "Restore suggestion" : "Ignore suggestion")}</button></div><p className="writing-helper">{label("采用后更新草稿，提交原文与原评分保留。", "Applying updates the draft; the submitted original and score stay saved.")}</p>
          {!canApply && <p className="writing-helper">{label("草稿已有改动，请参考建议手动修改，或从本稿重新开始。", "The draft has changed. Revise manually, or start again from this submission.")}</p>}
          <button className="piano-text-button writing-return" onClick={() => locateOriginal(activeEdit.id)}>{label("定位原文", "Locate in original")}<PianoIcon name="arrow-right" /></button>
        </article> : <p className="writing-empty-copy">{label("本次未标出明确的语言错误，不代表已通过人工校对。", "No specific language errors were flagged. This does not replace human proofreading.")}</p>}
        {corrections.length > 1 && <div className="writing-other-issues" aria-label={label("全部纠错建议", "All corrections")}>{corrections.map((edit, index) => <button key={edit.id} aria-pressed={activeEdit?.id === edit.id} disabled={disabled} onClick={() => locateIssue(edit.id)}><span>{index + 1}</span><span lang="en">{edit.original}</span><small>{label(ignored.includes(edit.id) ? "已忽略" : appliedIds.includes(edit.id) ? "已采用" : edit.category, ignored.includes(edit.id) ? "Ignored" : appliedIds.includes(edit.id) ? "Applied" : edit.category)}</small></button>)}</div>}
        {!!version.review.omittedCorrections && <p className="writing-notice">{label(version.review.omittedCorrections + " 条建议无法确定位置，已隐藏。请结合原文核对或更换全局模型复查。", version.review.omittedCorrections + " suggestions could not be positioned reliably and are hidden. Check the original or reassess with another model.")}</p>}
        <div className="writing-margin-footer"><button className="piano-text-button" onClick={() => showPanel("feedback")}>{label("可选表达与针对性练习", "Expressions and practice")}<PianoIcon name="arrow-right" /></button><p>{label("表达拓展与语言错误分别展示。", "Expression suggestions are separate from errors.")}</p></div>
      </aside></div>
    </>}
    {panel === "feedback" && version && <section className="writing-feedback-view"><h2 id="writing-view-feedback" tabIndex={-1} className="writing-report-heading">{label("评分与完整反馈", "Assessment and feedback")}</h2><WritingReport version={version} previous={doc.versions.find(v => v.id === version.parentVersionId) || doc.versions.find(v => v.number === version.number - 1)} onRevise={revise} disabled={disabled} /></section>}
    <details className="writing-model"><summary>{label("模型连接与设置", "Model connection and settings")}</summary><p><UiText text={modelLabel} /></p><Link className="piano-text-link" href="/settings/models">{label("模型设置", "Model settings")}<PianoIcon name="arrow-right" /></Link></details>
  </main>;
}

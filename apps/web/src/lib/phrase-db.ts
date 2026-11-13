import { DatabaseSync } from "node:sqlite";
import { checkPhraseAnswer, containsPhrase, PhraseError, phraseText, validatePhraseContent, type PhraseAttempt, type PhraseCatalog, type PhraseContent, type PhraseEntry, type PhraseProgress, type PhraseSentenceFeedback, type PhraseSnapshot } from "./phrases";

export function openPhraseDatabase(path: string) {
  const db = new DatabaseSync(path);
  try { db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS phrase_progress (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS phrase_content (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS phrase_units (id TEXT PRIMARY KEY, read_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS phrase_attempts (id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, payload TEXT NOT NULL);`); }
  catch(error) { db.close(); throw error; } return db;
}
export type PhraseDatabase = ReturnType<typeof openPhraseDatabase>;
function get<T>(db: PhraseDatabase, table: string, id: string): T | undefined { const row=db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id); return row ? JSON.parse(row.payload as string) as T : undefined; }
function transaction<T>(db: PhraseDatabase, work:()=>T) { db.exec("BEGIN IMMEDIATE"); try { const value=work(); db.exec("COMMIT"); return value; } catch(error) { db.exec("ROLLBACK"); throw error; } }
export function phraseProgress(db: PhraseDatabase, id: string): PhraseProgress | undefined {
  const old=get<PhraseProgress>(db,"phrase_progress",id);
  return old?{id:old.id,revision:old.revision,saved:old.saved}:undefined;
}
function progress(db: PhraseDatabase,id: string,revision: unknown) {
  const old=phraseProgress(db,id);
  if (!Number.isInteger(revision) || revision!==(old?.revision ?? 0)) throw new PhraseError("这条短语已更新，请重新打开后继续。",409);
  return old || {id,revision:0,saved:false};
}
function putProgress(db: PhraseDatabase,value: PhraseProgress) { value.revision++; db.prepare("INSERT INTO phrase_progress VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(value.id,JSON.stringify({...get<Record<string,unknown>>(db,"phrase_progress",value.id),...value})); }
export function phraseEntry(db: PhraseDatabase,catalog: PhraseCatalog,id: unknown) {
  const base=catalog.entries.find(e=>e.id===id); if(!base) throw new PhraseError("短语不存在。",404);
  const content=get<PhraseContent>(db,"phrase_content",base.id);
  return {...base,...(content?{content}:{}),progress:phraseProgress(db,base.id)};
}
export function phraseSnapshot(db: PhraseDatabase,catalog: PhraseCatalog,query: { search?:string; book?:string; level?:string; unit?:string; saved?:boolean; page?:number }={}): PhraseSnapshot {
  const overlays=new Map(db.prepare("SELECT id,payload FROM phrase_content").all().map(r=>[String(r.id),JSON.parse(r.payload as string) as PhraseContent]));
  const states=new Map(db.prepare("SELECT id,payload FROM phrase_progress").all().map(r=>[String(r.id),JSON.parse(r.payload as string) as PhraseProgress]));
  const all=catalog.entries.map(e=>({...e,...(overlays.has(e.id)?{content:overlays.get(e.id)}:{}),progress:states.has(e.id)?{id:e.id,revision:states.get(e.id)!.revision,saved:states.get(e.id)!.saved}:undefined}));
  const scoped=all.filter(e=>(!query.book || e.sources.some(s=>s.book===query.book)) && (!query.level || e.level===query.level) && (!query.unit || e.unit===query.unit) && (!query.saved || e.progress?.saved));
  const search=(query.search || "").trim().toLowerCase();
  const filtered=scoped.filter(e=>!search || [e.phrase,e.content?.teachingPhrase||"",e.content?.meaningZh||"",...e.variants].some(v=>v.toLowerCase().includes(search)));
  const read = new Set(db.prepare("SELECT id FROM phrase_units").all().map(r=>r.id));
  return {entries:filtered.slice((query.page||0)*24,((query.page||0)+1)*24),total:filtered.length,units:catalog.units.map(u=>({...u,read:read.has(u.id)})),books:catalog.books,
    courses:catalog.courses.map(c=>({...c,readUnits:c.unitIds.filter(id=>read.has(id)).length})),readUnits:catalog.units.filter(u=>read.has(u.id)).length};
}
export function savePhraseContent(db:PhraseDatabase,catalog:PhraseCatalog,id:unknown,revision:unknown,input:unknown,origin:PhraseContent["origin"]) {
  const entry=phraseEntry(db,catalog,id), content=validatePhraseContent(input,origin);
  // Metadata comes from the selected provider, not arbitrary manual object keys.
  if(origin==="ai") for(const key of ["provider","model"] as const) if(typeof (input as PhraseContent)[key]==="string") content[key]=(input as PhraseContent)[key]!.slice(0,160);
  return transaction(db,()=>{const state=progress(db,entry.id,revision);db.prepare("INSERT INTO phrase_content VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(entry.id,JSON.stringify(content));putProgress(db,state);return phraseEntry(db,catalog,entry.id);});
}
export function setPhraseSaved(db:PhraseDatabase,catalog:PhraseCatalog,id:unknown,revision:unknown,saved:unknown) {
  const entry=phraseEntry(db,catalog,id); if(typeof saved!=="boolean") throw new PhraseError("收藏参数无效。");
  return transaction(db,()=>{const state=progress(db,entry.id,revision);state.saved=saved;putProgress(db,state);return phraseEntry(db,catalog,entry.id);});
}
export function markPhraseUnit(db:PhraseDatabase,catalog:PhraseCatalog,id:unknown) { if(!catalog.units.some(u=>u.id===id)) throw new PhraseError("学习单元不存在。");db.prepare("INSERT INTO phrase_units VALUES (?,?) ON CONFLICT(id) DO UPDATE SET read_at=excluded.read_at").run(String(id),new Date().toISOString()); }
export function savePhraseAttempt(db:PhraseDatabase,catalog:PhraseCatalog,input:{id:unknown;entryId:unknown;kind:unknown;text:unknown}) {
  const entry=phraseEntry(db,catalog,input.entryId);if(!entry.content)throw new PhraseError("请先准备学习内容。");
  if(typeof input.id!=="string"||!/^[a-f0-9-]{36}$/i.test(input.id)||!["recall","cloze","sentence"].includes(String(input.kind)))throw new PhraseError("练习参数无效。");
  const text=phraseText(input.text,800,"回答"), kind=input.kind as PhraseAttempt["kind"];
  return transaction(db,()=>{const old=get<PhraseAttempt>(db,"phrase_attempts",input.id as string);if(old){if(old.entryId!==entry.id||old.kind!==kind||old.text!==text)throw new PhraseError("练习请求编号已使用。",409);return old;}
    const value:PhraseAttempt={id:input.id as string,entryId:entry.id,kind,text,createdAt:new Date().toISOString(),correct:kind==="sentence"?null:checkPhraseAnswer(entry.content!,kind,text)};
    db.prepare("INSERT INTO phrase_attempts VALUES (?,?,?)").run(value.id,entry.id,JSON.stringify(value));return value;});
}
export function phraseAttempt(db:PhraseDatabase,id:string) {const attempt=get<PhraseAttempt>(db,"phrase_attempts",id);if(!attempt)throw new PhraseError("练习记录不存在。",404);return attempt;}
export function savePhraseFeedback(db:PhraseDatabase,id:string,text:string,feedback:PhraseSentenceFeedback) {return transaction(db,()=>{const value=phraseAttempt(db,id);if(value.text!==text||value.kind!=="sentence")throw new PhraseError("造句已经改变，请重新点评。",409);value.feedback=feedback;db.prepare("UPDATE phrase_attempts SET payload=? WHERE id=?").run(JSON.stringify(value),id);return value;});}
export function phraseHistory(db:PhraseDatabase,id:string) {return db.prepare("SELECT payload FROM phrase_attempts WHERE entry_id=? ORDER BY rowid DESC LIMIT 10").all(id).map(r=>JSON.parse(r.payload as string) as PhraseAttempt);}
export function localSentenceCheck(entry:PhraseEntry,text:string) {return {targetUsed:Boolean(entry.content&&containsPhrase(text,entry.content.sentencePatterns)),wordCount:normalizeWords(text)};}
function normalizeWords(text:string) {return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g)||[]).length;}

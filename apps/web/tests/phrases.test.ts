import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { containsPhrase, checkPhraseAnswer, validatePhraseContent, type PhraseCatalog, type PhraseContent } from "../src/lib/phrases.ts";
import { openPhraseDatabase, phraseEntry, phraseSnapshot, savePhraseAttempt, savePhraseContent, setPhraseSaved, markPhraseUnit, phraseHistory, savePhraseFeedback } from "../src/lib/phrase-db.ts";

import { phraseFixture } from "./fixtures/phrase-fixture.ts";
const fullPack=existsSync(new URL("../../../deployment/phrases/catalog.json",import.meta.url));
const catalog=fullPack?JSON.parse(readFileSync(new URL("../../../deployment/phrases/catalog.json",import.meta.url),"utf8")) as PhraseCatalog:phraseFixture();
const lessons=fullPack?JSON.parse(readFileSync(new URL("../../../deployment/phrases/lessons.json",import.meta.url),"utf8")) as {entries:{phrase:string;unit:string;content:PhraseContent}[];units:PhraseCatalog["units"]}:{entries:catalog.entries.map(e=>({phrase:e.phrase,unit:e.unit!,content:e.content!})),units:catalog.units};
for(const row of lessons.entries){const e=catalog.entries.find(e=>e.phrase===row.phrase)!;assert.ok(e,row.phrase);e.content=validatePhraseContent(row.content,row.content.origin);e.unit=row.unit;}
if(fullPack)catalog.courses=JSON.parse(readFileSync(new URL("../../../deployment/phrases/courses.json",import.meta.url),"utf8")).courses;
catalog.units=lessons.units.map(u=>({...u,entryIds:catalog.entries.filter(e=>e.unit===u.id).map(e=>e.id)}));
const ready=catalog.entries.filter(e=>e.content), fixture={...catalog,entries:ready.slice(0,6)};

test("source hierarchy has 750 Oxford heads, 2468 real Pearson rows and no invented missing index",{skip:fullPack?false:"Optional publisher source pack is not distributed"},()=>{
 assert.equal(catalog.entries.length,3213);const sources=catalog.entries.flatMap(e=>e.sources);
 assert.equal(sources.filter(s=>s.book==="oxford").length,750);const pte=sources.filter(s=>s.book==="pte");assert.equal(pte.length,2468);
 assert.deepEqual([...Array(2469)].map((_,i)=>i+1).filter(n=>!pte.some(p=>p.number===n)),[2087]);
 assert.equal(new Set(catalog.entries.map(e=>e.id)).size,3213);
 assert.equal(catalog.entries.find(e=>e.phrase==="high value")?.sources[0].number,999);
 assert.equal(catalog.entries.find(e=>e.phrase==="high/er frequency")?.sources[0].number,1000);
 assert.ok(catalog.entries.some(e=>e.phrase==="greatly influenced (by)"));
});
test("published courses have reconstructable clozes and preserve the original pilot",{skip:fullPack?false:"Optional publisher source pack is not distributed"},()=>{
 assert.equal(ready.length,3213);assert.equal(ready.length,lessons.entries.length);assert.ok(catalog.units.length>=18);
 assert.equal(ready.filter(e=>e.content!.origin==="authored").length,48);
 assert.equal(ready.filter(e=>e.content!.origin==="ai").length,ready.length-48);
 for(const unit of catalog.units){assert.ok(unit.entryIds.length>=1&&unit.entryIds.length<=8,unit.id);if(!unit.id.startsWith("full-"))assert.equal(unit.entryIds.length,6,unit.id);}
 for(const entry of ready){const c=entry.content!;assert.ok(checkPhraseAnswer(c,"cloze",c.cloze.answers[0]));assert.ok(containsPhrase(c.example,c.sentencePatterns));}
});
test("all pilot lessons contain their six target structures and every cloze answer restores the example",{skip:fullPack?false:"Optional publisher source pack is not distributed"},()=>{
 for(const unit of catalog.units.filter(u=>u.id.startsWith("pilot-"))){
  for(const entry of ready.filter(e=>e.unit===unit.id)){
   const c=entry.content!;
   assert.ok(containsPhrase(unit.passage,c.sentencePatterns),`${unit.id}: ${entry.phrase}`);
   for(const answer of c.cloze.answers)assert.equal(c.cloze.prompt.replace("___",answer).toLowerCase(),c.example.toLowerCase(),entry.phrase);
  }
 }
});
test("pilot structures accept ordinary tense changes while retaining word boundaries",()=>{
 assert.ok(containsPhrase("They brought about a change.",["bring about sth"]));
 assert.ok(containsPhrase("She came up with an idea.",["come up with sth"]));
 assert.ok(containsPhrase("We undertook research last year.",["undertake research"]));
 assert.ok(containsPhrase("They are working on a new plan.",["work on sth"]));
 assert.ok(containsPhrase("She stuck to her plan.",["stick to sth"]));
 assert.equal(containsPhrase("The workaround was accepted.",["work on sth"]),false);
});
test("lexical checks respect boundaries, inflections and object slots without claiming grammar correctness",()=>{
 assert.ok(containsPhrase("We took the extra cost into consideration.",["take sth into consideration"]));
 assert.ok(containsPhrase("She carried the plan out.",["carry sth out"]));
 assert.ok(containsPhrase("She made a mistake.",["make a mistake"]));
 assert.equal(containsPhrase("This is a focused account.",["focus on sth"]),false);
 const c=ready.find(e=>e.phrase==="make a mistake")!.content!;
 assert.ok(checkPhraseAnswer(c,"recall"," MAKE   A MISTAKE! "));
 assert.ok(checkPhraseAnswer(c,"recall","make mistakes"));
 assert.equal(checkPhraseAnswer(c,"recall","commit an error"),false); // Other phrases may still be natural.
});
test("invalid generated teaching content is rejected instead of entering the learning queue",()=>{
 const content=structuredClone(ready[0].content!);content.cloze.prompt="An unrelated sentence.";
 assert.throws(()=>validatePhraseContent(content,"ai"));
 const wrong=structuredClone(ready[0].content!);wrong.cloze.prompt="___ and ___.";assert.throws(()=>validatePhraseContent(wrong,"ai"));
});
test("course hierarchy covers every topic once in related groups of six to ten",{skip:fullPack?false:"Optional publisher source pack is not distributed"},()=>{
 assert.equal(catalog.courses.length,103);
 const ids=catalog.courses.flatMap(c=>c.unitIds);assert.equal(ids.length,722);assert.equal(new Set(ids).size,722);
 assert.deepEqual(new Set(ids),new Set(catalog.units.map(u=>u.id)));
 for(const course of catalog.courses){assert.ok(course.unitIds.length>=6&&course.unitIds.length<=10);assert.ok(course.title&&course.titleEn&&course.category);}
});

test("reading completion and output practice track course progress without schedules",()=>{
 const db=openPhraseDatabase(":memory:");try{
  const e=fixture.entries[0];markPhraseUnit(db,fixture,e.unit);markPhraseUnit(db,fixture,e.unit);setPhraseSaved(db,fixture,e.id,0,true);
  savePhraseAttempt(db,fixture,{id:randomUUID(),entryId:e.id,kind:"sentence",text:"My original sentence."});
  const snap=phraseSnapshot(db,fixture);assert.equal(snap.readUnits,1);
  assert.equal(snap.courses.find(c=>c.unitIds.includes(e.unit!))?.readUnits,1);
  assert.equal("due" in snap,false);assert.equal("next" in snap,false);assert.equal("dailyNew" in snap,false);
  assert.equal("schedule" in phraseEntry(db,fixture,e.id).progress!,false);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  assert.equal(tables.includes("phrase_reviews"),false);assert.equal(tables.includes("phrase_settings"),false);
 }finally{db.close();}
});

test("legacy phrase scheduling is dormant and retained, while saves and notes still use revisions",()=>{
 const db=openPhraseDatabase(":memory:");try{
  const e=fixture.entries[0],old={id:e.id,revision:3,saved:false,schedule:{state:2,reps:5,due:"2027-01-01T00:00:00Z"},lastRating:4};
  db.prepare("INSERT INTO phrase_progress VALUES (?,?)").run(e.id,JSON.stringify(old));
  db.exec("CREATE TABLE phrase_reviews(id TEXT PRIMARY KEY,payload TEXT); INSERT INTO phrase_reviews VALUES('old','preserved');");
  const updated=setPhraseSaved(db,fixture,e.id,3,true);assert.equal(updated.progress?.revision,4);assert.equal("schedule" in updated.progress!,false);
  assert.throws(()=>setPhraseSaved(db,fixture,e.id,3,false),/已更新/);
  const raw=JSON.parse(db.prepare("SELECT payload FROM phrase_progress WHERE id=?").get(e.id)!.payload as string);
  assert.deepEqual(raw.schedule,old.schedule);assert.equal(raw.lastRating,4);assert.equal(db.prepare("SELECT payload FROM phrase_reviews").get()!.payload,"preserved");
  const snap=phraseSnapshot(db,fixture);assert.equal("schedule" in snap.entries[0].progress!,false);
 }finally{db.close();}
});

test("manual notes and asynchronous AI updates use revisions and leave the original catalog untouched",()=>{
 const db=openPhraseDatabase(":memory:");try{
  const e=fixture.entries[0],before=JSON.stringify(e),c={...e.content!,meaningZh:"手动核对后的释义"};
  savePhraseContent(db,fixture,e.id,0,c,"manual");assert.equal(phraseEntry(db,fixture,e.id).content?.meaningZh,c.meaningZh);
  assert.throws(()=>savePhraseContent(db,fixture,e.id,0,e.content,"ai"),/已更新/);assert.equal(JSON.stringify(e),before);
 }finally{db.close();}
});
test("attempt retries are idempotent, feedback stays attached to its original text, history is capped",()=>{
 const db=openPhraseDatabase(":memory:");try{
  const e=fixture.entries[0],body={id:randomUUID(),entryId:e.id,kind:"sentence",text:"This is my own original sentence."};
  const first=savePhraseAttempt(db,fixture,body);assert.deepEqual(savePhraseAttempt(db,fixture,body),first);
  assert.throws(()=>savePhraseAttempt(db,fixture,{...body,text:"Different text."}),/已使用/);
  assert.throws(()=>savePhraseFeedback(db,first.id,"Changed sentence.",{targetUsed:true,natural:true,corrected:first.text,explanation:"解释"}),/已经改变/);
  for(let i=0;i<12;i++)savePhraseAttempt(db,fixture,{...body,id:randomUUID()});assert.equal(phraseHistory(db,e.id).length,10);
 }finally{db.close();}
});
test("course progress and saved expressions survive reopening and remain learner-isolated",()=>{
 const dir=mkdtempSync(join(tmpdir(),"english-phrases-test-"));assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));
 try{let db=openPhraseDatabase(join(dir,"a.sqlite"));const e=fixture.entries[0];markPhraseUnit(db,fixture,e.unit);setPhraseSaved(db,fixture,e.id,0,true);const saved=phraseEntry(db,fixture,e.id).progress;db.close();
  db=openPhraseDatabase(join(dir,"a.sqlite"));assert.deepEqual(phraseEntry(db,fixture,e.id).progress,saved);assert.equal(phraseSnapshot(db,fixture).readUnits,1);db.close();
  const other=openPhraseDatabase(join(dir,"b.sqlite"));assert.equal(phraseEntry(other,fixture,e.id).progress,undefined);assert.equal(phraseSnapshot(other,fixture).readUnits,0);other.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test("teaching forms and source notes survive validation and are searchable without changing source IDs",()=>{
 const e=structuredClone(fixture.entries[0]);e.content=validatePhraseContent({...e.content,teachingPhrase:"corrected teaching form",sourceNote:"保留来源，学习自然表达。"},"ai");
 const db=openPhraseDatabase(":memory:");try{const c={...fixture,entries:[e]};assert.equal(phraseSnapshot(db,c,{search:"corrected teaching"}).total,1);assert.equal(e.id,fixture.entries[0].id);assert.equal(e.content.sourceNote,"保留来源，学习自然表达。");}finally{db.close();}
});


test("PDF import corrections preserve stable learner IDs and real source heads",{skip:fullPack?false:"Optional publisher source pack is not distributed"},()=>{
 const e=catalog.entries.find(e=>e.phrase==="provide data")!;assert.equal(e.id,"phrase-86daaba5c2a51e0d884fc9ab");assert.ok(e.legacyPhrases?.includes("prove data"));assert.equal(e.sources[0].number,1799);
 assert.ok(catalog.entries.some(e=>e.phrase==="private investment"));assert.equal(catalog.entries.some(e=>e.phrase==="prior sector"),false);
});

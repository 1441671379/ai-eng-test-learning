import test from "node:test";
import assert from "node:assert/strict";
import { movePhraseCheckpoint, practiceDestination, practiceSeed, validatePracticeEntry, type PracticeSnapshot } from "../src/lib/practice-continuity.ts";
import { isPhraseCourseComplete } from "../src/lib/phrases.ts";
import { publicReading, gradeReading, validateAnswers, validatedChoiceQuestions, type ReadingLesson } from "../src/lib/reading.ts";

test("knowledge accepts its own local route and rejects cross-module resume",()=>{
  assert.ok(validatePracticeEntry("knowledge",{route:"/knowledge",view:{}}));
  assert.throws(()=>validatePracticeEntry("knowledge",{route:"/vocabulary",view:{}}));
});
test("phrase checkpoint moves to knowledge without losing word state or draft input",()=>{
  const old:PracticeSnapshot={vocabulary:{route:"/vocabulary",view:{view:"phrases",deck:"cet6",cardId:"word-1",details:{"phrase-entry":"phrase-1","phrase-answer":"unfinished answer","phrase-course":"course-1","scroll:page":300,"word-audio":true}}}};
  const before=structuredClone(old),moved=movePhraseCheckpoint(old);
  assert.deepEqual(old,before);assert.equal(moved.knowledge?.route,"/knowledge");
  assert.equal((moved.knowledge?.view.details as Record<string,unknown>)["phrase-answer"],"unfinished answer");
  assert.equal(moved.vocabulary?.view.view,"review");assert.equal(moved.vocabulary?.view.deck,"cet6");assert.equal(moved.vocabulary?.view.cardId,"word-1");
  assert.deepEqual(moved.vocabulary?.view.details,{"word-audio":true});
  assert.deepEqual(movePhraseCheckpoint(moved),moved);
});
test("a newer knowledge checkpoint wins and ordinary word views remain unchanged",()=>{
  const state:PracticeSnapshot={vocabulary:{route:"/vocabulary",view:{view:"personal",details:{"phrase-unit":"old"}}},knowledge:{route:"/knowledge",view:{details:{"phrase-unit":"new"}}}};
  const result=movePhraseCheckpoint(state);assert.equal(result.knowledge,state.knowledge);assert.equal(result.vocabulary?.view.view,"personal");
});
test("knowledge always opens its directory while other areas still resume their saved practice",()=>{
  const snapshot:PracticeSnapshot={knowledge:{route:"/knowledge?id=11111111-1111-4111-8111-111111111111",view:{details:{"phrase-course":"old-course","phrase-entry":"old-entry"}}},reading:{route:"/reading?id=11111111-1111-4111-8111-111111111111",view:{question:3}}};
  assert.equal(practiceDestination("knowledge",snapshot),"/knowledge");
  assert.deepEqual(practiceSeed(snapshot,"knowledge",snapshot.knowledge!.route),{});
  assert.equal(practiceDestination("reading",snapshot),snapshot.reading!.route);
  assert.deepEqual(practiceSeed(snapshot,"reading",snapshot.reading!.route),{question:3});
});
test("courses move to completed only when every topic is read, without changing stored progress",()=>{
  const courses=[{id:"new",unitIds:["a","b"],readUnits:0},{id:"partial",unitIds:["c","d"],readUnits:1},{id:"done",unitIds:["e","f"],readUnits:2},{id:"empty",unitIds:[],readUnits:0}];
  const before=structuredClone(courses);
  assert.deepEqual(courses.filter(isPhraseCourseComplete).map(c=>c.id),["done"]);
  assert.deepEqual(courses.filter(c=>!isPhraseCourseComplete(c)).map(c=>c.id),["new","partial","empty"]);
  courses[1].readUnits=2;
  assert.deepEqual(courses.filter(isPhraseCourseComplete).map(c=>c.id),["partial","done"]);
  courses[1].readUnits=1;assert.deepEqual(courses,before);
});
const paragraph="Urban parks offer public access to green space.";
const questions=Array.from({length:6},(_,i)=>({id:`q${i+1}`,type:"choice" as const,prompt:`Which fact about parks does question ${i+1} address?`,options:["Public access","Private offices","Free housing","Train journeys"],answer:"A",explanation:"原文直接说明。",evidence:{paragraph:1,quote:paragraph}}));
test("choice boundary rejects nonchoices, duplicated options, blanks and fabricated evidence",()=>{
  const ready=validatedChoiceQuestions(questions,[paragraph]);assert.equal(ready.length,6);assert.equal(ready[0].id,"choice-v2-q1");
  for(const patch of [{type:"gap"},{prompt:"A park offers ___."},{options:["Access","access","B","C"]},{evidence:{paragraph:1,quote:"Invented evidence"}},{answer:"Z"}]){
    const wrong=structuredClone(questions);Object.assign(wrong[0],patch);assert.throws(()=>validatedChoiceQuestions(wrong,[paragraph]));
  }
});
test("legacy incomplete reading requires an upgrade; completed historical scores remain intact",()=>{
  const lesson:ReadingLesson={id:"old",title:"Old article",topic:"Parks",paragraphs:[paragraph],wordCount:9,questions:[{id:"q1",type:"gap",prompt:"Parks offer ___.",answer:"public access",explanation:"原文直接说明。",evidence:{paragraph:1,quote:paragraph}}],sentences:[],vocabulary:[],targetWords:[],length:"standard",provider:"test",model:"test",generatedAt:"2026-10-28T00:00:00Z"};
  assert.equal(publicReading(lesson).requiresChoiceUpgrade,true);assert.throws(()=>validateAnswers(lesson,{q1:"public access"}),/更新为选择题/);
  lesson.attempt={answers:{q1:" PUBLIC   access "},submittedAt:"2026-10-28T00:01:00Z"};
  assert.equal(gradeReading(lesson)?.score,100);assert.equal(publicReading(lesson).requiresChoiceUpgrade,false);
  assert.equal("originalQuestions" in publicReading({...lesson,originalQuestions:questions}),false);
});

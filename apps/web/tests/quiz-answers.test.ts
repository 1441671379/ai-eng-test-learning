import test from "node:test";
import assert from "node:assert/strict";
import { validateListeningAnswers, publicListening, type ListeningLesson } from "../src/lib/listening.ts";
import { validateAnswers, type ReadingLesson } from "../src/lib/reading.ts";

function listening(): ListeningLesson {
  const evidence={paragraph:1,quote:"Libraries offer public access."};
  return {id:"test",title:"Libraries",topic:"Learning",paragraphs:[evidence.quote],wordCount:5,level:"standard",provider:"test",model:"test",modelProvider:"configured",generatedAt:"2026-10-28T00:00:00Z",conversation:[],questions:[
    {id:"q1",type:"choice",prompt:"What do libraries offer?",options:["Public access","Tickets","Housing","Meals"],answer:"A",explanation:"Test",evidence},
    {id:"q2",type:"gap",prompt:"Libraries offer ___.",answer:"public access",explanation:"Test",evidence},
    {id:"q3",type:"judgment",prompt:"Libraries offer public access.",answer:"TRUE",explanation:"Test",evidence},
  ]};
}
test("listening accepts mixed question types before its first submission and grades them normally",()=>{
  const lesson=listening();
  assert.equal(publicListening(lesson).transcript,null);
  const answers=validateListeningAnswers(lesson,{q1:"A",q2:"  PUBLIC   access.  ",q3:"TRUE"});
  assert.equal(answers.q2,"PUBLIC   access.");
  lesson.attempt={answers,submittedAt:"2026-10-28T00:01:00Z",assisted:false};
  const result=publicListening(lesson);
  assert.equal(result.review?.score,100);assert.equal(result.review?.total,3);
  assert.equal(result.review?.assisted,false);assert.deepEqual(result.transcript,lesson.paragraphs);
});
test("listening still rejects incomplete, invalid or oversized mixed answers",()=>{
  const lesson=listening(),valid={q1:"A",q2:"public access",q3:"TRUE"};
  for(const answers of [null,[],{q1:"A"},{...valid,extra:"A"},{...valid,q1:"Z"},{...valid,q2:"more than three words"},{...valid,q2:" "},{...valid,q3:"Maybe"}])assert.throws(()=>validateListeningAnswers(lesson,answers));
});
test("the choice-only upgrade policy remains confined to Reading",()=>{
  const mixed=listening();
  const reading:ReadingLesson={...mixed,length:"standard",targetWords:[],sentences:[],vocabulary:[]};
  const answers={q1:"A",q2:"public access",q3:"TRUE"};
  assert.throws(()=>validateAnswers(reading,answers),/更新为选择题/);
  assert.deepEqual(validateListeningAnswers(mixed,answers),answers);
});

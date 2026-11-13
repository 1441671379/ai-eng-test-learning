import { withPhrases } from "@/lib/phrase-store";
import { phraseEntry, phraseSnapshot, setPhraseSaved, markPhraseUnit, savePhraseAttempt, savePhraseContent, phraseHistory, phraseAttempt, savePhraseFeedback, localSentenceCheck } from "@/lib/phrase-db";
import { PhraseError, phraseText, type PhraseSentenceFeedback } from "@/lib/phrases";
import { vocabularyUser, vocabularyBody } from "@/lib/vocabulary-api";
import { vocabularyCoach } from "@/lib/vocabulary-coach";
export const runtime="nodejs";
function failure(error:unknown) {return Response.json({error:error instanceof PhraseError?error.message:error instanceof Error&&"status" in error?error.message:"搭配服务暂不可用，请重试。已有进度保留。"},{status:error instanceof PhraseError?error.status:error instanceof Error&&"status" in error?Number(error.status)||503:503,headers:{"Cache-Control":"no-store"}});}
const json=(value:unknown)=>Response.json(value,{headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request) {
  const userId=await vocabularyUser(request);if(typeof userId!=="string")return userId;
  try {const q=new URL(request.url).searchParams,id=q.get("id");
    if(id)return json(await withPhrases(userId,(db,c)=>({entry:phraseEntry(db,c,id),history:phraseHistory(db,id)})));
    const page=Number(q.get("page")||0);if(!Number.isInteger(page)||page<0||page>1000)throw new PhraseError("页码无效。");
    return json(await withPhrases(userId,(db,c)=>phraseSnapshot(db,c,{search:(q.get("search")||"").slice(0,100),book:q.get("book")||undefined,level:q.get("level")||undefined,unit:q.get("unit")||undefined,saved:q.get("saved")==="1",page})));
  } catch(error){return failure(error);}
}
export async function POST(request:Request) {
  const userId=await vocabularyUser(request);if(typeof userId!=="string")return userId;
  try {const body=await vocabularyBody(request,24000);let value:unknown;
    if(body.action==="save")value=await withPhrases(userId,(db,c)=>({entry:setPhraseSaved(db,c,body.entryId,body.revision,body.saved)}));
    else if(body.action==="read"){await withPhrases(userId,(db,c)=>markPhraseUnit(db,c,body.unitId));value={saved:true};}
    else if(body.action==="content")value=await withPhrases(userId,(db,c)=>({entry:savePhraseContent(db,c,body.entryId,body.revision,body.content,"manual")}));
    else if(body.action==="prepare") {
      const entry=await withPhrases(userId,(db,c)=>phraseEntry(db,c,body.entryId));
      const content=await vocabularyCoach(request,"phrase-learning",{userId,action:"prepare",phrase:entry.content?.teachingPhrase||entry.phrase,level:entry.level,variants:entry.variants});
      value=await withPhrases(userId,(db,c)=>({entry:savePhraseContent(db,c,entry.id,body.revision,content,"ai")}));
    }
    else if(body.action==="attempt") {
      const result=await withPhrases(userId,(db,c)=>{const attempt=savePhraseAttempt(db,c,body as never);return {attempt,local:attempt.kind==="sentence"?localSentenceCheck(phraseEntry(db,c,attempt.entryId),attempt.text):null};});
      value=result;
    }
    else if(body.action==="feedback") {
      const id=phraseText(body.attemptId,100,"练习编号");
      const {attempt,entry}=await withPhrases(userId,(db,c)=>{const attempt=phraseAttempt(db,id);return{attempt,entry:phraseEntry(db,c,attempt.entryId)};});
      if(attempt.kind!=="sentence")throw new PhraseError("请选择造句练习。");
      const feedback=await vocabularyCoach(request,"phrase-learning",{userId,action:"review",phrase:entry.content?.teachingPhrase||entry.phrase,meaning:entry.content?.meaningZh,sentence:attempt.text}) as PhraseSentenceFeedback;
      if(typeof feedback.targetUsed!=="boolean"||typeof feedback.natural!=="boolean"||typeof feedback.corrected!=="string"||typeof feedback.explanation!=="string")throw new PhraseError("模型点评格式无效，请重试。",502);
      value={attempt:await withPhrases(userId,db=>savePhraseFeedback(db,id,attempt.text,feedback))};
    }
    else throw new PhraseError("未知的搭配操作。");
    return json(value);
  }catch(error){return failure(error);}
}

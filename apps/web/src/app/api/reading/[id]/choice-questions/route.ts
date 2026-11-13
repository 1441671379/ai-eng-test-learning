import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readingUser,readingError } from "@/lib/reading-api";
import { upgradeReadingChoices } from "@/lib/reading-store";
import { publicReading } from "@/lib/reading";
import { resolveDataDir } from "@/lib/pairing/store";
import { getModelServiceUrlForRequest } from "@/lib/services/runtime";
export const runtime="nodejs";
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const userId=await readingUser(request);if(typeof userId!=="string")return userId;
  try{
    const {id}=await context.params;
    const lesson=await upgradeReadingChoices(userId,id,async original=>{
      const token=(await readFile(join(resolveDataDir(),"coach-admin.token"),"utf8")).trim();
      const response=await fetch(`${getModelServiceUrlForRequest(request)}/reading-questions`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({userId,title:original.title,paragraphs:original.paragraphs,level:original.level||"standard",remarks:original.remarks||""}),cache:"no-store",signal:AbortSignal.any([request.signal,AbortSignal.timeout(600_000)])});
      const value=await response.json();if(!response.ok)throw new Error(value.detail||"更新选择题失败，请检查模型设置后重试。");return value;
    });
    return NextResponse.json({lesson:publicReading(lesson)},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return readingError(error,"选择题更新失败，原文章和题目已保留。请检查模型设置后重试。");}
}

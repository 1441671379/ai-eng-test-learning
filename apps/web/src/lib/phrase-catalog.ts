import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { normalizePhrase, validatePhraseContent, PhraseError, type PhraseCatalog, type PhraseCourse, type PhraseEntry, type PhraseUnit } from "./phrases";

let cached: { key: string; catalog: PhraseCatalog } | undefined;
export function phraseCatalog(): PhraseCatalog {
  const directory = process.env.ENGLISH_PHRASES_DIR || [resolve(process.cwd(), "../../deployment/phrases"), resolve(process.cwd(), "deployment/phrases")].find(p=>existsSync(join(p,"catalog.json")));
  if (!directory) throw new PhraseError("短语资料未安装，请更新应用资料。",503);
  const path = join(directory,"catalog.json"), lessonPath = join(directory,"lessons.json"), coursePath=join(directory,"courses.json");
  if(!existsSync(coursePath))throw new PhraseError("课程目录未安装，请更新应用资料。",503);
  const key = path+statSync(path).mtimeMs+statSync(lessonPath).mtimeMs+statSync(coursePath).mtimeMs;
  if (cached?.key===key) return cached.catalog;
  const raw = JSON.parse(readFileSync(path,"utf8")) as PhraseCatalog;
  const lessons = JSON.parse(readFileSync(lessonPath,"utf8")) as { entries: { phrase: string; unit: string; content: unknown }[]; units: Omit<PhraseUnit,"entryIds">[] };
  if (raw.version!==1 || !Array.isArray(raw.entries) || !Array.isArray(lessons.entries)) throw new PhraseError("短语资料格式无效。",503);
  const entries: PhraseEntry[] = raw.entries.map(e=>({...e,sources:e.sources.map(s=>({...s}))}));
  for (const item of lessons.entries) {
    const entry = entries.find(e=>[e.phrase,...(e.legacyPhrases||[])].some(p=>normalizePhrase(p)===normalizePhrase(item.phrase)));
    if (!entry) throw new PhraseError(`课程词条未收录：${item.phrase}`,503);
    const metadata=item.content as {origin?:unknown;provider?:unknown;model?:unknown}|null;
    const origin=metadata?.origin;
    if(origin!=="authored"&&origin!=="ai")throw new PhraseError("课程内容缺少有效来源标记。",503);
    entry.unit = item.unit; entry.content = validatePhraseContent(item.content,origin);
    if(origin==="ai")for(const field of ["provider","model"] as const)if(typeof metadata?.[field]==="string")entry.content[field]=metadata[field].slice(0,160);
  }
  const units = lessons.units.map(unit=>({...unit,entryIds:entries.filter(e=>e.unit===unit.id).map(e=>e.id),expressions:entries.filter(e=>e.unit===unit.id).map(e=>({id:e.id,phrase:e.content?.teachingPhrase||e.phrase}))}));
  const courseFile=JSON.parse(readFileSync(coursePath,"utf8")) as {version:number;courses:PhraseCourse[]};
  const known=new Set(units.map(u=>u.id)), assigned=new Set<string>(), courseIds=new Set<string>();
  if(courseFile.version!==1||!Array.isArray(courseFile.courses))throw new PhraseError("课程目录格式无效。",503);
  for(const course of courseFile.courses){
    if(!course.id||courseIds.has(course.id)||![course.title,course.titleEn,course.category,course.categoryTitle,course.categoryTitleEn].every(v=>typeof v==="string"&&v.trim())||!Array.isArray(course.unitIds)||course.unitIds.length<6||course.unitIds.length>10)throw new PhraseError("课程目录需要每课 6–10 个主题。",503);
    courseIds.add(course.id);
    for(const id of course.unitIds){if(!known.has(id)||assigned.has(id))throw new PhraseError("课程主题重复或不存在。",503);assigned.add(id);}
  }
  if(assigned.size!==units.length)throw new PhraseError("课程目录未覆盖全部主题。",503);
  const catalog: PhraseCatalog = { ...raw, entries, units, courses:courseFile.courses };
  cached = {key,catalog}; return catalog;
}

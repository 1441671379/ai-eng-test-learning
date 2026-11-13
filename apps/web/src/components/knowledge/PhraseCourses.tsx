"use client";

import { useEffect, useRef, useState } from "react";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { isPhraseCourseComplete, type PhraseSnapshot } from "@/lib/phrases";

export function PhraseCourses({snapshot, completed, courseId, unitId, busy, focusTarget, returnCourseId, onFocusSettled, onCourse, onUnit, onRead, onExpression}:{
  snapshot:PhraseSnapshot; completed:boolean; courseId:string; unitId:string; busy:boolean;
  focusTarget:"course"|"topic"|"directory"|null; returnCourseId:string; onFocusSettled:()=>void;
  onCourse:(id:string)=>void; onUnit:(id:string)=>void;
  onRead:(id:string)=>void; onExpression:(id:string)=>void;
}) {
  const {locale}=useUiLocale(), en=locale==="en", l=(zh:string,english:string)=>en?english:zh;
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("");
  const [savedPage,setPage]=useState(0);
  const course=snapshot.courses.find(c=>c.id===courseId)||(courseId!=="catalog"?snapshot.courses.find(c=>c.unitIds.includes(unitId)):undefined);
  const unitMap=new Map(snapshot.units.map(u=>[u.id,u]));
  const topics=course?.unitIds.map(id=>unitMap.get(id)!).filter(Boolean)||[];
  const unit=topics.find(u=>u.id===unitId)||topics[0];
  const topicIndex=unit?topics.findIndex(u=>u.id===unit.id):-1;
  const query=search.trim().toLowerCase();
  const available=snapshot.courses.filter(c=>isPhraseCourseComplete(c)===completed);
  const visible=available.filter(c=>(!category||c.category===category)&&(!query||[c.title,c.titleEn,c.categoryTitle,c.categoryTitleEn,...c.unitIds.flatMap(id=>{const u=unitMap.get(id)!;return[u.title,u.titleEn,u.description,...(u.expressions?.map(e=>e.phrase)||[])];})].some(s=>s.toLowerCase().includes(query))));
  const courseWord=visible.length===1?"course":"courses";
  const page=Math.max(0,Math.min(savedPage,Math.max(0,Math.ceil(visible.length/12)-1)));
  const lessonTitle=useRef<HTMLHeadingElement>(null), courseTitle=useRef<HTMLHeadingElement>(null), directoryStatus=useRef<HTMLParagraphElement>(null);
  const courseButtons=useRef(new Map<string,HTMLButtonElement>()), paginationRequested=useRef(false);
  const previous=useRef({course:course?.id,unit:unit?.id,page});
  useEffect(()=>{
    if(focusTarget==="course"&&course){courseTitle.current?.focus();onFocusSettled();}
    else if(focusTarget==="topic"&&unit){lessonTitle.current?.focus();onFocusSettled();}
    else if(focusTarget==="directory"&&!course){(courseButtons.current.get(returnCourseId)||directoryStatus.current)?.focus();onFocusSettled();}
    else if(course?.id===previous.current.course&&unit?.id!==previous.current.unit){
      lessonTitle.current?.focus();
    }else if(!course&&paginationRequested.current&&page!==previous.current.page){
      directoryStatus.current?.focus();
    }
    paginationRequested.current=false;
    previous.current={course:course?.id,unit:unit?.id,page};
  },[course,unit,page,focusTarget,returnCourseId,onFocusSettled]);
  function turnPage(next:number){paginationRequested.current=true;setPage(next);}
  if(!course)return <div className="phrase-courses">
    <form className="phrase-course-filters" onSubmit={e=>e.preventDefault()}>
      <label htmlFor="phrase-course-search">{l("搜索课程、主题或表达","Find a course, topic or expression")}
        <span className="phrase-unit-search"><input id="phrase-course-search" type="search" className="piano-field" maxLength={100} value={search} disabled={busy} onChange={e=>{paginationRequested.current=false;setSearch(e.target.value);setPage(0);}} />{search&&<button type="button" className="piano-text-button" disabled={busy} onClick={()=>{paginationRequested.current=false;setSearch("");setPage(0);}}>{l("清除","Clear")}</button>}</span>
      </label>
      <label htmlFor="phrase-course-category">{l("内容分类","Subject")}<select id="phrase-course-category" className="piano-field" value={category} disabled={busy} onChange={e=>{paginationRequested.current=false;setCategory(e.target.value);setPage(0);}}><option value="">{l("全部分类","All subjects")}</option>{Array.from(new Map(snapshot.courses.map(c=>[c.category,c])).values()).map(c=><option key={c.category} value={c.category}>{en?c.categoryTitleEn:c.categoryTitle}</option>)}</select></label>
    </form>
    <p ref={directoryStatus} tabIndex={-1} className="phrase-muted phrase-directory-status" role="status">{completed?l(`${visible.length} 门已完成课程 · 所有主题均已读`,`${visible.length} completed ${courseWord} · all topics read`):l(`${visible.length} 门待学习课程 · 每课 6–10 个主题`,`${visible.length} unfinished ${courseWord} · 6–10 topics per course`)}</p>
    <div className="phrase-course-list">{visible.slice(page*12,(page+1)*12).map(c=><button key={c.id} ref={node=>{if(node)courseButtons.current.set(c.id,node);else courseButtons.current.delete(c.id);}} disabled={busy} onClick={()=>onCourse(c.id)}><span><strong>{en?c.titleEn:c.title}</strong><span className="phrase-course-preview">{c.unitIds.slice(0,3).map(id=>{const u=unitMap.get(id)!;return en?u.titleEn:u.title;}).join(en?" · ":"、")}</span></span><span className="phrase-course-meta">{l(`${c.unitIds.length} 个主题`,`${c.unitIds.length} topics`)}<span>{c.readUnits?l(`已读 ${c.readUnits}/${c.unitIds.length}`,`${c.readUnits}/${c.unitIds.length} read`):l("未开始","Not started")}</span></span></button>)}</div>
    {!visible.length&&<p className="vocabulary-empty">{query||category?l("没有匹配的课程，试试其他关键词或分类。","No matching courses. Try another search or subject."):completed?l("还没有完成的课程。读完并标记一门课的所有主题后，会显示在这里。","No completed courses yet. Mark every topic in a course as read to move it here."):l("当前课程均已学完，可到“已完成学习”回顾。","All courses are complete. Revisit them under Completed.")}</p>}
    {visible.length>12&&<div className="vocabulary-pagination"><p>{l(`第 ${page+1} / ${Math.ceil(visible.length/12)} 页`,`Page ${page+1} of ${Math.ceil(visible.length/12)}`)}</p><div className="phrase-actions"><button className="piano-text-button" disabled={busy||page===0} onClick={()=>turnPage(page-1)}>{l("上一页","Previous")}</button><button className="piano-text-button" disabled={busy||(page+1)*12>=visible.length} onClick={()=>turnPage(page+1)}>{l("下一页","Next")}</button></div></div>}
  </div>;
  return <div className="phrase-course-open">
    <button className="piano-text-button" disabled={busy} onClick={()=>onCourse("catalog")}>{l("返回课程目录","Back to courses")}</button>
    <div className="phrase-course-title"><h3 ref={courseTitle} tabIndex={-1}>{en?course.titleEn:course.title}</h3><p className="phrase-muted">{l(`已读 ${course.readUnits} / ${topics.length} 个主题`,`${course.readUnits} of ${topics.length} topics read`)}</p></div>
    <div className="phrase-unit-layout"><nav className="phrase-unit-list" aria-label={l("本课主题","Topics in this course")}>{topics.map((u,i)=><button key={u.id} disabled={busy} aria-current={u.id===unit?.id?"step":undefined} aria-pressed={u.id===unit?.id} onClick={()=>onUnit(u.id)}><strong>{i+1}. {en?u.titleEn:u.title}</strong><span>{l(`${u.entryIds.length} 条表达`,`${u.entryIds.length} expressions`)}{u.read?l(" · 已读"," · Read"):""}</span></button>)}</nav>
    {unit&&<article className="phrase-lesson"><div className="vocabulary-panel-title"><h3 ref={lessonTitle} tabIndex={-1} className="phrase-lesson-title">{en?unit.titleEn:unit.title}</h3><span>{l(`主题 ${topicIndex+1}/${topics.length}`,`Topic ${topicIndex+1}/${topics.length}`)}</span></div><p lang="zh-CN">{unit.description}</p><p className="phrase-prose" lang="en">{unit.passage}</p><details key={unit.id}><summary>{l("查看中文理解提示","Chinese reading support")}</summary><p lang="zh-CN">{unit.translation}</p></details>
      <h4 className="phrase-expression-heading">{l("本主题表达与练习","Expressions and exercises")}</h4>
      <div className="phrase-unit-expressions">{unit.entryIds.map(id=><button className="piano-button" lang="en" disabled={busy} key={id} onClick={()=>onExpression(id)}>{unit.expressions?.find(e=>e.id===id)?.phrase||l("查看表达","Study expression")}</button>)}</div>
      <p className="phrase-muted">{l("阅读用法后，试着填写英文、完成语境填空，再用表达造句。可随时返回继续。","Read the usage, write the English expression, complete a sentence and try your own. Return whenever you like.")}</p>
      <div className="phrase-actions"><button className="piano-button" disabled={busy} onClick={()=>onRead(unit.id)}>{unit.read?l("已阅读","Read"):l("标记本主题已读","Mark topic as read")}</button><button className="piano-button piano-button--primary" disabled={busy} onClick={()=>onExpression(unit.entryIds[0])}>{l("学习本主题表达","Study these expressions")}</button></div>
      <div className="phrase-topic-paging"><button className="piano-text-button" disabled={busy||topicIndex<=0} onClick={()=>onUnit(topics[topicIndex-1].id)}>{l("上一主题","Previous topic")}</button>{topicIndex<topics.length-1?<button className="piano-text-button" disabled={busy} onClick={()=>onUnit(topics[topicIndex+1].id)}>{l("下一主题","Next topic")}</button>:<button className="piano-text-button" disabled={busy} onClick={()=>onCourse("catalog")}>{l("返回课程目录","Back to courses")}</button>}</div>
      <p className="phrase-material-origin">{unit.origin==="ai"?l("AI 生成的学习材料，可在表达详情中核对和编辑。","AI-generated learning material. Check or edit notes in expression details."):l("原创情境与讲解","Original learning material")}</p>
    </article>}</div>
  </div>;
}

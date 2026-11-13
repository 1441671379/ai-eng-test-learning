"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { KNOWLEDGE_HOME_EVENT } from "@/lib/practice-continuity";
import { PhraseWorkspace } from "./PhraseWorkspace";

export function KnowledgeWorkspace(){
  const {locale}=useUiLocale(),en=locale==="en";
  const [busy,setBusy]=useState(false);
  const [visit,setVisit]=useState(0),heading=useRef<HTMLHeadingElement>(null);
  const home=useCallback(()=>setVisit(value=>value+1),[]);
  useEffect(()=>{window.addEventListener(KNOWLEDGE_HOME_EVENT,home);return()=>window.removeEventListener(KNOWLEDGE_HOME_EVENT,home);},[home]);
  useEffect(()=>{document.querySelector<HTMLElement>(".piano-content")?.scrollTo({top:0});if(visit)heading.current?.focus({preventScroll:true});},[visit]);
  return <main className="vocabulary-page knowledge-page">
    <header className="vocabulary-heading"><h1 ref={heading} tabIndex={-1}>{en?"Knowledge":"知识库"}</h1></header>
    <nav className="vocabulary-nav" aria-label={en?"Knowledge areas":"知识库内容"}><button aria-current="page" aria-pressed="true" disabled={busy} onClick={home}>{en?"Phrases & collocations":"搭配与表达"}</button></nav>
    <PhraseWorkspace key={visit} onBusy={setBusy} />
  </main>;
}

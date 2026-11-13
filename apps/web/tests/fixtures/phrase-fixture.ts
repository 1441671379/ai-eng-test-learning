import { validatePhraseContent, type PhraseCatalog } from "../../src/lib/phrases.ts";
// Original synthetic test examples, independent of any publisher's source lists.
export function phraseFixture(): PhraseCatalog {
 const phrases=["make a mistake","take a break","ask a question","write a note","read a book","learn a skill"];
 const units=phrases.map((phrase,i)=>({id:`fixture-unit-${i}`,title:`测试主题 ${i+1}`,titleEn:`Test topic ${i+1}`,description:"Synthetic fixture",passage:`We can ${phrase}.`,translation:"用于测试的自建例句。",entryIds:[`fixture-phrase-${i}`]}));
 const entries=phrases.map((phrase,i)=>({id:`fixture-phrase-${i}`,phrase,level:null,pattern:phrase,variants:[],sources:[],unit:units[i].id,content:validatePhraseContent({version:1,meaningZh:"用于测试的表达释义",usage:"此例句用于验证练习和存储行为。",example:`We can ${phrase}.`,exampleZh:"我们可以完成这个动作。",recallAnswers:phrase==="make a mistake"?[phrase,"make mistakes"]:[phrase],sentencePatterns:[phrase],cloze:{prompt:"We can ___.",answers:[phrase]}},"authored")}));
 return {version:1,books:[],entries,units,courses:[{id:"fixture-course",category:"fixture",categoryTitle:"测试",categoryTitleEn:"Test",title:"自建测试课程",titleEn:"Synthetic test course",unitIds:units.map(u=>u.id)}]};
}

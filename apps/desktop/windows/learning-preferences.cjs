'use strict';
const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
function parseProfile(value){
 for(let n=0;n<3&&typeof value==='string';n++){
  try{
   const p=JSON.parse(value);
   if(!p||typeof p.id!=='string'||!p.id||p.id.length>256||['displayName','practiceFocus','practiceCadence','createdAt'].some(k=>typeof p[k]!=='string'))return null;
   return Object.fromEntries(['id','displayName','practiceFocus','practiceCadence','createdAt','onboardingCompleted'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
  }catch{try{value=decodeURIComponent(value);}catch{return null;}}
 }
 return null;
}
function atomic(file,value){const temporary=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2));fs.renameSync(temporary,file);}
async function persistLearningPreferences(cookies,origin,directory){
 fs.mkdirSync(directory,{recursive:true});
 const profiles=await cookies.get({url:origin,name:'english_local_profile'});
 const profile=parseProfile(profiles[0]?.value);
 if(profile)atomic(path.join(directory,'local-profile.json'),profile);
 const locales=await cookies.get({url:origin,name:'english_ui_locale'}),locale=locales[0]?.value;
 if(['zh-CN','en'].includes(locale))atomic(path.join(directory,'ui-settings.json'),{locale});
 // app.exit() skips normal Chromium teardown. Commit its cookie store first.
 await cookies.flushStore();
}
async function restoreInterfaceLanguage(cookies,origin,directory){
 let locale;try{locale=JSON.parse(fs.readFileSync(path.join(directory,'ui-settings.json'),'utf8')).locale;}catch{return;}
 // Match /api/interface-language: restoring a plain cookie over an HttpOnly
 // cookie is rejected by Chromium on the next desktop launch.
 if(['zh-CN','en'].includes(locale))await cookies.set({url:origin,name:'english_ui_locale',value:locale,path:'/',httpOnly:true,sameSite:'lax',expirationDate:Date.now()/1000+365*86400});
}
module.exports={parseProfile,persistLearningPreferences,restoreInterfaceLanguage};

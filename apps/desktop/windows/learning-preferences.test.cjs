const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {parseProfile,persistLearningPreferences,restoreInterfaceLanguage}=require('./learning-preferences.cjs');
const profile={id:'local-test',displayName:'Test',practiceFocus:'conversations',practiceCadence:'15-minutes',createdAt:'2026-10-28T00:00:00Z',onboardingCompleted:true};
test('desktop identity accepts existing raw and URI-encoded profile cookies without extra fields',()=>{assert.deepEqual(parseProfile(encodeURIComponent(JSON.stringify({...profile,unrelated:'ignored'}))),profile);assert.deepEqual(parseProfile(JSON.stringify(profile)),profile);assert.equal(parseProfile('invalid'),null);});
test('shutdown persists identity/language and awaits cookie flushing before exit',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'english-preferences-'));let flushed=false;try{await persistLearningPreferences({get:async q=>[{value:q.name==='english_local_profile'?encodeURIComponent(JSON.stringify(profile)):'zh-CN'}],flushStore:async()=>{await Promise.resolve();flushed=true;}},'http://127.0.0.1:3140',dir);assert.equal(flushed,true);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'local-profile.json'))),profile);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'ui-settings.json'))).locale,'zh-CN');}finally{fs.rmSync(dir,{recursive:true});}});
test('invalid cookies never replace a valid saved identity or language',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'english-preferences-'));try{fs.writeFileSync(path.join(dir,'local-profile.json'),JSON.stringify(profile));fs.writeFileSync(path.join(dir,'ui-settings.json'),JSON.stringify({locale:'en'}));await persistLearningPreferences({get:async()=>[{value:'bad'}],flushStore:async()=>{}},'http://127.0.0.1:3140',dir);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'local-profile.json'))),profile);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'ui-settings.json'))).locale,'en');const changed=[];await restoreInterfaceLanguage({set:async c=>changed.push(c)},'http://127.0.0.1:3140',dir);assert.equal(changed[0].value,'en');}finally{fs.rmSync(dir,{recursive:true});}});
test('restart restores either saved language over an existing HttpOnly locale without removing it',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'english-preferences-'));
 try{
  for(const locale of ['en','zh-CN']){
   fs.writeFileSync(path.join(dir,'ui-settings.json'),JSON.stringify({locale}));
   const changes=[];
   await restoreInterfaceLanguage({set:async cookie=>{
    assert.equal(cookie.name,'english_ui_locale');
    assert.equal(cookie.httpOnly,true,'restoration must match the interface-language API cookie');
    assert.equal(cookie.url,'http://127.0.0.1:3141');
    assert.equal(cookie.path,'/');assert.equal(cookie.sameSite,'lax');
    assert.ok(cookie.expirationDate>Date.now()/1000);
    changes.push(cookie);
   }},'http://127.0.0.1:3141',dir);
   assert.equal(changes.length,1);assert.equal(changes[0].value,locale);
  }
 }finally{fs.rmSync(dir,{recursive:true});}
});

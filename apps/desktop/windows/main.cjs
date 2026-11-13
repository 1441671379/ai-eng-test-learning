'use strict';
const { app, BrowserWindow, ipcMain, shell, session, dialog, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const exec = promisify(execFile);
app.setName('English Learning');
if (process.env.ENGLISH_DESKTOP_TEST_DATA) app.setPath('userData', path.resolve(process.env.ENGLISH_DESKTOP_TEST_DATA));
else app.setPath('userData', path.join(app.getPath('appData'), 'EnglishLearningDesktop'));
const data = app.getPath('userData');
fs.mkdirSync(data, { recursive: true });
const logs = path.join(data, 'logs'); fs.mkdirSync(logs, { recursive: true });
const root = app.isPackaged ? process.resourcesPath : path.resolve(process.env.ENGLISH_DESKTOP_RESOURCE_ROOT || path.join(__dirname, '../../..', 'deployment/electron/build/EnglishLearning/resources'));
const devRoot = process.argv.includes('--ui-dev') && process.env.ENGLISH_DESKTOP_DEV_ROOT ? path.resolve(process.env.ENGLISH_DESKTOP_DEV_ROOT) : '';
const script = path.join(root, 'app/deployment/windows_service.py');
const python = path.join(root, 'runtime/python/python.exe');
const runtimeFile = path.join(data, 'runtime.json');
const labels = { tts: '本地语音合成', ai: '语音识别与评估', coach: '外部语言模型接口', web: '听、说、读、写与单词' };
const state = { services: Object.fromEntries(Object.entries(labels).map(([key,label]) => [key, {label,ready:false,message:'等待启动'}])), hardware:'', error:'' };
const processes = new Map();
let window, runtime, starting = false, stopping = false, quitting = false, opened = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function publish() { if (window && !window.isDestroyed()) window.webContents.send('startup-status', state); }
function log(message) { fs.appendFileSync(path.join(logs,'desktop.log'), `${new Date().toISOString()} ${message}\n`); }
function save(file, value) { const temporary = file + '.tmp'; fs.writeFileSync(temporary, JSON.stringify(value,null,2),'utf8'); fs.renameSync(temporary,file); }
async function freePort(preferred, reserved) {
  for(let port=preferred;port<preferred+1000;port++) {
    if(reserved.has(port))continue;
    const available = await new Promise(resolve => { const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true))); });
    if(available){reserved.add(port);return port;}
  }
  throw new Error('没有可用的本机端口，请关闭占用大量端口的软件后重试。');
}
async function configure() {
  if(process.platform!=='win32'||process.arch!=='x64') throw new Error('此安装包需要 Windows x64。');
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'bundle-manifest.json'),'utf8'));
  for(const relative of manifest.required) if(!fs.existsSync(path.join(root,relative))) throw new Error(`安装文件缺失：${relative}。请重新运行安装程序。`);
  const available=fs.statfsSync(data);if(available.bavail*available.bsize<2*1024**3) throw new Error('保存学习数据的磁盘空间不足，请至少留出 2 GB。');
  let gpu='',gpuMemory=0,gpuFree=0;
  try {
    const nvidia=path.join(process.env.SystemRoot||'C:\\Windows','System32/nvidia-smi.exe');
    const result=await exec(nvidia,['--query-gpu=name,memory.total,driver_version,memory.free','--format=csv,noheader,nounits'],{windowsHide:true,timeout:10000});
    const values=result.stdout.trim().split('\n')[0].split(',').map(value=>value.trim());
    gpuMemory=Number(values[1]);gpuFree=Number(values[3]);gpu=`${values[0]} · 显存 ${Math.round(gpuMemory/1024)} GB · 驱动 ${values[2]}`;
  } catch {gpu='未检测到可用的 NVIDIA 驱动，将使用 CPU，语音生成会较慢';}
  state.hardware=`${gpu} · 内存 ${Math.round(os.totalmem()/1024**3)} GB`;publish();
  const savedPorts=path.join(data,'ports.json');let previous={};try{previous=JSON.parse(fs.readFileSync(savedPorts,'utf8'));}catch{}
  const ports={},reserved=new Set();
  for(const [key,preferred] of Object.entries({web:3140,tts:9890,ai:8020,coach:8021}))ports[key]=await freePort(previous[key]||preferred,reserved);
  save(savedPorts,ports);
  const settings=JSON.parse(fs.readFileSync(path.join(root,'voice-template.json'),'utf8'));
  const provider='kokoro';
  if(settings.provider!==provider)throw new Error('The desktop app requires Kokoro voice assets.');
  settings.model_dir=path.join(root,settings.model_dir);
  for(const entry of Object.values(settings.voices))entry.voice.voice_file=path.join(root,entry.voice.voice_file);
  Object.assign(settings,{endpoint:`http://127.0.0.1:${ports.tts}`,artifact_directory:path.join(data,'audio','kokoro'),selection_file:path.join(data,'kokoro-selected-voice.json')});
  const configFile=path.join(data,'kokoro-settings.json');save(configFile,settings);
  runtime={root,data,ports,configFile,provider,gpuMemory,gpuFree,devRoot};save(runtimeFile,runtime);
  for(const folder of ['tmp','audio','pronunciation-cache','learning'])fs.mkdirSync(path.join(data,folder),{recursive:true});
  return runtime;
}
function environment() {
  const {ports,configFile,gpuMemory,gpuFree}=runtime;const origin=`http://127.0.0.1:${ports.web}`;
  // Allow only the operating-system environment, never developer API keys or paths.
  const inherited={};for(const key of ['SystemRoot','WINDIR','COMSPEC','SystemDrive','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'])if(process.env[key])inherited[key]=process.env[key];
  return {...inherited,PATH:`${path.join(root,'runtime/bin')};${path.join(root,'runtime/python')};${path.join(process.env.SystemRoot||'C:\\Windows','System32')};${process.env.SystemRoot||'C:\\Windows'}`,TEMP:path.join(data,'tmp'),TMP:path.join(data,'tmp'),
    NODE_ENV:devRoot?'development':'production',HOSTNAME:'127.0.0.1',PORT:String(ports.web),NEXT_TELEMETRY_DISABLED:'1',ENGLISH_LOCAL_HTTP:'1',
    PYTHONUTF8:'1',PYTHONUNBUFFERED:'1',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',HF_HOME:path.join(root,'models'),HF_HUB_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1',HF_HUB_DISABLE_SYMLINKS_WARNING:'1',TOKENIZERS_PARALLELISM:'false',
    ENGLISH_WORD_PRONUNCIATIONS_DIR:path.join(devRoot||path.join(root,'app'),'deployment/word-pronunciations'),
    ENGLISH_PHRASES_DIR:path.join(devRoot||path.join(root,'app'),'deployment/phrases'),
    ENGLISH_PARENT_PID:String(process.pid),ENGLISH_PACKAGED_RUNTIME:'1',ENGLISH_EXTERNAL_LLM_ONLY:'1',ENGLISH_CPU_THREADS:'4',
    ENGLISH_DATA_DIR:path.join(data,'learning'),ENGLISH_WORDBOOKS_DIR:path.join(root,'app/wordbooks'),ENGLISH_DICTIONARY_DIR:path.join(devRoot||path.join(root,'app'),'deployment/dictionary'),ENGLISH_WORD_AUDIO_DIR:path.join(devRoot||path.join(root,'app'),'deployment/word-audio'),
    ENGLISH_TTS_PROVIDER:runtime.provider,ENGLISH_TTS_CONFIG:configFile,
    ENGLISH_LEARNING_ORIGIN:origin,
    AI_ENGINE_URL:`http://127.0.0.1:${ports.ai}`,AI_COACH_ENGINE_URL:`http://127.0.0.1:${ports.coach}`,ENGLISH_DESKTOP_AI_ENGINE_URL:`http://127.0.0.1:${ports.ai}`,ENGLISH_DESKTOP_COACH_ENGINE_URL:`http://127.0.0.1:${ports.coach}`};
}
function launch(key) {
  const out=fs.openSync(path.join(logs,key+'.log'),'a');
  const process=spawn(python,['-B',script,key,runtimeFile],{cwd:root,env:environment(),windowsHide:true,stdio:['ignore',out,out]});fs.closeSync(out);
  const item={process,restarts:processes.get(key)?.restarts||0};processes.set(key,item);
  process.once('error',error=>{item.error=error;log(`${key}: ${error.message}`);});
  process.once('exit',code=>{
    log(`${key} exited ${code}`);
    if(stopping||quitting||starting)return;
    state.services[key].ready=false;state.services[key].message='正在重新连接';publish();
    if(item.restarts++<3)void delay(3000).then(async()=>{if(!quitting&&!stopping){launch(key);try{await ready(key);state.services[key].ready=true;state.services[key].message='已恢复';publish();}catch(error){fail(error);}}});
    else fail(new Error(`${labels[key]} 多次退出，请查看日志或重新启动后台。`));
  });
}
async function ready(key) {
  const deadline=Date.now()+480000;
  while(Date.now()<deadline) {
    const item=processes.get(key);if(item.error||item.process.exitCode!==null)throw new Error(`${labels[key]} 启动失败，请点击“查看日志”，查看 ${key}.log。`);
    try {
      let endpoint='/health';if(key==='web')endpoint='/api/health';if(key==='tts')endpoint='/docs';
      if(key==='tts')endpoint='/health';
      const response=await fetch(`http://127.0.0.1:${runtime.ports[key]}${endpoint}`,{signal:AbortSignal.timeout(2500)});
      if(response.ok){if(key==='ai'){const value=await response.json();if(value.loadError||value.transcriberLoadError||value.wordTiming?.error)throw new Error(value.loadError||value.transcriberLoadError||value.wordTiming?.error);if(value.modelReady&&value.transcriberReady&&value.ttsReady&&value.wordTiming?.ready)return;}else if(key==='coach'){const value=await response.json();if(value.ready&&value.localLlmEnabled===false)return;}else if(key==='tts'){if((await response.json()).ttsReady)return;}else return;}
    }catch{}
    await delay(1200);
  }
  throw new Error(`${labels[key]} 加载超时，请查看日志、检查显卡驱动后重试。`);
}
async function stopAll() {
  stopping=true;
  await Promise.all([...processes.values()].map(async item=>{
    if(item.process.exitCode===null&&item.process.pid){try{await exec('taskkill.exe',['/PID',String(item.process.pid),'/T','/F'],{windowsHide:true,timeout:15000});}catch(error){log(`cleanup: ${error.message}`);}}
  }));processes.clear();stopping=false;
}
async function ensureProfile() {
  const origin=`http://127.0.0.1:${runtime.ports.web}`;
  await require('./legacy-profile.cjs').migrateProfileCookies(session.defaultSession.cookies,origin);
  const existing=await session.defaultSession.cookies.get({url:origin,name:'english_local_profile'});
  if(!existing.length){let profile;const file=path.join(data,'local-profile.json');try{profile=JSON.parse(fs.readFileSync(file,'utf8'));}catch{profile={id:'local-'+randomUUID(),displayName:'学习者',practiceFocus:'conversations',practiceCadence:'15-minutes',createdAt:new Date().toISOString(),onboardingCompleted:true};save(file,profile);}
    await session.defaultSession.cookies.set({url:origin,name:'english_local_profile',value:encodeURIComponent(JSON.stringify(profile)),path:'/',httpOnly:true,sameSite:'lax',expirationDate:Date.now()/1000+365*86400});}
  await session.defaultSession.cookies.set({url:origin,name:'english_app_mode',value:'local',path:'/',sameSite:'lax',expirationDate:Date.now()/1000+365*86400});
  await require('./learning-preferences.cjs').restoreInterfaceLanguage(session.defaultSession.cookies,origin,data);
  await require('./learning-preferences.cjs').persistLearningPreferences(session.defaultSession.cookies,origin,data);
  await session.defaultSession.flushStorageData();
}
async function showStartup() { opened=false;await window.loadFile(path.join(__dirname,'startup.html'));publish(); }
function fail(error){state.error=error.message;log(error.stack||error.message);void showStartup();}
async function start() {
  if(starting||quitting)return;starting=true;state.error='';
  try {
    await stopAll();for(const service of Object.values(state.services)){service.ready=false;service.message='等待启动';}
    await showStartup();await configure();
    for(const key of Object.keys(labels)){state.services[key].message='启动中';launch(key);}publish();
    await Promise.all(Object.keys(labels).map(async key=>{await ready(key);state.services[key].ready=true;state.services[key].message='就绪';publish();}));
    await ensureProfile();opened=true;
    await window.loadURL(`http://127.0.0.1:${runtime.ports.web}/dashboard`);
    log('All services ready; dashboard opened.');
    if(process.env.ENGLISH_DESKTOP_SMOKE_REPORT){
      await delay(1200);
      const page=await window.webContents.executeJavaScript('({url:location.href,text:document.body.innerText.slice(0,5000),secureContext:window.isSecureContext,recorderAvailable:typeof MediaRecorder!=="undefined"})');
      save(process.env.ENGLISH_DESKTOP_SMOKE_REPORT,{ready:true,runtime,guardianPids:[...processes.values()].map(item=>item.process.pid),state,page});
      fs.writeFileSync(process.env.ENGLISH_DESKTOP_SMOKE_REPORT+'.png',(await window.webContents.capturePage()).toPNG());
    }
  }catch(error){fail(error);if(process.env.ENGLISH_DESKTOP_SMOKE_REPORT)save(process.env.ENGLISH_DESKTOP_SMOKE_REPORT,{ready:false,error:error.message,runtime});}
  finally{starting=false;}
}
function trusted(url) {try{const value=new URL(url);return value.protocol==='http:'&&value.hostname==='127.0.0.1'&&runtime&&Number(value.port)===runtime.ports.web;}catch{return false;}}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(window){window.restore();window.focus();}});
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'应用',submenu:[{label:'查看后台日志',click:()=>shell.openPath(logs)},{label:'打开学习数据目录',click:()=>shell.openPath(path.join(data,'learning'))},{label:'重启后台',click:()=>start()},{type:'separator'},{role:'quit',label:'退出'}]},{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'视图',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},...(devRoot?[{role:'toggleDevTools'}]:[])]}]));
    session.defaultSession.setUserAgent(session.defaultSession.getUserAgent()+' EnglishLearningDesktop');
    session.defaultSession.setPermissionCheckHandler((_webContents,permission,origin)=>permission==='media'&&trusted(origin));
    session.defaultSession.setPermissionRequestHandler((_contents,permission,callback,details)=>callback(permission==='media'&&trusted(details.requestingUrl)));
    window=new BrowserWindow({width:1440,height:960,minWidth:1000,minHeight:700,title:'English Learning',show:process.env.ENGLISH_DESKTOP_HEADLESS!=='1',backgroundColor:'#f6f7f2',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,autoplayPolicy:'no-user-gesture-required',preload:path.join(__dirname,'preload.cjs')}});
    window.webContents.setWindowOpenHandler(({url})=>{if(trusted(url))void shell.openExternal(url);else if(/^https:\/\//.test(url))void shell.openExternal(url);return{action:'deny'};});
    window.webContents.on('will-navigate',(event,url)=>{if(!trusted(url)&&!url.startsWith('file://'))event.preventDefault();});
    ipcMain.handle('startup-retry',event=>{if(event.senderFrame.url.startsWith('file://'))return start();});
    ipcMain.handle('startup-logs',event=>{if(event.senderFrame.url.startsWith('file://'))return shell.openPath(logs);});
    window.on('closed',()=>{window=null;app.quit();});
    await start();
  }).catch(error=>{dialog.showErrorBox('启动失败',error.message);app.quit();});
  app.on('before-quit',event=>{
    if(quitting)return;event.preventDefault();quitting=true;
    void (async()=>{
      try{if(runtime)await require('./learning-preferences.cjs').persistLearningPreferences(session.defaultSession.cookies,`http://127.0.0.1:${runtime.ports.web}`,data);}
      catch(error){log('Learning preference persistence: '+error.message);}
      await stopAll();
    })().finally(()=>app.exit(0));
  });
  app.on('window-all-closed',()=>app.quit());
}

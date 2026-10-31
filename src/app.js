import './custom-extensions.js';
import {icon,e,hydrateIcons,btn,relativeDate} from './ui.js';
import {editorView,assistantView,documentsView,documentCards,resourcesView,ocrView,pluginsView,settingsView} from './views.js';
import {dbAll,dbPut,dbDelete} from './storage.js';
import {applyEdits,metrics} from './core/checker.js';
import {parseWordlist,parseHunspell,validatePlugin,validLanguage,MAX_RESOURCE_BYTES,sanitizeCheckPayload} from './core/resources.js';
import {dictionaryAdapters,documentAdapters} from './extensions.js';
import {remoteCheck,validateEndpoint} from './core/remote.js';
import {importDocument,exportDocument,downloadBlob,MAX_TEXT_LENGTH} from './documents.js';
import {SAMPLE_TEXT,OCR_SAMPLE,EXAMPLE_PLUGIN} from './sample.js';
import {createId} from './id.js';
import {showQuickFix,closeQuickFix,quickFixOpen} from './quickfix.js';
import {findIssueAtOffset} from './core/quickfix.js';

const $=selector=>document.querySelector(selector);
const main=$('#main'),dialog=$('#modal');
const DEFAULTS={id:'main',language:'en-US',preset:'general',autoCheck:true,checkNames:false,dialectConsistency:true,personal:[],disabledRules:[],endpoint:'',remoteConsent:false,activeId:null};
const state={docs:[],resources:[],settings:{...DEFAULTS},meta:{},activeId:null,route:'editor',version:0,issues:[],localIssues:[],remoteIssues:[],ignored:new Set(),choices:{},filter:'all',selectedId:null,checking:false,stale:false,capped:false,metrics:{},readability:null,storage:true,saveTimer:0,checkTimer:0,undo:new Map(),redo:new Map(),lastTyped:0,lastDeleted:null,findOpen:false,importOcr:false,importBusy:false};
const currentDoc=()=>state.docs.find(d=>d.id===state.activeId)||state.docs[0];
const currentChapter=()=>currentDoc()?.chapters[currentDoc().activeChapter||0];
const currentText=()=>currentChapter()?.text||'';
const historyKey=()=>`${currentDoc()?.id}:${currentDoc()?.activeChapter||0}`;
// The checker runs in a module worker next to the app. The single-file
// standalone build instead ships the whole worker as a string and starts it
// from a Blob URL — the only kind that browsers allow on file:// pages.
function createCheckerWorker(){
  if(globalThis.PROOFLOOM_WORKER_SOURCE){
    try{return new Worker(URL.createObjectURL(new Blob([globalThis.PROOFLOOM_WORKER_SOURCE],{type:'text/javascript'})));}
    catch(error){state.workerError=error.message;return null;}
  }
  try{return new Worker(new URL('./worker.js',import.meta.url),{type:'module'});}
  catch(error){state.workerError=error.message;return null;}
}
let worker=createCheckerWorker();
let activeImportOptions={};
let bookWorker;

// Browsers silently refuse to structured-clone unexpected payload values and
// the raw error ("Too many properties to enumerate") is opaque. Retry once
// with a sanitized payload before surfacing a clear message.
function postCheck(target,payload){
  try{target.postMessage(payload);return true;}
  catch{
    try{target.postMessage(sanitizeCheckPayload(payload));return true;}
    catch(error){
      state.checking=false;
      state.workerError='This browser refused to hand the document to the checker ('+error.message+'). Disable large imported packs in Dictionaries & languages, then run the check again.';
      renderAssistant();showEditorNotice();toast(state.workerError,true);
      return false;
    }
  }
}

function toast(message,error=false,action){
  const element=document.createElement('div');element.className='toast'+(error?' error':'');element.textContent=message;
  if(action){const b=document.createElement('button');b.textContent=action.label;b.onclick=()=>{action.run();element.remove();};element.append(b);}
  $('#toast-region').append(element);setTimeout(()=>element.remove(),error?10000:5500);
}
function saveStatus(message,dirty=false){const n=$('#save-status');n.innerHTML=`<i style="background:${dirty?'#c0ab75':'#78a26c'}"></i>${e(message)}`;}
async function persist(store,value){
  if(!state.storage)return false;
  try{await dbPut(store,value);return true;}
  catch(err){state.storage=false;saveStatus('In memory — export to keep',true);toast(err.message,true);return false;}
}
function saveSettings(){state.settings.activeId=state.activeId;void persist('settings',state.settings);}
function scheduleSave(doc=currentDoc()){
  if(!doc)return;doc.updatedAt=Date.now();saveStatus('Saving…',true);clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(async()=>{const ok=await persist('documents',doc);saveStatus(ok?'All changes saved':'In memory — export to keep',!ok);renderRecent();},500);
}
async function flushSave(){clearTimeout(state.saveTimer);if(currentDoc())await persist('documents',currentDoc());}
function makeDoc(title='Untitled document',text='',extra={}){return {id:createId(),title,language:state.settings.language,chapters:[{title:'Text',text}],activeChapter:0,sourceType:'draft',source:'',ocr:false,createdAt:Date.now(),updatedAt:Date.now(),snapshots:[],...extra};}
async function addDoc(doc){await flushSave();dialog.close();state.docs.unshift(doc);state.activeId=doc.id;await persist('documents',doc);saveSettings();state.ignored.clear();state.localIssues=[];state.remoteIssues=[];state.metrics=metrics(doc.chapters[doc.activeChapter||0].text,doc.language);state.filter='all';go('editor');}
function sortedDocs(){return [...state.docs].sort((a,b)=>b.updatedAt-a.updatedAt);}
function renderRecent(){
  $('#document-count').textContent=state.docs.length;
  $('#recent-documents').innerHTML=sortedDocs().slice(0,4).map(d=>`<button class="recent-document" data-action="open-document" data-id="${e(d.id)}" title="${e(d.title)}">${icon('file')}<span>${e(d.title)}</span></button>`).join('');
}
function context(){return {...state,doc:currentDoc(),docs:sortedDocs()};}
function go(route){
  if(location.hash==='#'+route)render(route);else location.hash=route;
}
function render(route=location.hash.slice(1)||'editor'){
  if(!['editor','documents','resources','ocr','plugins','settings'].includes(route))route='editor';
  state.route=route;state.findOpen=false;document.body.classList.remove('nav-open');closeQuickFix();
  document.querySelectorAll('[data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===route));
  $('#breadcrumb-current').textContent={editor:'Writing desk',documents:'My documents',resources:'Dictionaries & languages',ocr:'OCR studio',plugins:'Extension lab',settings:'Preferences'}[route];
  const ctx=context();
  main.innerHTML=route==='editor'?editorView(ctx):route==='documents'?documentsView(ctx):route==='resources'?resourcesView(ctx):route==='ocr'?ocrView():route==='plugins'?pluginsView(ctx,EXAMPLE_PLUGIN):settingsView(ctx);
  renderRecent();
  if(route==='editor'){
    $('#document-title').value=currentDoc().title;
    const ta=$('#editor');ta.value=currentText();
    const language=currentDoc().language||state.settings.language;
    const pack=state.resources.find(p=>p.enabled&&(p.language===language||p.language===language.split('-')[0]));
    ta.dir=pack?.direction||(/^(ar|he|fa|ur|ps|dv|yi)(-|$)/i.test(language)?'rtl':'ltr');
    $('#highlight-layer').dir=ta.dir;
    resizeEditor();renderStats();renderHighlights();renderAssistant();showEditorNotice();queueCheck(0);
  }
  if(route==='ocr'){
    const zone=$('#ocr-dropzone');zone.addEventListener('dragover',ev=>{ev.preventDefault();zone.classList.add('dragover');});zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));
    zone.addEventListener('drop',ev=>{ev.preventDefault();zone.classList.remove('dragover');activeImportOptions={ocr:true};void importFiles(ev.dataTransfer.files);});
    zone.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target===zone){ev.preventDefault();actions['ocr-import']();}});
    zone.addEventListener('click',ev=>{if(!ev.target.closest('button'))actions['ocr-import']();});
  }
  if(route==='documents'){
    $('#document-search').addEventListener('input',updateDocuments);
    $('#document-sort').addEventListener('change',updateDocuments);
  }
}
function updateDocuments(){const q=$('#document-search')?.value.toLowerCase()||'';const list=sortedDocs().filter(d=>d.title.toLowerCase().includes(q)||d.chapters.some(c=>c.text.toLowerCase().includes(q)));if($('#document-sort')?.value==='title')list.sort((a,b)=>a.title.localeCompare(b.title));$('#document-cards').innerHTML=documentCards(list);}
function resizeEditor(){const ta=$('#editor');if(!ta)return;ta.style.height='0px';ta.style.height=Math.max(window.innerWidth<=680?360:450,ta.scrollHeight)+'px';}
function showEditorNotice(){
  const n=$('#editor-notice');if(!n)return;
  const doc=currentDoc();let text='';
  if(doc.importNote)text=`<div class="restoration-callout">${icon(doc.ocr?'scan':'info')}<span>${e(doc.importNote)}</span></div>`;
  if(!doc.language?.startsWith('en')&&!(state.meta?.languages||[]).some(l=>l.code===doc.language||l.code===doc.language.split('-')[0])&&!state.resources.some(p=>p.enabled&&(p.language===doc.language||p.language===doc.language.split('-')[0])))text+=`<div class="editor-warning">This language has no bundled dictionary or active resource pack. Add vocabulary and language rules in Dictionaries & languages.</div>`;
  if(state.workerError){
    const standalone=location.protocol==='file:';
    text+=standalone
      ?`<div class="editor-warning">The local checker could not start on a ${e(location.protocol)} page — browsers block worker scripts there. Open the single-file build (<strong>proofloom-standalone.html</strong>) instead, or serve this folder over HTTPS or localhost.</div>`
      :`<div class="editor-warning">The local checker reported a problem: ${e(state.workerError)} Try reloading the page and running the check again. If it persists, disable large imported packs in Dictionaries &amp; languages.</div>`;
  }
  n.innerHTML=text;
}
function visibleIssues(){return [...state.localIssues,...state.remoteIssues].filter(i=>!state.ignored.has(issueKey(i))).sort((a,b)=>a.start-b.start||b.confidence-a.confidence).filter((i,n,all)=>!all.slice(0,n).some(x=>x.start===i.start&&x.end===i.end&&x.replacements[0]===i.replacements[0]));}
function issueKey(i){return `${i.ruleId}|${i.start}|${i.original}`;}
function renderAssistant(){
  state.issues=visibleIssues();if(!$('#assistant'))return;
  const list=$('#suggestions-list'),scroll=list?.scrollTop||0;
  $('#assistant').innerHTML=assistantView({...state,issues:state.issues});
  hydrateIcons($('#assistant'));
  if($('#suggestions-list'))$('#suggestions-list').scrollTop=scroll;
}
function renderHighlights(){
  const layer=$('#highlight-layer');if(!layer)return;
  const text=currentText(),selected=[];
  const candidates=[...state.issues].sort((a,b)=>(a.id===state.selectedId?-1:b.id===state.selectedId?1:0)||b.confidence-a.confidence);
  for(const i of candidates){if(text.slice(i.start,i.end)!==i.original||i.start===i.end||selected.some(x=>i.start<x.end&&i.end>x.start))continue;selected.push(i);}
  let html='',cursor=0;
  for(const i of selected.sort((a,b)=>a.start-b.start)){html+=e(text.slice(cursor,i.start))+`<mark class="${e(i.category)} ${i.id===state.selectedId?'selected':''}" data-issue-id="${e(i.id)}">${e(text.slice(i.start,i.end))}</mark>`;cursor=i.end;}
  layer.innerHTML=html+e(text.slice(cursor))+'\n';
}
function renderStats(){
  if(!$('#word-count'))return;const m=state.metrics;
  $('#word-count').textContent=(m.words||0).toLocaleString()+' words';$('#character-count').textContent=(m.characters||0).toLocaleString()+' characters';$('#reading-time').innerHTML=icon('clock')+`${m.readingMinutes||1} min read`;
}
// In-editor quick fix: clicking a highlighted word opens a correction
// popover anchored to that word; picking one rewrites the text in place.
function openQuickFixFor(issue){
  const layer=$('#highlight-layer');if(!layer||!issue)return;
  const selector=()=>layer.querySelector(`mark[data-issue-id="${CSS.escape(issue.id)}"]`);
  let mark=selector();
  if(!mark){state.selectedId=issue.id;renderAssistant();renderHighlights();mark=selector();}
  if(!mark)return;
  showQuickFix({
    original:issue.original,category:issue.category,message:issue.message,
    replacements:issue.replacements,chosen:state.choices[issue.id]||0,
    anchor:mark.getBoundingClientRect(),
    onPick:index=>applyQuickFix(issue,index),
    onIgnore:()=>{state.ignored.add(issueKey(issue));renderAssistant();renderHighlights();},
    onAddWord:()=>addPersonalWord(issue.original),
    onDisable:()=>{state.settings.disabledRules.push(issue.ruleId);saveSettings();state.localIssues=state.localIssues.filter(x=>x.ruleId!==issue.ruleId);state.remoteIssues=state.remoteIssues.filter(x=>x.ruleId!==issue.ruleId);renderAssistant();renderHighlights();toast('Rule disabled. Reset it in Preferences.');},
  });
}
function applyQuickFix(issue,index){
  const replacement=issue.replacements[index];if(replacement===undefined)return;
  state.choices[issue.id]=index;
  const original=currentText();
  if(original.slice(issue.start,issue.end)!==issue.original){closeQuickFix();toast('The text changed. Running another check.');queueCheck(0);return;}
  setText(original.slice(0,issue.start)+replacement+original.slice(issue.end));
  closeQuickFix();
  toast('Correction applied.',false,{label:'Undo',run:()=>actions.undo()});
}
function queueCheck(delay=500){
  clearTimeout(state.checkTimer);state.version++;state.stale=true;state.remoteIssues=[];
  if(!state.settings.autoCheck&&delay!==0){state.checking=false;state.localIssues=[];state.issues=[];renderAssistant();renderHighlights();return;}
  state.checkTimer=setTimeout(runCheck,delay);
}
function runCheck(){
  if(!worker||!currentDoc())return;
  state.checking=true;state.stale=false;state.capped=false;
  const text=currentText(),doc=currentDoc();
  if(!text.trim()){state.localIssues=[];state.remoteIssues=[];state.checking=false;state.metrics=metrics(text,doc.language);state.readability=null;renderAssistant();renderHighlights();renderStats();return;}
  $('#check-label')&&($('#check-label').textContent='Checking…');
  renderAssistant();
  postCheck(worker,{type:'check',id:state.version,text,packs:state.resources,personal:state.settings.personal,options:{language:doc.language||state.settings.language,preset:state.settings.preset,ocr:doc.ocr,checkNames:state.settings.checkNames,dialectConsistency:state.settings.dialectConsistency,disabledRules:state.settings.disabledRules}});
}
if(worker){
  worker.onmessage=({data})=>{
    if(data.id!==state.version)return;
    if(data.type==='result'){
      state.localIssues=data.issues;state.checking=false;state.capped=data.capped;state.metrics=data.metrics;state.readability=data.readability||null;
      if(!state.selectedId||!data.issues.some(i=>i.id===state.selectedId))state.selectedId=data.issues[0]?.id;
      renderAssistant();renderHighlights();renderStats();$('#check-label')&&($('#check-label').textContent='Check text');
    }else if(data.type==='error'){state.checking=false;state.workerError=data.message;renderAssistant();showEditorNotice();toast('The local check could not finish: '+data.message,true);}
  };
  worker.onerror=ev=>{state.checking=false;state.workerError=ev.message||'Worker unavailable';showEditorNotice();toast('The local checker could not start. '+state.workerError,true);};
}
function pushUndo(text=currentText(),force=true){
  const key=historyKey(),stack=state.undo.get(key)||[];
  if(!force&&Date.now()-state.lastTyped<900)return;
  if(stack.at(-1)!==text)stack.push(text);
  while(stack.length>40||stack.reduce((n,s)=>n+s.length,0)>12_000_000)stack.shift();
  state.undo.set(key,stack);state.redo.set(key,[]);state.lastTyped=Date.now();
}
function setText(text,{history=true,label='Edit'}={}){
  const total=currentDoc().chapters.reduce((n,c)=>n+c.text.length,0)-currentText().length+text.length;
  if(total>MAX_TEXT_LENGTH){toast('This edit exceeds the two-million-character workspace limit.',true);return false;}
  if(text===currentText())return false;
  if(history)pushUndo();currentChapter().text=text;state.localIssues=[];state.remoteIssues=[];state.ignored.clear();state.metrics=metrics(text,currentDoc().language);
  if($('#editor')){$('#editor').value=text;resizeEditor();renderStats();renderHighlights();}
  scheduleSave();queueCheck(100);return true;
}
function selectIssue(index,focus=true){const i=state.issues[index];if(!i)return;state.selectedId=i.id;renderAssistant();renderHighlights();if(focus&&$('#editor')){const ta=$('#editor');ta.focus({preventScroll:true});ta.setSelectionRange(i.start,i.end);const before=currentText().slice(0,i.start);const visualLines=before.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/Math.max(20,ta.clientWidth/9))),0);$('#editor-surface').scrollTop=Math.max(0,visualLines*30-130);}}
function snapshot(label='Saved checkpoint'){
  const doc=currentDoc();doc.snapshots||=[];
  doc.snapshots.unshift({id:createId(),label,at:Date.now(),title:doc.title,chapters:structuredClone(doc.chapters)});
  while(doc.snapshots.length>10||doc.snapshots.reduce((n,s)=>n+s.chapters.reduce((m,c)=>m+c.text.length,0),0)>12_000_000)doc.snapshots.pop();scheduleSave();
}
function openModal(title,body){$('#modal-content').innerHTML=`<div class="modal-header"><h2>${e(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div>`;if(!dialog.open)dialog.showModal();}
function showHelp(){openModal('A little guidance.',`<p>Proofloom is a local-first workspace for proofreading and OCR restoration. Import a document, review suggestions, and export your words when they feel right.</p><div class="modal-menu"><button data-action="help-guide">${icon('book')}Capabilities & GitHub deployment guide ${icon('external')}</button><button data-action="quick">${icon('search')}Quick actions<kbd>Ctrl K</kbd></button><button data-action="statistics">${icon('chart')}Writing insights</button><button data-action="credits">${icon('info')}Open-source credits</button></div><div class="hr"></div><p class="view-note">English dictionaries and local checks are built in. Additional grammar analysis can come from a connected server or a trusted check provider. There is no plagiarism service or generative rewriting engine built in, and suggestions can be wrong.</p><p class="view-note">Text and drafts stay in this browser unless you explicitly use a connected check. Downloads preserve your words outside this browser. GitHub Pages hosts the files; it does not provide a backend.</p>`);}
function showImport(ocr=false){activeImportOptions={ocr};openModal(ocr?'Bring in a scan.':'Give your words a home.',`<p>Import text, a document, or an ebook. Your file is read in this browser.</p><div class="dropzone" style="min-height:190px" id="import-drop">${icon('upload')}<h2>A fresh perspective starts here.</h2><p>TXT · DOCX · PDF · EPUB · ODT · RTF · HTML · FB2<br>Markdown, subtitles, and images are welcome too.</p>${btn('Choose files','choose-document','upload',true)}</div><label class="check-row"><input type="checkbox" id="import-ocr" ${ocr?'checked':''}/>Recognize scanned PDF pages with local English OCR</label><p class="view-note">Up to 80 MB per file, 500 PDF pages, and two million text characters per document. Import creates editable text. Original page layout, illustrations, and formatting are not retained.</p><div class="inline-actions">${btn('Paste text instead','paste','type')}${btn('Try an OCR sample','ocr-sample','file')}</div>`);
  const zone=$('#import-drop');zone.addEventListener('dragover',ev=>ev.preventDefault());zone.addEventListener('drop',ev=>{ev.preventDefault();activeImportOptions.ocr=$('#import-ocr')?.checked||false;void importFiles(ev.dataTransfer.files);});
}
async function importFiles(files){
  if(state.importBusy){toast('An import is already running.');return;}if(!files.length)return;
  state.importBusy=true;const options={...activeImportOptions};
  try{
    for(const file of [...files].slice(0,20)){
      openModal('Making room for your words.',`<p>${e(file.name)}</p><div class="progress-track"><div class="progress-fill" id="import-progress"></div></div><div class="import-status" id="import-status">Reading your document locally…</div><p class="view-note">For a large scan, recognition may take a few minutes. You can close this dialog while the import continues.</p>`);
      try{
        const doc=await importDocument(file,{...options,progress:(status,percent)=>{if($('#import-status'))$('#import-status').textContent=status+(Number.isFinite(percent)?` · ${percent}%`:'');if($('#import-progress'))$('#import-progress').style.width=Math.max(0,Math.min(100,percent||0))+'%';}});
        doc.language=state.settings.language;await addDoc(doc);dialog.close();toast('Imported “'+doc.title+'”.');
      }catch(err){dialog.close();toast(file.name+': '+err.message,true);}
    }
  }finally{state.importBusy=false;$('#document-file').value='';}
}
function showResourceImport(pluginOnly=false){
  openModal(pluginOnly?'Add your own rule pack.':'Make room for more words.',`<p>${pluginOnly?'Choose a JSON API v1 rule or language pack.':'Import a wordlist, a JSON pack, or a UTF-8 Hunspell dictionary pair. Choose both .aff and .dic files together to keep inflection rules.'}</p><div class="field-row"><div class="field"><label for="resource-name">Resource name</label><input id="resource-name" placeholder="My specialist dictionary" maxlength="100"/></div><div class="field"><label for="resource-language">Language code · BCP-47</label><input id="resource-language" value="en" placeholder="en, hi, ja, ar…" maxlength="50"/></div></div><div class="field-row"><div class="field"><label for="resource-encoding">Wordlist encoding</label><select id="resource-encoding"><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252</option><option value="utf-16le">UTF-16 LE</option><option value="iso-8859-1">ISO-8859-1</option></select></div><div class="field"><label for="resource-license">Source / license</label><input id="resource-license" placeholder="User supplied" maxlength="150"/></div></div><div class="format-chips"><span>.txt</span><span>.csv</span><span>.tsv</span><span>.json</span><span>.aff + .dic</span></div><p class="view-note">One word per line, or a word / term / entry column in CSV or TSV. JSON accepts a word array, an object keyed by word, or a full versioned resource pack. Each file can be up to 12 MB. A .dic file on its own imports surface forms.</p>${btn('Choose resource files','choose-resource','upload',true)}<div id="resource-message" class="inline-message" role="status"></div>`);
}
function renderBookReview(){
  const review=state.bookReview;if(!review)return;
  const doc=state.docs.find(d=>d.id===review.documentId);if(!doc)return;
  const total=review.results.reduce((n,r)=>n+(r?.issues.length||0),0),safe=review.results.reduce((n,r)=>n+(r?.issues.filter(i=>i.safe&&i.replacements.length).length||0),0);
  openModal(review.running?'Reading the whole story.':'A clearer view of your book.',`<p>“${e(doc.title)}” · ${review.completed} of ${doc.chapters.length} sections checked locally.</p>${review.running?`<div class="progress-track"><div class="progress-fill" style="width:${review.completed/doc.chapters.length*100}%"></div></div><p class="import-status">Checking section ${Math.min(review.completed+1,doc.chapters.length)} in a background worker…</p>`:`<div class="info-banner">${icon('book')}<div><strong>${total.toLocaleString()} suggestions · ${safe.toLocaleString()} safe fix${safe===1?'':'es'}</strong>Review suggestions section by section, or apply only high-confidence spelling, spacing, and character fixes. A checkpoint preserves the original.${review.capped?' The report reached an issue limit; resolve these issues and check again.':''}</div></div>`}<div class="table-scroll" style="max-height:300px"><table><thead><tr><th>Section</th><th>Suggestions</th><th></th></tr></thead><tbody>${doc.chapters.slice(0,100).map((c,i)=>`<tr><td>${i+1}. ${e(c.title)}</td><td>${review.results[i]?review.results[i].issues.length:'—'}</td><td>${review.results[i]?`<button class="text-link" data-action="book-open-section" data-index="${i}">Review</button>`:''}</td></tr>`).join('')}</tbody></table></div>${doc.chapters.length>100?'<p class="view-note">The first 100 sections are listed. The report includes all checked sections.</p>':''}<div class="modal-footer">${review.running?btn('Stop review','book-stop','close'):btn('Download report','book-report','download')}${!review.running?btn('Apply safe fixes','book-apply-safe','check',true,safe?'':'disabled'):''}</div>`);
}
async function reviewBook(){
  if(state.bookReview?.running){renderBookReview();return;}
  const doc=currentDoc();await flushSave();
  const texts=doc.chapters.map(c=>c.text),review={documentId:doc.id,texts,results:[],completed:0,running:true,capped:false,at:Date.now()};state.bookReview=review;
  bookWorker=createCheckerWorker();
  if(!bookWorker){review.running=false;toast('The checker worker could not start: '+(state.workerError||'unknown error'),true);renderBookReview();return;}
  const options={language:doc.language,preset:state.settings.preset,ocr:doc.ocr,checkNames:state.settings.checkNames,dialectConsistency:state.settings.dialectConsistency,disabledRules:state.settings.disabledRules};
  let retained=0;
  const sendNext=()=>{if(!review.running)return;if(review.completed>=texts.length){review.running=false;bookWorker.terminate();renderBookReview();return;}postCheck(bookWorker,{type:'check',id:review.completed+1,text:texts[review.completed],packs:state.resources,personal:state.settings.personal,options});};
  bookWorker.onmessage=({data})=>{
    if(data.type==='error'){review.running=false;bookWorker.terminate();toast('Book review stopped: '+data.message,true);renderBookReview();return;}
    if(data.type!=='result'||!review.running)return;
    const remaining=Math.max(0,12000-retained),issues=data.issues.slice(0,remaining);review.capped||=data.capped||data.issues.length>remaining;retained+=issues.length;
    review.results[review.completed]={title:doc.chapters[review.completed].title,issues,metrics:data.metrics};review.completed++;
    if(dialog.open&&$('#modal-content h2')?.textContent==='Reading the whole story.')renderBookReview();sendNext();
  };
  bookWorker.onerror=ev=>{review.running=false;bookWorker.terminate();toast('Book review stopped: '+ev.message,true);renderBookReview();};
  renderBookReview();sendNext();
}
async function importResources(files){
  if(!files.length)return;
  try{
    const options={name:$('#resource-name')?.value.trim()||files[0].name,language:validLanguage($('#resource-language')?.value.trim()||'en'),license:$('#resource-license')?.value.trim()||'User supplied'};
    const encoding=$('#resource-encoding')?.value||'utf-8';
    for(const f of files)if(f.size>MAX_RESOURCE_BYTES)throw new Error(f.name+' exceeds the 12 MB resource limit.');
    const read=async f=>new TextDecoder(encoding,{fatal:true}).decode(await f.arrayBuffer());
    const list=[...files],aff=list.find(f=>/\.aff$/i.test(f.name)),dic=list.find(f=>/\.dic$/i.test(f.name));
    const packs=[];
    if(aff){if(!dic)throw new Error('Choose the matching .dic file together with this .aff file.');packs.push(parseHunspell(await read(aff),await read(dic),options));}
    for(const file of list){
      if(file===aff||(aff&&file===dic))continue;
      const ext=file.name.split('.').pop().toLowerCase();
      const adapter=dictionaryAdapters().find(a=>a.extensions?.includes(ext));
      const pack=adapter?await adapter.read(file,options):parseWordlist(await read(file),ext,{...options,name:list.length>1?file.name:options.name});
      packs.push(pack);
    }
    for(const pack of packs)await installPack(pack);
    dialog.close();go('resources');toast(`Added ${packs.length} resource${packs.length===1?'':'s'}.`);
  }catch(err){if($('#resource-message'))$('#resource-message').textContent=err.message;else toast(err.message,true);}
  finally{$('#resource-file').value='';}
}
async function installPack(pack){
  if(state.resources.length>=60&&!state.resources.some(p=>p.id===pack.id))throw new Error('The workspace supports up to 60 resource packs. Remove an unused pack first.');
  const position=state.resources.findIndex(p=>p.id===pack.id);if(position>=0)state.resources[position]=pack;else state.resources.push(pack);
  await persist('resources',pack);queueCheck(0);
}

const actions={
  new:()=>addDoc(makeDoc()),
  import:()=>showImport(false),
  'ocr-import':()=>showImport(true),
  'choose-document':()=>{activeImportOptions.ocr=$('#import-ocr')?.checked||false;$('#document-file').click();},
  'close-modal':()=>dialog.close(),
  'go-editor':()=>{dialog.close();go('editor');},
  'open-document':async b=>{await flushSave();state.activeId=b.dataset.id;state.ignored.clear();state.localIssues=[];state.remoteIssues=[];state.metrics={};state.selectedId=null;saveSettings();dialog.close();go('editor');},
  'delete-document':async b=>{
    const d=state.docs.find(x=>x.id===b.dataset.id);if(!d)return;state.lastDeleted=d;state.docs=state.docs.filter(x=>x.id!==d.id);if(state.storage)await dbDelete('documents',d.id);
    if(!state.docs.length){const fresh=makeDoc();state.docs.push(fresh);await persist('documents',fresh);}if(state.activeId===d.id)state.activeId=state.docs[0].id;saveSettings();render();
    toast('Document removed.',false,{label:'Undo',run:async()=>{state.docs.unshift(d);await persist('documents',d);render();}});
  },
  'toggle-ocr':()=>{currentDoc().ocr=!currentDoc().ocr;scheduleSave();const button=document.querySelector('[data-action="toggle-ocr"]');button?.classList.toggle('on',currentDoc().ocr);button?.setAttribute('aria-pressed',String(currentDoc().ocr));queueCheck(0);},
  check:()=>queueCheck(0),
  filter:b=>{state.filter=b.dataset.filter;renderAssistant();},
  accept:b=>{
    const issue=state.issues[Number(b.dataset.issue)];if(!issue||!issue.replacements.length||state.checking)return;
    const original=currentText();if(original.slice(issue.start,issue.end)!==issue.original){toast('The text changed. Running another check.');queueCheck(0);return;}
    const replacement=issue.replacements[state.choices[issue.id]||0];setText(original.slice(0,issue.start)+replacement+original.slice(issue.end));
    toast('A little clearer. Edit accepted.',false,{label:'Undo',run:()=>actions.undo()});
  },
  ignore:b=>{const i=state.issues[Number(b.dataset.issue)];if(!i)return;state.ignored.add(issueKey(i));renderAssistant();renderHighlights();},
  'disable-rule':b=>{const i=state.issues[Number(b.dataset.issue)];if(!i)return;state.settings.disabledRules.push(i.ruleId);state.localIssues=state.localIssues.filter(x=>x.ruleId!==i.ruleId);state.remoteIssues=state.remoteIssues.filter(x=>x.ruleId!==i.ruleId);saveSettings();renderAssistant();renderHighlights();toast('Rule disabled. Reset it in Preferences.');},
  'apply-safe':()=>{
    if(state.checking)return;const result=applyEdits(currentText(),state.issues,{safeOnly:true});if(!result.count){toast('No high-confidence fixes are waiting.');return;}
    snapshot('Before safe fixes');setText(result.text);toast(`Applied ${result.count} safe fix${result.count===1?'':'es'}.`,false,{label:'Undo',run:()=>actions.undo()});
  },
  'add-word':b=>{const i=state.issues[Number(b.dataset.issue)];if(i)addPersonalWord(i.original);},
  undo:()=>{
    const key=historyKey(),stack=state.undo.get(key)||[],value=stack.pop();if(value===undefined){toast('No earlier edit in this session.');return;}
    const redo=state.redo.get(key)||[];redo.push(currentText());state.redo.set(key,redo);setText(value,{history:false});
  },
  redo:()=>{
    const key=historyKey(),stack=state.redo.get(key)||[],value=stack.pop();if(value===undefined)return;
    const undo=state.undo.get(key)||[];undo.push(currentText());state.undo.set(key,undo);setText(value,{history:false});
  },
  focus:()=>document.body.classList.toggle('focus-mode'),
  find:()=>{state.findOpen=!state.findOpen;const container=$('#find-container');container.innerHTML=state.findOpen?`<div class="find-bar"><input id="find-text" aria-label="Find text" placeholder="Find…"/><input id="replace-text" aria-label="Replacement text" placeholder="Replace with…"/><label><input type="checkbox" id="find-case"/>Match case</label>${btn('Find next','find-next')}${btn('Replace all','replace-all')}<button class="icon-button" data-action="find" aria-label="Close find bar">${icon('close')}</button></div>`:'';$('#find-text')?.focus();},
  'find-next':()=>{
    const query=$('#find-text')?.value;if(!query)return;const text=currentText(),sensitive=$('#find-case').checked,hay=sensitive?text:text.toLowerCase(),needle=sensitive?query:query.toLowerCase();
    const from=$('#editor').selectionEnd;let index=hay.indexOf(needle,from);if(index<0)index=hay.indexOf(needle);if(index<0){toast('No matching text found.');return;}const ta=$('#editor');ta.focus({preventScroll:true});ta.setSelectionRange(index,index+query.length);
  },
  'replace-all':()=>{
    const query=$('#find-text')?.value;if(!query)return;const replacement=$('#replace-text').value,sensitive=$('#find-case').checked;
    const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),regex=new RegExp(escaped,sensitive?'gu':'giu');let count=0;
    const text=currentText().replace(regex,()=>{count++;return replacement;});if(count){snapshot('Before find and replace');setText(text);}toast(`Replaced ${count} occurrence${count===1?'':'s'}.`);
  },
  'document-menu':()=>openModal('A little more room to work.',`<div class="modal-menu"><button data-action="export">${icon('download')}Export document</button><button data-action="snapshot">${icon('history')}Save a checkpoint</button><button data-action="history">${icon('history')}Version history</button><button data-action="duplicate">${icon('copy')}Duplicate document</button><button data-action="statistics">${icon('chart')}Writing insights</button><button data-action="review-book">${icon('book')}Review entire document</button><button data-action="remote-check">${icon('cloud')}Connected grammar check</button><button data-action="reflow">${icon('scan')}Reflow wrapped lines</button><button data-action="report">${icon('code')}Download suggestion report</button></div>`),
  'review-book':()=>reviewBook(),
  'book-stop':()=>{if(state.bookReview)state.bookReview.running=false;bookWorker?.terminate();renderBookReview();},
  'book-open-section':async b=>{await flushSave();state.activeId=state.bookReview.documentId;currentDoc().activeChapter=Number(b.dataset.index);state.localIssues=[];state.remoteIssues=[];state.ignored.clear();state.metrics={};dialog.close();go('editor');saveSettings();},
  'book-report':()=>{const r=state.bookReview;downloadBlob(new Blob([JSON.stringify({application:'Proofloom',version:1,document:state.docs.find(d=>d.id===r.documentId)?.title,checkedAt:new Date(r.at).toISOString(),completed:r.completed,capped:r.capped,sections:r.results},null,2)],{type:'application/json'}),'proofloom-book-review.json');},
  'book-apply-safe':()=>{
    const review=state.bookReview,doc=state.docs.find(d=>d.id===review.documentId);if(!doc||review.running)return;
    if(doc.chapters.some((c,i)=>c.text!==review.texts[i])||doc.chapters.length!==review.texts.length){toast('The book changed after this review. Run another book review before applying fixes.',true);return;}
    state.activeId=doc.id;snapshot('Before safe fixes across the book');let count=0;
    doc.chapters=doc.chapters.map((c,i)=>{const result=applyEdits(c.text,review.results[i]?.issues||[],{safeOnly:true});count+=result.count;return {...c,text:result.text};});
    scheduleSave();state.bookReview=null;state.localIssues=[];state.remoteIssues=[];dialog.close();go('editor');toast(`Applied ${count} safe fixes across the book. The original is in Version history.`);
  },
  snapshot:()=>{snapshot();dialog.close();toast('Checkpoint saved.');},
  history:()=>{
    const snapshots=currentDoc().snapshots||[];
    openModal('A little history.',`<p>Checkpoints are kept with this draft. Up to ten are retained, within a combined twelve-million-character limit.</p>${snapshots.length?snapshots.map((s,i)=>`<div class="history-item"><div><strong>${e(s.label)}</strong><small>${new Date(s.at).toLocaleString()} · ${s.chapters.length} sections</small></div><button class="btn btn-sm" data-action="restore-snapshot" data-index="${i}">Restore</button></div>`).join(''):'<div class="empty-state"><h3>No checkpoints yet.</h3><p>Save a checkpoint before a major revision.</p></div>'}<div class="modal-footer">${btn('Save checkpoint','snapshot','plus',true)}</div>`);
  },
  'restore-snapshot':b=>{
    const s=structuredClone(currentDoc().snapshots[Number(b.dataset.index)]);if(!s)return;snapshot('Before restoring a checkpoint');currentDoc().chapters=s.chapters;currentDoc().title=s.title;currentDoc().activeChapter=0;state.undo.clear();state.redo.clear();scheduleSave();dialog.close();render('editor');toast('Checkpoint restored.');
  },
  duplicate:()=>{const d=structuredClone(currentDoc());d.id=createId();d.title+=' — copy';d.createdAt=Date.now();d.updatedAt=Date.now();d.snapshots=[];dialog.close();return addDoc(d);},
  export:()=>openModal('Let your words travel.',`<p>Export every section of “${e(currentDoc().title)}”. Document exports use a fresh text-based layout; source formatting and images are not preserved.</p><div class="export-grid">${[['txt','Plain text','Simple, portable words'],['docx','Word document','A fresh editable document'],['epub','EPUB ebook','Reflowable text with chapters'],['html','HTML document','Readable in any browser'],['md','Markdown','Plain text for your workflow'],['pdf','Print / save PDF','Browser print dialog']].map(([f,l,d])=>`<button class="export-choice" data-action="download" data-format="${f}"><strong>${l}</strong><small>${d}</small></button>`).join('')}</div><p class="view-note">EPUB export creates a new text-only ebook with navigation and metadata. Original cover art, footnote links, and illustrations are not retained.</p>`),
  download:async b=>{
    const format=b.dataset.format;const doc={...currentDoc(),language:currentDoc().language};
    if(format==='pdf'){const blob=await exportDocument(doc,'html'),url=URL.createObjectURL(blob),win=window.open(url,'_blank');if(!win){URL.revokeObjectURL(url);toast('Allow a print window, or export HTML and print it from your browser.',true);return;}win.addEventListener('load',()=>{win.focus();win.print();},{once:true});setTimeout(()=>URL.revokeObjectURL(url),120000);dialog.close();return;}
    const blob=await exportDocument(doc,format);downloadBlob(blob,fileName(doc.title)+'.'+format);dialog.close();toast('Your document is ready to take with you.');
  },
  report:()=>{downloadBlob(new Blob([JSON.stringify({application:'Proofloom',version:state.meta.version,document:currentDoc().title,chapter:currentChapter().title,language:currentDoc().language,metrics:state.metrics,issues:state.issues,generatedAt:new Date().toISOString()},null,2)],{type:'application/json'}),fileName(currentDoc().title)+'-suggestions.json');dialog.close();},
  statistics:()=>{
    const m=metrics(currentText(),currentDoc().language);openModal('A different view of your words.',`<p>Insights for the current chapter. These estimates describe the text; they do not grade its meaning or quality.</p><div class="readability-list">${[[m.words.toLocaleString(),'Words'],[m.sentences,'Sentences'],[m.paragraphs,'Paragraphs'],[m.averageSentence,'Words per sentence'],[m.uniqueWords.toLocaleString(),'Different words'],[m.readingMinutes+' min','Estimated reading time']].map(([n,l])=>`<div class="readability-item"><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>${currentDoc().language?.startsWith('en')?`<div class="info-banner">${icon('chart')}<div><strong>Approximate Flesch reading ease: ${m.readability} / 100</strong>This uses a simple vowel-group syllable estimate. Short passages, names, poetry, and technical writing can make the score misleading.</div></div>`:''}${btn('Back to writing','go-editor','pen',true)}`);
  },
  reflow:()=>{
    const reflowed=currentText().replace(/(?<!\n)\n(?!\n)/g,' ');
    openModal('Give the lines a little room.',`<p>Join single line breaks into spaces. Blank lines keep paragraph boundaries. Preview the result before applying it; poetry, lists, and headings may need their original breaks.</p><div class="field"><label for="reflow-preview">Editable preview</label><textarea id="reflow-preview" rows="12" aria-label="Reflowed text preview">${e(reflowed)}</textarea></div><div class="modal-footer">${btn('Keep original','close-modal')}${btn('Apply reflow','apply-reflow','check',true)}</div>`);
  },
  'apply-reflow':()=>{snapshot('Before reflowing lines');setText($('#reflow-preview').value);dialog.close();toast('Line breaks reflowed.',false,{label:'Undo',run:()=>actions.undo()});},
  paste:()=>openModal('A fresh page for your text.',`<div class="field"><label for="paste-title">Document title</label><input id="paste-title" value="Pasted text" maxlength="160"/></div><div class="field"><label for="paste-text">Your text</label><textarea id="paste-text" rows="12" maxlength="2000000" placeholder="Paste your text here…"></textarea></div><label class="check-row"><input id="paste-ocr" type="checkbox"/>This text came from OCR</label><div class="modal-footer">${btn('Create document','create-pasted','plus',true)}</div>`),
  'create-pasted':()=>{const text=$('#paste-text').value,title=$('#paste-title').value.trim()||'Pasted text',ocr=$('#paste-ocr').checked;dialog.close();return addDoc(makeDoc(title,text,{ocr}));},
  'ocr-sample':()=>{dialog.close();return addDoc(makeDoc('The pleasure of reading',OCR_SAMPLE,{ocr:true,sourceType:'OCR sample',importNote:'A sample with intentional recognition errors. Compare each suggested repair with the intended meaning.'}));},
  'add-resource':()=>showResourceImport(),
  'plugin-import':()=>showResourceImport(true),
  'choose-resource':()=>$('#resource-file').click(),
  'remove-resource':async b=>{state.resources=state.resources.filter(p=>p.id!==b.dataset.id);if(state.storage)await dbDelete('resources',b.dataset.id);render();queueCheck(0);toast('Resource removed.');},
  'plugin-install':async()=>{
    try{const pack=validatePlugin(JSON.parse($('#plugin-json').value));await installPack(pack);$('#plugin-message').textContent=`Installed “${pack.name}”: ${pack.rules.length} phrase rules, ${pack.words.length} words. Same-ID packs replace their earlier version.`;toast('Your extension is ready.');}
    catch(err){$('#plugin-message').textContent=err.message;}
  },
  'plugin-download':()=>{try{const pack=validatePlugin(JSON.parse($('#plugin-json').value));downloadBlob(new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}),pack.id+'.json');}catch(err){$('#plugin-message').textContent=err.message;}},
  'personal-add':()=>{const field=$('#personal-word');if(field&&addPersonalWord(field.value))field.value='';},
  'personal-remove':b=>{state.settings.personal=state.settings.personal.filter(w=>w!==b.dataset.word);saveSettings();render('resources');queueCheck(0);},
  'save-connection':()=>{
    try{const endpoint=$('#remote-endpoint').value.trim();if(endpoint)validateEndpoint(endpoint);state.settings.endpoint=endpoint;state.settings.remoteConsent=$('#remote-consent').checked;saveSettings();$('#connection-message').textContent=endpoint?'Connection saved. Chapters are sent only when you click “Check current chapter”.':'Connection removed.';}
    catch(err){$('#connection-message').textContent=err.message;}
  },
  'remote-check':async()=>{
    if(state.route==='settings'){
      const endpoint=$('#remote-endpoint').value.trim();try{validateEndpoint(endpoint);}catch(err){$('#connection-message').textContent=err.message;return;}
      state.settings.endpoint=endpoint;state.settings.remoteConsent=$('#remote-consent').checked;saveSettings();
    }
    if(!state.settings.endpoint||!state.settings.remoteConsent){dialog.close();go('settings');toast('Add your server endpoint and enable chapter sharing first.');return;}
    if(state.route!=='editor'){history.pushState(null,'','#editor');render('editor');}
    const version=state.version,text=currentText();if(!text.trim()){toast('Add some text before a connected check.');return;}
    const docId=currentDoc().id,chapter=currentDoc().activeChapter;
    toast('Checking this chapter with your connected server…');dialog.close();
    try{
      const issues=await remoteCheck(text,{endpoint:state.settings.endpoint,language:currentDoc().language});
      if(currentDoc().id!==docId||currentDoc().activeChapter!==chapter||currentText()!==text||state.version!==version){toast('The text changed while the connected check ran. Run it again for the latest text.');return;}
      state.remoteIssues=issues.filter(i=>!state.settings.disabledRules.includes(i.ruleId));renderAssistant();renderHighlights();toast(`${issues.length} connected suggestion${issues.length===1?'':'s'} received.`);
    }catch(err){toast('Connected check failed. '+err.message+' Local checking is still available.',true);}
  },
  'reset-rules':()=>{state.settings.disabledRules=[];saveSettings();render('settings');queueCheck(0);toast('All local rules restored.');},
  backup:async()=>{
    await flushSave();const data={application:'Proofloom',backupVersion:1,exportedAt:new Date().toISOString(),documents:state.docs,resources:state.resources,settings:{...state.settings,endpoint:'',remoteConsent:false}};
    downloadBlob(new Blob([JSON.stringify(data)],{type:'application/json'}),'proofloom-workspace-'+new Date().toISOString().slice(0,10)+'.json');toast('Workspace backup downloaded. Server settings are excluded.');
  },
  'restore-backup':()=>{
    openModal('Bring your workspace with you.',`<p>Choose a Proofloom JSON workspace backup. Documents are added as copies; same-ID resources are updated. Existing drafts remain available.</p><div class="field"><label for="backup-file">Workspace backup</label><input type="file" id="backup-file" accept=".json"/></div><div id="backup-message" class="inline-message" role="status"></div><div class="modal-footer">${btn('Restore backup','apply-backup','upload',true)}</div>`);
  },
  'apply-backup':async()=>{
    try{
      const file=$('#backup-file').files[0];if(!file)throw new Error('Choose a backup file.');if(file.size>40*1024*1024)throw new Error('Backup exceeds the 40 MB restore limit.');
      const data=JSON.parse(await file.text());
      if(data.application!=='Proofloom'||data.backupVersion!==1||!Array.isArray(data.documents)||data.documents.length>200)throw new Error('This is not a supported Proofloom workspace backup.');
      const docs=data.documents.map(d=>{if(typeof d.title!=='string'||!Array.isArray(d.chapters)||!d.chapters.length||d.chapters.length>3000||d.chapters.some(c=>typeof c.text!=='string'||typeof c.title!=='string')||d.chapters.reduce((n,c)=>n+c.text.length,0)>MAX_TEXT_LENGTH)throw new Error('A document in the backup is invalid or oversized.');return makeDoc(d.title.slice(0,160), '',{chapters:d.chapters.map(c=>({title:c.title.slice(0,200),text:c.text})),language:validLanguage(d.language||'en-US'),ocr:!!d.ocr,sourceType:'restored',snapshots:[]});});
      if(!Array.isArray(data.resources)||data.resources.length>60)throw new Error('Invalid backup resource list.');
      const packs=data.resources.map(p=>{const validated=validatePlugin({...p,apiVersion:1});return {...validated,kind:p.kind==='hunspell'?'hunspell':p.kind==='wordlist'?'wordlist':'plugin',aff:p.kind==='hunspell'&&typeof p.aff==='string'?p.aff:undefined,dic:p.kind==='hunspell'&&typeof p.dic==='string'?p.dic:undefined,enabled:p.enabled!==false};});
      if(new Set([...state.resources.map(p=>p.id),...packs.map(p=>p.id)]).size>60)throw new Error('Restoring these resources would exceed the 60-pack limit. Remove unused packs first.');
      for(const d of docs){state.docs.unshift(d);await persist('documents',d);}for(const p of packs)await installPack(p);
      if(Array.isArray(data.settings?.personal))state.settings.personal=[...new Set([...state.settings.personal,...data.settings.personal.filter(w=>typeof w==='string'&&w.length<160)])];
      saveSettings();dialog.close();go('documents');toast(`Restored ${docs.length} document${docs.length===1?'':'s'} and ${packs.length} resources.`);
    }catch(err){$('#backup-message').textContent=err.message;}
  },
  quick:()=>openModal('A little shortcut.',`<div class="modal-menu"><button data-action="new">${icon('plus')}New document<kbd>Ctrl Alt N</kbd></button><button data-action="import">${icon('upload')}Import a document</button><button data-action="paste">${icon('type')}Paste a new draft</button><button data-action="go-editor">${icon('pen')}Open writing desk</button><button data-action="check-close">${icon('check')}Check current chapter<kbd>Ctrl Enter</kbd></button><button data-action="export">${icon('download')}Export document</button><button data-action="statistics">${icon('chart')}Writing insights</button><button data-action="route-resources">${icon('book')}Dictionaries & languages</button><button data-action="route-plugins">${icon('puzzle')}Extension lab</button></div>`),
  'check-close':()=>{dialog.close();go('editor');queueCheck(0);},
  'route-resources':()=>{dialog.close();go('resources');},
  'route-plugins':()=>{dialog.close();go('plugins');},
  'help-guide':()=>window.open(new URL('./README.md',import.meta.url),'_blank','noopener'),
  credits:()=>window.open(new URL('./THIRD_PARTY_NOTICES.md',import.meta.url),'_blank','noopener')
};

function fileName(title){return title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().slice(0,100)||'proofloom-document';}
function addPersonalWord(value){const word=value.trim();if(!word||word.length>100||/[\n\r]/.test(word)){toast('Enter a single word or name, up to 100 characters.',true);return false;}if(state.settings.personal.includes(word)){toast('This word is already in your dictionary.');return false;}state.settings.personal.push(word);saveSettings();queueCheck(0);if(state.route==='resources')render('resources');toast('Added “'+word+'” to your dictionary.');return true;}

document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-action]');
  if(b){const action=actions[b.dataset.action];if(!action)return;event.preventDefault();try{await action(b);}catch(err){toast(err.message||'This action could not be completed.',true);}return;}
  const card=event.target.closest('[data-select-issue]');if(card&&!event.target.closest('select,input,button'))selectIssue(Number(card.dataset.selectIssue));
});
document.addEventListener('input',event=>{
  const t=event.target;
  if(t.id==='editor'){
    closeQuickFix();
    const total=currentDoc().chapters.reduce((n,c)=>n+c.text.length,0)-currentText().length+t.value.length;
    if(total>MAX_TEXT_LENGTH){t.value=currentText();toast('The document has reached the two-million-character limit.',true);return;}
    pushUndo(currentText(),false);currentChapter().text=t.value;state.localIssues=[];state.remoteIssues=[];state.ignored.clear();state.metrics=metrics(t.value,currentDoc().language);resizeEditor();renderStats();renderHighlights();scheduleSave();queueCheck();
  }else if(t.id==='document-title'){currentDoc().title=t.value||'Untitled document';scheduleSave();}
});
document.addEventListener('change',async event=>{
  const t=event.target;
  try{
    if(t.id==='editor-language'){if(!t.value)return;currentDoc().language=t.value;scheduleSave();render('editor');}
    else if(t.id==='writing-preset'){state.settings.preset=t.value;saveSettings();queueCheck(0);}
    else if(t.id==='chapter-select'){await flushSave();currentDoc().activeChapter=Number(t.value);state.ignored.clear();state.localIssues=[];state.remoteIssues=[];state.metrics={};render('editor');scheduleSave();}
    else if(t.dataset.replacementFor){state.choices[t.dataset.replacementFor]=Number(t.value);renderAssistant();}
    else if(t.dataset.setting){state.settings[t.dataset.setting]=t.type==='checkbox'?t.checked:t.value;saveSettings();queueCheck(0);}
    else if(t.dataset.resourceToggle){const p=state.resources.find(p=>p.id===t.dataset.resourceToggle);if(p){p.enabled=t.checked;await persist('resources',p);queueCheck(0);}}
  }catch(err){toast(err.message,true);}
});
document.addEventListener('keydown',event=>{
  const mod=event.ctrlKey||event.metaKey;
  if(mod&&event.key.toLowerCase()==='k'){event.preventDefault();actions.quick();}
  else if(mod&&event.key==='Enter'){event.preventDefault();dialog.close();go('editor');queueCheck(0);}
  else if(mod&&event.altKey&&event.key.toLowerCase()==='n'){event.preventDefault();void actions.new();}
  else if(mod&&event.key.toLowerCase()==='s'){event.preventDefault();void flushSave().then(()=>toast('Draft saved in this browser.'));}
  else if(state.route==='editor'&&!dialog.open&&mod&&event.key.toLowerCase()==='z'&&(event.target.id==='editor'||!event.target.matches('input,textarea,[contenteditable]'))){event.preventDefault();event.shiftKey?actions.redo():actions.undo();}
  else if(state.route==='editor'&&!dialog.open&&mod&&event.key.toLowerCase()==='f'){event.preventDefault();if(!state.findOpen)actions.find();else $('#find-text')?.focus();}
  else if(event.key==='Escape'){document.body.classList.remove('focus-mode','nav-open');closeQuickFix();}
  else if(event.key==='Enter'&&event.target.id==='personal-word'){event.preventDefault();actions['personal-add']();}
});
$('#document-file').addEventListener('change',ev=>void importFiles(ev.target.files));
$('#resource-file').addEventListener('change',ev=>void importResources(ev.target.files));
$('#sidebar-new').onclick=()=>void actions.new();$('#quick-actions').onclick=actions.quick;$('#about-button').onclick=showHelp;$('#header-help').onclick=showHelp;
$('#menu-button').onclick=()=>document.body.classList.toggle('nav-open');
dialog.addEventListener('click',ev=>{if(ev.target===dialog){const r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)dialog.close();}});
window.addEventListener('hashchange',()=>{void flushSave();render();});window.addEventListener('resize',()=>{resizeEditor();closeQuickFix();});
// Click-to-correct: a click in the editor that lands on a highlighted word
// opens the correction popover for that issue.
document.addEventListener('click',event=>{
  if(state.route!=='editor'||dialog.open)return;
  const ta=event.target.closest('#editor');
  if(!ta)return;
  const issue=findIssueAtOffset(state.issues,ta.selectionStart??0);
  if(issue)openQuickFixFor(issue);else closeQuickFix();
});
window.addEventListener('beforeunload',event=>{if(!state.storage){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)void flushSave();});

async function init(){
  hydrateIcons();main.innerHTML='<div class="loading-row"><span class="spinner"></span>Making room for your words…</div>';
  for(const adapter of documentAdapters())for(const ext of adapter.extensions||[])$('#document-file').accept+=',.'+ext;
  for(const adapter of dictionaryAdapters())for(const ext of adapter.extensions||[])$('#resource-file').accept+=',.'+ext;
  try{
    const [docs,resources,settings]=await Promise.all([dbAll('documents'),dbAll('resources'),dbAll('settings')]);state.docs=docs;state.resources=resources;
    if(settings[0])state.settings={...DEFAULTS,...settings[0]};
    if(!settings[0]){state.resources.push(structuredClone(EXAMPLE_PLUGIN));await persist('resources',EXAMPLE_PLUGIN);}
  }catch(err){state.storage=false;toast(err.message,true);saveStatus('In memory — export to keep',true);}
  if(!state.docs.length){const doc=makeDoc('The art of noticing',SAMPLE_TEXT,{ocr:true,sourceType:'sample'});state.docs.push(doc);await persist('documents',doc);}
  state.activeId=state.docs.some(d=>d.id===state.settings.activeId)?state.settings.activeId:state.docs[0].id;
  for(const d of state.docs){d.language||=state.settings.language;d.activeChapter=Math.min(d.activeChapter||0,d.chapters.length-1);d.snapshots||=[];}
  try{
    const embeddedMeta=globalThis.PROOFLOOM_DATA?.['./data/meta.json'];
    if(embeddedMeta)state.meta=JSON.parse(embeddedMeta);
    else{const r=await fetch(new URL('./data/meta.json',import.meta.url));if(r.ok)state.meta=await r.json();}
  }catch{}
  state.metrics=metrics(currentText(),currentDoc().language);render();
  // The service worker only makes sense on a served origin (it would also
  // throw on file:// pages and inside the standalone build, where
  // import.meta.url is unavailable in a classic inline script).
  if(!globalThis.PROOFLOOM_WORKER_SOURCE&&location.protocol!=='file:'&&'serviceWorker' in navigator)navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{scope:'./'}).catch(()=>{});
}
void init().catch(error=>{main.innerHTML=`<div class="panel"><h2>The workspace could not open.</h2><p>${e(error.message)} Reload this page to try again. If browser storage is unavailable, export any existing work before clearing site data.</p></div>`;toast(error.message,true);});

import {ProofEngine,chunks,MAX_ISSUES,metrics,protectedRanges,inProtected} from './core/checker.js';
import './custom-extensions.js';
import {extensionChecks} from './extensions.js';
let engine,variant='',newest=0;
const loadText=async path=>{const r=await fetch(new URL(path,import.meta.url));if(!r.ok)throw new Error(`Dictionary data could not be loaded (${r.status}).`);return r.text();};
async function getEngine(language){
  const next=/^en-(GB|IN|AU|NZ|IE)/i.test(language)?'en-GB':'en-US';
  if(!engine||variant!==next){
    const [aff,dic,corrections]=await Promise.all([loadText(`./data/${next}.aff`),loadText(`./data/${next}.dic`),loadText('./data/corrections.json')]);
    engine=new ProofEngine({aff,dic},JSON.parse(corrections));variant=next;
  }
  return engine;
}
self.onmessage=async({data})=>{
  if(data.type!=='check')return;
  newest=data.id;const id=data.id;
  try{
    const e=await getEngine(data.options.language);
    if(id!==newest)return;
    e.configure({packs:data.packs,personal:data.personal,language:data.options.language});
    const results=[],protectedText=protectedRanges(data.text);
    for(const chunk of chunks(data.text)){
      if(id!==newest)return;
      const extensionIssues=(await extensionChecks(chunk.text,{...data.options,offset:chunk.offset})).filter(i=>!data.options.disabledRules.includes(i.ruleId)&&(data.options.ocr||i.category!=='ocr')&&(data.options.preset!=='creative'||i.category!=='style'));
      const found=[...e.check(chunk.text,data.options),...extensionIssues].map(i=>({...i,start:i.start+chunk.offset,end:i.end+chunk.offset,id:`${i.ruleId}:${i.start+chunk.offset}:${i.end+chunk.offset}`})).filter(i=>!inProtected(i.start,i.end,protectedText));
      results.push(...found);
      self.postMessage({type:'progress',id,value:Math.min(1,(chunk.offset+chunk.text.length)/data.text.length)});
      if(results.length>=MAX_ISSUES)break;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(id===newest)self.postMessage({type:'result',id,issues:results.slice(0,MAX_ISSUES),capped:results.length>=MAX_ISSUES,metrics:metrics(data.text,data.options.language)});
  }catch(error){if(id===newest)self.postMessage({type:'error',id,message:error.message});}
};

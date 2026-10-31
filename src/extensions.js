// Code extensions are trusted source modules, registered at build time.
// Uploaded JSON packs are data-only and never execute code.
const dictionaries=new Map(),documents=new Map(),checks=new Map(),languages=new Map();
const register=(registry,id,adapter)=>{
  if(!/^[a-z][a-z0-9.-]+$/.test(id)||!adapter||typeof adapter!=='object')throw new Error('Invalid extension registration.');
  if(registry.has(id))throw new Error(`Duplicate extension: ${id}`);
  registry.set(id,Object.freeze(adapter));return ()=>registry.delete(id);
};
export const registerDictionaryAdapter=(id,adapter)=>register(dictionaries,id,adapter);
export const registerDocumentAdapter=(id,adapter)=>register(documents,id,adapter);
export const registerCheckProvider=(id,provider)=>register(checks,id,provider);
export const registerLanguage=(code,language)=>{const normalized=new Intl.Locale(code).toString();languages.set(normalized,Object.freeze(language));};
export const languageExtensions=()=>[...languages].map(([code,value])=>({code,...value}));
export const dictionaryAdapters=()=>[...dictionaries].map(([id,value])=>({id,...value}));
export const documentAdapters=()=>[...documents].map(([id,value])=>({id,...value}));
export async function extensionChecks(text,context){
  const results=[];
  for(const [id,provider] of checks){
    if(provider.languages&&!provider.languages.some(code=>context.language===code||context.language.startsWith(code+'-')))continue;
    const issues=await provider.check(text,Object.freeze(context));
    if(!Array.isArray(issues))throw new Error(`Check provider ${id} did not return an array.`);
    for(const issue of issues.slice(0,3000)){
      if(!Number.isInteger(issue.start)||!Number.isInteger(issue.end)||issue.start<0||issue.end<=issue.start||issue.end>text.length)continue;
      results.push({...issue,id:`extension:${id}:${issue.start}:${issue.end}`,ruleId:`extension:${id}:${issue.ruleId||'check'}`,original:text.slice(issue.start,issue.end),replacements:(issue.replacements||[]).filter(x=>typeof x==='string').slice(0,5),category:['grammar','spelling','punctuation','style','ocr'].includes(issue.category)?issue.category:'style',message:String(issue.message||provider.name||id),confidence:Math.max(0,Math.min(.99,Number(issue.confidence)||.8)),safe:false,source:provider.name||id});
    }
  }
  return results;
}

import nspell from 'nspell';
import { RULES, DIALECT_PAIRS, replacementFor, matchCase } from './rules.js';
import { compilePackRules } from './resources.js';

export const CATEGORIES=['spelling','grammar','punctuation','style','ocr'];
export const MAX_ISSUES = 3000;
export const CHUNK_SIZE = 14000;
export const EXTRA_WORDS=['Proofloom','OCR','ebook','ebooks','plugin','plugins','offline','online','PDF','DOCX','EPUB','UTF','Unicode','GitHub','Grammarly','Hunspell','Tesseract','LanguageTool','wordlist','wordlists','metadata','workflow','workflows','dataset','datasets','webpage','webpages','API','APIs','JavaScript','TypeScript','backend','frontend','WebAssembly','localization','accessibility','BCP','JSON','CSV','TSV','HTML','XML','AI','WASM','Kubernetes','tokenization'];

export function protectedRanges(text) {
  return [...text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`|https?:\/\/[^\s<>]+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu)].map(m=>[m.index,m.index+m[0].length]);
}
export function inProtected(start,end,ranges){return ranges.some(([a,b])=>start<b&&end>a);}

export function* chunks(text,size=CHUNK_SIZE){
  let offset=0;
  while(offset<text.length){let end=Math.min(offset+size,text.length);if(end<text.length){const space=text.lastIndexOf('\n',end);const word=text.lastIndexOf(' ',end);end=(space>offset+size/2?space:word>offset+size/2?word:end);if(end>offset&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;}
    yield {text:text.slice(offset,end),offset};offset=end;
  }
}

export class ProofEngine {
  constructor(dictionary,corrections={}) {
    this.spell = dictionary ? nspell(dictionary) : null;
    for(const word of EXTRA_WORDS)this.spell?.add(word);
    this.corrections=corrections;
    this.cache=new Map();
    this.extraSpells=[];
  }
  configure({packs=[],personal=[],language='en-US'}={}) {
    this.language=language;
    this.english=language.split('-')[0]==='en';
    this.personal=new Set(personal.map(x=>x.toLocaleLowerCase(language)));
    this.wordlist=new Set();this.extraSpells=[];
    for(const p of packs.filter(p=>p.enabled&&(p.language===language||p.language===language.split('-')[0]))){
      for(const word of p.words||[])this.wordlist.add(word.toLocaleLowerCase(language));
      if(p.kind==='hunspell')try{this.extraSpells.push(nspell({aff:p.aff,dic:p.dic}));}catch{ /* The imported surface forms remain available. */ }
    }
    this.pluginRules=compilePackRules(packs,language);
    this.cache.clear();
  }
  correct(word) {
    const lower=word.toLocaleLowerCase(this.language);
    return this.personal?.has(lower)||this.wordlist?.has(lower)||this.extraSpells.some(s=>s.correct(word))||
      (this.english && (this.spell?.correct(word)||this.spell?.correct(lower)));
  }
  suggest(word) {
    const lower=word.toLocaleLowerCase(this.language);
    if(this.cache.has(lower))return this.cache.get(lower);
    let result=this.english?(this.corrections[lower]||this.spell?.suggest(lower)||[]):this.extraSpells.flatMap(s=>s.suggest(lower));
    result=[...new Set(result)].slice(0,5).map(s=>matchCase(s,word));
    if(this.cache.size<500)this.cache.set(lower,result);
    return result;
  }
  check(text,options={}) {
    const ranges=protectedRanges(text), issues=[];
    const disabled=new Set(options.disabledRules||[]);
    const enabled=new Set(options.categories||CATEGORIES);
    if(!options.ocr)enabled.delete('ocr');
    const add=(start,end,original,replacements,rule)=>{
      if(issues.length>=MAX_ISSUES||disabled.has(rule.id)||!enabled.has(rule.category)||inProtected(start,end,ranges))return;
      if(replacements?.[0]===original)return;
      issues.push({id:`${rule.id}:${start}:${end}`,ruleId:rule.id,category:rule.category,start,end,original,replacements:replacements||[],message:rule.message,confidence:rule.confidence,source:rule.source||'Proofloom',safe:rule.confidence>=.97 && ['spelling','punctuation','ocr'].includes(rule.category)});
    };
    for(const r of [...(this.english?RULES:[]),...(this.pluginRules||[])]){
      if(!enabled.has(r.category)||disabled.has(r.id))continue;
      if(r.category==='style'&&options.preset==='creative')continue;
      if(r.id==='passive-voice'&&!['academic','business'].includes(options.preset))continue;
      r.pattern.lastIndex=0;
      for(const m of text.matchAll(r.pattern)){
        if(issues.length>=MAX_ISSUES)break;
        if(r.id==='singular-was'&&/\b(?:if|wish)\b[^.!?\n]{0,60}$/i.test(text.slice(Math.max(0,m.index-70),m.index)))continue;
        const replacement=replacementFor(r,m);
        add(m.index,m.index+m[0].length,m[0],replacement===null?[]:[replacement],r);
      }
    }
    const spellEnabled=enabled.has('spelling') && (this.english||this.extraSpells.length||this.wordlist?.size);
    let suggestions=0;
    const occupied=(s,e)=>issues.some(i=>s<i.end&&e>i.start&&i.category!=='style');
    const tokens=!this.english&&typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(this.language,{granularity:'word'}).segment(text)].filter(s=>s.isWordLike).map(s=>Object.assign([s.segment],{index:s.index})):text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu);
    if(spellEnabled || (options.ocr&&this.english))for(const m of tokens){
      if(issues.length>=MAX_ISSUES)break;
      const word=m[0], start=m.index, end=start+word.length,lower=word.toLocaleLowerCase(this.language);
      if((this.english&&word.length<2)||word.length>48||inProtected(start,end,ranges)||occupied(start,end))continue;
      if(/^\p{Lu}{2,}$/u.test(word)||this.correct(word.replace(/’/g,"'")))continue;
      // Skip isolated title-case names outside sentence starts; they can be added to the personal dictionary.
      const before=text.slice(Math.max(0,start-3),start);
      if(/^\p{Lu}/u.test(word)&&start>0&&!/[.!?]\s*$/.test(before)&&!options.checkNames)continue;
      const mapped=this.english?this.corrections[lower]:null;
      if(mapped?.length){add(start,end,word,mapped.map(x=>matchCase(x,word)),{id:'dictionary-typo',category:'spelling',message:'Commonly misspelled word. Choose the intended spelling.',confidence:mapped.length===1?.98:.9,source:'CSpell / Wikipedia correction data'});continue;}
      if(options.ocr&&this.english){
        const candidates=[word.replace(/rn/g,'m'),word.replace(/cl/g,'d'),word.replace(/vv/g,'w'),word.replace(/l/g,'i')].filter(w=>w!==word&&this.correct(w));
        if(candidates.length){add(start,end,word,[...new Set(candidates)],{id:'ocr-confusion',category:'ocr',message:'Possible merged or split letter recognition. Compare with the scan.',confidence:.82});continue;}
      }
      if(spellEnabled){
        const replacements=suggestions<120?this.suggest(word):[];suggestions++;
        add(start,end,word,replacements,{id:'hunspell',category:'spelling',message:replacements.length?'This spelling is not in the active dictionaries.':'Unknown word. Add a name or specialist term to your dictionary.',confidence:.88,source:this.english?'SCOWL / Hunspell':'Language pack'});
      }
    }
    if(this.english&&enabled.has('spelling')&&options.dialectConsistency!==false){
      const british=/^en-(GB|IN|AU|NZ|IE)/i.test(this.language);
      for(const pair of DIALECT_PAIRS){const from=pair[british?0:1],to=pair[british?1:0];for(const m of text.matchAll(new RegExp(`\\b${from}\\b`,'giu'))){
        if(occupied(m.index,m.index+m[0].length))continue;
        add(m.index,m.index+m[0].length,m[0],[matchCase(to,m[0])],{id:'dialect',category:'spelling',message:`Use a consistent ${british?'British':'American'} English spelling.`,confidence:.9,source:'Proofloom dialect guide'});
      }}
    }
    if(options.ocr&&this.english){
      for(const m of text.matchAll(/([\p{L}]{2,})-[ \t]*\r?\n[ \t]*([\p{L}]{2,})/gu)){
        const joined=m[1]+m[2];if(this.correct(joined))add(m.index,m.index+m[0].length,m[0],[joined],{id:'ocr-dehyphenate',category:'ocr',message:'Join a word split across a printed line ending. Review intentional hyphens.',confidence:.94});
      }
      for(const m of text.matchAll(/[\p{L}]+[01][\p{L}01]*|[01][\p{L}]{2,}/gu)){
        const candidate=m[0].replace(/0/g,'o').replace(/1/g,'l');if(this.correct(candidate)&&candidate!==m[0])add(m.index,m.index+m[0].length,m[0],[matchCase(candidate,m[0])],{id:'ocr-digit-letter',category:'ocr',message:'Possible confusion between a digit and a letter. Check the original.',confidence:.87});
      }
    }
    return issues.sort((a,b)=>a.start-b.start||b.confidence-a.confidence).filter((v,i,all)=>!all.slice(0,i).some(x=>x.start===v.start&&x.end===v.end&&x.replacements[0]===v.replacements[0]));
  }
}

export function applyEdits(text,issues,{safeOnly=false}={}) {
  // Resolve overlaps first, then edit right-to-left so UTF-16 offsets remain valid.
  const selected=[];
  for(const i of [...issues].sort((a,b)=>b.confidence-a.confidence||a.start-b.start)){
    if(!i.replacements?.length || (safeOnly&&!i.safe)||text.slice(i.start,i.end)!==i.original||selected.some(x=>i.start<x.end&&i.end>x.start))continue;
    selected.push(i);
  }
  for(const i of selected.sort((a,b)=>b.start-a.start))text=text.slice(0,i.start)+i.replacements[0]+text.slice(i.end);
  return {text,count:selected.length};
}

export function metrics(text,language='en') {
  const tokens=!language.startsWith('en')&&typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(language,{granularity:'word'}).segment(text)].filter(s=>s.isWordLike).map(s=>s.segment):[...text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}]+)*/gu)].map(m=>m[0]);
  const sentenceSegments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(language,{granularity:'sentence'}).segment(text)]:text.split(/[.!?]+/);
  const sentences=sentenceSegments.filter(s=>/[\p{L}]/u.test(s.segment??s)).length;
  const syllables=tokens.reduce((n,w)=>{const t=w.toLowerCase().replace(/e$/,'');return n+Math.max(1,(t.match(/[aeiouy]+/g)||[]).length);},0);
  const readability=tokens.length&&sentences?Math.max(0,Math.min(100,206.835-1.015*(tokens.length/sentences)-84.6*(syllables/tokens.length))):0;
  return {words:tokens.length,characters:text.length,sentences,paragraphs:text.split(/\n\s*\n/).filter(s=>s.trim()).length,readingMinutes:Math.max(1,Math.ceil(tokens.length/220)),readability:Math.round(readability),averageSentence:sentences?Math.round(tokens.length/sentences):0,uniqueWords:new Set(tokens.map(s=>s.toLocaleLowerCase(language))).size};
}

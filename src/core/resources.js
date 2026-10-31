export const MAX_RESOURCE_BYTES = 12 * 1024 * 1024;
export const API_VERSION = 1;
const MAX_WORDS = 400000;
const MAX_RULES = 10000;

export function validLanguage(code) {
  if (typeof code !== 'string' || code.length > 50) throw new Error('Use a valid BCP-47 language code, such as en-US or hi.');
  try { return new Intl.Locale(code).toString(); } catch { throw new Error('Use a valid BCP-47 language code, such as en-US or hi.'); }
}

export function cleanWords(words) {
  const result = [...new Set(words.map(w=>String(w).normalize('NFC').trim()).filter(w=>w && w.length < 160 && !/[\n\r\x00-\x1f]/.test(w)))];
  if (!result.length) throw new Error('No dictionary entries found.');
  if (result.length > MAX_WORDS) throw new Error(`A pack may contain up to ${MAX_WORDS.toLocaleString()} entries. Split larger dictionaries into packs.`);
  return result;
}

export function parseDelimited(text, delimiter) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='"') { if (quoted && text[i+1]==='"') { cell+='"'; i++; } else quoted=!quoted; }
    else if(c===delimiter && !quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';if(c==='\r'&&text[i+1]==='\n')i++;}
    else cell+=c;
  }
  if(quoted) throw new Error('Unclosed quote in the dictionary file.');
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}

export function validatePlugin(pack) {
  if (!pack || pack.apiVersion !== API_VERSION) throw new Error('This pack must declare apiVersion: 1.');
  if (!/^[a-z][a-z0-9.-]{2,80}$/.test(pack.id||'')) throw new Error('Pack id must use lowercase letters, numbers, periods, or hyphens.');
  if (!pack.name || typeof pack.name !== 'string') throw new Error('The pack needs a name.');
  const language=validLanguage(pack.language||'en');
  if(pack.rules!==undefined&&!Array.isArray(pack.rules))throw new Error('Pack rules must be an array.');
  if(pack.words!==undefined&&!Array.isArray(pack.words))throw new Error('Pack words must be an array.');
  if(pack.rules?.length > MAX_RULES) throw new Error(`A pack may contain at most ${MAX_RULES} rules.`);
  const rules=(pack.rules||[]).map((r,i)=>{
    // Runtime packs use literal phrase matching, never executable JS or user regex.
    if (typeof r.find !== 'string' || !r.find || r.find.length > 240 || /[\r\n]/.test(r.find)) throw new Error(`Rule ${i+1} needs a single-line literal “find” phrase (up to 240 characters).`);
    if(typeof r.replace!=='string'||r.replace.length>600) throw new Error(`Rule ${i+1} needs a text “replace” value (up to 600 characters).`);
    return {id:String(r.id||`rule-${i+1}`),find:r.find,replace:r.replace,message:String(r.message||'Suggestion from '+pack.name).slice(0,600),category:['spelling','grammar','punctuation','style','ocr'].includes(r.category)?r.category:'style',confidence:Math.max(.5,Math.min(.99,Number(r.confidence)||.9)),caseSensitive:!!r.caseSensitive};
  });
  return {apiVersion:1,id:pack.id,name:pack.name.slice(0,100),language,version:String(pack.version||'1.0.0'),direction:pack.direction==='rtl'?'rtl':'ltr',description:String(pack.description||'').slice(0,800),license:String(pack.license||'User supplied'),words:pack.words?.length?cleanWords(pack.words):[],rules,kind:'plugin',enabled:true};
}

export function parseWordlist(text, format, options={}) {
  text=text.replace(/^\uFEFF/,'');
  const base={apiVersion:1,id:`words.${Date.now().toString(36)}.${Math.random().toString(36).slice(2,7)}`,name:options.name||'Imported dictionary',language:validLanguage(options.language||'en'),license:options.license||'User supplied',kind:'wordlist',enabled:true,rules:[]};
  let words=[];
  if(format==='json') {
    const data=JSON.parse(text);
    if(data.apiVersion) return validatePlugin(data);
    if(Array.isArray(data)) words=data.map(x=>typeof x==='object' ? x.word : x);
    else if(Array.isArray(data.words)) words=data.words;
    else words=Object.keys(data);
  } else if(format==='csv'||format==='tsv') {
    const rows=parseDelimited(text,format==='csv'?',':'\t');
    let column=Number(options.column)||0;
    const header=rows[0]?.map(x=>x.toLowerCase().trim());
    const found=header?.findIndex(x=>['word','term','entry','headword'].includes(x));
    if(found>=0) {column=found;rows.shift();}
    words=rows.map(r=>r[column]).filter(x=>x!==undefined);
  } else if(format==='dic') {
    const lines=text.split(/\r?\n/);if(/^\d+$/.test(lines[0]?.trim()))lines.shift();
    words=lines.filter(x=>x&&!x.startsWith('#')).map(x=>x.split(/[\/\t]/)[0]);
  } else if(format==='txt'||format==='wordlist') words=text.split(/\r?\n/).filter(x=>!x.startsWith('#')).map(x=>x.split('\t')[0]);
  else throw new Error('This format needs a dictionary adapter. Convert it to UTF-8 TXT, CSV, TSV, JSON, or a Hunspell pair, or add a build-time adapter.');
  return {...base,words:cleanWords(words.filter(x=>x!=null))};
}

export function parseHunspell(aff,dic,options={}) {
  if(!/^SET UTF-8\s*$/mi.test(aff)) throw new Error('Use a UTF-8 Hunspell dictionary. Convert legacy encodings before importing.');
  const count=Number(dic.split(/\r?\n/)[0]);
  if(!Number.isFinite(count)||count>MAX_WORDS) throw new Error('Invalid or oversized Hunspell dictionary.');
  return {...parseWordlist(dic,'dic',options),kind:'hunspell',aff,dic};
}

export function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

export function compilePackRules(packs,language) {
  return packs.filter(p=>p.enabled && (p.language===language || p.language===language.split('-')[0])).flatMap(p=>p.rules.map(r=>({
    id:`${p.id}:${r.id}`,category:r.category,pattern:new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(r.find)}(?![\\p{L}\\p{N}_])`,r.caseSensitive?'gu':'giu'),replacement:r.replace,message:r.message,confidence:r.confidence,source:p.name,plugin:true
  })));
}

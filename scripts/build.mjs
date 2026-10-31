import {build} from 'esbuild';
import {readFile,writeFile,mkdir,rm,cp,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RULES,DIALECT_PAIRS} from '../src/core/rules.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
await mkdir('dist',{recursive:true});
for(const file of await readdir('dist'))await rm(path.join('dist',file),{recursive:true,force:true});
await mkdir('dist/data',{recursive:true});
await mkdir('dist/fonts',{recursive:true});
await mkdir('dist/vendor/ocr/core',{recursive:true});
await mkdir('dist/vendor/ocr/lang',{recursive:true});
await mkdir('dist/vendor/pdf',{recursive:true});
await mkdir('dist/licenses',{recursive:true});
for(const file of ['index.html','style.css','favicon.svg'])await cp(`src/${file}`,`dist/${file}`);
for(const [name,pkg] of [['en-US','dictionary-en'],['en-GB','dictionary-en-gb']])for(const ext of ['aff','dic'])await cp(`node_modules/${pkg}/index.${ext}`,`dist/data/${name}.${ext}`);
const correctionData=JSON.parse(await readFile('node_modules/@cspell/dict-en-common-misspellings/dict/dict-en.json','utf8'));
const corrections={};
for(const def of correctionData.dictionaryDefinitions)for(const item of [...(def.suggestWords||[]),...(def.flagWords||[])]){
  const [wrong,correct]=item.split('->');
  if(!wrong||!correct)continue;
  const from=wrong.trim().toLowerCase(),to=correct.split(',').map(s=>s.trim()).filter(Boolean);
  if(from.length<2||from.length>50||!to.length||/\s/.test(from))continue;
  corrections[from]=to;
}
await writeFile('dist/data/corrections.json',JSON.stringify(corrections));
const dictionaryEntries=Number((await readFile('dist/data/en-US.dic','utf8')).split('\n')[0]);
const meta={version:'1.0.0',corrections:Object.keys(corrections).length,rules:RULES.length,dialectPairs:DIALECT_PAIRS.length,dictionaryEntries,builtAt:new Date().toISOString(),dataLicense:'CC-BY-SA-4.0',dataSource:'https://github.com/streetsidesoftware/cspell-dicts/tree/main/dictionaries/en-common-misspellings'};
await writeFile('dist/data/meta.json',JSON.stringify(meta,null,2));
for(const weight of [400,500,600,700])await cp(`node_modules/@fontsource/dm-sans/files/dm-sans-latin-${weight}-normal.woff2`,`dist/fonts/dm-sans-latin-${weight}-normal.woff2`);
for(const weight of [400,500])await cp(`node_modules/@fontsource/newsreader/files/newsreader-latin-${weight}-normal.woff2`,`dist/fonts/newsreader-latin-${weight}-normal.woff2`);
await cp('node_modules/tesseract.js/dist/worker.min.js','dist/vendor/ocr/worker.min.js');
for(const file of await readdir('node_modules/tesseract.js-core'))if(file.endsWith('.wasm')||file.endsWith('.wasm.js'))await cp(`node_modules/tesseract.js-core/${file}`,`dist/vendor/ocr/core/${file}`);
await cp('node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz','dist/vendor/ocr/lang/eng.traineddata.gz');
await cp('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs','dist/vendor/pdf/pdf.worker.min.mjs');
for(const folder of ['cmaps','standard_fonts'])await cp(`node_modules/pdfjs-dist/${folder}`,`dist/vendor/pdf/${folder}`,{recursive:true});
const licenses=[];
const packageDirs=(await readdir('node_modules',{withFileTypes:true})).filter(d=>d.isDirectory()&&!d.name.startsWith('.'));
let packages=[];
for(const d of packageDirs)if(d.name.startsWith('@')){for(const n of await readdir(`node_modules/${d.name}`))packages.push(`${d.name}/${n}`);}else packages.push(d.name);
for(const pkg of packages){
  let packageJson;try{packageJson=JSON.parse(await readFile(`node_modules/${pkg}/package.json`,'utf8'));}catch{continue;}
  const folder=path.resolve('node_modules',pkg);
  for(const name of await readdir(folder))if(/^(licen[sc]e|copying|notice)(\.|$)/i.test(name)&&(await stat(path.join(folder,name))).isFile()){
    const output=`${pkg.replace('/','--')}--${name}`;await cp(path.join(folder,name),`dist/licenses/${output}`);
    licenses.push({package:pkg,version:packageJson.version,license:packageJson.license||'See license file',file:output});
  }
}
await writeFile('dist/licenses/index.json',JSON.stringify(licenses,null,2));
await build({entryPoints:{app:'src/app.js',worker:'src/worker.js'},outdir:'dist',bundle:true,format:'esm',platform:'browser',splitting:true,minify:true,target:['es2022'],chunkNames:'chunks/[name]-[hash]',legalComments:'linked',logLevel:'warning'});
await cp('docs','dist/docs',{recursive:true});
await cp('examples','dist/examples',{recursive:true});
await cp('README.md','dist/README.md');
await cp('THIRD_PARTY_NOTICES.md','dist/THIRD_PARTY_NOTICES.md');
// Cache core assets during install; large OCR/PDF assets are cached on first use.
const core=['./','./index.html','./style.css','./app.js','./worker.js','./favicon.svg',...['en-US.aff','en-US.dic','en-GB.aff','en-GB.dic','corrections.json','meta.json'].map(f=>'./data/'+f),...(await readdir('dist/chunks')).map(f=>'./chunks/'+f),...(await readdir('dist/fonts')).map(f=>'./fonts/'+f)];
const cacheId='proofloom-'+Date.now().toString(36);
await writeFile('dist/sw.js',`const CACHE=${JSON.stringify(cacheId)};const CORE=${JSON.stringify(core)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('proofloom-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));return;}e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r.ok&&!r.headers.get('content-type')?.includes('text/html')){const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy)).catch(()=>{});}return r;})));});`);
await writeFile('dist/.nojekyll','');
console.log(`Built Proofloom: ${meta.corrections.toLocaleString()} correction mappings, ${meta.rules} original rules, ${meta.dictionaryEntries.toLocaleString()} dictionary stems.`);

// Build: bundles the app, extracts every third-party dictionary into
// dist/data, derives the frequency index, and writes honest meta counts.
import {build} from 'esbuild';
import {readFile, writeFile, mkdir, rm, cp, readdir, stat} from 'node:fs/promises';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {gunzipSync, gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importTrie, iteratorTrieWords} from 'cspell-trie-lib';
import {RULES, ruleCounts, DIALECT_GENERATED_RULES, DIALECT_VOCAB_RULES} from '../src/core/rules/index.js';
import {registeredAlgorithms, algorithmFamilies} from '../src/core/algorithms/registry.js';
import {READABILITY_FORMULAS} from '../src/core/algorithms/readability.js';
import {CONFUSION_SETS} from '../src/core/data/confusion-sets.js';
import {DIALECT_SPELLING_PAIRS, DIALECT_VOCAB_PAIRS} from '../src/core/data/dialect.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
await mkdir('dist', {recursive: true});
for (const file of await readdir('dist')) await rm(path.join('dist', file), {recursive: true, force: true});
await mkdir('dist/data', {recursive: true});
await mkdir('dist/fonts', {recursive: true});
await mkdir('dist/vendor/ocr/core', {recursive: true});
await mkdir('dist/vendor/ocr/lang', {recursive: true});
await mkdir('dist/vendor/pdf', {recursive: true});
await mkdir('dist/licenses', {recursive: true});
for (const file of ['index.html', 'style.css', 'favicon.svg']) await cp(`src/${file}`, `dist/${file}`);
for (const [name, pkg] of [['en-US', 'dictionary-en'], ['en-GB', 'dictionary-en-gb']]) for (const ext of ['aff', 'dic']) await cp(`node_modules/${pkg}/index.${ext}`, `dist/data/${name}.${ext}`);

// 1b) Bundled language dictionaries: Hunspell aff+dic pairs, gzipped so the
// worker can decompress them on demand (only the selected language loads).
const LANGUAGE_PACKS = [
  ['bg', 'Bulgarian', 'dictionary-bg'], ['ca', 'Catalan', 'dictionary-ca'], ['cs', 'Czech', 'dictionary-cs'],
  ['da', 'Danish', 'dictionary-da'], ['de', 'German', 'dictionary-de'], ['el', 'Greek', 'dictionary-el'],
  ['eo', 'Esperanto', 'dictionary-eo'], ['es', 'Spanish', 'dictionary-es'], ['et', 'Estonian', 'dictionary-et'],
  ['eu', 'Basque', 'dictionary-eu'], ['fa', 'Persian', 'dictionary-fa'], ['fr', 'French', 'dictionary-fr'],
  ['ga', 'Irish', 'dictionary-ga'], ['gl', 'Galician', 'dictionary-gl'], ['he', 'Hebrew', 'dictionary-he'],
  ['hr', 'Croatian', 'dictionary-hr'], ['hu', 'Hungarian', 'dictionary-hu'], ['is', 'Icelandic', 'dictionary-is'],
  ['it', 'Italian', 'dictionary-it'], ['ko', 'Korean', 'dictionary-ko'], ['lt', 'Lithuanian', 'dictionary-lt'],
  ['lv', 'Latvian', 'dictionary-lv'], ['nb', 'Norwegian Bokmål', 'dictionary-nb'], ['nl', 'Dutch', 'dictionary-nl'],
  ['nn', 'Norwegian Nynorsk', 'dictionary-nn'], ['pl', 'Polish', 'dictionary-pl'], ['pt', 'Portuguese', 'dictionary-pt'],
  ['ro', 'Romanian', 'dictionary-ro'], ['ru', 'Russian', 'dictionary-ru'], ['sk', 'Slovak', 'dictionary-sk'],
  ['sl', 'Slovenian', 'dictionary-sl'], ['sr', 'Serbian', 'dictionary-sr'], ['sv', 'Swedish', 'dictionary-sv'],
  ['tr', 'Turkish', 'dictionary-tr'], ['uk', 'Ukrainian', 'dictionary-uk'], ['vi', 'Vietnamese', 'dictionary-vi'],
];
await mkdir('dist/data/lang', {recursive: true});
const languages = [];
for (const [code, name, pkg] of LANGUAGE_PACKS) {
  const base = `node_modules/${pkg}`;
  if (!existsSync(`${base}/index.dic`) || !existsSync(`${base}/index.aff`)) {
    console.warn(`Skipping ${pkg}: index.aff/index.dic missing (npm install first)`);
    continue;
  }
  await writeFile(`dist/data/lang/${code}.aff.gz`, gzipSync(readFileSync(`${base}/index.aff`), {level: 9}));
  await writeFile(`dist/data/lang/${code}.dic.gz`, gzipSync(readFileSync(`${base}/index.dic`), {level: 9}));
  let license = 'See package';
  try { license = JSON.parse(readFileSync(`${base}/package.json`, 'utf8')).license || license; } catch { /* keep default */ }
  // Most Hunspell .dic files start with the entry count; fall back to a line
  // count for packages whose header differs.
  const dicText = readFileSync(`${base}/index.dic`, 'utf8');
  const header = Number(dicText.split('\n')[0].trim());
  const words = Number.isFinite(header) && header > 0 ? header : Math.max(0, dicText.split('\n').length - 1);
  languages.push({code, name, words, license, source: `https://www.npmjs.com/package/${pkg}`});
}
languages.sort((a, b) => a.code.localeCompare(b.code));

const WORD_FILTER = /^[a-zA-Z][a-zA-Z'’-]{1,47}$/;

// 1) Spelling-correction mappings (CSpell common misspellings, US + GB).
const corrections = {}, correctionsGB = {};
{
  const data = JSON.parse(readFileSync('node_modules/@cspell/dict-en-common-misspellings/dict/dict-en.json', 'utf8'));
  for (const def of data.dictionaryDefinitions || []) {
    for (const item of [...(def.suggestWords || []), ...(def.flagWords || [])]) {
      const [wrong, correct] = item.split('->');
      if (!wrong || !correct) continue;
      const from = wrong.trim().toLowerCase(), to = correct.split(',').map(s => s.trim()).filter(Boolean);
      if (from.length < 2 || from.length > 50 || !to.length || /\s/.test(from)) continue;
      corrections[from] = to;
    }
  }
  Object.assign(correctionsGB, corrections);
  const gb = 'node_modules/@cspell/dict-en-common-misspellings/dict/dict-en-gb.json';
  if (existsSync(gb)) {
    const dataGB = JSON.parse(readFileSync(gb, 'utf8'));
    for (const def of dataGB.dictionaryDefinitions || []) {
      for (const item of [...(def.suggestWords || []), ...(def.flagWords || [])]) {
        const [wrong, correct] = item.split('->');
        if (!wrong || !correct) continue;
        const from = wrong.trim().toLowerCase(), to = correct.split(',').map(s => s.trim()).filter(Boolean);
        if (from.length < 2 || from.length > 50 || !to.length || /\s/.test(from)) continue;
        correctionsGB[from] = to;
      }
    }
  }
}
await writeFile('dist/data/corrections.json', JSON.stringify(corrections));
await writeFile('dist/data/corrections-en-GB.json', JSON.stringify(correctionsGB));

// 2) Frequency index from the vendored OpenSubtitles top-50k list.
const frequencyWords = readFileSync('vendor/frequency/en_50k.txt', 'utf8')
  .split('\n').map(line => line.split(' ')[0].trim())
  .filter(w => /^[a-z][a-z'-]{0,30}$/.test(w));
await writeFile('dist/data/frequency.json', JSON.stringify({source: 'OpenSubtitles 2018 top-50k (CC BY-SA 4.0)', words: frequencyWords}));

// 3) Domain dictionaries from the CSpell suite (txt, gz, and trie formats).
const DOMAIN_PACKAGES = [
  ['software-terms', 'Software terms'], ['companies', 'Company names'], ['npm', 'npm packages'],
  ['node', 'Node.js'], ['docker', 'Docker'], ['k8s', 'Kubernetes'], ['aws', 'AWS'],
  ['golang', 'Go'], ['python', 'Python'], ['typescript', 'TypeScript'], ['cpp', 'C++'],
  ['csharp', 'C#'], ['java', 'Java'], ['ruby', 'Ruby'], ['rust', 'Rust'], ['dart', 'Dart'],
  ['php', 'PHP'], ['swift', 'Swift'], ['scala', 'Scala'], ['elixir', 'Elixir'],
  ['haskell', 'Haskell'], ['lua', 'Lua'], ['powershell', 'PowerShell'], ['vue', 'Vue'],
  ['sql', 'SQL'], ['win32', 'Win32'], ['gaming-terms', 'Gaming terms'],
  ['cryptocurrencies', 'Cryptocurrencies'], ['lorem-ipsum', 'Lorem ipsum'],
  ['filetypes', 'File types'], ['fullstack', 'Fullstack'], ['latex', 'LaTeX'],
  ['markdown', 'Markdown'], ['bash', 'Bash & shell'], ['shell', 'Shell'],
  ['public-licenses', 'Open-source licenses'], ['scientific-terms-us', 'Scientific terms'],
  ['medicalterms', 'Medical terms'], ['data-science', 'Data science'],
  ['css', 'CSS'], ['html', 'HTML'],
];
const dictionaries = {};
let domainWordCount = 0;
// Morphological dedup: drop derived forms whose stem is also present.
const dedupeMorphology = words => {
  const stems = words;
  return [...words].filter(w => {
    for (const suf of ['s', 'es', 'ed', 'ing', 'ly', 'er', 'est']) {
      if (w.length > suf.length + 2 && w.endsWith(suf) && stems.has(w.slice(0, -suf.length))) return false;
    }
    return true;
  });
};
for (const [pkg, name] of DOMAIN_PACKAGES) {
  const base = `node_modules/@cspell/dict-${pkg}`;
  if (!existsSync(base)) continue;
  const words = new Set();
  const collect = (text) => {
    for (const line of text.split('\n')) {
      const word = line.replace(/#.*$/, '').trim();
      if (!word || !WORD_FILTER.test(word)) continue;
      words.add(word.toLowerCase());
    }
  };
  const visit = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, {withFileTypes: true}); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.txt.gz')) collect(gunzipSync(readFileSync(full)).toString('utf8'));
      else if (entry.name.endsWith('.txt')) collect(readFileSync(full, 'utf8'));
      else if (entry.name.endsWith('.trie.gz')) {
        try {
          const trie = importTrie(gunzipSync(readFileSync(full)).toString('utf8'));
          for (const word of iteratorTrieWords(trie)) if (WORD_FILTER.test(word)) words.add(word.toLowerCase());
        } catch { /* skip unreadable trie */ }
      }
    }
  };
  visit(base);
  // dict-bash delegates to dict-shell.
  if (pkg === 'bash' && existsSync('node_modules/@cspell/dict-shell')) visit('node_modules/@cspell/dict-shell');
  let list = [...words].filter(Boolean);
  if (pkg === 'scientific-terms-us') list = list.filter(w => /^[a-z]{3,16}$/.test(w));
  list = dedupeMorphology(new Set(list)).sort();
  if (list.length) {
    dictionaries[pkg] = list;
    domainWordCount += list.length;
  }
  void name;
}
// 4) Readability familiar-word lists.
const daleChall = readFileSync('node_modules/dale-chall/index.js', 'utf8').match(/export default \[([\s\S]*?)\]/);
let daleChallWords = [];
try { daleChallWords = (await import('dale-chall')).default; } catch { /* optional */ }
let spacheWords = [];
try { spacheWords = (await import('spache')).default; } catch { /* optional */ }
await writeFile('dist/data/domain-dictionaries.json.gz', gzipSync(Buffer.from(JSON.stringify({
  daleChall: daleChallWords,
  spache: spacheWords,
  dictionaries,
})), {level: 9}));

// 5) Context model (prebuilt from public-domain classics).
await cp('src/core/data/context-model.json', 'dist/data/context-model.json');
const contextModel = JSON.parse(readFileSync('src/core/data/context-model.json', 'utf8'));
const contextEntries = contextModel.sets.reduce((n, s) => n + Object.keys(s.contexts || {}).length, 0);

// 6) Meta counts (displayed in the UI; all real).
const stats = ruleCounts();
const dictionaryEntries = Number(readFileSync('dist/data/en-US.dic', 'utf8').split('\n')[0]);
const meta = {
  version: '2.0.0',
  builtAt: new Date().toISOString(),
  corrections: Object.keys(corrections).length,
  correctionsGB: Object.keys(correctionsGB).length,
  rules: stats.total + stats.dialect,
  rulesCore: stats.total,
  rulesDialect: stats.dialect,
  rulesByCategory: stats.byCategory,
  confusionSets: stats.confusionSets,
  confusionSetsModelled: contextModel.sets.length,
  contextEntries,
  corpusWords: contextModel.corpusWords,
  dialectPairs: DIALECT_SPELLING_PAIRS.length + DIALECT_VOCAB_PAIRS.length,
  dictionaryEntries,
  domainDictionaries: Object.keys(dictionaries).length,
  domainWords: domainWordCount,
  frequencyWords: frequencyWords.length,
  algorithms: registeredAlgorithms().length,
  algorithmFamilies: algorithmFamilies().length,
  readabilityFormulas: READABILITY_FORMULAS.length,
  dataLicense: 'CC-BY-SA-4.0 (CSpell misspellings, OpenSubtitles frequencies)',
  dataSource: 'https://github.com/streetsidesoftware/cspell-dicts',
  languages,
};
await writeFile('dist/data/meta.json', JSON.stringify(meta, null, 2));

// 7) Fonts, OCR, PDF vendor assets.
for (const weight of [400, 500, 600, 700]) await cp(`node_modules/@fontsource/dm-sans/files/dm-sans-latin-${weight}-normal.woff2`, `dist/fonts/dm-sans-latin-${weight}-normal.woff2`);
for (const weight of [400, 500]) await cp(`node_modules/@fontsource/newsreader/files/newsreader-latin-${weight}-normal.woff2`, `dist/fonts/newsreader-latin-${weight}-normal.woff2`);
await cp('node_modules/tesseract.js/dist/worker.min.js', 'dist/vendor/ocr/worker.min.js');
for (const file of await readdir('node_modules/tesseract.js-core')) if (file.endsWith('.wasm') || file.endsWith('.wasm.js')) await cp(`node_modules/tesseract.js-core/${file}`, `dist/vendor/ocr/core/${file}`);
await cp('node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', 'dist/vendor/ocr/lang/eng.traineddata.gz');
await cp('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'dist/vendor/pdf/pdf.worker.min.mjs');
for (const folder of ['cmaps', 'standard_fonts']) await cp(`node_modules/pdfjs-dist/${folder}`, `dist/vendor/pdf/${folder}`, {recursive: true});

// 8) Licenses index.
const licenses = [];
const packageDirs = (await readdir('node_modules', {withFileTypes: true})).filter(d => d.isDirectory() && !d.name.startsWith('.'));
let packages = [];
for (const d of packageDirs) if (d.name.startsWith('@')) { for (const n of await readdir(`node_modules/${d.name}`)) packages.push(`${d.name}/${n}`); } else packages.push(d.name);
for (const pkg of packages) {
  let packageJson;
  try { packageJson = JSON.parse(await readFile(`node_modules/${pkg}/package.json`, 'utf8')); } catch { continue; }
  const folder = path.resolve('node_modules', pkg);
  for (const name of await readdir(folder)) if (/^(licen[sc]e|copying|notice)(\.|$)/i.test(name) && (await stat(path.join(folder, name))).isFile()) {
    const output = `${pkg.replace('/', '--')}--${name}`;
    await cp(path.join(folder, name), `dist/licenses/${output}`);
    licenses.push({package: pkg, version: packageJson.version, license: packageJson.license || 'See license file', file: output});
  }
}
await writeFile('dist/licenses/index.json', JSON.stringify(licenses, null, 2));

// 9) App bundle.
await build({entryPoints: {app: 'src/app.js', worker: 'src/worker.js'}, outdir: 'dist', bundle: true, format: 'esm', platform: 'browser', splitting: true, minify: true, target: ['es2022'], chunkNames: 'chunks/[name]-[hash]', legalComments: 'linked', logLevel: 'warning'});
await cp('docs', 'dist/docs', {recursive: true});
await cp('examples', 'dist/examples', {recursive: true});
await cp('README.md', 'dist/README.md');
await cp('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');

// 10) Service worker cache manifest.
const core = ['./', './index.html', './style.css', './app.js', './worker.js', './favicon.svg',
  ...['en-US.aff', 'en-US.dic', 'en-GB.aff', 'en-GB.dic', 'corrections.json', 'corrections-en-GB.json', 'frequency.json', 'context-model.json', 'meta.json'].map(f => './data/' + f),
  ...(await readdir('dist/chunks')).map(f => './chunks/' + f),
  ...(await readdir('dist/fonts')).map(f => './fonts/' + f)];
const cacheId = 'proofloom-' + Date.now().toString(36);
await writeFile('dist/sw.js', `const CACHE=${JSON.stringify(cacheId)};const CORE=${JSON.stringify(core)};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('proofloom-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));return;}e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{if(r.ok&&!r.headers.get('content-type')?.includes('text/html')){const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy)).catch(()=>{});}return r;})));});`);
await writeFile('dist/.nojekyll', '');
console.log(`Built Proofloom v2: ${meta.rules.toLocaleString()} rules (${meta.rulesDialect.toLocaleString()} dialect variants), ${meta.algorithms} algorithms, ${meta.corrections.toLocaleString()} correction mappings, ${meta.domainWords.toLocaleString()} domain words in ${meta.domainDictionaries} dictionaries, ${meta.frequencyWords.toLocaleString()} frequency-ranked words, ${meta.confusionSetsModelled} corpus-modelled confusion sets, ${languages.length} bundled language dictionaries.`);

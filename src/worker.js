// Worker orchestration: loads the bundled language resources once, then
// checks chunks with cancellation and progress reporting.
import {ProofEngine, chunks, MAX_ISSUES, metrics, protectedRanges, inProtected} from './core/checker.js';
import {readabilityProfile} from './core/algorithms/readability.js';
import './custom-extensions.js';
import {extensionChecks} from './extensions.js';

let engine, variant = '', newest = 0;
const loadText = async path => {
  const r = await fetch(new URL(path, import.meta.url));
  if (!r.ok) throw new Error(`Dictionary data could not be loaded (${r.status}).`);
  return r.text();
};
const loadJSON = async path => JSON.parse(await loadText(path));

async function getEngine(language) {
  const next = /^en-(GB|IN|AU|NZ|IE)/i.test(language) ? 'en-GB' : 'en-US';
  if (!engine || variant !== next) {
    const [aff, dic, corrections, frequency, domain, contextModel] = await Promise.all([
      loadText(`./data/${next}.aff`),
      loadText(`./data/${next}.dic`),
      loadJSON(next === 'en-GB' ? './data/corrections-en-GB.json' : './data/corrections.json'),
      loadJSON('./data/frequency.json'),
      loadDomain(),
      loadJSON('./data/context-model.json'),
    ]);
    const frequencyMap = new Map();
    if (Array.isArray(frequency.words)) frequency.words.forEach((word, index) => frequencyMap.set(word, index + 1));
    const domainSet = new Set();
    for (const list of Object.values(domain.dictionaries || {})) for (const word of list) domainSet.add(word.toLowerCase());
    const daleChall = new Set(domain.daleChall || []);
    const spache = new Set(domain.spache || []);
    engine = new ProofEngine({aff, dic}, corrections, {frequency: frequencyMap, domainWords: domainSet, contextModel, daleChallSet: daleChall, spacheSet: spache});
    variant = next;
  }
  return engine;
}

// Domain dictionaries ship gzipped; decompress in the worker. Without
// DecompressionStream the engine still runs on Hunspell + corrections.
async function loadDomain() {
  if (typeof DecompressionStream !== 'function') return {dictionaries: {}, daleChall: [], spache: []};
  try {
    const r = await fetch(new URL('./data/domain-dictionaries.json.gz', import.meta.url));
    if (!r.ok) return {dictionaries: {}, daleChall: [], spache: []};
    const text = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  } catch { return {dictionaries: {}, daleChall: [], spache: []}; }
}

self.onmessage = async ({data}) => {
  if (data.type !== 'check') return;
  newest = data.id; const id = data.id;
  try {
    const e = await getEngine(data.options.language);
    if (id !== newest) return;
    e.configure({packs: data.packs, personal: data.personal, language: data.options.language});
    const results = [], protectedText = protectedRanges(data.text);
    for (const chunk of chunks(data.text)) {
      if (id !== newest) return;
      const extensionIssues = (await extensionChecks(chunk.text, {...data.options, offset: chunk.offset}))
        .filter(i => !data.options.disabledRules.includes(i.ruleId) && (data.options.ocr || i.category !== 'ocr') && (data.options.preset !== 'creative' || i.category !== 'style'));
      const found = [...e.check(chunk.text, data.options), ...extensionIssues]
        .map(i => ({...i, start: i.start + chunk.offset, end: i.end + chunk.offset, id: `${i.ruleId}:${i.start + chunk.offset}:${i.end + chunk.offset}`}))
        .filter(i => !inProtected(i.start, i.end, protectedText));
      results.push(...found);
      self.postMessage({type: 'progress', id, value: Math.min(1, (chunk.offset + chunk.text.length) / data.text.length)});
      if (results.length >= MAX_ISSUES) break;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (id === newest) {
      const profile = data.text.length <= 400000 ? readabilityProfile(data.text, {daleChallSet: null, spacheSet: null}) : null;
      self.postMessage({
        type: 'result', id,
        issues: results.slice(0, MAX_ISSUES),
        capped: results.length >= MAX_ISSUES,
        metrics: metrics(data.text, data.options.language),
        readability: profile ? {results: profile.results, averageGrade: profile.averageGrade, counts: profile.counts} : null,
      });
    }
  } catch (error) {
    if (id === newest) self.postMessage({type: 'error', id, message: error.message});
  }
};

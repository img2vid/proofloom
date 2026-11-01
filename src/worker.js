// Worker orchestration: loads the bundled language resources once, then
// checks chunks with cancellation and progress reporting.
//
// Data loading works in two modes:
//  - served (HTTPS / localhost): files are fetched relative to this module;
//  - standalone single-file build: every file is embedded as a string in
//    globalThis.PROOFLOOM_DATA (gzipped payloads as base64), so a worker
//    created from a Blob URL needs no network and no file:// requests.
import {ProofEngine, chunks, MAX_ISSUES, metrics, protectedRanges, inProtected} from './core/checker.js';
import {readabilityProfile} from './core/algorithms/readability.js';
import {bundledVariant} from './core/languages.js';
import {LazyHunspell} from './core/lazy-hunspell.js';
import './custom-extensions.js';
import {extensionChecks} from './extensions.js';

let engines = new Map(), metaPromise = null, newest = 0;

const embeddedData = () => globalThis.PROOFLOOM_DATA || null;

const loadText = async path => {
  const data = embeddedData();
  if (data && Object.prototype.hasOwnProperty.call(data, path)) return data[path];
  const r = await fetch(new URL(path, import.meta.url));
  if (!r.ok) throw new Error(`Dictionary data could not be loaded (${r.status}).`);
  return r.text();
};
const loadJSON = async path => JSON.parse(await loadText(path));
const getMeta = () => metaPromise ||= loadJSON('./data/meta.json').catch(() => ({}));

// Bundled dictionaries ship gzipped; decompress in the worker.
async function loadGzipped(path) {
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress bundled dictionaries (DecompressionStream is missing). Update it, or use the served build over HTTPS.');
  const data = embeddedData();
  let stream;
  if (data && Object.prototype.hasOwnProperty.call(data, path)) {
    const bin = atob(data[path]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    stream = new Blob([bytes]).stream();
  } else {
    const r = await fetch(new URL(path, import.meta.url));
    if (!r.ok) throw new Error(`Dictionary data could not be loaded (${r.status}).`);
    stream = r.body;
  }
  return new Response(stream.pipeThrough(new DecompressionStream('gzip'))).text();
}

// Per-language ranked word list: Map(word -> rank). Same mechanism for
// English and every other bundled language, so suggestions rank by real
// corpus frequency everywhere.
async function loadFrequency(variant) {
  try {
    const parsed = JSON.parse(await loadGzipped(`./data/frequency/${variant}.json.gz`));
    const map = new Map();
    if (Array.isArray(parsed.words)) for (const [index, word] of parsed.words.entries()) map.set(String(word).toLowerCase().normalize('NFC'), index + 1);
    return map.size ? map : null;
  } catch { return null; }
}

async function getEngine(language) {
  const {variant, bundled} = bundledVariant(language, (await getMeta()).languages || []);
  let engine = engines.get(variant);
  if (!engine) {
    if (bundled) {
      const [aff, dic, frequency] = await Promise.all([
        loadGzipped(`./data/lang/${variant}.aff.gz`),
        loadGzipped(`./data/lang/${variant}.dic.gz`),
        loadFrequency(variant),
      ]);
      engine = new ProofEngine(new LazyHunspell({aff, dic}, {frequency, locale: variant}), {}, {frequency});
    } else if (variant.startsWith('none')) {
      // No bundled dictionary for this language: user packs and wordlists
      // still drive the spelling pipeline.
      engine = new ProofEngine(null, {}, {});
    } else {
      // English full engine: corrections + frequency + domain dictionaries
      // + corpus context model.
      const [aff, dic, corrections, frequency, domain, contextModel] = await Promise.all([
        loadGzipped(`./data/${variant}.aff.gz`),
        loadGzipped(`./data/${variant}.dic.gz`),
        loadJSON(variant === 'en-GB' ? './data/corrections-en-GB.json' : './data/corrections.json'),
        loadFrequency(variant),
        loadDomain(),
        loadJSON('./data/context-model.json'),
      ]);
      const domainSet = new Set();
      for (const list of Object.values(domain.dictionaries || {})) for (const word of list) domainSet.add(word.toLowerCase());
      const daleChall = new Set(domain.daleChall || []);
      const spache = new Set(domain.spache || []);
      engine = new ProofEngine({aff, dic}, corrections, {frequency, domainWords: domainSet, contextModel, daleChallSet: daleChall, spacheSet: spache});
    }
    // Keep a small number of active engines to bound memory after changing languages.
    if (engines.size >= 2) engines.delete(engines.keys().next().value);
    engines.set(variant, engine);
  }
  return engine;
}

// Domain dictionaries ship gzipped; decompress in the worker. Without
// DecompressionStream the engine still runs on Hunspell + corrections.
async function loadDomain() {
  try { return JSON.parse(await loadGzipped('./data/domain-dictionaries.json.gz')); }
  catch { return {dictionaries: {}, daleChall: [], spache: []}; }
}

// Browsers refuse to structured-clone oversized or exotic payloads. Degrade
// step by step instead of losing the whole check result.
function postResult(payload) {
  try { self.postMessage(payload); return; } catch { /* too large / not cloneable */ }
  const slim = {...payload, readability: null};
  try { self.postMessage(slim); return; } catch { /* still too large */ }
  try { self.postMessage({...slim, issues: (payload.issues || []).slice(0, 500), capped: true}); return; }
  catch {
    self.postMessage({type: 'error', id: payload.id, message: 'The result was too large for this browser to display. Check a smaller section of the document, then continue.'});
  }
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
      postResult({
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

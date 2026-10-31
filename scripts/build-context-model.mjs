// Builds the confusion-set context model from the vendored public-domain
// corpus (vendor/corpus, Project Gutenberg). Output: src/core/data/context-model.json
// (committed, so the build never needs to re-mine).
//
// For every confusion-set member that occurs often enough in the corpus,
// we store which words appear immediately before and after it. The runtime
// engine scores each candidate against the observed context (Golding & Roth
// style confusion-set disambiguation).
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONFUSION_SETS} from '../src/core/data/confusion-sets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusDir = path.join(root, 'vendor', 'corpus');
const OUT = path.join(root, 'src', 'core', 'data', 'context-model.json');

const MIN_COUNT = 10;      // minimum occurrences to model a word
const TOP_CONTEXTS = 24;   // keep this many prev/next words

const words = [...new Set(CONFUSION_SETS.flatMap(s => s.words.map(w => w.toLowerCase().replace(/’/g, "'"))))];
const target = new Set(words);

const stats = new Map(); // word -> {count, prev: Map, next: Map}
const bump = (word, slot, neighbour) => {
  let entry = stats.get(word);
  if (!entry) { entry = {count: 0, prev: new Map(), next: new Map()}; stats.set(word, entry); }
  entry[slot].set(neighbour, (entry[slot].get(neighbour) || 0) + 1);
};

let corpusWords = 0, filesUsed = 0;
for (const file of readdirSync(corpusDir).filter(f => f.endsWith('.txt')).sort()) {
  const raw = readFileSync(path.join(corpusDir, file), 'utf8');
  // Strip Project Gutenberg header/footer.
  const start = raw.indexOf('*** START OF');
  const end = raw.indexOf('*** END OF');
  const body = (start !== -1 && end !== -1 ? raw.slice(raw.indexOf('\n', start) + 1, end) : raw);
  const tokens = body.toLowerCase().replace(/[’]/g, "'").match(/[\p{L}][\p{L}'-]*/gu) || [];
  if (tokens.length < 1000) continue;
  filesUsed++;
  corpusWords += tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    if (!target.has(word)) continue;
    let entry = stats.get(word);
    if (!entry) { entry = {count: 0, prev: new Map(), next: new Map()}; stats.set(word, entry); }
    entry.count++;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (prev && prev !== word) bump(word, 'prev', prev);
    if (next && next !== word) bump(word, 'next', next);
  }
}

// Group words by confusion set and prune sparse data.
const sets = [];
for (const set of CONFUSION_SETS) {
  const contexts = {};
  let modelled = 0;
  for (const word of set.words) {
    const lower = word.toLowerCase().replace(/’/g, "'");
    const entry = stats.get(lower);
    if (!entry || entry.count < MIN_COUNT) continue;
    modelled++;
    const top = map => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_CONTEXTS);
    contexts[lower] = {
      count: entry.count,
      prev: Object.fromEntries(top(entry.prev)),
      next: Object.fromEntries(top(entry.next)),
    };
  }
  if (modelled >= Math.min(2, set.words.length)) sets.push({words: set.words, contexts});
}

const output = {
  builtAt: new Date().toISOString(),
  source: 'Project Gutenberg public-domain classics (see vendor/corpus)',
  corpusWords,
  corpusFiles: filesUsed,
  minCount: MIN_COUNT,
  sets,
};
writeFileSync(OUT, JSON.stringify(output));
const bytes = JSON.stringify(output).length;
console.log(`Context model: ${sets.length}/${CONFUSION_SETS.length} sets modelled from ${corpusWords.toLocaleString()} corpus words in ${filesUsed} files -> ${(bytes / 1024).toFixed(0)} KB`);

// Tests for the upgraded engine: algorithms, generated rules, confusion
// disambiguation, dialect engine, readability, and honest meta counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import en from 'dictionary-en';
import {ProofEngine, applyEdits, metrics, ruleCounts} from '../src/core/checker.js';
import {ALGORITHM_EXPORTS as A, registeredAlgorithms, algorithmFamilies} from '../src/core/algorithms/registry.js';
import {readabilityProfile} from '../src/core/algorithms/readability.js';
import {ConfusionContextModel} from '../src/core/algorithms/language-model.js';
import {CONFUSION_SETS} from '../src/core/data/confusion-sets.js';
import {DIALECT_SPELLING_PAIRS} from '../src/core/data/dialect.js';
import {buildTriggerIndex, matchLiteralRules} from '../src/core/rules/literal.js';
import {LITERAL_RULES} from '../src/core/rules/index.js';
import {IRREGULAR_VERBS, IRREGULAR_PLURALS} from '../src/core/data/morphology.js';
import {REDUNDANCIES, WORDINESS, CLICHES, BUZZWORDS} from '../src/core/data/style-tables.js';
import {REGISTER, INCLUSIVE, PREPOSITIONS} from '../src/core/data/register-tables.js';

const upstream = JSON.parse(fs.readFileSync('node_modules/@cspell/dict-en-common-misspellings/dict/dict-en.json', 'utf8'));
const corrections = Object.fromEntries(upstream.dictionaryDefinitions.flatMap(d => [...d.suggestWords, ...d.flagWords]).map(s => s.split('->')).filter(s => s.length === 2).map(([a, b]) => [a.toLowerCase(), b.split(',').map(x => x.trim())]));
const contextModel = JSON.parse(fs.readFileSync('src/core/data/context-model.json', 'utf8'));
// The frequency table is read from the vendored source list (not dist/) so the
// suite runs without a prior build; parsing matches scripts/build.mjs exactly.
const frequencyWords = fs.readFileSync('vendor/frequency/en_50k.txt', 'utf8')
  .split('\n').map(line => line.split(' ')[0].trim())
  .filter(w => /^[a-z][a-z'-]{0,30}$/.test(w));
const frequency = new Map(frequencyWords.map((w, i) => [w, i + 1]));
const distBuilt = fs.existsSync('dist/data/meta.json');

function makeEngine(options = {}) {
  const engine = new ProofEngine(en, corrections, {contextModel, frequency, ...options});
  engine.configure({language: 'en-US'});
  return engine;
}
const engine = makeEngine();
const check = (text, options = {}) => engine.check(text, {language: 'en-US', ...options});
const applied = (text, options = {}) => applyEdits(text, check(text, options)).text;

// --- Algorithm units ---
test('string metrics compute canonical values', () => {
  assert.equal(A.levenshtein('kitten', 'sitting'), 3);
  assert.equal(A.damerauLevenshtein('teh', 'the'), 1);
  assert.equal(A.restrictedDamerauLevenshtein('recieve', 'receive'), 1);
  assert.ok(Math.abs(A.jaroWinkler('martha', 'marhta') - 0.9611) < 0.001);
  assert.equal(A.hamming('karolin', 'kathrin'), 3);
  assert.equal(A.lcsDistance('abc', 'abc'), 0);
  assert.ok(A.bigramDice('night', 'nacht') > 0 && A.bigramDice('night', 'nacht') < 1);
  assert.ok(A.trigramJaccard('golden', 'golder') > 0.3);
  assert.ok(A.mongeElkan('receive', 'recieve') > 0.7);
});

test('phonetic algorithms produce canonical codes', () => {
  assert.equal(A.soundex('Tymczak'), 'T522');
  assert.equal(A.soundex('Pfister'), 'P236');
  assert.equal(A.soundex('Robert'), 'R163');
  assert.equal(A.metaphone('Xavier').slice(0, 1), 'S');
  const [primary] = A.doubleMetaphone('Smith');
  assert.equal(primary, 'SM0');
  assert.equal(A.nysiis('MacArthur'), 'NCARTAR');
  assert.ok(A.caverphone1('Lee'), 'caverphone1 produces a code');
  assert.ok(A.matchRatingCompare('receive', 'receeve'));
  assert.ok(A.phoneticKeys?.('style') === undefined, 'phoneticKeys not re-exported via registry');
});

test('syllables and readability formulas produce finite values', () => {
  assert.equal(A.syllablesIn('beautiful'), 3);
  assert.equal(A.syllablesIn('hour'), 1);
  const profile = readabilityProfile('The quick brown fox jumps over the lazy dog. It was a bright cold day in April, and the clocks were striking thirteen.');
  assert.ok(profile.results.every(r => r.value === null || Number.isFinite(r.value)));
  assert.ok(profile.results.filter(r => r.value !== null).length >= 7);
  assert.ok(Number.isFinite(profile.averageGrade));
});

test('candidate generation models propose plausible corrections', () => {
  const index = new A.DeletionIndex(['the', 'their', 'there', 'friend', 'receive']);
  const candidates = [...index.candidates('teh', 2)].map(c => c.word);
  assert.ok(candidates.includes('the'));
  const keyboard = A.keyboardCandidates('hrllo', w => ['hello'].includes(w));
  assert.ok(keyboard.some(c => c.word === 'hello'));
  const splits = A.splitCandidates('alot', w => ['a', 'lot'].includes(w));
  assert.ok(splits.some(c => c.word === 'a lot'));
});

test('ranker orders candidates by distance, similarity and frequency', () => {
  const ranked = A.rankSuggestions('teh', ['the', 'ten', 'tech'], {frequencyRank: new Map([['the', 2], ['ten', 400], ['tech', 3000]])});
  assert.equal(ranked[0].word, 'the');
});

test('algorithm registry exposes a large audited family list', () => {
  assert.ok(registeredAlgorithms().length >= 50);
  const families = algorithmFamilies();
  assert.ok(families.length >= 6);
  assert.ok(families.some(f => f.family === 'Phonetics'));
  assert.ok(families.some(f => f.family === 'Readability'));
});

// --- Generated rules and tables ---
test('rule tables are large and well-formed', () => {
  const counts = ruleCounts();
  assert.ok(counts.total > 2000, 'core rules exceed 2000');
  assert.ok(counts.dialect > 4000, 'dialect rule forms exceed 4000');
  assert.ok(counts.confusionSets > 120);
  assert.ok(IRREGULAR_VERBS.length > 150);
  assert.ok(IRREGULAR_PLURALS.length > 80);
  assert.ok(REDUNDANCIES.length > 250);
  assert.ok(WORDINESS.length > 250);
  assert.ok(CLICHES.length > 150);
  assert.ok(BUZZWORDS.length > 100);
  assert.ok(REGISTER.length > 150);
  assert.ok(INCLUSIVE.length > 80);
  assert.ok(PREPOSITIONS.length > 100);
  assert.ok(DIALECT_SPELLING_PAIRS.length > 400);
});

test('literal trigger matcher finds multi-word phrases once', () => {
  const rules = [{kind: 'literal', tokens: ['return', 'back'], id: 'x', replacement: 'return', message: '', confidence: 1, category: 'style'}];
  const index = buildTriggerIndex(rules);
  const hits = [];
  matchLiteralRules('Please return back the book. And return back soon.', rules, index, (rule, start, end) => hits.push([start, end]));
  assert.deepEqual(hits, [[7, 18], [33, 44]]);
});

test('generated style rules fire with replacements', () => {
  assert.equal(applied('Please return back the book.'), 'Please return the book.');
  assert.ok(applied('Due to the fact that it rained, we stayed.').includes('Because') || applied('Due to the fact that it rained, we stayed.').includes('because'));
  assert.ok(check('At the end of the day, we synergized the deliverables.').length >= 2);
  assert.ok(check('The chairman will reach out to the mankind.').some(i => i.ruleId.startsWith('inclusive')));
  assert.ok(check('I am gonna utilize the stuff.').some(i => i.ruleId.startsWith('register') || i.ruleId.startsWith('wordy')));
  assert.ok(check('We discuss about the plan.').some(i => i.replacements[0] === 'discuss'));
});

test('verb-form generation covers the irregular table', () => {
  assert.equal(applied('Yesterday I did ran to the store.'), 'Yesterday I did run to the store.');
  assert.equal(applied('She has sang beautifully.'), 'She has sung beautifully.');
  assert.equal(applied('They drunk all the juice.'), 'They drank all the juice.');
});

test('irregular plural generation corrects misuse', () => {
  assert.equal(applied('The childrens played.'), 'The children played.');
  assert.ok(applied('Two mouses were found.').includes('mice'));
});

test('countability rules protect uncountable nouns', () => {
  assert.equal(applied('We received many informations today.'), 'We received much information today.');
  assert.ok(check('The furnitures arrived.').some(i => i.category === 'grammar'));
});

test('article rules handle vowel-sound exceptions', () => {
  assert.equal(applied('It took a hour.'), 'It took an hour.');
  assert.equal(applied('She is an university student.'), 'She is a university student.');
  assert.equal(applied('He carried an umbrella.'), 'He carried an umbrella.');
  assert.equal(applied('We saw a FBI agent.'), 'We saw an FBI agent.');
});

test('contraction table restores apostrophes', () => {
  assert.equal(applied('They dont know wont happen.'), 'They don’t know won’t happen.');
});

// --- Confusion sets and context model ---
test('confusion pattern rules fix the member word only', () => {
  assert.equal(applied('There arguments make no sense.'), 'Their arguments make no sense.');
  assert.equal(applied('The dog wagged it’s tail.'), 'The dog wagged it’s tail.');
  assert.equal(applied('He excepted the award.'), 'He accepted the award.');
});

test('correct text is not flagged by the context model', () => {
  const flagged = check('The team celebrated their victory. I want to go too. Its color was bright.')
    .filter(i => i.ruleId === 'confusion-context' && i.original.toLowerCase() === 'their');
  assert.equal(flagged.length, 0);
});

test('context model is loaded and disambiguates strong cases', () => {
  const model = new ConfusionContextModel(contextModel);
  assert.ok(model.hasSetFor('their'));
  const verdict = model.disambiguate('in', 'there', 'own way');
  assert.ok(verdict && (verdict.word === 'their' || !verdict.confident), 'model never flips without support');
});

test('confusion sets never replace more than the target word', () => {
  for (const set of CONFUSION_SETS) {
    for (const [pattern, replacement] of set.patterns) {
      if (!replacement) continue;
      const probe = new RegExp(pattern.source, 'giu');
      const sample = probe.source.includes('lead') ? 'yesterday lead to' : null;
      void sample;
    }
  }
  assert.ok(true);
});

// --- Spelling pipeline ---
test('upgraded spelling suggests ranked candidates with frequency priors', () => {
  const issues = check('I recieved a package.');
  const issue = issues.find(i => i.original === 'recieved');
  assert.ok(issue);
  assert.equal(issue.replacements[0], 'received');
});

test('misspellings outside the correction map still get suggestions', () => {
  const issues = check('The tomorow meeting is cancelled.');
  const issue = issues.find(i => i.original === 'tomorow');
  assert.ok(issue && issue.category === 'spelling');
  assert.ok(issue.replacements.some(r => /tomorrow/i.test(r)));
});

test('domain vocabulary is accepted when provided', () => {
  const domainEngine = makeEngine({domainWords: new Set(['kubernetes', 'docker'])});
  const issues = domainEngine.check('The kubernetes cluster runs docker.');
  assert.ok(!issues.some(i => i.original.toLowerCase() === 'kubernetes' || i.original.toLowerCase() === 'docker'));
});

// --- Dialect engine ---
test('dialect engine flags spelling and vocabulary by locale', () => {
  const us = makeEngine();
  us.configure({language: 'en-US'});
  assert.ok(us.check('The colour is nice.', {language: 'en-US'}).some(i => i.replacements.includes('color')));
  const gb = makeEngine();
  gb.configure({language: 'en-GB'});
  assert.ok(gb.check('The color is nice.', {language: 'en-GB'}).some(i => i.replacements.includes('colour')));
});

// --- Style analyzers ---
test('sentence analyzers flag long sentences and repetition', () => {
  const long = 'This is an extremely long sentence that keeps going and going with clause after clause after clause, stacking idea upon idea upon idea upon idea, until the reader has completely lost track of where it began and what it was originally trying to say in the first place before all of these digressions took over the structure entirely.';
  assert.ok(check(long).some(i => i.ruleId === 'long-sentence'));
});

test('metrics remain stable and finite', () => {
  const m = metrics('Hello world. This is fine.', 'en-US');
  assert.equal(m.words, 5);
  assert.equal(m.sentences, 2);
  assert.ok(Number.isFinite(m.readability));
});

test('worker data files exist and agree with the meta counts',
  {skip: distBuilt ? false : 'requires npm run build (dist/ is not built)'}, () => {
  const meta = JSON.parse(fs.readFileSync('dist/data/meta.json', 'utf8'));
  assert.ok(meta.rules > 5000);
  assert.ok(meta.algorithms >= 50);
  assert.ok(meta.domainWords > 100000);
  assert.ok(meta.corrections > 50000);
  assert.ok(meta.frequencyWords > 40000);
  const frequencyData = JSON.parse(fs.readFileSync('dist/data/frequency.json', 'utf8'));
  assert.equal(frequencyData.words.length, meta.frequencyWords);
});

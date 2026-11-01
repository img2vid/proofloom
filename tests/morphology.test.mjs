// Tests for the cross-language morphology layer: inflected, declined, and
// conjugated forms of known roots are accepted instead of flagged, typos
// that only look like inflections stay flagged, and unknown words fall back
// to suggestions of their main root form. Dictionary data comes from the
// dictionary-* packages, so these run offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import en from 'dictionary-en';
import es from 'dictionary-es';
import fr from 'dictionary-fr';
import de from 'dictionary-de';
import ru from 'dictionary-ru';
import tr from 'dictionary-tr';
import ko from 'dictionary-ko';
import {ProofEngine} from '../src/core/checker.js';
import {Morphology} from '../src/core/morphology.js';
import {LazyHunspell} from '../src/core/lazy-hunspell.js';

const known = words => {
  const set = new Set(words);
  return stem => set.has(stem);
};

// --- Language resolution ---

test('morphology resolves variants and aliases onto curated tables', () => {
  assert.equal(Morphology.forLanguage('en-GB').primary, Morphology.forLanguage('en-US').primary);
  assert.equal(Morphology.forLanguage('ca-valencia').primary, Morphology.forLanguage('ca').primary);
  assert.equal(Morphology.forLanguage('hyw').primary, Morphology.forLanguage('hy').primary);
  assert.equal(Morphology.forLanguage('nds').primary, Morphology.forLanguage('de').primary);
  assert.equal(Morphology.forLanguage('ckb').primary, Morphology.forLanguage('ar').primary);
  assert.equal(Morphology.forLanguage('nn').primary, Morphology.forLanguage('sv').primary);
});

test('languages without a curated table fall back to their script', () => {
  const unknown = Morphology.forLanguage('zz');
  assert.equal(unknown.primary, null);
  assert.equal(unknown.specsFor('houses')[0].strictEs, true, 'latin fallback applies');
  assert.equal(unknown.specsFor('houses')[0].suffixes.includes('ing'), false, 'generic latin stays conservative');
  assert.ok(unknown.specsFor('книги').length, 'cyrillic fallback applies');
  assert.ok(unknown.specsFor('الكتاب').length, 'arabic fallback applies');
  assert.ok(unknown.specsFor('사랑은').length, 'hangul fallback applies');
  assert.ok(unknown.specsFor('चलता').length, 'devanagari fallback applies');
});

test('every bundled language code resolves to an active spec', () => {
  const codes = ['en-US', 'en-GB', 'be', 'bg', 'bn', 'bo', 'br', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'eo', 'es', 'et', 'eu', 'fa', 'fo', 'fr', 'fur', 'fy', 'ga', 'gd', 'gl', 'gu', 'gug', 'he', 'hi', 'hr', 'hu', 'hy', 'hyw', 'ia', 'id', 'ie', 'is', 'isv', 'it', 'ka', 'kmr', 'kn', 'ko', 'la', 'lb', 'lij', 'lt', 'ltg', 'lv', 'mk', 'mn', 'mr', 'nds', 'ne', 'nl', 'nn', 'oc', 'or', 'pa', 'pt', 'ro', 'ru', 'sa', 'si', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'tk', 'tr', 'uk', 'vi', 'af', 'an', 'ar', 'as', 'ckb'];
  for (const code of codes) {
    const morph = Morphology.forLanguage(code);
    assert.ok(morph.specsFor('words').length, `${code} resolves a spec for Latin-script words`);
  }
});

// --- Root-form recognition (unit level) ---

test('English inflections resolve to their roots', () => {
  const morph = Morphology.forLanguage('en-US');
  const roots = (word, dict) => morph.roots(word, known(dict));
  assert.deepEqual(roots('cats', ['cat']), ['cat']);
  assert.deepEqual(roots('boxes', ['box']), ['box']);
  assert.deepEqual(roots('houses', ['house']), ['house']);
  assert.deepEqual(roots('tomatoes', ['tomato']), ['tomato']);
  assert.deepEqual(roots('studies', ['study']), ['study']);
  assert.deepEqual(roots('wolves', ['wolf']), ['wolf']);
  assert.deepEqual(roots('walking', ['walk']), ['walk']);
  assert.deepEqual(roots('walked', ['walk']), ['walk']);
  assert.deepEqual(roots('loved', ['love']), ['love']);
  assert.deepEqual(roots('making', ['make']), ['make']);
  assert.deepEqual(roots('seeing', ['see']), ['see']);
  assert.deepEqual(roots('enjoys', ['enjoy']), ['enjoy']);
  assert.deepEqual(roots("children's", ['children']), ['children']);
});

test('English typos that only look like inflections stay unrecognized', () => {
  const morph = Morphology.forLanguage('en-US');
  const roots = (word, dict) => morph.roots(word, known(dict));
  const words = ['cat', 'walk', 'walks', 'make', 'love', 'study', 'see', 'agree'];
  assert.deepEqual(roots('thes', words), [], 'stopword stems are guarded');
  assert.deepEqual(roots('runing', words), [], 'missing doubling stays a typo');
  assert.deepEqual(roots('walkss', words), [], 'doubled suffix boundary stays a typo');
  assert.deepEqual(roots('walkeded', words), [], 'stacked endings stay a typo');
  assert.deepEqual(roots('studys', words), [], 'consonant+y takes -ies');
  assert.deepEqual(roots('studyed', words), [], 'consonant+y takes -ied');
  assert.deepEqual(roots('walkes', words), [], '-es needs a sibilant stem');
  assert.deepEqual(roots('makees', words), [], '-es needs a sibilant stem');
  assert.deepEqual(roots('makeing', words), [], 'extra e before -ing stays a typo');
  assert.deepEqual(roots('makeed', words), [], 'extra e before -ed stays a typo');
  assert.deepEqual(roots('looved', words), [], 'extra o stays a typo');
  assert.deepEqual(roots('agreeds', words), []);
});

test('agglutinative and fusional languages resolve chains to their roots', () => {
  assert.deepEqual(Morphology.forLanguage('de').roots('häusern', known(['haus'])), ['haus']);
  assert.deepEqual(Morphology.forLanguage('tr').roots('evlerde', known(['ev'])), ['ev']);
  assert.deepEqual(Morphology.forLanguage('tr').roots('evimdeki', known(['ev'])), ['ev']);
  assert.deepEqual(Morphology.forLanguage('hu').roots('házakban', known(['ház'])), ['ház']);
  assert.deepEqual(Morphology.forLanguage('ru').roots('книги', known(['книга'])), ['книга']);
  assert.deepEqual(Morphology.forLanguage('ru').roots('коты', known(['кот'])), ['кот']);
  assert.deepEqual(Morphology.forLanguage('ko').roots('사랑은의', known(['사랑'])), ['사랑']);
  assert.deepEqual(Morphology.forLanguage('ar').roots('الكتاب', known(['كتاب'])), ['كتاب']);
  assert.deepEqual(Morphology.forLanguage('ar').roots('والكتابات', known(['كتاب'])), ['كتاب']);
  assert.deepEqual(Morphology.forLanguage('hi').roots('चलता', known(['चल'])), ['चल']);
  assert.deepEqual(Morphology.forLanguage('es').roots('mujeres', known(['mujer'])), ['mujer']);
  assert.deepEqual(Morphology.forLanguage('es').roots('hablando', known(['hablar'])), ['hablar']);
  assert.deepEqual(Morphology.forLanguage('nl').roots('huizen', known(['huis'])), ['huis']);
});

// --- Engine integration: wordlist-only dictionaries ---

const wordEngine = (language, words) => {
  const engine = new ProofEngine(null, {}, {});
  engine.configure({packs: [{id: 'test.words', kind: 'wordlist', language, enabled: true, words, rules: []}], language});
  return engine;
};

test('wordlist-only dictionaries accept inflected forms across languages', () => {
  const en = wordEngine('en-US', ['cat', 'walk', 'study', 'wolf', 'box', 'house']);
  for (const word of ['cats', 'walked', 'walking', 'studies', 'wolves', 'boxes', 'houses']) assert.equal(en.correct(word), true, word);
  for (const word of ['thes', 'runing', 'walkss', 'walkeded', 'studys', 'walkes', 'makeing', 'looved', 'catses', 'catsed']) assert.equal(en.correct(word), false, word);

  const es = wordEngine('es', ['gato', 'casa', 'mujer', 'hablar']);
  for (const word of ['gatos', 'casas', 'mujeres', 'hablando', 'hablamos']) assert.equal(es.correct(word), true, word);
  for (const word of ['hablendo', 'gatox']) assert.equal(es.correct(word), false, word);

  const de = wordEngine('de', ['Haus']);
  assert.equal(de.correct('Häusern'), true);
  assert.equal(de.correct('Hauses'), true);
  assert.equal(de.correct('Hausx'), false);

  const ru = wordEngine('ru', ['книга', 'стол', 'кот']);
  for (const word of ['книги', 'кота', 'коты', 'столом']) assert.equal(ru.correct(word), true, word);
  assert.equal(ru.correct('книгга'), false);

  const tr = wordEngine('tr', ['ev', 'kitap']);
  for (const word of ['evlerde', 'evimde', 'kitapta']) assert.equal(tr.correct(word), true, word);
  assert.equal(tr.correct('evlerdz'), false);

  const ko = wordEngine('ko', ['사랑']);
  for (const word of ['사랑은', '사랑이', '사랑에서', '사랑은의']) assert.equal(ko.correct(word), true, word);

  const ar = wordEngine('ar', ['كتاب']);
  for (const word of ['الكتاب', 'كتابات', 'والكتاب']) assert.equal(ar.correct(word), true, word);

  const hi = wordEngine('hi', ['चल', 'पढ़']);
  assert.equal(hi.correct('चलता'), true);
  assert.equal(hi.correct('पढ़ते'), true);

  const hu = wordEngine('hu', ['ház']);
  assert.equal(hu.correct('házakban'), true);
});

test('unknown inflected words fall back to root-form suggestions', () => {
  const tr = wordEngine('tr', ['ev', 'kitap']);
  assert.ok(tr.suggest('evlerimdeki').includes('ev'), 'root form is suggested');
  assert.deepEqual(tr.suggest('evxler'), [], 'non-inflectional typos get no root suggestion');

  const ko = wordEngine('ko', ['사랑']);
  assert.ok(ko.suggest('사랑은의').includes('사랑'), 'root form is suggested');
});

// --- Engine integration: bundled dictionaries ---

test('bundled dictionaries accept real inflections and still flag typos', () => {
  const enEngine = new ProofEngine(en, {}, {});
  enEngine.configure({language: 'en-US'});
  for (const word of ['cats', 'walked', 'walking', 'studies']) assert.equal(enEngine.correct(word), true, word);
  for (const word of ['runing', 'thes', 'walkeded', 'makeing', 'studys', 'walkes', 'recieve']) assert.equal(enEngine.correct(word), false, word);
  const issues = enEngine.check('the runing cat', {language: 'en-US'});
  assert.ok(issues.some(i => i.original === 'runing'), 'runing is flagged');
  assert.ok(!issues.some(i => i.original === 'cat' && i.category === 'spelling'), 'cat is clean');

  const esEngine = new ProofEngine(es, {}, {});
  esEngine.configure({language: 'es-ES'});
  for (const word of ['gatos', 'casas', 'mujeres', 'hablamos']) assert.equal(esEngine.correct(word), true, word);
  assert.equal(esEngine.correct('hablendo'), false);

  const frEngine = new ProofEngine(fr, {}, {});
  frEngine.configure({language: 'fr-FR'});
  assert.equal(frEngine.correct('maisons'), true);
  assert.equal(frEngine.correct('grandes'), true);
  assert.equal(frEngine.correct('maisonss'), false);

  const deEngine = new ProofEngine(de, {}, {});
  deEngine.configure({language: 'de-DE'});
  assert.equal(deEngine.correct('Häusern'), true);
  assert.equal(deEngine.correct('Hause'), true);

  const ruEngine = new ProofEngine(ru, {}, {});
  ruEngine.configure({language: 'ru-RU'});
  assert.equal(ruEngine.correct('книгами'), true);
  assert.equal(ruEngine.correct('книгга'), false);

  const trEngine = new ProofEngine(tr, {}, {});
  trEngine.configure({language: 'tr-TR'});
  assert.equal(trEngine.correct('evlerde'), true);
  assert.equal(trEngine.correct('evlerdz'), false);

  const koEngine = new ProofEngine(ko, {}, {});
  koEngine.configure({language: 'ko-KR'});
  assert.equal(koEngine.correct('사랑'), true);
  assert.equal(koEngine.correct('사랑은'), true, 'particle-attached forms are accepted');
});

// --- Capability gating ---

test('generative morphology covers forms the affix tables miss', () => {
  // dictionary-ko lists verb conjugations in its affix file but no nominal
  // particles: the generative layer is what accepts josa-attached nouns.
  // LazyHunspell mirrors the worker's bundled-dictionary path.
  const koEngine = new ProofEngine(new LazyHunspell(ko, {}), {}, {});
  koEngine.configure({language: 'ko-KR'});
  assert.equal(koEngine.correct('사랑은'), true, 'particle-attached forms are accepted');
  assert.equal(koEngine.correct('사랑ㅋ'), false);
  assert.equal(koEngine.correct('사랑x'), false);

  const sparse = new LazyHunspell({aff: '', dic: '2\ncat\ndog\n'}, {});
  const sparseEngine = new ProofEngine(sparse, {}, {});
  sparseEngine.configure({language: 'en-US'});
  assert.equal(sparseEngine.correct('cats'), true);
  assert.equal(sparseEngine.correct('catss'), false);

  const bare = new ProofEngine(null, {}, {});
  bare.configure({language: 'en-US'});
  assert.equal(bare.correct('cats'), false, 'with no known words nothing is accepted');
});

test('analysis stays bounded on pathological input', () => {
  const engine = wordEngine('en-US', ['cat']);
  for (let i = 0; i < 2000; i++) engine.correct('cats' + 'e'.repeat(i % 7) + 's'.repeat(i % 5));
  assert.equal(engine.correct('cats'), true);
});

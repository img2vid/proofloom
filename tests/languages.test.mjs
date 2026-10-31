// Tests for bundled multi-language support and the in-editor quick fix.
// Language data comes from the dictionary-* packages, so these run offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fr from 'dictionary-fr';
import de from 'dictionary-de';
import es from 'dictionary-es';
import ru from 'dictionary-ru';
import {ProofEngine} from '../src/core/checker.js';
import {findIssueAtOffset, quickFixPosition} from '../src/core/quickfix.js';
import {tokenizeWords} from '../src/core/algorithms/tokenize.js';

const distBuilt = fs.existsSync('dist/data/meta.json');

test('quick-fix helper finds the narrowest issue at a clicked offset', () => {
  const issues = [
    {id: 'a:0:6', start: 0, end: 6, original: 'Tihs', replacements: ['This']},
    {id: 'b:8:13', start: 8, end: 13, original: 'wrold', replacements: ['world']},
  ];
  assert.equal(findIssueAtOffset(issues, 2)?.id, 'a:0:6');
  assert.equal(findIssueAtOffset(issues, 10)?.id, 'b:8:13');
  assert.equal(findIssueAtOffset(issues, 7), null);
  assert.equal(findIssueAtOffset(issues, -1), null);
  assert.equal(findIssueAtOffset([], 0), null);
  // Clicking exactly on a shared boundary picks the narrower range.
  assert.equal(findIssueAtOffset([{id: 'x', start: 3, end: 9}, {id: 'y', start: 9, end: 20}], 9)?.id, 'x');
});

test('quick-fix position stays inside the viewport', () => {
  const viewport = {width: 1000, height: 600};
  // Fits below the word.
  assert.deepEqual(quickFixPosition({left: 100, top: 100, right: 150, bottom: 120}, {width: 260, height: 140}, viewport), {left: 100, top: 130});
  // Near the bottom edge it flips above the word.
  const flipped = quickFixPosition({left: 100, top: 500, right: 150, bottom: 520}, {width: 260, height: 140}, viewport);
  assert.ok(flipped.top + 140 <= 600);
  // Near the right edge it is clamped.
  const clamped = quickFixPosition({left: 900, top: 100, right: 960, bottom: 120}, {width: 260, height: 140}, viewport);
  assert.ok(clamped.left + 260 <= 1000);
});

test('tokenizer segments Latin, Cyrillic, and accented words', () => {
  const tokens = tokenizeWords('Привет, мир! Schöne Grüße — déjà vu.');
  assert.deepEqual(tokens.map(t => t.word), ['Привет', 'мир', 'Schöne', 'Grüße', 'déjà', 'vu']);
});

test('bundled French dictionary flags and corrects misspellings', () => {
  const engine = new ProofEngine(fr, {}, {});
  engine.configure({language: 'fr-FR'});
  assert.equal(engine.correct('bonjour'), true);
  assert.equal(engine.correct('bonjur'), false);
  const issues = engine.check('Je te dis bonjur ce soir.', {language: 'fr-FR'});
  const hit = issues.find(i => i.original === 'bonjur');
  assert.ok(hit, 'bonjur is flagged as a spelling issue');
  assert.equal(hit.category, 'spelling');
  assert.equal(hit.replacements[0], 'bonjour');
  assert.equal(hit.source, 'Hunspell dictionary');
});

test('bundled Russian dictionary flags and corrects Cyrillic misspellings', () => {
  const engine = new ProofEngine(ru, {}, {});
  engine.configure({language: 'ru-RU'});
  const issues = engine.check('Он сказал спосибо и ушёл.', {language: 'ru-RU'});
  const hit = issues.find(i => i.original === 'спосибо');
  assert.ok(hit, 'спосибо is flagged');
  assert.ok(hit.replacements.includes('спасибо'), 'спасибо is among the suggestions');
});

test('bundled German dictionary flags misspellings with suggestions', () => {
  const engine = new ProofEngine(de, {}, {});
  engine.configure({language: 'de-DE'});
  const issues = engine.check('Das Hauss ist groß und alt.', {language: 'de-DE', checkNames: true});
  const hit = issues.find(i => i.original === 'Hauss');
  assert.ok(hit, 'Hauss is flagged');
  assert.ok(hit.replacements.some(r => /^Haus/.test(r)), 'a Haus-form is suggested');
});

test('bundled Spanish dictionary offers the intended correction', () => {
  const engine = new ProofEngine(es, {}, {});
  engine.configure({language: 'es-ES'});
  const issues = engine.check('El gato duerme en la cosina.', {language: 'es-ES'});
  const hit = issues.find(i => i.original === 'cosina');
  assert.ok(hit, 'cosina is flagged');
  assert.ok(hit.replacements.includes('cocina'), 'cocina is among the suggestions');
});

test('English-only rule tables do not fire for French documents', () => {
  const engine = new ProofEngine(fr, {}, {});
  engine.configure({language: 'fr-FR'});
  const issues = engine.check('Le rapport fut rédigé par la commission hier.', {language: 'fr-FR'});
  assert.ok(issues.every(i => i.category !== 'grammar'), 'no English grammar rules fire');
});

test('built dist ships every advertised language dictionary', {skip: distBuilt ? false : 'requires npm run build (dist/ is not built)'}, () => {
  const meta = JSON.parse(fs.readFileSync('dist/data/meta.json', 'utf8'));
  assert.ok(Array.isArray(meta.languages) && meta.languages.length >= 30, 'meta advertises at least 30 languages');
  const codes = new Set();
  for (const language of meta.languages) {
    assert.ok(!codes.has(language.code), 'language codes are unique');
    codes.add(language.code);
    assert.ok(fs.existsSync(`dist/data/lang/${language.code}.dic.gz`), `${language.code} dic.gz exists`);
    assert.ok(fs.existsSync(`dist/data/lang/${language.code}.aff.gz`), `${language.code} aff.gz exists`);
    assert.ok(language.words > 100, `${language.code} reports a real entry count`);
    assert.ok(language.name && language.license, `${language.code} carries name and license metadata`);
  }
});

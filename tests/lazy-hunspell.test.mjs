import test from 'node:test';
import assert from 'node:assert/strict';
import it from 'dictionary-it';
import fr from 'dictionary-fr';
import de from 'dictionary-de';
import es from 'dictionary-es';
import ru from 'dictionary-ru';
import {LazyHunspell} from '../src/core/lazy-hunspell.js';
import {ProofEngine} from '../src/core/checker.js';

test('lazy Hunspell accepts stems, suffixes, prefixes and crossed forms', () => {
  const aff = ['SET UTF-8', 'PFX P Y 1', 'PFX P 0 ri .', 'SFX S Y 1', 'SFX S 0 ni .'].join('\n');
  const spell = new LazyHunspell({aff, dic: '2\ncasa/PS\namico/S\n'}, {locale: 'it'});
  assert.equal(spell.correct('casa'), true);
  assert.equal(spell.correct('ricasa'), true);
  assert.equal(spell.correct('casani'), true);
  assert.equal(spell.correct('ricasani'), true);
  assert.equal(spell.correct('ricasano'), false);
  spell.add('ricasano');
  assert.equal(spell.correct('ricasano'), true);
});

test('synthetic cross-product dictionary stays bounded instead of expanding millions of forms', () => {
  const aff = ['SET UTF-8', 'PFX P Y 120'];
  for (let i = 0; i < 120; i++) aff.push('PFX P 0 p' + i + ' .');
  aff.push('SFX S Y 120');
  for (let i = 0; i < 120; i++) aff.push('SFX S 0 s' + i + ' .');
  const dic = ['500'];
  for (let i = 0; i < 500; i++) dic.push('stem' + i + '/PS');
  const spell = new LazyHunspell({aff: aff.join('\n'), dic: dic.join('\n')}, {locale: 'en'});
  // 500 * 120 * 120 hypothetical cross-products, never materialized.
  assert.equal(spell.words.size, 500);
  assert.equal(spell.correct('p17stem321s19'), true);
  assert.equal(spell.correct('p17stem321snonexistent'), false);
});

test('Italian dictionary initializes without eagerly expanding the known huge affix cross-product', () => {
  const spell = new LazyHunspell(it, {locale: 'it'});
  assert.ok(spell.words.size > 1000);
  assert.equal(spell.correct('casa'), true);
  assert.equal(spell.correct('zzzxxy'), false);
  const engine = new ProofEngine(spell, {}, {});
  engine.configure({language: 'it-IT'});
  const threeParagraphs = [
    'La casa si trova vicino al centro della città. La giornata è bella e il cielo è sereno.',
    'Ogni mattina gli studenti leggono libri e scrivono racconti. Oggi hanno molto da imparare.',
    'Dopo pranzo la famiglia torna a casa. Questo breve testo contiene una parola zzzxxy sbagliata.',
  ].join('\n\n');
  const issues = engine.check(threeParagraphs, {language: 'it-IT'});
  assert.ok(Array.isArray(issues));
  assert.ok(issues.some(i => i.original === 'zzzxxy'), 'Italian proofreading continues through all three paragraphs');
});

test('lazy multilingual checking retains real bundled dictionaries', () => {
  for (const [locale, dictionary, known] of [
    ['fr', fr, 'bonjour'], ['de', de, 'Haus'],
    ['es', es, 'cocina'], ['ru', ru, 'спасибо'],
  ]) {
    const spell = new LazyHunspell(dictionary, {locale});
    assert.equal(spell.correct(known), true, locale + ' must recognize ' + known + '; direct=' + spell.words.has(spell.lower(known)) + '; sample=' + [...spell.words.keys()].filter(w => w.includes(spell.lower(known))).slice(0, 5).join('|') + '; stems=' + spell.words.size);
    assert.equal(spell.correct('zzzxxy'), false, locale + ' must detect an obvious error');
  }
});

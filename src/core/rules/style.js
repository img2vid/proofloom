// Style rules generated from the writing tables: redundancies, wordiness,
// clichés, buzzwords, register, inclusive language, hedges.
import {literalRule, PHRASE_PATTERN} from './literal.js';
import {REDUNDANCIES, WORDINESS, CLICHES, BUZZWORDS} from '../data/style-tables.js';
import {REGISTER, INCLUSIVE, HEDGES} from '../data/register-tables.js';

function generate(idPrefix, table, category, message, confidence, extra = {}) {
  const rules = [];
  const seen = new Set();
  table.forEach(([wrong, right], i) => {
    const phrase = String(wrong).trim();
    if (!PHRASE_PATTERN.test(phrase) || seen.has(phrase.toLowerCase())) return;
    seen.add(phrase.toLowerCase());
    const replacement = right == null ? null : String(right);
    const note = replacement && replacement !== 'null' && replacement.length && replacement !== ' '
      ? `Try “${replacement.trim()}”.` : message;
    rules.push(literalRule(`${idPrefix}-${i}`, category, phrase, replacement || '', note, confidence, extra));
  });
  return rules;
}

export const REDUNDANCY_RULES = generate('redundant', REDUNDANCIES, 'style', 'This phrase repeats an idea. Consider the shorter form.', .9);
export const WORDINESS_RULES = generate('wordy', WORDINESS, 'style', 'This can be more concise.', .9);
export const CLICHE_RULES = generate('cliche', CLICHES, 'style', 'This expression is a cliché. A fresh phrasing may be stronger.', .72);
export const BUZZWORD_RULES = generate('buzzword', BUZZWORDS, 'style', 'Jargon can hide the meaning. Consider plainer words.', .78);
export const REGISTER_RULES = generate('register', REGISTER, 'style', 'Consider a more formal register.', .62, {register: true});
export const INCLUSIVE_RULES = generate('inclusive', INCLUSIVE, 'style', 'Consider more inclusive wording.', .7);
export const HEDGE_RULES = generate('hedge', HEDGES, 'style', 'Hedging weakens the sentence. Consider a direct statement.', .6);

// Passive voice: auxiliary + (optional adverb) + past participle, including
// irregular participles, with a "by" or without. Regex-based.
export const PASSIVE_RULE = {
  id: 'passive-voice', category: 'style', kind: 'regex',
  pattern: /\b(?:is|are|was|were|been|being|be)\s+(?:(?:\w+ly)\s+)?[\p{L}]+ed\b|\b(?:is|are|was|were|been|being|be)\s+(?:written|seen|given|taken|made|known|shown|told|sent|held|kept|brought|thought|bought|caught|taught|left|felt|found|heard|built|burnt|meant|dealt|laid|led|lost|met|paid|said|sold|spent|stood|won|sung|done|gone|driven|eaten|given|grown|known|thrown|worn|born|broken|chosen|frozen|hidden|spoken|stolen|forgotten)\b/giu,
  replacement: null,
  message: 'Possible passive voice. Consider naming the actor first when it improves clarity.',
  confidence: .68,
};

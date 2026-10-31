// Rule index: merges curated regex rules with generated literal rules and
// exposes the shared case helpers plus honest counts.
import {GRAMMAR_RULES, GRAMMAR_GENERATED} from './grammar.js';
import {REDUNDANCY_RULES, WORDINESS_RULES, CLICHE_RULES, BUZZWORD_RULES, REGISTER_RULES, INCLUSIVE_RULES, HEDGE_RULES, PASSIVE_RULE} from './style.js';
import {PUNCTUATION_RULES, TYPOGRAPHY_RULES, OCR_RULES} from './punctuation.js';
import {DIALECT_GENERATED_RULES, DIALECT_VOCAB_RULES, CONFUSABLE_PATTERN_RULES, CONFUSION_SETS} from './dialect.js';
import {buildTriggerIndex} from './literal.js';

export const CATEGORIES = ['spelling', 'grammar', 'punctuation', 'style', 'ocr'];
// Dialect rules are checked by the dedicated dialect engine, not matchAll.
export const RULES = [
  ...GRAMMAR_RULES, ...GRAMMAR_GENERATED,
  ...REDUNDANCY_RULES, ...WORDINESS_RULES, ...CLICHE_RULES, ...BUZZWORD_RULES,
  ...REGISTER_RULES, ...INCLUSIVE_RULES, ...HEDGE_RULES, PASSIVE_RULE,
  ...PUNCTUATION_RULES, ...TYPOGRAPHY_RULES, ...OCR_RULES, ...CONFUSABLE_PATTERN_RULES,
];

// Regex rules to run with matchAll; literal rules run via the trigger index.
export const REGEX_RULES = RULES.filter(r => r.kind === 'regex');
export const LITERAL_RULES = RULES.filter(r => r.kind === 'literal');
export const LITERAL_TRIGGER_INDEX = buildTriggerIndex(LITERAL_RULES);

export function ruleCounts() {
  const byCategory = {};
  for (const r of RULES) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  return {
    total: RULES.length,
    regex: REGEX_RULES.length,
    literal: LITERAL_RULES.length,
    dialect: DIALECT_GENERATED_RULES.length + DIALECT_VOCAB_RULES.length,
    byCategory,
    confusionSets: CONFUSION_SETS.length,
  };
}

export function matchCase(replacement, original) {
  if (!replacement) return replacement;
  if (original.length > 1 && original === original.toLocaleUpperCase()) return replacement.toLocaleUpperCase();
  if (/^\p{Lu}/u.test(original)) return replacement[0].toLocaleUpperCase() + replacement.slice(1);
  return replacement;
}

export function replacementFor(rule, match) {
  if (rule.replacement == null || rule.replacement === '') return null;
  if (rule.plugin) return rule.caseSensitive ? rule.replacement : matchCase(rule.replacement, match[0]);
  const value = typeof rule.replacement === 'function' ? rule.replacement(match)
    : String(rule.replacement).replace(/\$(\d+)/g, (_, i) => match[Number(i)] ?? '');
  return matchCase(value, match[0]);
}

export {CONFUSION_SETS, DIALECT_GENERATED_RULES, DIALECT_VOCAB_RULES};

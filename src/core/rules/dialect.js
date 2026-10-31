// Dialect rules generated from the British/American tables, expanded with
// inflections, plus confusable pattern rules for the confusion engine.
import {literalRule, PHRASE_PATTERN, inflections} from './literal.js';
import {DIALECT_SPELLING_PAIRS, DIALECT_VOCAB_PAIRS} from '../data/dialect.js';
import {CONFUSION_SETS} from '../data/confusion-sets.js';

// One rule per (pair, inflected form) with a direction chosen at check time.
export function generateDialectRules() {
  const rules = [];
  const seen = new Set();
  DIALECT_SPELLING_PAIRS.forEach(([us, gb]) => {
    for (const variant of new Set([...inflections(us), ...inflections(gb)])) {
      const key = variant.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // The replacement is resolved at check time from DIALECT_SPELLING_PAIRS.
      rules.push({
        id: `dialect-${rules.length}`, category: 'spelling', kind: 'dialect',
        dialectWord: key, phrase: key, tokens: [key], replacement: null,
        message: 'Use a consistent English dialect for this spelling.', confidence: .9,
        source: 'Proofloom dialect tables',
      });
    }
  });
  return rules;
}

// Vocabulary preferences: only fire when the document dialect disagrees.
export function generateDialectVocabularyRules() {
  const rules = [];
  DIALECT_VOCAB_PAIRS.forEach(([us, gb], i) => {
    for (const [term, variant] of [[us, 'us'], [gb, 'gb']]) {
      if (!PHRASE_PATTERN.test(term)) continue;
      rules.push(literalRule(`dialect-vocab-${i}-${variant}`, 'spelling', term, '',
        'Regional vocabulary preference. Choose the consistent term.', .55, {dialectVocab: variant, dialectVocabPair: [us, gb]}));
    }
  });
  return rules;
}

// Confusable pattern rules derived from the confusion table. Each rule
// matches the full phrase and replaces ONLY the wrong set member inside the
// match (longest member forms first), so surrounding words are preserved.
function buildMemberSwapper(members, replacement) {
  const forms = new Set();
  for (const word of members) {
    const base = word.replace(/[’]/g, "'");
    forms.add(base);
    for (const suffix of ['s', 'es', 'ed', 'd', 'ing', '’s', "'s"]) forms.add(base + suffix);
  }
  const alternation = [...forms].sort((a, b) => b.length - a.length)
    .map(escapeRegex).join('|');
  const swapPattern = new RegExp(`(?<![\\p{L}])(${alternation})(?![\\p{L}])`, 'iu');
  const findPattern = new RegExp(`(?<![\\p{L}])(${alternation})(?![\\p{L}])`, 'iu');
  // Regular suffixes carry over: "excepted" -> "accepted", not "accept".
  const SUFFIXES = ['s', 'es', 'ed', 'd', 'ing', '’s', "'s"];
  return match => {
    const found = match[0].match(findPattern);
    if (!found) return null;
    const matchedForm = found[1];
    let rep = replacement;
    if (!/['’]/.test(replacement)) {
      for (const word of members) {
        const base = word.replace(/[’]/g, "'");
        if (matchedForm.toLowerCase().startsWith(base.toLowerCase())) {
          const suffix = matchedForm.slice(base.length).toLowerCase();
          if (SUFFIXES.includes(suffix) && !replacement.toLowerCase().endsWith(suffix)) rep = replacement + suffix;
          break;
        }
      }
    }
    const fixed = match[0].replace(swapPattern, () => rep);
    return fixed === match[0] ? null : fixed;
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function generateConfusableRules() {
  const rules = [];
  let id = 0;
  for (const set of CONFUSION_SETS) {
    for (const [pattern, replacement] of set.patterns) {
      if (!replacement) continue;
      rules.push({
        id: `confusable-pattern-${id++}`, category: 'grammar', kind: 'regex',
        pattern: new RegExp(pattern.source, 'giu'),
        replacement: buildMemberSwapper(set.words, replacement),
        message: set.message, confidence: .9,
        source: 'Proofloom confusion sets',
      });
    }
  }
  return rules;
}

export const DIALECT_GENERATED_RULES = generateDialectRules();
export const DIALECT_VOCAB_RULES = generateDialectVocabularyRules();
export const CONFUSABLE_PATTERN_RULES = generateConfusableRules();
export {CONFUSION_SETS};

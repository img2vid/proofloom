// Dialect engine: consistent US/UK spelling and vocabulary across the text.
import {wordTokens, buildTriggerIndex} from '../rules/literal.js';
import {DIALECT_GENERATED_RULES, DIALECT_VOCAB_RULES} from '../rules/dialect.js';
import {DIALECT_SPELLING_PAIRS, DIALECT_VOCAB_PAIRS} from '../data/dialect.js';
import {matchCase} from '../rules/index.js';

const BRITISH = /^en-(GB|IN|AU|NZ|IE)/i;

export class DialectEngine {
  constructor() {
    this.spellingIndex = buildTriggerIndex(DIALECT_GENERATED_RULES);
    this.spellingLookup = new Map();
    for (const rule of DIALECT_GENERATED_RULES) {
      this.spellingLookup.set(rule.dialectWord, rule);
    }
    this.vocabRules = DIALECT_VOCAB_RULES;
    this.vocabIndex = buildTriggerIndex(this.vocabRules);
  }

  check(text, language, {add}) {
    const british = BRITISH.test(language || 'en-US');
    const tokens = wordTokens(text);
    // Spelling pairs.
    for (const token of tokens) {
      const key = token.lower;
      if (!this.spellingLookup.has(key)) continue;
      const pair = DIALECT_SPELLING_PAIRS.find(([a, b]) => a === key || b === key);
      if (!pair) continue;
      const from = pair[0] === key ? pair[0] : pair[1];
      const to = british ? (pair[0] === key ? pair[1] : pair[0]) : (pair[0] === key ? pair[0] : pair[1]);
      if (from === to) continue;
      add(token.start, token.end, token.word, [matchCase(to, token.word)], {
        id: 'dialect-spelling', category: 'spelling',
        message: `Use a consistent ${british ? 'British' : 'American'} English spelling.`,
        confidence: .9, source: 'Proofloom dialect tables',
      });
    }
    // Vocabulary preferences (US term when writing British or vice versa).
    for (let i = 0; i < tokens.length; i++) {
      const candidates = this.vocabIndex.get(tokens[i].lower);
      if (!candidates) continue;
      for (const ruleIndex of candidates) {
        const rule = this.vocabRules[ruleIndex];
        const tokens2 = rule.tokens;
        if (i + tokens2.length > tokens.length) continue;
        let ok = true;
        for (let k = 1; k < tokens2.length; k++) if (tokens[i + k].lower !== tokens2[k]) { ok = false; break; }
        if (!ok) continue;
        const variant = rule.dialectVocab;
        if ((british && variant === 'us') || (!british && variant === 'gb')) {
          const [us, gb] = rule.dialectVocabPair;
          const replacement = british ? us : gb;
          const start = tokens[i].start, end = tokens[i + tokens2.length - 1].end;
          add(start, end, text.slice(start, end), [matchCase(replacement, text.slice(start, end))], {
            id: 'dialect-vocabulary', category: 'spelling',
            message: `In ${british ? 'British' : 'American'} English, “${replacement}” is the usual term.`,
            confidence: .62, source: 'Proofloom dialect vocabulary',
          });
        }
      }
    }
  }
}

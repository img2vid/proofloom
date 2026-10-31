// Confusion-set engine: context-based disambiguation of real-word errors.
// Combines the corpus context model (when data exists for a set) with the
// grammatical pattern tests from the confusion table.
import {tokenizeWords} from '../algorithms/tokenize.js';
import {contextWindow} from '../algorithms/language-model.js';

export class ConfusablesEngine {
  constructor(confusionSets, contextModel, frequency) {
    this.sets = confusionSets;
    this.model = contextModel;
    this.frequency = frequency;
    this.byWord = new Map();
    for (const set of confusionSets) {
      for (const word of set.words) {
        const lower = word.toLowerCase().replace(/’/g, "'");
        const list = this.byWord.get(lower) || [];
        list.push(set);
        this.byWord.set(lower, list);
      }
    }
  }

  check(text, {add}) {
    const tokens = tokenizeWords(text);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const lower = token.lower.replace(/’/g, "'");
      const sets = this.byWord.get(lower);
      if (!sets || token.word.length < 2) continue;
      for (const set of sets) {
        const alternatives = set.words.filter(w => w.toLowerCase().replace(/’/g, "'") !== lower);
        if (!alternatives.length) continue;
        const {prev, next} = contextWindow(tokens, i);
        // 2) Corpus context model.
        if (this.model?.hasSetFor(lower)) {
          const verdict = this.model.disambiguate(prev, lower, next, {margin: 1.35, minSupport: 10});
          if (verdict?.confident && verdict.word !== lower) {
            const display = set.words.find(w => w.toLowerCase().replace(/’/g, "'") === verdict.word) || verdict.word;
            add(token.start, token.end, token.word, [display], {
              id: 'confusion-context', category: 'grammar',
              message: `${set.message} The surrounding words suggest “${display}”.`,
              confidence: Math.min(.94, .62 + Math.min(.3, verdict.margin / 6)),
              source: 'Corpus context model (public-domain classics)',
            });
          }
        }
        break; // one set per word position is enough
      }
    }
  }
}

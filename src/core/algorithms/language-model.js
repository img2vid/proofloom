// 55. Confusion-set language model. Derived from a public-domain corpus
// (see scripts/build-context-model.mjs). For each confusion set
// ("their/there/they're"), the model stores which words appear immediately
// before and after each member in real prose. At runtime the model scores
// each candidate against the surrounding context and flags the member
// that best fits — the classic confusion-set disambiguation approach
// (Golding & Roth, 1999).

// A member with no corpus data at all scores very low; unseen context words
// share a fixed floor so rare members gain no advantage from being rare.
const ALPHA = 0.15;
const SMOOTH_VOCAB = 60;
const FLOOR = Math.log(ALPHA / (1000 + ALPHA * SMOOTH_VOCAB)); // ≈ -8.8
const NO_DATA = 2 * FLOOR + Math.log(0.0005);

export function normalizeToken(word) {
  return String(word).toLowerCase().replace(/[’]/g, "'");
}

export class ConfusionContextModel {
  constructor(data) {
    this.sets = [];
    this.byWord = new Map();
    for (const set of data?.sets || []) {
      const entry = {words: set.words.map(normalizeToken), contexts: new Map()};
      for (const [word, contexts] of Object.entries(set.contexts || {})) {
        const prev = new Map(Object.entries(contexts.prev || {}));
        const next = new Map(Object.entries(contexts.next || {}));
        entry.contexts.set(normalizeToken(word), {
          prev, next,
          count: contexts.count || 0,
          prevTotal: [...prev.values()].reduce((a, b) => a + b, 0) || contexts.count || 1,
          nextTotal: [...next.values()].reduce((a, b) => a + b, 0) || contexts.count || 1,
        });
      }
      this.sets.push(entry);
      for (const word of entry.words) {
        const existing = this.byWord.get(word) || [];
        existing.push(entry);
        this.byWord.set(word, existing);
      }
    }
  }

  hasSetFor(word) {
    return this.byWord.has(normalizeToken(word));
  }

  // Log P(context | word) per side with a shared unseen floor, plus the
  // word's corpus prior — a Bayes-style comparison across set members.
  sideScore(side, ctx, own) {
    const counts = side === 'prev' ? own.prev : own.next;
    const total = side === 'prev' ? own.prevTotal : own.nextTotal;
    const c = counts.get(ctx);
    if (!c) return FLOOR;
    return Math.log((c + ALPHA) / (total + ALPHA * SMOOTH_VOCAB));
  }

  // Probability-ish score of a word given its neighbouring words.
  contextScore(word, prevWord = '', nextWord = '') {
    const key = normalizeToken(word);
    const set = this.byWord.get(key)?.[0];
    if (!set) return null;
    const own = set.contexts.get(key);
    if (!own) return NO_DATA;
    const prevKey = normalizeToken(prevWord), nextKey = normalizeToken(nextWord);
    let score = 0;
    if (prevKey) score += this.sideScore('prev', prevKey, own);
    if (nextKey) score += this.sideScore('next', nextKey, own);
    return score;
  }

  // Disambiguate one confusion set against the observed context. Returns
  // null when the model has no strong opinion (sparse data, or the margin
  // between the top two candidates is too small).
  disambiguate(prevWord, word, nextWord, {margin = 1.35, minSupport = 12} = {}) {
    const lower = normalizeToken(word);
    const set = this.byWord.get(lower)?.[0];
    if (!set) return null;
    const totalCount = [...set.contexts.values()].reduce((n, c) => n + c.count, 0) || 1;
    const scored = set.words.map(w => {
      const own = set.contexts.get(w);
      const support = own?.count || 0;
      const prior = own ? Math.log(own.count / totalCount) : Math.log(0.0005);
      const context = own ? this.contextScore(w, prevWord, nextWord) : 2 * FLOOR;
      return {word: w, score: context + prior, support};
    });
    const supported = scored.filter(s => s.support >= minSupport);
    if (supported.length < 2) return null;
    scored.sort((a, b) => b.score - a.score);
    const [best, second] = scored;
    if (!best || !second) return null;
    if (best.word === lower) return {word: lower, confident: false, margin: best.score - second.score};
    const spread = best.score - second.score;
    if (spread < margin) return {word: lower, confident: false, margin: spread};
    return {word: best.word, confident: true, margin: spread, alternatives: set.words.filter(w => w !== best.word)};
  }
}

// 56. Context-window extraction around an offset: previous and next word
// ignoring punctuation.
export function contextWindow(tokens, index) {
  let prev = '';
  for (let i = index - 1; i >= 0; i--) {
    if (/^[\p{L}][\p{L}'’-]*$/u.test(tokens[i].word)) { prev = tokens[i].word; break; }
  }
  let next = '';
  for (let i = index + 1; i < tokens.length; i++) {
    if (/^[\p{L}][\p{L}'’-]*$/u.test(tokens[i].word)) { next = tokens[i].word; break; }
  }
  return {prev, next};
}

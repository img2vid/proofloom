// 52. Candidate ranker. Combines weighted edit distance, similarity metrics,
// frequency priors and context scores into a single plausible ordering.

import {damerauLevenshtein, weightedEditDistance} from './edit-distance.js';
import {keyboardCost} from './keyboard.js';
import {jaroWinkler, bigramDice} from './similarity.js';

// Frequency prior: log-scaled rank of a word in the bundled frequency list.
// Rank 1 ("you") gets the strongest prior; words beyond the list get the
// weakest but non-zero prior.
export function frequencyPrior(rank) {
  if (!rank) return 0;
  return 1 / (1 + Math.log(rank) / 3);
}

export function scoreCandidate(original, candidate, {distance, similarity = 0, frequencyRank = 0, contextScore = 0, keyboardHint = 0} = {}) {
  const lowerOriginal = original.toLowerCase(), lowerCandidate = candidate.toLowerCase();
  const editDistance = distance ?? damerauLevenshtein(lowerOriginal, lowerCandidate);
  const weighted = weightedEditDistance(lowerOriginal, lowerCandidate, keyboardCost);
  const winkler = similarity || jaroWinkler(lowerOriginal, lowerCandidate);
  const dice = bigramDice(lowerOriginal, lowerCandidate);
  const phoneticBonus = similarity ? 0.4 : 0;
  const lengthPenalty = Math.abs(lowerOriginal.length - lowerCandidate.length) * 0.02;
  const freq = frequencyPrior(frequencyRank);
  const score =
    1.2 * winkler +
    0.7 * dice -
    0.35 * editDistance -
    0.16 * weighted +
    1.8 * freq +
    1.2 * contextScore +
    keyboardHint * 0.15 +
    phoneticBonus -
    lengthPenalty;
  return score;
}

// 53. Rank suggestions: dedupe, score, sort, and case-match against the
// original word. Returns top N with scores.
export function rankSuggestions(original, candidates, {limit = 5, frequencyRank, contextScores} = {}) {
  const seen = new Set();
  const scored = [];
  for (const entry of candidates) {
    const word = typeof entry === 'string' ? entry : entry.word;
    const lower = word.toLowerCase();
    if (seen.has(lower) || lower === original.toLowerCase()) continue;
    seen.add(lower);
    const score = scoreCandidate(original, word, {
      distance: typeof entry === 'object' ? entry.distance : undefined,
      similarity: typeof entry === 'object' ? entry.similarity : undefined,
      frequencyRank: frequencyRank?.get?.(lower) || 0,
      contextScore: contextScores?.get?.(lower) || 0,
      keyboardHint: typeof entry === 'object' ? entry.keyboardHint : 0,
    });
    scored.push({word, score});
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => ({word: s.word, score: clampConfidence((s.score + 0.8) / 2.6)}));
}

// 54. Confidence clamp for displayed suggestions.
export function clampConfidence(value) {
  return Math.max(0.05, Math.min(0.99, value));
}

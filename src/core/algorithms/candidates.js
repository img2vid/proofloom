// Candidate-generation algorithms for the spelling pipeline. Given a
// non-dictionary word, each generator proposes plausible dictionary words
// from a different error model; the ranker then scores them.

import {damerauLevenshtein} from './edit-distance.js';
import {keyNeighbors} from './keyboard.js';
import {phoneticKeys} from './phonetics.js';
import {bigramDice} from './similarity.js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

// 46. Norvig-style deletion index. Index every word by the strings reachable
// through one deletion; a query word is matched through its own deletions,
// recovering candidates within edit distance 1-2 cheaply.
export class DeletionIndex {
  constructor(words, {extraKeys = []} = {}) {
    this.index = new Map();
    for (const word of words) {
      if (word.length > 24) continue;
      this.addDeletions(word.toLowerCase());
    }
    for (const key of extraKeys) this.addDeletions(key);
  }
  addDeletions(word) {
    const forms = new Set([word]);
    for (let i = 0; i < word.length; i++) forms.add(word.slice(0, i) + word.slice(i + 1));
    for (const form of forms) {
      const bucket = this.index.get(form);
      if (bucket) bucket.add(word);
      else this.index.set(form, new Set([word]));
    }
  }
  * candidates(word, maxDistance = 2) {
    const lower = word.toLowerCase();
    const seen = new Set();
    const variants = new Set([lower]);
    for (let i = 0; i < lower.length; i++) variants.add(lower.slice(0, i) + lower.slice(i + 1));
    if (maxDistance >= 2) {
      for (const first of [...variants]) {
        for (let i = 0; i < first.length; i++) variants.add(first.slice(0, i) + first.slice(i + 1));
      }
    }
    for (const variant of variants) {
      const bucket = this.index.get(variant);
      if (!bucket) continue;
      for (const candidate of bucket) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        const distance = damerauLevenshtein(lower, candidate);
        if (distance <= maxDistance && distance > 0) yield {word: candidate, distance};
      }
    }
  }
}

// 47. Phonetic bucket index: dictionary words grouped by pronunciation keys
// so that sound-alike candidates can be retrieved directly.
export class PhoneticIndex {
  constructor(words) {
    this.buckets = new Map();
    for (const word of words) {
      if (word.length < 2 || word.length > 24) continue;
      const keys = phoneticKeys(word);
      for (const family of ['soundex', 'metaphone', 'dmpPrimary', 'nysiis', 'caverphone']) {
        const key = keys[family];
        if (!key) continue;
        for (const k of family === 'dmpPrimary' ? [key] : [key]) {
          const id = family + ':' + k;
          let bucket = this.buckets.get(id);
          if (!bucket) { bucket = []; this.buckets.set(id, bucket); }
          if (bucket.length < 60) bucket.push(word.toLowerCase());
        }
      }
    }
  }
  * candidates(word) {
    const keys = phoneticKeys(word);
    const seen = new Set();
    for (const family of ['soundex', 'metaphone', 'dmpPrimary', 'nysiis', 'caverphone']) {
      const bucket = this.buckets.get(family + ':' + keys[family]);
      if (!bucket) continue;
      for (const candidate of bucket) {
        if (seen.has(candidate) || candidate === word.toLowerCase()) continue;
        seen.add(candidate);
        const similarity = bigramDice(word.toLowerCase(), candidate);
        if (similarity >= 0.34) yield {word: candidate, distance: 2, similarity};
      }
    }
  }
}

// 48. Keyboard-adjacency candidates: one-character substitutions using keys
// next to the typed key on a QWERTY layout.
export function keyboardCandidates(word, isKnown) {
  const out = [];
  const lower = word.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    for (const neighbor of keyNeighbors(lower[i])) {
      const candidate = lower.slice(0, i) + neighbor + lower.slice(i + 1);
      if (candidate !== lower && isKnown(candidate)) out.push({word: candidate, distance: 1});
    }
  }
  return out;
}

// 49. OCR-confusion candidates via the recognition-confusion table.
export function ocrCandidates(word, isKnown) {
  const out = [];
  const lower = word.toLowerCase();
  const swaps = [['rn', 'm'], ['m', 'rn'], ['cl', 'd'], ['d', 'cl'], ['vv', 'w'], ['w', 'vv'], ['h', 'li'], ['li', 'h'], ['ii', 'n'], ['n', 'ii']];
  for (const [from, to] of swaps) {
    for (let index = lower.indexOf(from); index !== -1 && from !== to; index = lower.indexOf(from, index + 1)) {
      const candidate = lower.slice(0, index) + to + lower.slice(index + from.length);
      if (candidate !== lower && isKnown(candidate)) out.push({word: candidate, distance: 1});
    }
  }
  const digitSwaps = [['0', 'o'], ['1', 'l'], ['5', 's'], ['8', 'b'], ['2', 'z'], ['6', 'g'], ['9', 'g']];
  if (/[0125689]/.test(lower)) {
    for (const [from, to] of digitSwaps) {
      const candidate = lower.split(from).join(to);
      if (candidate !== lower && isKnown(candidate)) out.push({word: candidate, distance: 1});
    }
  }
  return out;
}

// 50. Split/join candidates: words written as one ("alot", "infront",
// "aswell") or as two ("every day/everyday", "may be/maybe").
export function splitCandidates(word, isKnown) {
  const out = [];
  const lower = word.toLowerCase();
  for (let i = 1; i < lower.length - 2; i++) {
    const left = lower.slice(0, i), right = lower.slice(i);
    if (left.length >= 1 && right.length >= 3 && isKnown(left) && isKnown(right)) out.push({word: left + ' ' + right, distance: 1});
  }
  return out;
}

export function joinCandidates(phrase, isKnown) {
  const compact = phrase.toLowerCase().replace(/\s+/g, '');
  return isKnown(compact) ? [{word: compact, distance: 1}] : [];
}

// 51. Insertion candidates: try inserting one missing character at a time,
// prioritized by doubled-consonant patterns ("tomorow" -> "tomorrow").
export function insertionCandidates(word, isKnown) {
  const out = [];
  const lower = word.toLowerCase();
  for (let i = 0; i <= lower.length; i++) {
    const neighbors = i > 0 ? [lower[i - 1], ...keyNeighbors(lower[i - 1])] : [];
    for (const ch of new Set([...neighbors, ...'aeiou'])) {
      const candidate = lower.slice(0, i) + ch + lower.slice(i);
      if (isKnown(candidate)) out.push({word: candidate, distance: 1});
    }
  }
  return out;
}

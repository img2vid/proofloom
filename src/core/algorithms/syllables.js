// Syllable-counting algorithms used by every readability formula.

// 31. Vowel-group heuristic with silent-e and -le handling.
export function countSyllables(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = s.match(/[aeiouy]{1,2}/g) || [];
  let count = Math.max(1, groups.length);
  // Special clusters that usually add a syllable.
  if (/[aeiou][aeiou]/.test(w) && w.endsWith('ion') && !w.endsWith('sion') && !w.endsWith('cion')) count += 0;
  if (/[^aeiou]le$/.test(w)) count += 1;
  if (/ia|io|ua|uo/.test(w) && !/cia|tia|gia/.test(w)) count += 0;
  return count;
}

// 32. Dictionary-irregular override table for words the heuristic gets wrong
// (names, loanwords, function words). Applied before the heuristic.
const IRREGULAR_SYLLABLES = new Map(Object.entries({
  every: 3, different: 3, interesting: 4, area: 3, idea: 3, being: 2, science: 2, quiet: 2,
  poem: 2, poet: 2, ocean: 2, lion: 2, piano: 3, camera: 3, family: 3, chocolate: 3,
  business: 2, restaurant: 3, comfortable: 4, vegetable: 4, favorite: 3, separate: 3,
  temperature: 4, battery: 3, actually: 4, basically: 4, generally: 4, library: 3,
  schedule: 2, Wednesday: 3, evening: 2, recipe: 3, queue: 1, onion: 2, opinion: 3,
  million: 2, billion: 2, union: 2, unicorn: 3, beautiful: 3, hour: 1, our: 1,
  fire: 1, hire: 1, tire: 1, wire: 1, more: 1, before: 2, table: 2, little: 2,
  people: 2, purple: 2, angle: 2, single: 2, circle: 2, article: 3, vehicle: 3,
}));

export function syllablesIn(word) {
  const key = word.toLowerCase();
  if (IRREGULAR_SYLLABLES.has(key)) return IRREGULAR_SYLLABLES.get(key);
  return countSyllables(word);
}

export function countSyllablesInText(text) {
  return [...text.matchAll(/[\p{L}\p{M}]+/gu)].reduce((n, m) => n + syllablesIn(m[0]), 0);
}

// 33. Complex-word classifier: three or more syllables (Fog, SMOG) or not in
// the Dale-Chall familiar list.
export function isComplexWord(word, threshold = 3) {
  return syllablesIn(word) >= threshold;
}

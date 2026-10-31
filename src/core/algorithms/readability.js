// Ten classic readability formulas, each registered as an algorithm. The
// engines use them for the readability dashboard; the formulas take counts
// computed once from the text.
import {syllablesIn, isComplexWord} from './syllables.js';

const round = n => Math.round(n * 10) / 10;
const safe = (n, fallback = null) => Number.isFinite(n) ? n : fallback;

// 34. Flesch Reading Ease.
export function fleschReadingEase({sentences, words, syllables}) {
  if (!sentences || !words) return null;
  return safe(round(206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)));
}

// 35. Flesch-Kincaid Grade Level.
export function fleschKincaidGrade({sentences, words, syllables}) {
  if (!sentences || !words) return null;
  return safe(round(0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59));
}

// 36. Gunning Fog index.
export function gunningFog({sentences, words, complexWords}) {
  if (!sentences || !words) return null;
  return safe(round(0.4 * ((words / sentences) + 100 * (complexWords / words))));
}

// 37. SMOG index (simplified, needs >= 30 sentences for full accuracy).
export function smog({sentences, polysyllables}) {
  if (!sentences) return null;
  return safe(round(1.043 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291));
}

// 38. Coleman-Liau index.
export function colemanLiau({sentences, words, letters}) {
  if (!words) return null;
  const L = (letters / words) * 100, S = (sentences / words) * 100;
  return safe(round(0.0588 * L - 0.296 * S - 15.8));
}

// 39. Automated Readability Index.
export function automatedReadability({sentences, words, letters}) {
  if (!sentences || !words) return null;
  return safe(round(4.71 * (letters / words) + 0.5 * (words / sentences) - 21.43));
}

// 40. Linsear Write.
export function linsearWrite({easyWords, hardWords, sentences}) {
  if (!sentences || !easyWords + hardWords) return null;
  const raw = (easyWords + 3 * hardWords) / sentences;
  return safe(round(raw <= 20 ? raw / 2 : raw / 3));
}

// 41. Dale-Chall Readability Score.
export function daleChall({sentences, words, unfamiliarWords}) {
  if (!sentences || !words) return null;
  const raw = 0.1579 * (100 * unfamiliarWords / words) + 0.0496 * (words / sentences);
  const adjusted = 100 * unfamiliarWords / words > 5 ? raw + 3.6365 : raw;
  return safe(round(adjusted));
}

// 42. FORCAST.
export function forcast({words, monosyllables}) {
  if (!words || words < 150) return null;
  return safe(round(20 - (monosyllables / (words / 150)) / 10));
}

// 43. Spache (primary-grade texts).
export function spache({sentences, words, unfamiliarWords}) {
  if (!sentences || !words) return null;
  return safe(round(0.141 * (words / sentences) + 0.086 * (100 * unfamiliarWords / words) + 0.839));
}

export const READABILITY_FORMULAS = [
  {id: 'flesch', name: 'Flesch Reading Ease', run: fleschReadingEase, higher: 'easier'},
  {id: 'flesch-kincaid', name: 'Flesch-Kincaid Grade', run: fleschKincaidGrade, higher: 'harder'},
  {id: 'gunning-fog', name: 'Gunning Fog Index', run: gunningFog, higher: 'harder'},
  {id: 'smog', name: 'SMOG Index', run: smog, higher: 'harder'},
  {id: 'coleman-liau', name: 'Coleman-Liau Index', run: colemanLiau, higher: 'harder'},
  {id: 'ari', name: 'Automated Readability Index', run: automatedReadability, higher: 'harder'},
  {id: 'linsear-write', name: 'Linsear Write', run: linsearWrite, higher: 'harder'},
  {id: 'dale-chall', name: 'Dale-Chall Score', run: daleChall, higher: 'harder'},
  {id: 'forcast', name: 'FORCAST', run: forcast, higher: 'harder'},
  {id: 'spache', name: 'Spache Score', run: spache, higher: 'harder'},
];

// 44. Full readability profile over a text. Familiar-word sets come from the
// bundled Dale-Chall and Spache word lists.
export function readabilityProfile(text, {daleChallSet, spacheSet, daleChallThreshold = 3} = {}) {
  const words = [...text.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu)].map(m => m[0]);
  const sentences = [...text.matchAll(/[^.!?\n]+[.!?]+["'”’)\]]*/g)].filter(m => /[\p{L}]/u.test(m[0]));
  const tokens = words.map(w => w.toLowerCase());
  const syllables = words.reduce((n, w) => n + syllablesIn(w), 0);
  const complexWords = words.filter(w => isComplexWord(w)).length;
  const polysyllables = words.filter(w => syllablesIn(w) >= 3).length;
  const monosyllables = words.filter(w => syllablesIn(w) === 1).length;
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  const easyWords = words.filter(w => syllablesIn(w) <= 2).length;
  const hardWords = words.length - easyWords;
  // Dale-Chall: a word is "unfamiliar" when neither it nor a simple
  // inflection-stripped stem is in the familiar-word list.
  const strip = w => w.replace(/(ed|s|es|ing|er|est|ly)$/, '');
  const daleUnfamiliar = daleChallSet ? tokens.filter(w => !daleChallSet.has(w) && (strip(w) === w || (!daleChallSet.has(strip(w)) && w.length > 3))).length : 0;
  const spacheUnfamiliar = spacheSet ? tokens.filter(w => !spacheSet.has(w)).length : 0;
  const counts = {sentences: sentences.length, words: words.length, syllables, complexWords, polysyllables, monosyllables, letters, easyWords, hardWords, unfamiliarWords: daleUnfamiliar};
  const results = READABILITY_FORMULAS.map(f => ({
    id: f.id, name: f.name, higher: f.higher,
    value: f.run(f.id === 'spache' ? {...counts, unfamiliarWords: spacheUnfamiliar} : counts),
  }));
  const gradeInputs = [fleschKincaidGrade, gunningFog, smog, colemanLiau, automatedReadability].map(run => run(counts)).filter(Number.isFinite);
  const averageGrade = gradeInputs.length ? gradeInputs.reduce((a, b) => a + b, 0) / gradeInputs.length : null;
  return {counts, results, averageGrade: averageGrade === null ? null : round(averageGrade), daleChallThreshold};
}

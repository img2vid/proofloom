// Sentence-level style analyzers: readability profile, sentence-length
// variance, repeated sentence starts, adverb density, nominalizations,
// weasel words, passive density. These produce review-only style issues.
import {tokenizeSentences, tokenizeWords} from '../algorithms/tokenize.js';
import {syllablesIn} from '../algorithms/syllables.js';
import {looksPassive} from '../algorithms/pos-guess.js';

const WEASEL = /\b(?:some|many|most|few|several|various|virtually|clearly|obviously|significantly|substantially|considerably|arguably|essentially|basically|relatively|somewhat|rather|quite|fairly)\b/giu;
const NOMINALIZATIONS = /\b(?:[\p{L}]{4,}(?:tion|sion|ment|ance|ence|ity))\b/giu;

export function analyzeSentences(text, {add, preset}) {
  const sentences = tokenizeSentences(text);
  if (!sentences.length) return {sentences: []};
  const stats = [];
  let lastStart = '';
  for (const sentence of sentences) {
    const words = tokenizeWords(sentence.text);
    if (!words.length) continue;
    const syllables = words.reduce((n, w) => n + syllablesIn(w.word), 0);
    const start = words[0].lower;
    stats.push({sentence, words: words.length, syllables, start, words_: words});
  }
  const totalWords = stats.reduce((n, s) => n + s.words, 0);
  const average = totalWords / stats.length;
  // Sentence-length variance (>= 3 sentences).
  if (stats.length >= 3 && average > 0) {
    const variance = stats.reduce((n, s) => n + (s.words - average) ** 2, 0) / stats.length;
    if (variance < 9 && stats.length >= 4) {
      add(0, Math.min(text.length, 60), text.slice(0, Math.min(60, text.length)), [], {
        id: 'sentence-variance', category: 'style', message: 'Sentences have very similar lengths. Mixing short and long sentences improves rhythm.', confidence: .55, source: 'Sentence-length variance analysis',
      });
    }
  }
  for (const s of stats) {
    const {sentence, words, start, words_} = s;
    if (words > 38) {
      add(sentence.start, sentence.start + Math.min(sentence.text.length, 80), sentence.text.slice(0, 80), [], {
        id: 'long-sentence', category: 'style', message: `This sentence runs ${words} words. Consider splitting it for clarity.`, confidence: .6, source: 'Sentence-length analysis',
      });
    }
    // Repeated sentence starts.
    if (start && start === lastStart && !['the', 'a', 'an', 'i', 'it', 'he', 'she', 'they', 'we', 'you', 'to', 'if', 'and'].includes(start)) {
      add(sentence.start, sentence.start + Math.min(30, sentence.text.length), sentence.text.slice(0, 30), [], {
        id: 'repeated-start', category: 'style', message: `Several sentences begin with “${sentence.text.split(/\s+/)[0]}”. Vary the openings.`, confidence: .55, source: 'Repeated-start detection',
      });
    }
    lastStart = start;
    // Adverb density: 3+ -ly adverbs in one sentence.
    const adverbs = words_.filter(w => w.lower.endsWith('ly') && w.word.length > 5).length;
    if (adverbs >= 3) {
      add(sentence.start, sentence.start + Math.min(60, sentence.text.length), sentence.text.slice(0, 60), [], {
        id: 'adverb-density', category: 'style', message: `${adverbs} adverbs in one sentence. Strong verbs may serve better.`, confidence: .55, source: 'Adverb-density analysis',
      });
    }
    // Nominalization density.
    const nominalizations = sentence.text.match(NOMINALIZATIONS) || [];
    if (nominalizations.length >= 3 && preset !== 'creative') {
      add(sentence.start, sentence.start + Math.min(60, sentence.text.length), sentence.text.slice(0, 60), [], {
        id: 'nominalization', category: 'style', message: 'Several abstract -tion/-ment nouns in one sentence. Verbs may read more directly.', confidence: .5, source: 'Nominalization analysis',
      });
    }
    // Weasel words.
    if (preset === 'academic' || preset === 'business') {
      const weasels = sentence.text.match(WEASEL) || [];
      if (weasels.length >= 3) {
        add(sentence.start, sentence.start + Math.min(50, sentence.text.length), sentence.text.slice(0, 50), [], {
          id: 'weasel-words', category: 'style', message: 'Multiple vague qualifiers weaken the claim. Name specifics instead.', confidence: .5, source: 'Weasel-word analysis',
        });
      }
    }
  }
  // Passive-voice constructions through the POS helper.
  for (const s of stats) {
    if (preset && !['academic', 'business'].includes(preset)) break;
    const plain = s.sentence.text.replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/);
    if (plain.some((w, i) => looksPassive(plain, i))) {
      add(s.sentence.start, s.sentence.start + Math.min(50, s.sentence.text.length), s.sentence.text.slice(0, 50), [], {
        id: 'passive-structure', category: 'style', message: 'Passive construction. Consider an active alternative.', confidence: .6, source: 'Passive-voice detector',
      });
    }
  }
  return {sentences: stats};
}

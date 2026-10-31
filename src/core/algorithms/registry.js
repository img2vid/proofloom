// Algorithm registry. Every algorithm in src/core/algorithms registers here
// so the UI can show what the engine actually runs, with real counts.
const registry = [];

export function registerAlgorithm(id, family, name, description) {
  registry.push({id, family, name, description});
}

export function registeredAlgorithms() {
  return registry;
}

export function algorithmCount() {
  return registry.length;
}

export function algorithmFamilies() {
  const families = new Map();
  for (const entry of registry) {
    const list = families.get(entry.family) || [];
    list.push(entry);
    families.set(entry.family, list);
  }
  return [...families.entries()].map(([family, list]) => ({family, count: list.length, algorithms: list}));
}

import {levenshtein, damerauLevenshtein, restrictedDamerauLevenshtein, hamming, lcsDistance, weightedEditDistance, levenshteinSimilarity} from './edit-distance.js';
import {jaro, jaroWinkler, bigramDice, trigramJaccard, ngramCosine, longestCommonSubstring, mongeElkan, affixSimilarity} from './similarity.js';
import {keyNeighbors, keyboardCost, isDoubledConsonant, transpositionLikely} from './keyboard.js';
import {soundex, refinedSoundex, metaphone, doubleMetaphone, nysiis, caverphone1, caverphone2, matchRatingCodex, matchRatingCompare} from './phonetics.js';
import {tokenizeWords, tokenizeSentences, paragraphs} from './tokenize.js';
import {countSyllables, syllablesIn, isComplexWord} from './syllables.js';
import {fleschReadingEase, fleschKincaidGrade, gunningFog, smog, colemanLiau, automatedReadability, linsearWrite, daleChall, forcast, spache, readabilityProfile} from './readability.js';
import {guessPos, looksPassive} from './pos-guess.js';
import {DeletionIndex, PhoneticIndex, keyboardCandidates, ocrCandidates, splitCandidates, joinCandidates, insertionCandidates} from './candidates.js';
import {frequencyPrior, scoreCandidate, rankSuggestions, clampConfidence} from './ranker.js';
import {ConfusionContextModel, contextWindow} from './language-model.js';

registerAlgorithm('levenshtein', 'String metrics', 'Levenshtein distance', 'Insertion/deletion/substitution distance.');
registerAlgorithm('damerau-levenshtein', 'String metrics', 'Damerau-Levenshtein (OSA)', 'Adds adjacent-transposition handling for typing slips.');
registerAlgorithm('restricted-damerau', 'String metrics', 'Restricted Damerau-Levenshtein', 'Handles jumbled letters like recieve/receive.');
registerAlgorithm('hamming', 'String metrics', 'Hamming distance', 'Substitution-only distance for equal-length strings.');
registerAlgorithm('lcs-distance', 'String metrics', 'LCS distance', 'Insert/delete-only distance via longest common subsequence.');
registerAlgorithm('weighted-edit', 'String metrics', 'Weighted edit distance', 'Edit distance with keyboard- and confusion-aware costs.');
registerAlgorithm('levenshtein-similarity', 'String metrics', 'Levenshtein similarity', 'Normalized 0-1 similarity from Levenshtein distance.');
registerAlgorithm('jaro', 'String metrics', 'Jaro similarity', 'Match-window similarity metric.');
registerAlgorithm('jaro-winkler', 'String metrics', 'Jaro-Winkler similarity', 'Jaro with a common-prefix bonus.');
registerAlgorithm('bigram-dice', 'String metrics', 'Sørensen–Dice (bigrams)', 'Shared character-bigram coefficient.');
registerAlgorithm('trigram-jaccard', 'String metrics', 'Jaccard (trigrams)', 'Set similarity over character trigrams.');
registerAlgorithm('ngram-cosine', 'String metrics', 'Cosine (n-grams)', 'Vector cosine over character n-gram frequencies.');
registerAlgorithm('lcs-substring', 'String metrics', 'Longest common substring', 'Longest exact shared run of characters.');
registerAlgorithm('monge-elkan', 'String metrics', 'Monge-Elkan', 'Symmetric average best-pair similarity.');
registerAlgorithm('affix-similarity', 'String metrics', 'Affix similarity', 'Shared prefix + suffix ratio.');

registerAlgorithm('qwerty-adjacency', 'Error models', 'QWERTY adjacency graph', 'Physical-key neighbor model for substitution costs.');
registerAlgorithm('ocr-confusion-table', 'Error models', 'OCR confusion matrix', 'rn/m, cl/d, O/0 and friends for scan artifacts.');
registerAlgorithm('doubled-consonants', 'Error models', 'Doubled-consonant model', 'bdgmnprt doubling slips like tomorow/tomorrow.');
registerAlgorithm('transposition-model', 'Error models', 'Transposition likelihood', 'Flags adjacent swapped keys by layout distance.');

registerAlgorithm('soundex', 'Phonetics', 'Soundex', 'Classic 1918 American phonetic code.');
registerAlgorithm('refined-soundex', 'Phonetics', 'Refined Soundex (NARA)', 'Extended census-bureau variant.');
registerAlgorithm('metaphone', 'Phonetics', 'Metaphone', 'Philips 1990 English phonetic encoding.');
registerAlgorithm('double-metaphone', 'Phonetics', 'Double Metaphone', 'Primary/secondary keys for alternate pronunciations.');
registerAlgorithm('nysiis', 'Phonetics', 'NYSIIS', 'New York State Identification and Intelligence System code.');
registerAlgorithm('caverphone1', 'Phonetics', 'Caverphone 1', 'New Zealand name-matching phonetic code.');
registerAlgorithm('caverphone2', 'Phonetics', 'Caverphone 2', 'Extended Caverphone encoding.');
registerAlgorithm('match-rating', 'Phonetics', 'Match Rating Approach', 'Western Airlines codex with comparison table.');

registerAlgorithm('word-tokenizer', 'Text segmentation', 'Word tokenizer', 'Unicode word tokens with UTF-16 offsets.');
registerAlgorithm('sentence-segmenter', 'Text segmentation', 'Sentence segmenter', 'Abbreviation-aware sentence boundaries.');
registerAlgorithm('paragraph-segmenter', 'Text segmentation', 'Paragraph segmenter', 'Blank-line paragraph detection.');
registerAlgorithm('vowel-group-syllables', 'Text segmentation', 'Vowel-group syllable counter', 'Heuristic syllable counting with silent-e handling.');
registerAlgorithm('irregular-syllables', 'Text segmentation', 'Irregular syllable table', 'Dictionary overrides for tricky words.');

registerAlgorithm('deletion-index', 'Candidate generation', 'Norvig deletion index', 'Edit-distance 1-2 lookup through deletion keys.');
registerAlgorithm('phonetic-bucket-index', 'Candidate generation', 'Phonetic bucket index', 'Dictionary words grouped by five phonetic families.');
registerAlgorithm('keyboard-candidates', 'Candidate generation', 'Keyboard candidates', 'Single adjacent-key substitutions.');
registerAlgorithm('ocr-candidates', 'Candidate generation', 'OCR candidates', 'Confusion-pair substitutions for scan text.');
registerAlgorithm('split-candidates', 'Candidate generation', 'Split candidates', 'Detects run-on words like alot/infront.');
registerAlgorithm('join-candidates', 'Candidate generation', 'Join candidates', 'Detects needlessly split words.');
registerAlgorithm('insertion-candidates', 'Candidate generation', 'Insertion candidates', 'Missing-letter insertion with doubled-consonant priority.');

registerAlgorithm('frequency-prior', 'Ranking', 'Frequency prior', 'Log-scaled corpus rank prior (OpenSubtitles top 50k).');
registerAlgorithm('candidate-scorer', 'Ranking', 'Weighted candidate scorer', 'Blends distance, similarity, frequency, and context.');
registerAlgorithm('suggestion-ranker', 'Ranking', 'Suggestion ranker', 'Dedupes and orders the final suggestion list.');

registerAlgorithm('confusion-context-model', 'Context analysis', 'Confusion-set context model', 'Corpus-derived before/after word statistics per confusion set.');
registerAlgorithm('confusion-disambiguator', 'Context analysis', 'Confusion-set disambiguator', 'Picks the set member that fits the surrounding words.');
registerAlgorithm('context-window', 'Context analysis', 'Context window extractor', 'Previous/next lexical words around an offset.');

registerAlgorithm('pos-guesser', 'Grammar analysis', 'Suffix POS guesser', 'Suffix-based part-of-speech tagger.');
registerAlgorithm('passive-detector', 'Grammar analysis', 'Passive construction detector', 'Auxiliary + participle chain detection.');

registerAlgorithm('flesch-reading-ease', 'Readability', 'Flesch Reading Ease', '1948 reading-ease score.');
registerAlgorithm('flesch-kincaid-grade', 'Readability', 'Flesch-Kincaid Grade Level', 'US grade-level estimate.');
registerAlgorithm('gunning-fog', 'Readability', 'Gunning Fog', 'Complex-word density index.');
registerAlgorithm('smog', 'Readability', 'SMOG', 'Polysyllable-based grade estimate.');
registerAlgorithm('coleman-liau', 'Readability', 'Coleman-Liau', 'Letter-based grade estimate.');
registerAlgorithm('ari', 'Readability', 'Automated Readability Index', 'Character-based grade estimate.');
registerAlgorithm('linsear-write', 'Readability', 'Linsear Write', 'US Air Force readability method.');
registerAlgorithm('dale-chall', 'Readability', 'Dale-Chall', 'Familiar-word-list readability score.');
registerAlgorithm('forcast', 'Readability', 'FORCAST', 'Monosyllable-based score for forms and manuals.');
registerAlgorithm('spache', 'Readability', 'Spache', 'Primary-grade readability score.');

export const ALGORITHM_EXPORTS = {levenshtein, damerauLevenshtein, restrictedDamerauLevenshtein, hamming, lcsDistance, weightedEditDistance, levenshteinSimilarity, jaro, jaroWinkler, bigramDice, trigramJaccard, ngramCosine, longestCommonSubstring, mongeElkan, affixSimilarity, keyNeighbors, keyboardCost, isDoubledConsonant, transpositionLikely, soundex, refinedSoundex, metaphone, doubleMetaphone, nysiis, caverphone1, caverphone2, matchRatingCodex, matchRatingCompare, tokenizeWords, tokenizeSentences, paragraphs, countSyllables, syllablesIn, isComplexWord, fleschReadingEase, fleschKincaidGrade, gunningFog, smog, colemanLiau, automatedReadability, linsearWrite, daleChall, forcast, spache, readabilityProfile, guessPos, looksPassive, DeletionIndex, PhoneticIndex, keyboardCandidates, ocrCandidates, splitCandidates, joinCandidates, insertionCandidates, frequencyPrior, scoreCandidate, rankSuggestions, clampConfidence, ConfusionContextModel, contextWindow};

// Proofloom checking engine. Composition of:
//  - thousands of deterministic rules (regex + literal phrase matcher)
//  - confusion-set disambiguation backed by a corpus context model
//  - a dialect consistency engine (spelling + vocabulary)
//  - an upgraded spelling pipeline with candidate generation and ranking
//  - sentence-level style analyzers and readability statistics
//  - OCR restoration heuristics
import nspell from 'nspell';
import {LazyHunspell} from './lazy-hunspell.js';
import {Morphology} from './morphology.js';
import {REGEX_RULES, LITERAL_RULES, LITERAL_TRIGGER_INDEX, matchCase, replacementFor, ruleCounts, CONFUSION_SETS} from './rules/index.js';
import {compilePackRules} from './resources.js';
import {matchLiteralRules} from './rules/literal.js';
import {DIALECT_GENERATED_RULES} from './rules/dialect.js';
import {DIALECT_SPELLING_PAIRS} from './data/dialect.js';
import {protectedRangesInternal, inProtected} from './ranges.js';
import {ConfusablesEngine} from './engines/confusables.js';
import {DialectEngine} from './engines/dialect.js';
import {analyzeSentences} from './engines/style.js';
import {DeletionIndex, PhoneticIndex, keyboardCandidates, ocrCandidates, splitCandidates, insertionCandidates} from './algorithms/candidates.js';
import {rankSuggestions, frequencyPrior} from './algorithms/ranker.js';
import {ConfusionContextModel} from './algorithms/language-model.js';
import {tokenizeWords} from './algorithms/tokenize.js';
import {syllablesIn} from './algorithms/syllables.js';

export const CATEGORIES = ['spelling', 'grammar', 'punctuation', 'style', 'ocr'];
export const MAX_ISSUES = 3000;
export const CHUNK_SIZE = 14000;
export const EXTRA_WORDS = ['Proofloom', 'OCR', 'ebook', 'ebooks', 'plugin', 'plugins', 'offline', 'online', 'PDF', 'DOCX', 'EPUB', 'UTF', 'Unicode', 'GitHub', 'Grammarly', 'Hunspell', 'Tesseract', 'LanguageTool', 'wordlist', 'wordlists', 'metadata', 'workflow', 'workflows', 'dataset', 'datasets', 'webpage', 'webpages', 'API', 'APIs', 'JavaScript', 'TypeScript', 'backend', 'frontend', 'WebAssembly', 'localization', 'accessibility', 'BCP', 'JSON', 'CSV', 'TSV', 'HTML', 'XML', 'AI', 'WASM', 'Kubernetes', 'tokenization'];

export function protectedRanges(text) {
  return protectedRangesInternal(text);
}
export {inProtected};

export function* chunks(text, size = CHUNK_SIZE) {
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + size, text.length);
    if (end < text.length) {
      const space = text.lastIndexOf('\n', end);
      const word = text.lastIndexOf(' ', end);
      end = (space > offset + size / 2 ? space : word > offset + size / 2 ? word : end);
      if (end > offset && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    yield {text: text.slice(offset, end), offset};
    offset = end;
  }
}

const SUGGESTION_BUDGET = 160;

export class ProofEngine {
  constructor(dictionary, corrections = {}, options = {}) {
    this.spell = dictionary ? (typeof dictionary.correct === 'function' && typeof dictionary.suggest === 'function' ? dictionary : nspell(dictionary)) : null;
    for (const word of EXTRA_WORDS) this.spell?.add(word);
    // Generative morphology (see ./morphology.js) always runs as the last
    // resort in correct(): dictionaries with rich affix tables accept their
    // inflections themselves, and the generative layer only sees the words
    // every dictionary rejected.
    this.morphology = Morphology.forLanguage('en-US');
    this.morphCache = new Map();
    this.corrections = corrections;
    this.cache = new Map();
    this.extraSpells = [];
    this.frequency = options.frequency || null;          // Map word -> rank
    this.domainWords = options.domainWords || null;      // Set of lowercase words
    this.daleChallSet = options.daleChallSet || null;
    this.spacheSet = options.spacheSet || null;
    const rawModel = options.contextModel;
    this.contextModel = rawModel instanceof ConfusionContextModel ? rawModel : rawModel ? new ConfusionContextModel(rawModel) : null;
    this.confusables = new ConfusablesEngine(CONFUSION_SETS, this.contextModel, this.frequency);
    this.dialect = new DialectEngine();
    this.dialectRules = DIALECT_GENERATED_RULES;
    this.deletionIndex = null;
    this.phoneticIndex = null;
    this.ruleStats = ruleCounts();
  }

  configure({packs = [], personal = [], language = 'en-US'} = {}) {
    this.language = language;
    this.english = language.split('-')[0] === 'en';
    this.morphology = Morphology.forLanguage(language);
    this.morphCache.clear();
    this.british = /^en-(GB|IN|AU|NZ|IE)/i.test(language);
    this.personal = new Set(personal.map(x => x.toLocaleLowerCase(language)));
    this.wordlist = new Set();
    this.extraSpells = [];
    for (const p of packs.filter(p => p.enabled && (p.language === language || p.language === language.split('-')[0]))) {
      for (const word of p.words || []) this.wordlist.add(word.toLocaleLowerCase(language));
      if (p.kind === 'hunspell') try { this.extraSpells.push(new LazyHunspell({aff: p.aff, dic: p.dic}, {locale: language})); } catch { /* surface forms remain available */ }
    }
    this.pluginRules = compilePackRules(packs, language);
    this.cache.clear();
  }

  // A word counts as known when it or any of its inflected forms resolves
  // to a dictionary, personal-list, or domain entry.
  knownRoot(stem) {
    if (this.personal?.has(stem) || this.wordlist?.has(stem) || this.domainWords?.has(stem)) return true;
    if (this.extraSpells.some(s => s.correct(stem))) return true;
    return !!(this.spell?.correct(stem));
  }

  // Generative fallback: accept an unknown word when it decomposes into a
  // known root plus a plausible inflection for the document language
  // (inflections, declensions, conjugations are not spelling errors).
  acceptsInflection(word) {
    if (!this.morphology) return false;
    const cached = this.morphCache.get(word);
    if (cached !== undefined) return cached;
    let ok = false;
    if (word.length >= 2 && word.length <= 48 && !/\p{N}/u.test(word)) {
      ok = this.morphology.lemmatize(word, stem => this.knownRoot(stem));
    }
    if (this.morphCache.size >= 4000) this.morphCache.clear();
    this.morphCache.set(word, ok);
    return ok;
  }

  correct(word) {
    const lower = word.toLocaleLowerCase(this.language);
    if (this.personal?.has(lower) || this.wordlist?.has(lower)) return true;
    if (this.domainWords?.has(lower)) return true;
    if (this.extraSpells.some(s => s.correct(word))) return true;
    // The primary dictionary always matches the document language (English
    // variants and every bundled language alike), so consult it directly.
    if (this.spell?.correct(word) || this.spell?.correct(lower)) return true;
    return this.acceptsInflection(lower);
  }

  frequencyRank(word) {
    return this.frequency?.get(word.toLowerCase()) || 0;
  }

  // Upgraded suggestion pipeline: mapping table first, then Hunspell, then
  // candidate-generation models ranked by the weighted scorer.
  suggest(word) {
    const lower = word.toLocaleLowerCase(this.language);
    if (this.cache.has(lower)) return this.cache.get(lower);
    let scored = [];
    if (this.english) {
      const mapped = this.corrections[lower];
      if (mapped?.length) {
        scored = mapped.slice(0, 5).map((s, i) => ({word: s, score: 1 - i * 0.08}));
      } else {
        const candidates = [];
        const seen = new Set([lower]);
        const isKnown = w => w !== lower && !seen.has(w) && (seen.add(w), this.correct(w));
        // Hunspell's own suggestions (morphology-aware).
        const native = this.spell?.suggest(lower) || [];
        for (const word2 of native) if (isKnown(word2.toLowerCase())) candidates.push({word: word2, distance: 1});
        // Deletion-index candidates (edit distance 1-2).
        if (this.deletionIndex) {
          for (const {word: c} of this.deletionIndex.candidates(lower, lower.length > 5 ? 2 : 1)) {
            if (isKnown(c)) candidates.push({word: c, distance: 1});
          }
        }
        if (this.phoneticIndex) {
          for (const {word: c, similarity} of this.phoneticIndex.candidates(word)) {
            if (isKnown(c)) candidates.push({word: c, distance: 2, similarity});
          }
        }
        for (const {word: c} of keyboardCandidates(word, w => this.correct(w) && !seen.has(w) && (seen.add(w), true))) candidates.push({word: c, distance: 1});
        for (const {word: c} of splitCandidates(word, w => this.correct(w))) candidates.push({word: c, distance: 1});
        for (const {word: c} of insertionCandidates(word, w => this.correct(w) && !seen.has(w) && (seen.add(w), true))) candidates.push({word: c, distance: 1});
        scored = rankSuggestions(word, candidates, {limit: 5, frequencyRank: this.frequency})
          .map(s => ({word: s.word, score: s.score}));
      }
    } else {
      // Bundled and imported Hunspell dictionaries provide morphology-aware
      // candidates. With a per-language frequency list (shipped for every
      // bundled language), they are ranked by the same weighted scorer as
      // English; otherwise their native order is kept.
      const candidates = [];
      const seen = new Set([lower]);
      const isKnown = w => {
        const key = String(w).toLowerCase();
        return key !== lower && !seen.has(key) && (seen.add(key), this.correct(key));
      };
      for (const s of this.spell?.suggest(lower) || []) if (isKnown(s)) candidates.push(String(s));
      for (const s of this.extraSpells.flatMap(sp => sp.suggest(lower))) if (isKnown(s)) candidates.push(String(s));
      scored = candidates.length > 1 && this.frequency
        ? rankSuggestions(word, candidates.map(w => ({word: w, distance: 1})), {limit: 5, frequencyRank: this.frequency})
            .map(s => ({word: s.word, score: s.score}))
        : candidates.slice(0, 5).map((w, i) => ({word: w, score: .9 - i * .06}));
    }
    // Last resort for unknown words in any language: offer the main root
    // form of a plausible inflection ("walkss" -> "walk", "Hauss" -> "haus").
    if (!scored.length && this.morphology) {
      for (const root of this.morphology.roots(lower, stem => this.knownRoot(stem))) scored.push({word: root, score: .5});
    }
    const result = [...new Map(scored.map(s => [s.word.toLowerCase(), s])).values()]
      .sort((a, b) => b.score - a.score).slice(0, 5)
      .map(s => ({word: matchCase(s.word, word), score: s.score}));
    const words = result.map(s => s.word);
    if (this.cache.size < 800) this.cache.set(lower, words);
    return words;
  }

  // Build the candidate indexes once per dictionary variant.
  buildIndexes() {
    // Non-English dictionaries already provide lazy suggestions; do not build
    // the English-only 120k-word candidate indexes for every language.
    if (!this.english || this.deletionIndex) return;
    const vocabulary = new Set();
    for (const list of Object.values(this.corrections)) for (const w of list) if (/^[a-z]+$/.test(w)) vocabulary.add(w.toLowerCase());
    if (this.frequency) for (const word of this.frequency.keys()) if (word.length >= 2 && word.length <= 18) vocabulary.add(word);
    if (this.domainWords) for (const word of this.domainWords) if (word.length >= 3 && word.length <= 16) vocabulary.add(word);
    const words = [...vocabulary].slice(0, 120000);
    this.deletionIndex = new DeletionIndex(words);
    // Phonetic models are English/Latin-centric; restrict them to ASCII so
    // Cyrillic, Greek, Arabic, and CJK vocabularies do not pollute the index.
    this.phoneticIndex = new PhoneticIndex(words.filter(w => /^[a-z][a-z'-]*$/.test(w)).slice(0, 40000));
  }

  check(text, options = {}) {
    this.buildIndexes();
    const ranges = protectedRangesInternal(text), issues = [];
    const disabled = new Set(options.disabledRules || []);
    const enabled = new Set(options.categories || CATEGORIES);
    if (!options.ocr) enabled.delete('ocr');
    const add = (start, end, original, replacements, rule) => {
      if (issues.length >= MAX_ISSUES || disabled.has(rule.id) || !enabled.has(rule.category)) return;
      if (inProtected(start, end, ranges)) return;
      if (replacements?.[0] === original) return;
      issues.push({
        id: `${rule.id}:${start}:${end}`, ruleId: rule.id, category: rule.category,
        start, end, original, replacements: replacements || [], message: rule.message,
        confidence: rule.confidence, source: rule.source || 'Proofloom',
        safe: rule.confidence >= .97 && ['spelling', 'punctuation', 'ocr'].includes(rule.category),
      });
    };

    // 1) Regex rules. English tables only apply to English documents.
    for (const r of [...(this.english ? REGEX_RULES : []), ...(this.pluginRules || [])]) {
      if (!enabled.has(r.category) || disabled.has(r.id)) continue;
      if (r.category === 'style' && options.preset === 'creative') continue;
      if (r.id === 'passive-voice' && !['academic', 'business'].includes(options.preset)) continue;
      r.pattern.lastIndex = 0;
      for (const m of text.matchAll(r.pattern)) {
        if (issues.length >= MAX_ISSUES) break;
        if (r.id === 'singular-was' && /\b(?:if|wish)\b[^.!?\n]{0,60}$/i.test(text.slice(Math.max(0, m.index - 70), m.index))) continue;
        const replacement = replacementFor(r, m);
        add(m.index, m.index + m[0].length, m[0], replacement === null ? [] : [replacement], r);
      }
    }

    // 2) Literal phrase rules through the trigger index.
    if (this.english && LITERAL_RULES.length) {
      matchLiteralRules(text, LITERAL_RULES, LITERAL_TRIGGER_INDEX, (rule, start, end, original) => {
        if (!enabled.has(rule.category) || disabled.has(rule.id)) return;
        if (rule.category === 'style' && options.preset === 'creative') return;
        const replacement = rule.replacement ? matchCase(rule.replacement, original) : '';
        if (replacement && replacement.toLowerCase() === original.toLowerCase()) return;
        add(start, end, original, replacement ? [replacement] : [], rule);
      });
    }

    // 3) Dialect consistency (spelling + vocabulary).
    if (this.english && enabled.has('spelling') && options.dialectConsistency !== false) {
      const occupied = (s, e) => issues.some(i => s < i.end && e > i.start && i.category !== 'style');
      this.dialect.check(text, this.language, {
        add: (start, end, original, replacements, rule) => {
          if (occupied(start, end)) return;
          add(start, end, original, replacements, rule);
        },
      });
    }

    // 4) Confusion-set disambiguation.
    if (this.english && (enabled.has('grammar') || enabled.has('spelling'))) {
      const occupied = (s, e) => issues.some(i => s < i.end && e > i.start && i.category !== 'style');
      this.confusables.check(text, {
        add: (start, end, original, replacements, rule) => {
          if (occupied(start, end)) return;
          add(start, end, original, replacements, rule);
        },
      });
    }

    // 5) Spelling pipeline.
    const spellEnabled = enabled.has('spelling') && !!(this.spell || this.extraSpells.length || this.wordlist?.size);
    let suggestions = 0;
    const occupied2 = (s, e) => issues.some(i => s < i.end && e > i.start && i.category !== 'style');
    if (spellEnabled || (options.ocr && this.english)) {
      const tokens = tokenizeWords(text);
      for (const t of tokens) {
        if (issues.length >= MAX_ISSUES) break;
        const word = t.word, start = t.start, end = t.end, lower = t.lower;
        if (word.length < 2 || word.length > 48 || inProtected(start, end, ranges) || occupied2(start, end)) continue;
        if (/^\p{Lu}{2,}$/u.test(word) || this.correct(word.replace(/’/g, "'"))) continue;
        const before = text.slice(Math.max(0, start - 3), start);
        if (/^\p{Lu}/u.test(word) && start > 0 && !/[.!?]\s*$/.test(before) && !options.checkNames) continue;
        const mapped = this.english ? this.corrections[lower] : null;
        if (mapped?.length) {
          add(start, end, word, mapped.map(x => matchCase(x, word)), {
            id: 'dictionary-typo', category: 'spelling',
            message: 'Commonly misspelled word. Choose the intended spelling.',
            confidence: mapped.length === 1 ? .98 : .9, source: 'CSpell / Wikipedia correction data',
          });
          continue;
        }
        if (options.ocr && this.english) {
          const candidates = [...new Set(ocrCandidates(word, w => this.correct(w)).map(c => c.word))];
          if (candidates.length) {
            add(start, end, word, candidates.map(x => matchCase(x, word)), {
              id: 'ocr-confusion', category: 'ocr',
              message: 'Possible merged or split letter recognition. Compare with the scan.', confidence: .82,
            });
            continue;
          }
        }
        if (spellEnabled) {
          const replacements = suggestions < SUGGESTION_BUDGET ? this.suggest(word) : [];
          suggestions++;
          add(start, end, word, replacements, {
            id: 'hunspell', category: 'spelling',
            message: replacements.length ? 'This spelling is not in the active dictionaries.' : 'Unknown word. Add a name or specialist term to your dictionary.',
            confidence: .88, source: this.english ? 'SCOWL / Hunspell + candidate models' : 'Hunspell dictionary',
          });
        }
      }
    }

    // 6) OCR document-level heuristics.
    if (options.ocr && this.english) {
      for (const m of text.matchAll(/([\p{L}]{2,})-[ \t]*\r?\n[ \t]*([\p{L}]{2,})/gu)) {
        const joined = m[1] + m[2];
        if (this.correct(joined)) add(m.index, m.index + m[0].length, m[0], [joined], {
          id: 'ocr-dehyphenate', category: 'ocr', message: 'Join a word split across a printed line ending. Review intentional hyphens.', confidence: .94,
        });
      }
      for (const m of text.matchAll(/[\p{L}]+[01][\p{L}01]*|[01][\p{L}]{2,}/gu)) {
        const candidate = m[0].replace(/0/g, 'o').replace(/1/g, 'l');
        if (this.correct(candidate) && candidate !== m[0]) add(m.index, m.index + m[0].length, m[0], [matchCase(candidate, m[0])], {
          id: 'ocr-digit-letter', category: 'ocr', message: 'Possible confusion between a digit and a letter. Check the original.', confidence: .87,
        });
      }
    }

    // 7) Sentence-level style analysis.
    if (enabled.has('style') && options.preset !== 'creative' && text.length > 40) {
      const occupied3 = (s, e) => issues.some(i => s < i.end && e > i.start && i.category !== 'style');
      analyzeSentences(text, {
        preset: options.preset,
        add: (start, end, original, replacements, rule) => {
          if (occupied3(start, end) || disabled.has(rule.id)) return;
          add(start, end, original, replacements, rule);
        },
      });
    }

    return issues.sort((a, b) => a.start - b.start || b.confidence - a.confidence)
      .filter((v, i, all) => !all.slice(0, i).some(x => x.start === v.start && x.end === v.end && x.replacements[0] === v.replacements[0]));
  }
}

export function applyEdits(text, issues, {safeOnly = false} = {}) {
  const selected = [];
  for (const i of [...issues].sort((a, b) => b.confidence - a.confidence || a.start - b.start)) {
    if (!i.replacements?.length || (safeOnly && !i.safe) || text.slice(i.start, i.end) !== i.original || selected.some(x => i.start < x.end && i.end > x.start)) continue;
    selected.push(i);
  }
  for (const i of selected.sort((a, b) => b.start - a.start)) text = text.slice(0, i.start) + i.replacements[0] + text.slice(i.end);
  return {text, count: selected.length};
}

export function metrics(text, language = 'en') {
  const tokens = [...text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}]+)*/gu)].map(m => m[0]);
  const sentenceSegments = typeof Intl !== 'undefined' && Intl.Segmenter
    ? [...new Intl.Segmenter(language, {granularity: 'sentence'}).segment(text)]
    : text.split(/[.!?]+/);
  const sentences = sentenceSegments.filter(s => /[\p{L}]/u.test(s.segment ?? s)).length;
  const syllables = tokens.reduce((n, w) => n + syllablesIn(w), 0);
  const words = tokens.length;
  const flesch = words && sentences ? Math.max(0, Math.min(100, 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words))) : 0;
  return {
    words, characters: text.length, sentences,
    paragraphs: text.split(/\n\s*\n/).filter(s => s.trim()).length,
    readingMinutes: Math.max(1, Math.ceil(words / 220)),
    readability: Math.round(flesch),
    averageSentence: sentences ? Math.round(words / sentences) : 0,
    uniqueWords: new Set(tokens.map(s => s.toLocaleLowerCase(language))).size,
  };
}

export {ruleCounts, frequencyPrior};

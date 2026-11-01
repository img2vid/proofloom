// Generative morphology engine. Recognizes inflected, declined, and
// conjugated forms of dictionary words that the bundled Hunspell affix data
// does not cover (wordlist-only dictionaries, sparse affix files, personal
// lists, imported packs). When a word the dictionaries reject decomposes
// into a known root plus a plausible ending for its language, it is accepted
// as a real form instead of being reported as a spelling error; the root
// itself is also offered among the suggestions ("suggesting the main root
// form").
//
// Analysis is bounded: per language at most maxDepth strip/swap steps, a
// frontier of 24 unverified stems, and a cache of results in the engine, so
// the worst case stays a few dozen string operations per unknown word.
import {INFLECTION_SPECS, INFLECTION_ALIASES, SCRIPT_SPECS, scriptOf} from './data/inflections.js';

const MAX_FRONTIER = 24;
const MAX_ROOTS = 4;
const MAX_WORD = 48;

// Reject strips where the word ends in a doubled letter and both the suffix
// and the remaining stem end in that same letter ("walkss" -> "walks" must
// stay a misspelling, while "boxes" -> "box" and "glasses" -> "glass" pass).
function doubledBoundary(word, suffix, stem) {
  const n = word.length;
  if (n < 2 || word[n - 1] !== word[n - 2]) return false;
  const letter = word[n - 1];
  return suffix.endsWith(letter) && stem.endsWith(letter);
}

// English-style past/gerund gate: a stem that ends vowel+consonant after
// stripping -ed/-ing only verifies through its silent-e form, so "loved"
// resolves via "love" while "runing" (rune?) stays flagged.
const ENDS_VOWEL_CONSONANT = /[aeiouy][bcdfghjklmnpqrstvwxz]$/;

// -es attaches to sibilant stems and thematic -o ("boxes", "houses",
// "tomatoes"); "walkes", "makees", "knifes" stay misspellings. Only specs
// that set strictEs (English-style -s plurals) apply this restriction.
const ES_STEM = /(?:[sxzh]|o)$/;

// Consonant+y stems take -ies/-ied, never -ys/-yed ("studys", "studyed"),
// while vowel+y stems are regular ("boys", "enjoyed").
const CONSONANT_Y = /[bcdfghjklmnpqrstvwxz]y$/;

// Consonant+e stems drop the e before -ed/-ing (make -> making, agree ->
// agreed), so an extra e marks a misspelling ("makeing", "makeed"); vowel+e
// stems keep it ("seeing", "fleeing").
const EXTRA_E = /[bcdfghjklmnpqrstvwxz]e$/;

function implausible(word, suffix, stem, spec) {
  if (doubledBoundary(word, suffix, stem)) return true;
  if ((suffix === 's' || suffix === 'es' || suffix === 'ed') && CONSONANT_Y.test(stem)) return true;
  if (suffix === 'es' && spec.strictEs && !ES_STEM.test(stem)) return true;
  if ((suffix === 'ed' || suffix === 'ing') && word.endsWith('e' + suffix) && EXTRA_E.test(stem)) return true;
  return false;
}

function normalize(spec) {
  if (spec.__normalized) return spec;
  spec.suffixes = [...new Set(spec.suffixes || [])].sort((a, b) => b.length - a.length);
  spec.verbs = [...new Set(spec.verbs || [])].sort((a, b) => b.length - a.length);
  spec.swaps = [...new Set((spec.swaps || []).map(pair => pair.join('\u0000')))]
    .map(pair => pair.split('\u0000'))
    .sort((a, b) => b[0].length - a[0].length);
  spec.prefixes = [...new Set(spec.prefixes || [])].sort((a, b) => b.length - a.length);
  spec.guards = new Set(spec.guards || []);
  spec.minStem = spec.minStem ?? 3;
  spec.maxDepth = spec.maxDepth ?? 2;
  spec.__normalized = true;
  return spec;
}

function* variants(spec, stem) {
  if (stem.length < spec.minStem) return;
  yield stem;
  if (spec.unUmlaut && /[äöü]/.test(stem)) {
    yield stem.replace(/[äöü]/g, ch => ({'ä': 'a', 'ö': 'o', 'ü': 'u'}[ch]));
  }
  if (spec.finalDevoice) {
    const last = stem.at(-1);
    if ('zvd'.includes(last)) yield stem.slice(0, -1) + ({z: 's', v: 'f', d: 't'}[last]);
  }
}

function* candidates(word, specs, verify) {
  for (const spec of specs) {
    const limit = word.length - spec.minStem;
    for (const suffix of spec.suffixes) {
      if (suffix.length > limit) continue;
      if (!word.endsWith(suffix)) continue;
      const stem = word.slice(0, word.length - suffix.length);
      if (implausible(word, suffix, stem, spec)) continue;
      yield* variants(spec, stem);
    }
    for (const [from, to] of spec.swaps) {
      if (from.length > limit) continue;
      if (!word.endsWith(from)) continue;
      yield* variants(spec, word.slice(0, word.length - from.length) + to);
    }
    for (const prefix of spec.prefixes) {
      if (prefix.length >= word.length) continue;
      if (!word.startsWith(prefix)) continue;
      const stem = word.slice(prefix.length);
      if (stem.length >= spec.minStem) yield stem;
    }
    for (const suffix of spec.verbs) {
      if (suffix.length > limit) continue;
      if (!word.endsWith(suffix)) continue;
      const stem = word.slice(0, word.length - suffix.length);
      if (implausible(word, suffix, stem, spec)) continue;
      if (spec.cvcGate && ENDS_VOWEL_CONSONANT.test(stem)) {
        // Requires the silent-e form; "runing" -> "rune" fails, "making" ->
        // "make" passes. When the bare stem is itself a word ("run"), the
        // e-form is a different word, not a missing affix: run -> running,
        // so the un-doubled spelling stays flagged.
        if (typeof verify === 'function' && verify(stem)) continue;
        yield* variants(spec, stem + 'e');
      } else {
        yield* variants(spec, stem);
        if (!stem.endsWith('e')) yield* variants(spec, stem + 'e');
      }
    }
  }
}

function baseOf(code) {
  const tag = String(code || '').trim() || 'en';
  try { return new Intl.Locale(tag).language.toLowerCase(); } catch { return tag.split('-')[0].toLowerCase(); }
}

export class Morphology {
  constructor(code) {
    const base = baseOf(code);
    const key = INFLECTION_ALIASES[base] || base;
    this.primary = INFLECTION_SPECS[key] ? normalize(INFLECTION_SPECS[key]) : null;
    this.maxDepth = this.primary ? this.primary.maxDepth : 2;
    for (const spec of Object.values(SCRIPT_SPECS)) normalize(spec);
  }

  static forLanguage(code) {
    Morphology.cache ||= new Map();
    const base = baseOf(code);
    let morph = Morphology.cache.get(base);
    if (!morph) {
      morph = new Morphology(base);
      Morphology.cache.set(base, morph);
    }
    return morph;
  }

  // Active specs for a word: the language's curated table, or, when the
  // language has none, the fallback table for the word's script (so any
  // language, bundled or imported, gets its script's core inflections).
  specsFor(word) {
    if (this.primary) return [this.primary];
    const script = scriptOf(word);
    const spec = script ? SCRIPT_SPECS[script] : null;
    return spec ? [spec] : [];
  }

  // Verified root forms of an inflected word, best first. `verify` decides
  // whether a candidate stem is a known word (dictionary / personal list).
  roots(word, verify, {first = false} = {}) {
    const w = String(word || '');
    if (w.length < 2 || w.length > MAX_WORD) return [];
    const specs = this.specsFor(w);
    if (!specs.length) return [];
    const guards = specs.reduce((all, spec) => (spec.guards.size ? all.concat([...spec.guards]) : all), []);
    const guardSet = new Set(guards);
    const seen = new Set([w]);
    const found = [];
    let frontier = [w];
    for (let depth = 0; depth < this.maxDepth && frontier.length; depth++) {
      // Verb endings (past/gerund) attach directly to a stem: chaining them
      // would only legitimize stacked typos like "walkeded".
      const active = depth === 0 ? specs : specs.map(spec => (spec.verbs.length ? {...spec, verbs: []} : spec));
      const next = [];
      for (const current of frontier) {
        for (const stem of candidates(current, active, verify)) {
          if (seen.has(stem)) continue;
          seen.add(stem);
          if (guardSet.has(stem)) continue;
          if (verify(stem)) {
            found.push(stem);
            // Keep walking through verified stems too: an inflected
            // intermediate ("মানুষে") must not hide the main root
            // ("মানুষ") from the suggestion list.
            if (depth + 1 < this.maxDepth) next.push(stem);
            if (first) return found;
            if (found.length >= MAX_ROOTS) return found.sort((a, b) => a.length - b.length);
          } else {
            next.push(stem);
          }
        }
      }
      if (next.length > MAX_FRONTIER) next.length = MAX_FRONTIER;
      frontier = next;
    }
    // Most-stripped root first: the main root form is the shortest stem
    // that verified, so it leads the suggestion list.
    return found.sort((a, b) => a.length - b.length);
  }

  lemmatize(word, verify) {
    return this.roots(word, verify, {first: true}).length > 0;
  }
}

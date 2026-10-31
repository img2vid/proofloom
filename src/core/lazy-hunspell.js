// Memory-bounded Hunspell reader. Unlike nspell, this stores lemmas and
// affix transformations rather than eagerly materializing every derived form.
// Necessary for Italian and other highly inflected dictionaries.
import {DeletionIndex} from './algorithms/candidates.js';
import {damerauLevenshtein} from './algorithms/edit-distance.js';

const MAX_PATHS = 12000;
const MAX_DEPTH = 3;
const CACHE_LIMIT = 6000;

export class LazyHunspell {
  constructor({aff = '', dic = ''} = {}, {frequency = null, locale = 'en'} = {}) {
    this.locale = locale;
    this.frequency = frequency;
    this.words = new Map();
    this.added = new Set();
    this.cache = new Map();
    this.prefix = new Map();
    this.suffix = new Map();
    this.aliases = [];
    this.flagMode = 'short';
    this.needAffix = null;
    this.forbidden = null;
    this.onlyCompound = null;
    this.suggestIndex = null;
    this.parseAff(String(aff));
    this.parseDic(String(dic));
  }

  lower(word) {
    try { return String(word).normalize('NFC').toLocaleLowerCase(this.locale); }
    catch { return String(word).normalize('NFC').toLowerCase(); }
  }

  flags(raw) {
    if (!raw) return [];
    if (this.flagMode === 'num') return raw.split(',').filter(Boolean);
    if (this.flagMode === 'long') return raw.match(/.{1,2}/gu) || [];
    return Array.from(raw);
  }

  parseAff(aff) {
    const lines = aff.replace(/\r/g, '').replace(/^\uFEFF/, '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i].trim().split(/\s+/);
      if (!p[0] || p[0].startsWith('#')) continue;
      if (p[0] === 'FLAG') { this.flagMode = p[1] || 'short'; continue; }
      if (p[0] === 'NEEDAFFIX') { this.needAffix = p[1]; continue; }
      if (p[0] === 'FORBIDDENWORD') { this.forbidden = p[1]; continue; }
      if (p[0] === 'ONLYINCOMPOUND') { this.onlyCompound = p[1]; continue; }
      if (p[0] === 'AF' && /^\d+$/.test(p[1])) {
        const count = Math.min(Number(p[1]), lines.length - i - 1);
        for (let j = 0; j < count; j++) this.aliases.push((lines[++i].trim().split(/\s+/)[1]) || '');
        continue;
      }
      if (!['PFX', 'SFX'].includes(p[0]) || p.length < 4 || !/^\d+$/.test(p[3])) continue;
      const type = p[0], flag = p[1], cross = p[2] === 'Y';
      const count = Math.min(Number(p[3]), lines.length - i - 1);
      const table = type === 'PFX' ? this.prefix : this.suffix;
      for (let j = 0; j < count; j++) {
        const r = lines[++i].trim().split(/\s+/);
        if (r[0] !== type || r[1] !== flag || r.length < 5) continue;
        const strip = r[2] === '0' ? '' : r[2];
        const [rawAdd, continuation = ''] = r[3].split('/');
        const add = rawAdd === '0' ? '' : rawAdd;
        let condition;
        try { condition = new RegExp((type === 'PFX' ? '^' : '') + r[4] + (type === 'SFX' ? '$' : ''), 'u'); }
        catch { continue; }
        const rule = {type, flag, cross, strip, add, condition, continuation: new Set(this.flags(continuation))};
        const key = add ? (type === 'PFX' ? Array.from(add)[0] : Array.from(add).at(-1)) : '';
        if (!table.has(key)) table.set(key, []);
        table.get(key).push(rule);
      }
    }
  }

  parseDic(dic) {
    const lines = dic.replace(/\r/g, '').replace(/^\uFEFF/, '').split('\n');
    for (let i = /^\d+\s*$/.test(lines[0] || '') ? 1 : 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      const entry = line.split(/\s+/)[0];
      const slash = entry.search(/(?<!\\)\//u);
      const stem = (slash < 0 ? entry : entry.slice(0, slash)).replace(/\\\//g, '/');
      if (!stem) continue;
      const raw = slash < 0 ? '' : entry.slice(slash + 1);
      let decoded = this.flags(raw);
      if (this.aliases.length && /^\d+(?:,\d+)*$/.test(raw)) {
        decoded = raw.split(',').flatMap(n => this.flags(this.aliases[Number(n) - 1] || ''));
      }
      const key = this.lower(stem);
      const flags = this.words.get(key) || new Set();
      for (const flag of decoded) flags.add(flag);
      this.words.set(key, flags);
    }
  }

  add(word) {
    this.added.add(this.lower(word));
    this.cache.clear();
    this.suggestIndex = null;
  }

  *reverse(word) {
    for (const [type, table] of [['SFX', this.suffix], ['PFX', this.prefix]]) {
      const letters = Array.from(word);
      const key = type === 'PFX' ? letters[0] : letters.at(-1);
      for (const rule of [...(table.get(key) || []), ...(table.get('') || [])]) {
        if (rule.add && !(type === 'PFX' ? word.startsWith(rule.add) : word.endsWith(rule.add))) continue;
        const remainder = type === 'PFX' ? word.slice(rule.add.length) : word.slice(0, word.length - rule.add.length);
        const stem = type === 'PFX' ? rule.strip + remainder : remainder + rule.strip;
        if (stem === word || !stem || !rule.condition.test(stem)) continue;
        yield {stem, rule};
      }
    }
  }

  // Rules in path are ordered outermost -> innermost, as encountered while
  // stripping affixes. A continuing affix can be licensed by the inner one;
  // otherwise the lemma must carry its flag. Prefix/suffix crosses require Y.
  validPath(flags, path) {
    if (!path.length) return !flags.has(this.needAffix);
    for (let i = path.length - 1; i >= 0; i--) {
      const rule = path[i];
      const inner = path[i + 1];
      const continuing = inner?.continuation.has(rule.flag) || false;
      if (!continuing && !flags.has(rule.flag)) return false;
      if (inner && !continuing) {
        if (inner.type === rule.type || !inner.cross || !rule.cross) return false;
      }
    }
    return true;
  }

  correct(word) {
    const key = this.lower(word);
    if (this.added.has(key)) return true;
    if (this.cache.has(key)) return this.cache.get(key);
    const direct = this.words.get(key);
    let found = !!(direct && !direct.has(this.forbidden) && this.validPath(direct, []));
    if (!found && key.length >= 2 && key.length <= 80) {
      const stack = [{word: key, path: []}];
      const seen = new Set();
      let paths = 0;
      while (stack.length && paths++ < MAX_PATHS) {
        const {word: candidate, path} = stack.pop();
        if (path.length >= MAX_DEPTH) continue;
        for (const {stem, rule} of this.reverse(candidate)) {
          const next = [...path, rule];
          const flags = this.words.get(stem);
          if (flags && !flags.has(this.forbidden) && this.validPath(flags, next)) {
            found = true;
            break;
          }
          if (next.length >= MAX_DEPTH) continue;
          const signature = stem + '\0' + next.map(r => r.flag + ':' + r.type).join(',');
          if (!seen.has(signature)) {
            seen.add(signature);
            stack.push({word: stem, path: next});
          }
        }
        if (found) break;
      }
    }
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    this.cache.set(key, found);
    return found;
  }

  suggest(word) {
    const key = this.lower(word);
    if (this.correct(key)) return [];
    if (!this.suggestIndex) {
      // Common inflected forms from the language's frequency list are included
      // along with a bounded sample of dictionary lemmas.
      const vocabulary = new Set(this.frequency ? this.frequency.keys() : []);
      const step = Math.max(1, Math.ceil(this.words.size / 80000));
      let n = 0;
      for (const stem of this.words.keys()) {
        if (n++ % step === 0 && stem.length >= 2 && stem.length <= 24) vocabulary.add(stem);
      }
      for (const stem of this.added) vocabulary.add(stem);
      this.suggestIndex = new DeletionIndex(vocabulary);
    }
    const found = [];
    for (const candidate of this.suggestIndex.candidates(key, key.length > 4 ? 2 : 1)) {
      if (this.correct(candidate.word)) found.push(candidate.word);
      if (found.length >= 150) break;
    }
    return [...new Set(found)].sort((a, b) => {
      const da = damerauLevenshtein(key, a), db = damerauLevenshtein(key, b);
      return da - db || (this.frequency?.get(a) || Infinity) - (this.frequency?.get(b) || Infinity) || a.localeCompare(b);
    }).slice(0, 5);
  }
}

// 45. Suffix-based part-of-speech guesser. A classic lightweight English
// tagger: word endings predict likely grammatical roles. The grammar engines
// use it to avoid false positives (e.g. not treating a gerund after "was" as
// an agreement error).

const NOUN_SUFFIXES = ['tion', 'sion', 'ment', 'ness', 'ance', 'ence', 'ity', 'ism', 'ist', 'ship', 'hood', 'ery', 'ary', 'ory', 'age', 'ure', 'dom', 'ency', 'acy', 'logy', 'graphy'];
const VERB_SUFFIXES = ['ize', 'ise', 'ate', 'ify', 'fy', 'es', 'ed', 'ing', 's'];
const ADJ_SUFFIXES = ['ous', 'ful', 'less', 'able', 'ible', 'ive', 'ic', 'al', 'ish', 'ive', 'ary', 'esque', 'like', 'y'];
const ADV_SUFFIXES = ['ly'];

const PREDETERMINERS = new Set(['all', 'both', 'half', 'many', 'much', 'few', 'several', 'various', 'numerous', 'some', 'any', 'no', 'each', 'every', 'either', 'neither']);
const DETERMINERS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'one', 'two', 'three']);
const AUXILIARIES = new Set(['is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must']);
const PREPOSITIONS = new Set(['of', 'in', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'about', 'into', 'over', 'after', 'between', 'through', 'under', 'around', 'against', 'without', 'within', 'along', 'across', 'behind', 'beyond', 'during', 'before', 'upon', 'toward', 'towards', 'among', 'amid', 'despite', 'except', 'inside', 'outside', 'near', 'off', 'past', 'per', 'since', 'until', 'up', 'down']);

export function guessPos(word) {
  const w = String(word).toLowerCase();
  const tags = new Set();
  if (PREDETERMINERS.has(w) || DETERMINERS.has(w)) tags.add('determiner');
  if (AUXILIARIES.has(w)) tags.add('auxiliary');
  if (PREPOSITIONS.has(w)) tags.add('preposition');
  if (w.endsWith('ly') && w.length > 4) tags.add('adverb');
  if (NOUN_SUFFIXES.some(s => w.endsWith(s)) && w.length > 5) tags.add('noun');
  if (ADJ_SUFFIXES.some(s => w.endsWith(s)) && w.length > 4) tags.add('adjective');
  if (VERB_SUFFIXES.some(s => w.endsWith(s)) && w.length > 3) tags.add('verb');
  if (w.endsWith('ing')) { tags.add('gerund'); tags.add('noun'); }
  if (!tags.size) { tags.add('noun'); tags.add('verb'); }
  return tags;
}

export function isAuxiliary(word) { return AUXILIARIES.has(String(word).toLowerCase()); }
export function isDeterminer(word) { return DETERMINERS.has(String(word).toLowerCase()); }
export function isPreposition(word) { return PREPOSITIONS.has(String(word).toLowerCase()); }
export function isPredeterminer(word) { return PREDETERMINERS.has(String(word).toLowerCase()); }

// Plausibility helper: is "(aux) (word) (by ...)" passive-shaped?
export function looksPassive(words, index) {
  const w = words[index]?.toLowerCase() || '';
  if (!AUXILIARIES.has(w) && w !== 'been' && w !== 'being') return false;
  for (let k = index + 1; k < Math.min(index + 4, words.length); k++) {
    const candidate = words[k];
    if (['been', 'being', 'be', 'is', 'was', 'were', 'are', 'am'].includes(candidate.toLowerCase())) continue;
    if (candidate.toLowerCase().endsWith('ed')) return true;
    return false;
  }
  return false;
}

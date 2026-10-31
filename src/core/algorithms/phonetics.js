// Phonetic algorithms. Eight independent encoding families reduce words to
// pronunciation keys so the engine can propose corrections that *sound* like
// the typed word ("precius" -> "precious").

// 20. American Soundex.
export function soundex(word) {
  const s = String(word).toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const codes = { B: '1', F: '1', P: '1', V: '1', C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2', D: '3', T: '3', L: '4', M: '5', N: '5', R: '6' };
  let out = s[0], previous = codes[s[0]] || '';
  for (const ch of s.slice(1)) {
    const code = codes[ch] || '';
    if (code && code !== previous) out += code;
    if (ch !== 'H' && ch !== 'W') previous = code;
    if (out.length === 4) break;
  }
  return (out + '000').slice(0, 4);
}

// 21. Refined Soundex (NARA).
const REFINED = { B: '1', F: '1', P: '1', V: '1', C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2', D: '3', T: '3', L: '4', M: '5', N: '5', R: '6' };
export function refinedSoundex(word) {
  const s = String(word).toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  let out = s[0], previous = REFINED[s[0]] || '';
  for (const ch of s.slice(1)) {
    const code = REFINED[ch] || '';
    if (code && code !== previous) out += code;
    previous = code;
  }
  return out;
}

// 22. Metaphone (Lawrence Philips, 1990).
export function metaphone(word) {
  const w = String(word).toUpperCase().replace(/[^A-Z]/g, '');
  if (!w) return '';
  const isVowel = c => 'AEIOU'.includes(c);
  let out = '';
  const at = i => w[i] || '';
  const n = w.length;
  if (n >= 2 && ((w[0] === 'A' && w[1] === 'E') || (w[0] === 'G' && w[1] === 'N') || (w[0] === 'K' && w[1] === 'N') || (w[0] === 'P' && w[1] === 'N') || (w[0] === 'W' && w[1] === 'R'))) return metaphone(w.slice(1));
  if (w[0] === 'X') return 'S' + metaphone(w.slice(1));
  if (w[0] === 'W' && isVowel(w[1])) return 'W' + metaphone(w.slice(1));
  for (let i = 0; i < n; i++) {
    const c = w[i], next = at(i + 1), next2 = at(i + 2), previous = i > 0 ? w[i - 1] : '';
    if (c === previous && !(c === 'C')) continue;
    switch (c) {
      case 'B': if (!(i === n - 1 && previous === 'M')) out += 'B'; break;
      case 'C':
        if (next === 'I' && next2 === 'A') out += 'X';
        else if (next === 'I' || next === 'E' || next === 'Y') out += 'S';
        else if (next === 'H') { out += 'SH'; i++; }
        else out += 'K';
        break;
      case 'D':
        if (next === 'G' && 'IEY'.includes(next2)) { out += 'J'; i++; }
        else out += 'T';
        break;
      case 'F': out += 'F'; break;
      case 'G':
        if (next === 'H') { if ('BDH'.includes(next2) || i + 3 === n) { out += 'K'; i++; } else if (i + 3 < n) { i++; } }
        else if (next === 'N') { if (!(i + 2 === n && (next2 === 'E' || next2 === 'D')) && !(at(i + 3) === 'S')) out += 'K'; }
        else if (next === 'I' || next === 'E' || next === 'Y') out += 'J';
        else out += 'K';
        break;
      case 'H':
        if (!'AEIOUCGPT'.includes(previous) && !(i + 1 === n && previous === 'V')) out += 'H';
        break;
      case 'K': if (previous !== 'C') out += 'K'; break;
      case 'P': if (next === 'H') { out += 'F'; i++; } else out += 'P'; break;
      case 'Q': out += 'K'; break;
      case 'S': if (next === 'H') { out += 'X'; i++; } else out += 'S'; break;
      case 'T':
        if (next === 'I' && (next2 === 'O' || next2 === 'A')) out += 'X';
        else if (next === 'H') { out += '0'; i++; }
        else if (!(next === 'C' && next2 === 'H')) out += 'T';
        break;
      case 'V': out += 'F'; break;
      case 'W': if (!(next === 'R' || next === 'H')) out += 'W'; break;
      case 'X': out += 'KS'; break;
      case 'Z': out += 'S'; break;
      case 'A': case 'E': case 'I': case 'O': case 'U': if (i === 0) out += 'A'; break;
      case 'J': out += 'J'; break;
      case 'L': case 'M': case 'N': case 'R': out += c; break;
      case 'Y': if (i + 1 === n) out += 'Y'; break;
    }
    if (out.length >= 6) break;
  }
  return out;
}

// 23. Double Metaphone (Lawrence Philips, 2000). Produces primary and
// secondary keys; the secondary key handles alternate pronunciations
// (Germanic, French, Spanish-influenced spellings).
function doubleMetaphoneOne(word, primary) {
  const w = String(word).toUpperCase().replace(/[^A-Z']/g, '');
  const n = w.length;
  if (!n) return '';
  const isVowel = c => 'AEIOUY'.includes(c);
  const slavoGermanic = /W|K|CZ|WITZ/.test(w);
  let pos = 0, last = n - 1;
  const matchAt = (start, ...options) => options.some(o => w.startsWith(o, start));
  let result = '';
  const add = s => { result += s; };
  if (matchAt(0, 'CAESAR') || matchAt(0, 'CHIRURG') || matchAt(0, 'SCH')) { add(primary ? 'S' : 'S'); pos += 2; }
  else if (matchAt(0, 'KN', 'GN', 'PN', 'WR', 'PS')) { pos++; }
  else if (w[0] === 'X') { add('S'); pos++; }
  while (pos < n && result.length < 6) {
    const c = w[pos];
    switch (c) {
      case 'A': case 'E': case 'I': case 'O': case 'U': case 'Y':
        if (pos === 0) add('A');
        pos++; break;
      case 'B':
        add('B');
        if (matchAt(pos + 1, 'B')) pos += 2; else pos++;
        break;
      case 'Ç': add('S'); pos++; break;
      case 'C':
        if (matchAt(pos + 1, 'H')) {
          if (pos > 0 && pos + 3 === n && !isVowel(w[pos - 1]) && matchAt(pos - 1, 'MC')) add('K');
          else if (primary && matchAt(pos + 2, 'AE', 'EM', 'ER', 'YM')) { add('X'); pos += 3; break; }
          else if (matchAt(pos + 2, 'A', 'O', 'U', 'E', 'Y') || matchAt(pos + 2, 'T')) add('X');
          else if (!primary && matchAt(pos + 2, 'A', 'O', 'U', 'E', 'Y')) add('K');
          else add('K');
          pos += 2;
        } else if (matchAt(pos + 1, 'I', 'E', 'Y') && !matchAt(pos + 2, 'IA')) { add('S'); pos++; }
        else if (matchAt(pos + 1, 'IA')) { add('X'); pos += 2; }
        else if (matchAt(pos + 1, 'K', 'Q', 'C')) { pos += 2; }
        else { add('K'); pos++; }
        break;
      case 'D':
        if (matchAt(pos + 1, 'G') && matchAt(pos + 2, 'I', 'E', 'Y')) { add('J'); pos += 2; }
        else if (matchAt(pos + 1, 'D')) { add('T'); pos += 2; }
        else { add('T'); pos++; }
        break;
      case 'F':
        if (matchAt(pos + 1, 'F')) pos += 2; else pos++;
        add('F'); break;
      case 'G':
        if (matchAt(pos + 1, 'H')) {
          if (pos + 3 < n && !isVowel(w[pos + 3]) && !matchAt(pos + 1, 'GI', 'GE', 'GY')) { pos += 2; }
          else if (pos > 0 && !isVowel(w[pos - 1]) && pos + 3 === n) { pos += 2; }
          else { add('K'); pos += 2; }
        } else if (matchAt(pos + 1, 'N')) {
          if (pos + 2 === n && (matchAt(pos + 2, 'E', 'Y')) || matchAt(pos + 2, 'Y')) { }
          else add('K');
          pos += 2;
        } else if (matchAt(pos + 1, 'I', 'E', 'Y')) { add(primary ? 'J' : (slavoGermanic ? 'K' : 'J')); pos++; }
        else if (matchAt(pos + 1, 'G')) { add('K'); pos += 2; }
        else { add('K'); pos++; }
        break;
      case 'H':
        if (pos === 0 || isVowel(w[pos - 1])) {
          if (isVowel(w[pos + 1])) add('H');
          pos++;
        } else pos++;
        break;
      case 'J':
        if (matchAt(pos + 1, 'J')) pos += 2; else pos++;
        if (matchAt(0, 'SAN ', 'JOSE')) { add(primary ? (isVowel(w[pos + 1]) ? 'H' : 'J') : (isVowel(w[pos + 1]) ? 'H' : 'J')); }
        else add(primary ? (slavoGermanic ? 'J' : 'J') : (slavoGermanic ? 'K' : 'J'));
        break;
      case 'K':
        if (matchAt(pos + 1, 'K')) pos += 2; else pos++;
        add('K'); break;
      case 'L':
        if (matchAt(pos + 1, 'L')) {
          if (pos + 3 === n && matchAt(pos - 1, 'ILLO', 'ILLA', 'ALLE')) { add(primary ? 'L' : ''); pos += 2; break; }
          pos += 2;
        } else pos++;
        add('L'); break;
      case 'M':
        if ((matchAt(pos + 1, 'M')) || (pos + 1 === last && matchAt(pos + 1, 'MB'))) pos += 2; else pos++;
        add('M'); break;
      case 'N':
        if (matchAt(pos + 1, 'N')) pos += 2; else pos++;
        add('N'); break;
      case 'Ñ': add('N'); pos++; break;
      case 'P':
        if (matchAt(pos + 1, 'H')) { add('F'); pos += 2; break; }
        if (matchAt(pos + 1, 'P')) pos += 2; else pos++;
        add('P'); break;
      case 'Q':
        if (matchAt(pos + 1, 'Q')) pos += 2; else pos++;
        add('K'); break;
      case 'R':
        if (pos === last && !slavoGermanic && matchAt(pos - 2, 'IE') && !matchAt(pos - 4, 'ME', 'MA')) { add(primary ? '' : 'R'); pos++; }
        else { add('R'); if (matchAt(pos + 1, 'R')) pos += 2; else pos++; }
        break;
      case 'S':
        if (matchAt(pos + 1, 'L') && (matchAt(pos - 1, 'I', 'Y') || matchAt(0, 'SL'))) { pos++; break; }
        if (w[pos + 1] === 'H') {
          if (primary && matchAt(pos + 2, 'IE', 'ED', 'ER', 'ES', 'EW', 'OW')) { add('X'); pos += 2; break; }
          if (matchAt(pos + 2, 'HEIM', 'HOEK', 'HOLM', 'HOLZ')) { add('S'); pos += 2; break; }
          add('X'); pos += 2; break;
        }
        if (primary && matchAt(pos + 1, 'IO', 'IA')) { add('X'); pos++; break; }
        if (matchAt(pos + 1, 'S')) pos += 2; else pos++;
        add('S'); break;
      case 'T':
        if (matchAt(pos + 1, 'ION')) { add('X'); pos += 3; break; }
        if (matchAt(pos + 1, 'IA', 'IO')) { add('X'); pos++; break; }
        if (matchAt(pos + 1, 'H')) { add('0'); pos += 2; break; }
        if (matchAt(pos + 1, 'T')) pos += 2; else pos++;
        add('T'); break;
      case 'V':
        if (matchAt(pos + 1, 'V')) pos += 2; else pos++;
        add('F'); break;
      case 'W':
        if (matchAt(pos, 'WR')) { add('R'); pos += 2; break; }
        if (pos === 0) { add('A'); pos++; break; }
        if (pos === last && isVowel(w[pos - 1])) { add('F'); pos++; break; }
        if (matchAt(pos + 1, 'SKI', 'SKY', 'SCH')) { add(''); pos++; break; }
        if (matchAt(pos + 1, 'ICZ', 'ITZ')) { add(primary ? 'TS' : 'FX'); pos += 3; break; }
        pos++; break;
      case 'X':
        if (!(pos === last && (matchAt(pos - 3, 'IAU', 'EAU') || matchAt(pos - 2, 'AU', 'OU')))) { add('KS'); }
        if (matchAt(pos + 1, 'C', 'X')) pos += 2; else pos++;
        break;
      case 'Z':
        if (matchAt(pos + 1, 'H')) { add('J'); pos += 2; break; }
        if (matchAt(pos + 1, 'Z')) pos += 2; else pos++;
        add('S'); break;
      default: pos++; break;
    }
  }
  return result;
}

export function doubleMetaphone(word) {
  return [doubleMetaphoneOne(word, true), doubleMetaphoneOne(word, false)];
}

// 24. NYSIIS phonetic code.
export function nysiis(word) {
  let s = String(word).toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  s = s.replace(/^MAC/, 'MCC').replace(/^KN/, 'NN').replace(/^K/, 'C').replace(/^(PH|PF)/, 'FF').replace(/^SCH/, 'SSS');
  s = s.replace(/EE$/, 'Y').replace(/IE$/, 'Y').replace(/(DT|RT|RD|NT|ND)$/, 'D');
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i], next = s[i + 1] || '', next2 = s[i + 2] || '', prev = out.slice(-1);
    if ('AEIOU'.includes(c)) { out += 'A'; i++; continue; }
    if (c === 'Q') { out += prev === 'G' ? '' : 'G'; i++; continue; }
    if (c === 'Z') { out += 'S'; i++; continue; }
    if (c === 'M') { out += 'N'; i++; continue; }
    if (c === 'K') { if (prev !== 'C') out += 'C'; i++; continue; }
    if (c === 'S' && next === 'C' && 'HIO'.includes(next2)) { i += 2; continue; }
    if (c === 'P' && next === 'H') { out += 'F'; i += 2; continue; }
    if (c === 'H' && (!'AEIOU'.includes(next) || !'AEIOU'.includes(s[i - 1] || ''))) { i++; continue; }
    if (c === 'W' && !'AEIOU'.includes(next)) { i++; continue; }
    out += c; i++;
  }
  out = out.replace(/(.)\1+/g, '$1').replace(/S$/, '').replace(/AY$/, 'Y').replace(/A$/, '');
  return out;
}

// 25. Caverphone 1.
export function caverphone1(word) {
  let s = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';
  s = s.replace(/e$/, '');
  s = s
    .replace(/^cough/, 'cou2f').replace(/^rough/, 'rou2f').replace(/^tough/, 'tou2f').replace(/^enough/, 'enou2f').replace(/^gn/, '2n')
    .replace(/mb$/, 'm2').replace(/cq/, '2q').replace(/ci([a-z])/, 'si$1').replace(/ce([a-z])/, 'se$1').replace(/ck/, 'k').replace(/^cq/, 'k')
    .replace(/^ca([a-z])/, 'ka$1').replace(/^co([a-z])/, 'ko$1').replace(/^cu([a-z])/, 'ku$1').replace(/^ce([a-z])/, 'ke$1').replace(/^cy([a-z])/, 'ky$1')
    .replace(/^tch/, '2ch').replace(/ph/, 'f').replace(/q/, 'k').replace(/x/, 'ks').replace(/^y([a-z])/, 'i$1')
    .replace(/([aeiou])w/, '$1u').replace(/([aeiou])y([a-z])/, '$1i$2').replace(/dg/, 'j').replace(/tch/, 'ch')
    .replace(/[aeiou]+/, 'A').replace(/z/g, 's').replace(/wr/, 'r').replace(/([ptkgmnbrsz])$/, '$12')
    .replace(/2/g, '').replace(/[^a-z]/g, '');
  return s.padEnd(6, '1').slice(0, 6);
}

// 26. Caverphone 2 (extended).
export function caverphone2(word) {
  let s = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';
  s = s
    .replace(/([^aeiou])e$/, '$1').replace(/(gn|kn|pn|wr|ps)$/, '$12')
    .replace(/cq/, 'qq').replace(/ci([a-z])/, 'si$1').replace(/ce([a-z])/, 'se$1').replace(/ck/, 'kk')
    .replace(/^c([aeiouy])/, 'k$1').replace(/c(?=[kq])/, 'k').replace(/(ph|q|x|wr|z)/g, m => ({ ph: 'f', q: 'k', x: 'ks', wr: 'r', z: 's' }[m]))
    .replace(/^y([a-z])/, 'i$1').replace(/w(?=[a-z])/, 'u').replace(/dg/, 'jj').replace(/tch/, 'cch')
    .replace(/[aeiou]+/g, 'A').replace(/j+/, 'j');
  s = s.replace(/y$/, '').replace(/([ptkgmnbrsz])$/, '$12').replace(/2/g, '');
  return s.padEnd(10, '1').slice(0, 10);
}

// 27. Match Rating Approach codex + comparison.
const MRA_SKIP = 'AEIOU';
export function matchRatingCodex(word) {
  let s = String(word).toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  let first = s[0];
  let rest = s.slice(1).split('').filter(c => !MRA_SKIP.includes(c)).join('');
  rest = rest.replace(/(.)\1+/g, '$1');
  s = (first + rest).replace(/(.)\1+/g, '$1');
  return s.slice(0, 6);
}

export function matchRatingCompare(a, b) {
  const ca = matchRatingCodex(a), cb = matchRatingCodex(b);
  const min = Math.min(ca.length, cb.length), diff = Math.abs(ca.length - cb.length);
  const minAllowed = { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4, 11: 5, 12: 6 }[Math.min(ca.length, cb.length)] ?? 6;
  let count = 0;
  for (let i = min - 1; i >= 0; i--) if (ca[i] !== cb[i]) count++;
  count += diff;
  void min;
  return count <= minAllowed;
}

// Convenience: every phonetic key family for bucket indexing.
export function phoneticKeys(word) {
  const [primary, secondary] = doubleMetaphone(word);
  return {
    soundex: soundex(word),
    refined: refinedSoundex(word),
    metaphone: metaphone(word),
    dmpPrimary: primary,
    dmpSecondary: secondary,
    nysiis: nysiis(word),
    caverphone: caverphone2(word),
    mra: matchRatingCodex(word),
  };
}

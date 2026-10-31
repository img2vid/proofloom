// Edit-distance family. Every function here is a distinct, standard algorithm
// used by the spelling pipeline to measure how two words differ.

// 1. Levenshtein distance: insertions, deletions, substitutions.
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    const ca = a[i - 1];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// 2. Damerau-Levenshtein (optimal string alignment): adds transposition of
// two adjacent characters, which covers the most common typing slips.
export function damerauLevenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = [];
  for (let i = 0; i <= m; i++) { d[i] = [i]; }
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, d[i - 2][j - 2] + 1);
      d[i][j] = value;
    }
  }
  return d[m][n];
}

// 3. Restricted Damerau-Levenshtein: like OSA but allows the same substring
// to be edited twice (uses the auxiliary-row variant). Useful for jumbled
// letter errors such as "recieve"/"receive".
export function restrictedDamerauLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const infinity = m + n;
  const da = new Map();
  const d = Array.from({length: m + 2}, () => new Array(n + 2).fill(0));
  d[0][0] = infinity;
  for (let i = 0; i <= m; i++) { d[i + 1][0] = infinity; d[i + 1][1] = i; }
  for (let j = 0; j <= n; j++) { d[0][j + 1] = infinity; d[1][j + 1] = j; }
  for (let i = 1; i <= m; i++) {
    let db = 0;
    for (let j = 1; j <= n; j++) {
      const k = da.get(b[j - 1]) || 0, l = db;
      let cost;
      if (a[i - 1] === b[j - 1]) { cost = 0; db = j; } else cost = 1;
      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost,
        d[i + 1][j] + 1,
        d[i][j + 1] + 1,
        d[k][l] + (i - k - 1) + 1 + (j - l - 1)
      );
    }
    da.set(a[i - 1], i);
  }
  return d[m + 1][n + 1];
}

// 4. Hamming distance: substitutions only, for equal-length strings.
export function hamming(a, b) {
  if (a.length !== b.length) return Infinity;
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
  return count;
}

// 5. Longest-common-subsequence distance: deletions/insertions only.
export function lcsDistance(a, b) {
  const m = a.length, n = b.length;
  let previous = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const current = [0];
    for (let j = 1; j <= n; j++) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return m + n - 2 * previous[n];
}

// 6. Weighted edit distance with a per-character cost function. The spelling
// pipeline uses it with keyboard-adjacency and OCR-confusion costs so that
// plausible slips rank better than implausible ones.
export function weightedEditDistance(a, b, cost) {
  const m = a.length, n = b.length;
  const d = Array.from({length: m + 1}, () => new Array(n + 1).fill(Infinity));
  d[0][0] = 0;
  for (let i = 1; i <= m; i++) d[i][0] = d[i - 1][0] + cost(a[i - 1], '', i - 1, a);
  for (let j = 1; j <= n; j++) d[0][j] = d[0][j - 1] + cost('', b[j - 1], j - 1, b);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sub = d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : cost(a[i - 1], b[j - 1], i - 1, a));
      const del = d[i - 1][j] + cost(a[i - 1], '', i - 1, a);
      const ins = d[i][j - 1] + cost('', b[j - 1], j - 1, b);
      d[i][j] = Math.min(sub, del, ins);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost(a[i - 2] + a[i - 1], b[j - 2] + b[j - 1], i - 2, a));
      }
    }
  }
  return d[m][n];
}

// 7. Normalized similarity derived from Levenshtein distance (0..1).
export function levenshteinSimilarity(a, b) {
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - levenshtein(a, b) / longest : 1;
}


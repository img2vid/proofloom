// String-similarity metrics used to rank spelling candidates and compare
// phonetic keys. Each function is an independent, standard algorithm.

// 8. Jaro similarity (0..1).
export function jaro(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const window = Math.max(0, Math.floor(Math.max(m, n) / 2) - 1);
  const aMatch = new Array(m).fill(false), bMatch = new Array(n).fill(false);
  let matches = 0;
  for (let i = 0; i < m; i++) {
    const start = Math.max(0, i - window), end = Math.min(i + window + 1, n);
    for (let j = start; j < end; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = bMatch[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let transpositions = 0, k = 0;
  for (let i = 0; i < m; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  return (matches / m + matches / n + (matches - transpositions) / matches) / 3;
}

// 9. Jaro-Winkler similarity: Jaro with a common-prefix bonus.
export function jaroWinkler(a, b, scaling = 0.1) {
  const base = jaro(a, b);
  let prefix = 0;
  const limit = Math.min(4, a.length, b.length);
  while (prefix < limit && a[prefix] === b[prefix]) prefix++;
  return base + prefix * scaling * (1 - base);
}

// 10. Sørensen–Dice coefficient over character bigrams.
export function bigramDice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const count = grams.get(g) || 0;
    if (count > 0) { grams.set(g, count - 1); shared++; }
  }
  return (2 * shared) / (a.length - 1 + b.length - 1);
}

// 11. Jaccard similarity over character trigram sets.
export function trigramJaccard(a, b) {
  if (a === b) return 1;
  const set = s => { const out = new Set(); for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3)); return out; };
  const A = set(a), B = set(b);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / (A.size + B.size - shared);
}

// 12. Cosine similarity over character n-gram frequency vectors.
export function ngramCosine(a, b, n = 2) {
  if (a === b) return 1;
  const vector = s => {
    const map = new Map();
    for (let i = 0; i + n <= s.length; i++) { const g = s.slice(i, i + n); map.set(g, (map.get(g) || 0) + 1); }
    return map;
  };
  const A = vector(a), B = vector(b);
  let dot = 0, na = 0, nb = 0;
  for (const [, v] of A) na += v * v;
  for (const [g, v] of B) { nb += v * v; const av = A.get(g); if (av) dot += av * v; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// 13. Longest common substring length.
export function longestCommonSubstring(a, b) {
  let best = 0, previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = [0];
    for (let j = 1; j <= b.length; j++) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : 0;
      if (current[j] > best) best = current[j];
    }
    previous = current;
  }
  return best;
}

// 14. Monge-Elkan similarity: symmetric-average best match between the
// character bigrams of both words (catches reordered syllables).
export function mongeElkan(a, b) {
  const grams = s => { const out = []; for (let i = 0; i + 2 <= s.length; i++) out.push(s.slice(i, i + 2)); return out; };
  const A = grams(a), B = grams(b);
  if (!A.length || !B.length) return a === b ? 1 : 0;
  const best = (token, list) => list.reduce((m, other) => Math.max(m, jaroWinkler(token, other)), 0);
  const sumA = A.reduce((n, t) => n + best(t, B), 0);
  const sumB = B.reduce((n, t) => n + best(t, A), 0);
  return (sumA / A.length + sumB / B.length) / 2;
}

// 15. Affix similarity: shared prefix length + shared suffix length,
// normalized. Misspellings tend to preserve word beginnings and endings.
export function affixSimilarity(a, b) {
  if (a === b) return 1;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return (prefix + suffix) / Math.max(a.length, b.length);
}

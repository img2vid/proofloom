// Keyboard-adjacency and character-confusion knowledge. These tables power
// weighted edit distance so that likely slips ("teh" for "the") outrank
// unlikely ones.

// 16. QWERTY adjacency graph.
const QWERTY_ROWS = ['`1234567890-', 'qwertyuiop[]', 'asdfghjkl;\'', 'zxcvbnm,./'];
const ADJACENT = new Map();
for (let r = 0; r < QWERTY_ROWS.length; r++) {
  for (let c = 0; c < QWERTY_ROWS[r].length; c++) {
    const key = QWERTY_ROWS[r][c];
    const neighbors = [];
    for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, 1], [1, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < QWERTY_ROWS.length && nc >= 0 && nc < QWERTY_ROWS[nr].length) neighbors.push(QWERTY_ROWS[nr][nc]);
    }
    ADJACENT.set(key, neighbors);
  }
}

export function keyNeighbors(ch) {
  return ADJACENT.get(ch.toLowerCase()) || [];
}

// Keyboard cost for weighted edit distance: 0.35 for adjacent keys,
// 0.55 for vowel swaps (cognitive confusions), 1 otherwise.
const VOWELS = 'aeiou';
export function keyboardCost(from, to) {
  if (!from || !to) return 1;
  const f = from.toLowerCase(), t = to.toLowerCase();
  if (f === t) return 0;
  if (VOWELS.includes(f) && VOWELS.includes(t)) return 0.55;
  if (keyNeighbors(f).includes(t)) return 0.35;
  return 1;
}

// 17. OCR/handwriting character-confusion pairs. Source: classic recognition
// error literature (rn/m, cl/d, vv/w, l/1, O/0, S/5, B/8, Z/2, G/6...).
export const OCR_CONFUSIONS = [
  ['rn', 'm'], ['cl', 'd'], ['vv', 'w'], ['nn', 'm'], ['ii', 'n'], ['li', 'h'],
  ['l', '1'], ['I', '1'], ['O', '0'], ['o', '0'], ['Q', '0'], ['S', '5'], ['s', '5'],
  ['B', '8'], ['Z', '2'], ['z', '2'], ['G', '6'], ['b', '6'], ['g', '9'], ['q', '9'],
  ['i', '1'], ['J', '1'], ['D', '0'], ['A', '4'], ['E', '8'], ['T', '7'], ['U', '0'],
  ['g', 'q'], ['m', 'rn'], ['w', 'vv'], ['d', 'cl'], ['h', 'li'], ['n', 'ii'],
];

// 18. Cognitive double-letter confusions: homophone-influenced slips and
// doubled/undoubled consonants, the most frequent real typing errors.
export const DOUBLED_CONSONANTS = 'bdgmnprt';
export function isDoubledConsonant(ch) {
  return DOUBLED_CONSONANTS.includes(ch.toLowerCase());
}

// 19. Common adjacent-transposition-prone sequences (typing rhythm errors).
export function transpositionLikely(word, i) {
  const a = word[i], b = word[i + 1];
  if (!a || !b || a === b) return false;
  return keyNeighbors(a.toLowerCase()).includes(b.toLowerCase()) ||
    (VOWELS.includes(a.toLowerCase()) && VOWELS.includes(b.toLowerCase()));
}

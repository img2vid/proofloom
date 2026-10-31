// Literal-rule machinery. Thousands of phrase rules would be slow as
// individual regexes, so each phrase rule is stored as a token sequence and
// matched through a first-word trigger index: one pass over the text finds
// every rule that can fire at each position. This is a multi-pattern
// dictionary matcher (Aho-Corasick simplified to exact phrase sequences).

export const PHRASE_PATTERN = /^[a-z][a-z'’\s-]*$/i;

// Build a rule object from a phrase. Variants add inflectional forms
// ("color"/"colors"/"colored"...).
export function literalRule(id, category, phrase, replacement, message, confidence, extra = {}) {
  const tokens = String(phrase).toLowerCase().split(/\s+/).filter(Boolean);
  return {
    id, category, kind: 'literal', tokens, phrase,
    replacement, message, confidence,
    source: extra.source || 'Proofloom language tables',
    ...extra,
  };
}

// Tokenize text into lowercase words with offsets. Apostrophes kept.
export function wordTokens(text) {
  const tokens = [];
  for (const m of text.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu)) {
    tokens.push({word: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length});
  }
  return tokens;
}

// Build {firstTokenLower: [ruleIndex]} index over literal rules.
export function buildTriggerIndex(rules) {
  const index = new Map();
  rules.forEach((rule, i) => {
    if (rule.kind !== 'literal' || !rule.tokens.length) return;
    const first = rule.tokens[0];
    let bucket = index.get(first);
    if (!bucket) { bucket = []; index.set(first, bucket); }
    bucket.push(i);
  });
  return index;
}

// Run all literal rules over text, invoking visit(rule, start, end, matchText).
export function matchLiteralRules(text, rules, triggerIndex, visit) {
  if (!rules.length) return;
  const tokens = wordTokens(text);
  for (let i = 0; i < tokens.length; i++) {
    const candidates = triggerIndex.get(tokens[i].lower);
    if (!candidates) continue;
    for (const ruleIndex of candidates) {
      const rule = rules[ruleIndex];
      const tokens2 = rule.tokens;
      if (i + tokens2.length > tokens.length) continue;
      let ok = true;
      for (let k = 1; k < tokens2.length; k++) {
        if (tokens[i + k].lower !== tokens2[k]) { ok = false; break; }
      }
      if (!ok) continue;
      const start = tokens[i].start, end = tokens[i + tokens2.length - 1].end;
      visit(rule, start, end, text.slice(start, end));
      if (visit === null) return; // not used; kept for safety
    }
  }
}

// Expand a base word with regular inflections for dialect rules.
export function inflections(word) {
  const forms = new Set([word]);
  if (!/^[a-z]+$/.test(word)) return [...forms];
  forms.add(word + 's');
  if (/[^s]y$/.test(word)) forms.add(word.slice(0, -1) + 'ies');
  if (/[sxz]$/.test(word) || /(ch|sh)$/.test(word)) forms.add(word + 'es');
  forms.add(word + 'd');
  if (/e$/.test(word)) forms.add(word + 'd');
  else if (/[^aeiou][aeiou][^aeiouwxy]$/.test(word)) {
    forms.add(word + word.slice(-1) + 'ed');
    forms.add(word + word.slice(-1) + 'ing');
  } else forms.add(word + 'ing');
  if (/ic$/.test(word)) forms.add(word + 'ally');
  else if (/[^s]y$/.test(word)) forms.add(word.slice(0, -1) + 'ily');
  else if (/[a-z]{3,}le$/.test(word)) forms.add(word + 'y');
  return [...forms];
}

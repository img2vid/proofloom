// Text segmentation algorithms: words, sentences, paragraphs with offsets.

// 28. Word tokenization with UTF-16 offsets. ZWJ/ZWNJ join conjuncts in
// Indic scripts (Sinhala මනුෂ්‍ය, Marathi half forms), so they belong
// inside a word instead of splitting it in two.
export function tokenizeWords(text) {
  const out = [];
  const pattern = /[\p{L}\p{M}][\p{L}\p{M}\u200C\u200D'’-]*/gu;
  for (const m of text.matchAll(pattern)) {
    const word = m[0];
    out.push({ word, lower: word.toLowerCase().replace(/[’]/g, "'"), start: m.index, end: m.index + word.length });
  }
  return out;
}

// 29. Sentence segmentation: Intl.Segmenter when available, with an
// abbreviation-aware fallback (common titles and Latin abbreviations must
// not end a sentence).
const NOT_SENTENCE_END = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|fig|approx|no|vol|inc|ltd|co|dept|univ|assn|bros|approx)\.$/i;

export function tokenizeSentences(text, language = 'en') {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    try {
      const segments = [...new Intl.Segmenter(language, {granularity: 'sentence'}).segment(text)];
      // Merge segments that end with an abbreviation.
      const merged = [];
      for (const segment of segments) {
        const previous = merged[merged.length - 1];
        if (previous && NOT_SENTENCE_END.test(previous.text.trimEnd())) {
          previous.text += segment.text;
          previous.end = segment.index + segment.text.length;
        } else merged.push({text: segment.text, start: segment.index, end: segment.index + segment.text.length});
      }
      return merged.filter(s => /[\p{L}]/u.test(s.text));
    } catch { /* fall through to the regex segmenter */ }
  }
  const out = [];
  const pattern = /[^.!?\n]+[.!?]+["'”’)\]]*|\S[^.!?\n]*$/g;
  for (const m of text.matchAll(pattern)) {
    const start = m.index, end = m.index + m[0].length, trimmed = m[0].trim();
    if (!trimmed) continue;
    const previous = out[out.length - 1];
    if (previous && NOT_SENTENCE_END.test(previous.text.trimEnd())) {
      previous.text += text.slice(previous.end, end);
      previous.end = end;
    } else out.push({text: trimmed, start, end});
  }
  return out.filter(s => /[\p{L}]/u.test(s.text));
}

// 30. Paragraph segmentation.
export function paragraphs(text) {
  const out = [];
  for (const m of text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]*)*/g)) {
    if (m[0].trim()) out.push({text: m[0], start: m.index, end: m.index + m[0].length});
  }
  return out;
}

export function countWords(text) {
  return [...text.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu)].length;
}

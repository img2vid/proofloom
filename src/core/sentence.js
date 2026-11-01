// Sentence-context previews for the writing-assistant pane. DOM-free and
// pure: given the document text and an issue range, return the sentence
// that contains it together with the same sentence rewritten with a chosen
// replacement, so every suggestion card can show an example and a corrected
// sentence side by side.

// A sentence boundary is sentence-ending punctuation — ASCII plus the CJK,
// Arabic, and interrobang variants — optionally followed by closing quotes
// or brackets and then whitespace or a letter (which keeps "3.14" intact
// while still breaking after "。" with no trailing space), or any run of
// line breaks: headings, list items, and poem lines start their own
// sentence. This is a display heuristic, not a syntactic parse; common
// abbreviations ("Dr.", "e.g.") can shorten a preview, never corrupt the
// flagged range itself.
const BACKWARD = /[.!?…。！？؟‽]+["'”’»)\]]*(?=\s|\p{L}|\n|$)|\n+/gu;
const FORWARD = /[.!?…。！？؟‽]+["'”’»)\]]*(?=\s|\p{L}|\n|$)|\n+/gu;

// Characters scanned on each side of the flagged range while looking for
// the sentence that contains it. Bounds the work done per suggestion card
// and keeps very long sentences out of the pane.
const WINDOW = 400;

export function sentenceContext(text, issue, replacement) {
  if (typeof text !== 'string' || !issue || typeof issue !== 'object') return null;
  const {start, end} = issue;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end <= start || end > text.length) return null;
  // Callers may pass the alternative picked in the card's dropdown; without
  // one, fall back to the issue's first replacement.
  if (replacement === undefined) replacement = issue.replacements?.[0] ?? null;

  const windowStart = Math.max(0, start - WINDOW);
  const windowEnd = Math.min(text.length, end + WINDOW);

  // Walk backwards over every boundary before the flagged range; the last
  // one found opens the sentence.
  const head = text.slice(windowStart, start);
  BACKWARD.lastIndex = 0;
  let match, sentenceStart = windowStart;
  while ((match = BACKWARD.exec(head))) sentenceStart = windowStart + match.index + match[0].length;

  // The first boundary at or after the range closes the sentence.
  FORWARD.lastIndex = 0;
  const close = FORWARD.exec(text.slice(end, windowEnd));
  let sentenceEnd = close ? end + close.index + close[0].length : windowEnd;

  // Trim surrounding whitespace without ever eating into the flagged range.
  while (sentenceStart < start && /\s/.test(text[sentenceStart])) sentenceStart++;
  while (sentenceEnd > end && /\s/.test(text[sentenceEnd - 1])) sentenceEnd--;

  const sentence = text.slice(sentenceStart, sentenceEnd);
  if (!sentence) return null;
  const corrected = replacement == null ? null
    : text.slice(sentenceStart, start) + replacement + text.slice(end, sentenceEnd);
  return {
    sentence,
    corrected,
    // Offsets of the flagged range inside `sentence`; inside `corrected` the
    // replacement occupies [from, from + replaced.length).
    from: start - sentenceStart,
    to: end - sentenceStart,
    replaced: replacement == null ? '' : replacement,
    // The preview reaches the scan window edge, so the sentence likely
    // continues beyond it and the view may show an ellipsis.
    startClipped: windowStart > 0 && sentenceStart === windowStart,
    endClipped: windowEnd < text.length && sentenceEnd === windowEnd,
  };
}

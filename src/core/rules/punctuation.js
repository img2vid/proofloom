// Punctuation, typography, and OCR rules (regex-based).
const rule = (id, category, pattern, replacement, message, confidence = .97, extra = {}) =>
  ({id, category, kind: 'regex', pattern, replacement, message, confidence, ...extra});

export const PUNCTUATION_RULES = [
  rule('punct-space-before','punctuation', /[ \t]+([,;:!?])/gu, '$1', 'Remove the space before punctuation.'),
  rule('space-after-comma','punctuation', /([,;:])(?=[\p{L}])/gu, '$1 ', 'Add a space after punctuation.'),
  rule('space-after-period','punctuation', /([.!?])(?=[A-Z][a-z])/gu, '$1 ', 'Add a space between these sentences.', .94),
  rule('multiple-comma','punctuation', /,{2,}/gu, ',', 'Use a single comma.'),
  rule('multiple-semicolon','punctuation', /;{2,}/gu, ';', 'Use a single semicolon.'),
  rule('multiple-colon','punctuation', /:{2,}/gu, ':', 'Use a single colon.'),
  rule('double-space','punctuation', /(?<=\S)[ \t]{2,}(?=\S)/gu, ' ', 'Use a single space between words.', .99),
  rule('trailing-space','punctuation', /[ \t]+(?=\n|$)/gu, '', 'Remove trailing whitespace.', .99),
  rule('ellipsis','punctuation', /\.{4,}/gu, '…', 'Use an ellipsis for an intentional omission.', .9),
  rule('parenthesis-space-open','punctuation', /\([ \t]+/gu, '(', 'Remove the space after the opening parenthesis.'),
  rule('parenthesis-space-close','punctuation', /[ \t]+\)/gu, ')', 'Remove the space before the closing parenthesis.'),
  rule('bracket-space-close','punctuation', /[ \t]+\]/gu, ']', 'Remove the space before the closing bracket.'),
  rule('empty-parens','punctuation', /\(\s*\)/gu, '', 'This parenthesis is empty.', .8),
  rule('comma-before-that','punctuation', /, (?:that|which|who) (?:is|are|was|were) (?=(?:very|really|so)\b)/gu, null, 'A comma before a restrictive clause can mislead. Review it.', .6),
  rule('question-mark-space','punctuation', /\?{1} +(?=[a-z])/gu, null, 'A lowercase word right after a question mark may need a capital.', .7),
  rule('punct-dup-mixed','punctuation', /[.,;:!?][.,;:!?]{1,}/gu, null, 'Repeated punctuation marks. Review the intended one.', .85),
  rule('comma-splice-pronoun','punctuation', /, (?:he|she|it|they|we|i|you) (?:is|are|was|were|will|would|can|could)\b/giu, null, 'Possible comma splice: two independent clauses joined only by a comma.', .62),
  rule('period-space-digit','punctuation', /(\D)\.(?=\d)/gu, null, 'A period between text and a digit may need a space.', .55),
  rule('hyphen-space','punctuation', /(?<=\p{L}) - (?=\p{L})/gu, ' – ', 'For an interruption, an en dash is standard.', .7),
  rule('dash-double-hyphen','punctuation', /(?<=\S)--(?=\S)/gu, '—', 'Use an em dash for an interruption.', .9),
  rule('hyphen-double','punctuation', /(?<=\p{L})--(?=\p{L})/gu, '—', 'Use an em dash between words.', .85),
  rule('ellipsis-dots','punctuation', /\.\.\.(?=\p{L})/gu, '…', 'Use the ellipsis character or add a space.', .8),
  rule('quote-direction','punctuation', /[“”]{1}(?=\s)/gu, null, 'A possible stray curly quote. Review the direction.', .6),
  rule('stray-apostrophe','punctuation', /\p{L}{3,}'\s/gu, null, 'An apostrophe with nothing after it may be stray.', .65),
  rule('space-before-open-paren','punctuation', /\S[ \t]+\(/gu, null, 'A space before an opening parenthesis is usually unwanted after a word.', .55),
];

export const TYPOGRAPHY_RULES = [
  rule('straight-quote-pair','punctuation', /"(?=\S)/gu, null, 'Straight quotes can become curly quotes in publishing.', .5),
  rule('capital-after-comma','punctuation', /, (?=[A-Z][a-z]{2,}\s)/gu, null, 'A capital word right after a comma may indicate a run-on. Review.', .5),
  rule('double-apostrophe','punctuation', /''/gu, '”', 'Two straight apostrophes look like a closing double quote.', .6),
  rule('degree-space','punctuation', /\d +[°CF]\b/gu, null, 'No space between a number and a degree symbol.', .7),
  rule('number-thousand-space','punctuation', /\d{1,3}(?: \d{3})+(?!\d)/gu, null, 'Use commas or thin spaces in thousands separators, consistently.', .5),
  rule('mixed-quote-marks','punctuation', /(?<=\p{L})"(?=\s?[.,;])/gu, '”', 'Use a closing curly quote before punctuation.', .7),
  rule('abbrev-period-space','punctuation', /\b(?:e\.g|i\.e|etc)\.(?=\p{L})/gu, null, 'Add a space after the abbreviation period.', .7),
];

export const OCR_RULES = [
  rule('ocr-soft-hyphen','ocr', /\u00ad/gu, '', 'Remove the invisible soft hyphen.', .99),
  rule('ocr-replacement','ocr', /\uFFFD/gu, null, 'An unreadable character needs comparison with the original scan.', .6),
  rule('ocr-ligature','ocr', /[ﬀﬁﬂﬃﬄﬅﬆ]/gu, m=>({ﬀ:'ff',ﬁ:'fi',ﬂ:'fl',ﬃ:'ffi',ﬄ:'ffl',ﬅ:'st',ﬆ:'st'})[m[0]], 'Expand a typographic ligature into ordinary letters.', .99),
  rule('ocr-quote','ocr', /(?<=\p{L})[´`‘](?=\p{L})/gu, '’', 'Normalize a misrecognized apostrophe.', .95),
  rule('ocr-noise','ocr', /[|¦](?=[a-z])/gu, 'l', 'Possible OCR confusion between a vertical stroke and “l”. Review against the scan.', .75),
  rule('ocr-pronoun-stroke','ocr', /(^|\n|[.!?][ \t]+)[|¦](?=[ \t]+\p{L})/gmu, '$1I', 'A standalone vertical stroke may be the pronoun “I”. Compare with the original scan.', .82),
  rule('ocr-hyphen-space','ocr', /(?<=\p{L})-(?=[ \t]*\r?\n)/gu, null, 'A hyphen at a line end may be a broken word. Review the scan.', .7),
  rule('ocr-doubled-space','ocr', /[^\S\n]{3,}/gu, ' ', 'A wide gap is often a scan artifact.', .8),
  rule('ocr-caret','ocr', /\^/gu, null, 'A caret may be a misrecognized letter. Compare with the scan.', .6),
  rule('ocr-mixed-case','ocr', /(?<=\p{Ll})\p{Lu}(?=\p{Ll}{2,})/gu, null, 'An isolated capital inside a word suggests a recognition error.', .6),
  rule('ocr-curly-brace','ocr', /[{}]/gu, null, 'Curly braces rarely appear in prose; check the scan.', .6),
  rule('ocr-tilde','ocr', /~(?=\p{L})/gu, null, 'A tilde inside a word suggests a scan artifact.', .6),
  rule('ocr-lowercase-i','ocr', /(?<![A-Za-z])i(?![A-Za-z])/gu, 'I', 'A standalone lowercase “i” is usually the pronoun “I”.', .9),
];

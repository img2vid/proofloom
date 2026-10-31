// Original Proofloom rules. Dictionary corrections are loaded separately with provenance.
const rule = (id, category, pattern, replacement, message, confidence = .97, extra = {}) =>
  ({ id, category, pattern, replacement, message, confidence, ...extra });

export const RULES = [
  rule('duplicate-word','grammar', /\b([\p{L}]+)([ \t]+)\1\b/giu, '$1', 'Remove the repeated word.'),
  rule('pronoun-i','grammar', /\bi\b/gu, 'I', 'Capitalize the pronoun “I”.'),
  rule('i-am','grammar', /\bI (?:is|are)\b/gu, 'I am', 'Use “am” with “I”.'),
  rule('singular-is','grammar', /\b(he|she|it|this|that) are\b/giu, '$1 is', 'Use a singular verb with this subject.'),
  rule('plural-are','grammar', /\b(we|they|you|these|those) is\b/giu, '$1 are', 'Use “are” with this subject.'),
  rule('singular-has','grammar', /\b(he|she|it) have\b/giu, '$1 has', 'Use “has” with a singular third-person subject.'),
  rule('plural-have','grammar', /\b(I|we|they|you) has\b/giu, '$1 have', 'Use “have” with this subject.'),
  rule('singular-doesnt','grammar', /\b(he|she|it) don['’]t\b/giu, '$1 doesn’t', 'Use “doesn’t” with this subject.'),
  rule('plural-dont','grammar', /\b(I|we|they|you) doesn['’]t\b/giu, '$1 don’t', 'Use “don’t” with this subject.'),
  rule('singular-was','grammar', /\b(he|she|it) were\b/giu, '$1 was', 'Check the past-tense agreement. Keep “were” for a hypothetical statement.', .8),
  rule('plural-were','grammar', /\b(we|they|you) was\b/giu, '$1 were', 'Use “were” with this subject.'),
  rule('everyone-is','grammar', /\b(everyone|everybody|someone|somebody|nobody|anyone|anybody|each) are\b/giu, '$1 is', 'This indefinite pronoun takes a singular verb.'),
  rule('everyone-has','grammar', /\b(everyone|everybody|someone|somebody|nobody|anyone|anybody|each) have\b/giu, '$1 has', 'This indefinite pronoun takes “has”.'),
  rule('there-are','grammar', /\bthere is (many|several|two|three|four|five|six|seven|eight|nine|ten)\b/giu, 'there are $1', 'Use “there are” before this plural expression.'),
  rule('modal-have','grammar', /\b(could|would|should|must|might|may) of\b/giu, '$1 have', 'Use “have” after this modal verb.'),
  rule('did-base','grammar', /\b(did|didn['’]t) (went|saw|ate|came|took|gave|wrote|ran|knew|made)\b/giu, m => `${m[1]} ${{went:'go',saw:'see',ate:'eat',came:'come',took:'take',gave:'give',wrote:'write',ran:'run',knew:'know',made:'make'}[m[2].toLowerCase()]}`, 'Use the base form of the verb after “did”.'),
  rule('have-participle','grammar', /\b(have|has|had) (went|saw|ate|wrote|took|gave|broke|spoke|drove|chose)\b/giu, m => `${m[1]} ${{went:'gone',saw:'seen',ate:'eaten',wrote:'written',took:'taken',gave:'given',broke:'broken',spoke:'spoken',drove:'driven',chose:'chosen'}[m[2].toLowerCase()]}`, 'Use the past participle after this auxiliary verb.'),
  rule('a-vowel','grammar', /\ba (apple|orange|egg|idea|issue|example|answer|article|author|image|error|email|event|editor|engine|object|option|opportunity|umbrella|unexpected|unusual|hour|honest|honor|honour)\b/giu, 'an $1', 'Use “an” before a vowel sound.'),
  rule('an-consonant','grammar', /\ban (book|document|file|page|report|word|sentence|language|dictionary|plugin|user|university|unique|useful|European|one)\b/giu, 'a $1', 'Use “a” before a consonant sound.'),
  rule('much-countable','grammar', /\bmuch (books|pages|words|errors|documents|people|students|files|things|problems|hours)\b/giu, 'many $1', 'Use “many” with this countable plural noun.'),
  rule('less-countable','grammar', /\bless (books|pages|words|errors|documents|people|students|files|things|problems)\b/giu, 'fewer $1', 'Consider “fewer” for a countable plural noun.', .9),
  rule('many-uncountable','grammar', /\bmany (information|advice|equipment|furniture|knowledge|research)\b/giu, 'much $1', 'This noun is normally uncountable.'),
  rule('uncountable-plural','grammar', /\b(informations|equipments|advices|furnitures|knowledges)\b/giu, m => m[0].slice(0,-1), 'This noun is normally uncountable in general English.', .9),
  rule('more-better','grammar', /\bmore (better|worse|easier|harder|faster|slower|stronger|smaller|larger)\b/giu, '$1', 'Remove the doubled comparative.'),
  rule('most-best','grammar', /\bmost (best|worst|easiest|hardest|fastest|slowest|strongest)\b/giu, '$1', 'Remove the doubled superlative.'),
  rule('irregular-plural','grammar', /\b(childs|childrens|mouses|foots|tooths|womans|mans)\b/giu, m => ({childs:'children',childrens:'children',mouses:'mice',foots:'feet',tooths:'teeth',womans:'women',mans:'men'})[m[0].toLowerCase()], 'Check this irregular plural.', .85),
  rule('between-you-me','grammar', /\bbetween you and I\b/giu, 'between you and me', 'Use the object pronoun after “between”.'),
  rule('one-of','grammar', /\bone of the (book|page|word|document|student|problem|reason)\b/giu, 'one of the $1s', 'Use a plural noun in “one of the …”.'),
  rule('look-forward','grammar', /\blook(?:ing)? forward to (hear|meet|see|work|read|learn)\b/giu, m=>m[0].replace(new RegExp(`${m[1]}$`,'i'),{hear:'hearing',meet:'meeting',see:'seeing',work:'working',read:'reading',learn:'learning'}[m[1].toLowerCase()]), 'Use the -ing form after “look forward to”.'),
  rule('discuss-about','grammar', /\bdiscuss about\b/giu, 'discuss', '“Discuss” normally takes a direct object.'),
  rule('despite-of','grammar', /\bdespite of\b/giu, 'despite', 'Use “despite” without “of”.'),
  rule('married-with','grammar', /\bmarried with (him|her|a man|a woman)\b/giu, 'married to $1', 'Use “married to” for a spouse.'),
  rule('cope-up','grammar', /\bcope up with\b/giu, 'cope with', 'Use “cope with”.'),
  rule('according-to-me','style', /\baccording to me\b/giu, 'in my opinion', 'A more natural way to introduce your opinion.', .85),
  rule('its-important','grammar', /\bits (important|necessary|possible|impossible|obvious|clear|unlikely|likely|time to)\b/giu, 'it’s $1', 'Use “it’s” when you mean “it is”.', .92),
  rule('your-welcome','grammar', /\byour welcome\b/giu, 'you’re welcome', 'Use “you’re” when you mean “you are”.', .94),
  rule('your-going','grammar', /\byour (going|doing|being) to\b/giu, 'you’re $1 to', 'Check whether you mean “you are”.', .85),
  rule('their-is','grammar', /\btheir (is|are|was|were)\b/giu, 'there $1', 'Use “there” to introduce existence.', .94),
  rule('theyre-possessive','grammar', /\bthey['’]re (books|documents|files|house|car|names|parents)\b/giu, 'their $1', 'Check whether you mean the possessive “their”.', .78),
  rule('then-than','grammar', /\b(better|worse|more|less|fewer|rather|other) then\b/giu, '$1 than', 'Use “than” in this comparison.', .95),
  rule('comparison-than-before','grammar', /\b(better|worse|greater|smaller|larger|faster|slower) ([\p{L}]+) then (before|ever|expected|usual)\b/giu, '$1 $2 than $3', 'Use “than” to compare these things.', .93),
  rule('affect-effect','grammar', /\b(the|an|this|that) affect of\b/giu, '$1 effect of', '“Effect” is usually the noun for a result.', .9),
  rule('loose-lose','grammar', /\b(loose) (weight|interest|patience|money|hope|sight|track)\b/giu, 'lose $2', 'Use “lose” for losing something.', .94),
  rule('to-too','grammar', /\bto (much|many|late|early|often|expensive|difficult)\b/giu, 'too $1', 'Use “too” to mean excessively.', .96),
  rule('allot-alot','spelling', /\balot\b/giu, 'a lot', 'Write “a lot” as two words.'),
  rule('alright','style', /\balright\b/giu, 'all right', '“All right” is preferred by some formal style guides.', .72),
  rule('cannot','spelling', /\bcant\b/giu, 'can’t', 'Add the apostrophe in this contraction.', .95),
  rule('dont','spelling', /\bdont\b/giu, 'don’t', 'Add the apostrophe in this contraction.', .98),
  rule('doesnt','spelling', /\bdoesnt\b/giu, 'doesn’t', 'Add the apostrophe in this contraction.', .98),
  rule('isnt','spelling', /\bisnt\b/giu, 'isn’t', 'Add the apostrophe in this contraction.', .98),
  rule('im','grammar', /\bim\b/gu, 'I’m', 'Capitalize and punctuate “I’m”.', .94),
  rule('punct-space-before','punctuation', /[ \t]+([,;:!?])/gu, '$1', 'Remove the space before punctuation.'),
  rule('space-after-comma','punctuation', /([,;:])(?=[\p{L}])/gu, '$1 ', 'Add a space after punctuation.'),
  rule('space-after-period','punctuation', /([.!?])(?=[A-Z][a-z])/gu, '$1 ', 'Add a space between these sentences.', .94),
  rule('multiple-comma','punctuation', /,{2,}/gu, ',', 'Use a single comma.'),
  rule('multiple-semicolon','punctuation', /;{2,}/gu, ';', 'Use a single semicolon.'),
  rule('multiple-exclamation','style', /!{2,}/gu, '!', 'A single exclamation mark usually has more impact.', .9),
  rule('multiple-question','style', /\?{2,}/gu, '?', 'A single question mark is enough in formal writing.', .9),
  rule('double-space','punctuation', /(?<=\S)[ \t]{2,}(?=\S)/gu, ' ', 'Use a single space between words.', .99),
  rule('trailing-space','punctuation', /[ \t]+(?=\n|$)/gu, '', 'Remove trailing whitespace.', .99),
  rule('ellipsis','punctuation', /\.{4,}/gu, '…', 'Use an ellipsis for an intentional omission.', .9),
  rule('parenthesis-space-open','punctuation', /\([ \t]+/gu, '(', 'Remove the space after the opening parenthesis.'),
  rule('parenthesis-space-close','punctuation', /[ \t]+\)/gu, ')', 'Remove the space before the closing parenthesis.'),
  rule('sentence-case','grammar', /(^|[.!?]["”’)]*[ \t\n]+)([a-z])(?=[a-z])/gmu, m=>m[1]+m[2].toUpperCase(), 'Start this sentence with a capital letter.', .92),
  rule('in-order-to','style', /\bin order to\b/giu, 'to', 'Try a more concise expression.', .88),
  rule('due-to-fact','style', /\bdue to the fact that\b/giu, 'because', 'Try a more direct expression.', .9),
  rule('at-this-time','style', /\bat this point in time\b/giu, 'now', 'A shorter phrase may be clearer.', .9),
  rule('in-event','style', /\bin the event that\b/giu, 'if', 'Try a shorter expression.', .88),
  rule('with-regard','style', /\bwith (?:regard|respect) to\b/giu, 'about', 'Consider a simpler expression.', .85),
  rule('prior-to','style', /\bprior to\b/giu, 'before', '“Before” is often clearer.', .85),
  rule('utilize','style', /\butilize\b/giu, 'use', 'Consider a simpler word.', .85),
  rule('very-unique','style', /\b(?:very|quite|rather|most) unique\b/giu, 'unique', '“Unique” often works without a modifier.', .85),
  rule('redundant-return','style', /\breturn back\b/giu, 'return', 'Remove the redundant “back”.', .9),
  rule('redundant-repeat','style', /\brepeat again\b/giu, 'repeat', 'Consider removing the redundant “again”.', .85),
  rule('redundant-basic','style', /\bbasic fundamentals\b/giu, 'fundamentals', 'Remove a redundant modifier.', .88),
  rule('redundant-future','style', /\bfuture plans\b/giu, 'plans', '“Plans” already refer to the future.', .8),
  rule('redundant-end','style', /\bfinal outcome\b/giu, 'outcome', 'Consider removing the redundant modifier.', .8),
  rule('passive-voice','style', /\b(?:was|were|is|are|been|being) (?:\w+ed|written|seen|given|taken|made|known) by\b/giu, null, 'Possible passive voice. Consider naming the actor first when it improves clarity.', .75),
  rule('ocr-soft-hyphen','ocr', /\u00ad/gu, '', 'Remove the invisible soft hyphen.', .99),
  rule('ocr-replacement','ocr', /\uFFFD/gu, null, 'An unreadable character needs comparison with the original scan.', .6),
  rule('ocr-ligature','ocr', /[ﬀﬁﬂﬃﬄﬅﬆ]/gu, m=>({ﬀ:'ff',ﬁ:'fi',ﬂ:'fl',ﬃ:'ffi',ﬄ:'ffl',ﬅ:'st',ﬆ:'st'})[m[0]], 'Expand a typographic ligature into ordinary letters.', .99),
  rule('ocr-quote','ocr', /(?<=\p{L})[´`‘](?=\p{L})/gu, '’', 'Normalize a misrecognized apostrophe.', .95),
  rule('ocr-noise','ocr', /[|¦](?=[a-z])/gu, 'l', 'Possible OCR confusion between a vertical stroke and “l”. Review against the scan.', .75),
  rule('ocr-pronoun-stroke','ocr', /(^|\n|[.!?][ \t]+)[|¦](?=[ \t]+\p{L})/gmu, '$1I', 'A standalone vertical stroke may be the pronoun “I”. Compare with the original scan.', .82),
];

export const DIALECT_PAIRS = [
  ['color','colour'],['colors','colours'],['colored','coloured'],['colorful','colourful'],
  ['favorite','favourite'],['favorites','favourites'],['honor','honour'],['honors','honours'],
  ['center','centre'],['centers','centres'],['theater','theatre'],['theaters','theatres'],
  ['organize','organise'],['organized','organised'],['organizing','organising'],['organization','organisation'],
  ['recognize','recognise'],['recognized','recognised'],['recognizing','recognising'],
  ['analyze','analyse'],['analyzed','analysed'],['analyzing','analysing'],['defense','defence'],
  ['traveling','travelling'],['traveled','travelled'],['canceled','cancelled'],['canceling','cancelling'],
  ['gray','grey'],['neighbor','neighbour'],['neighbors','neighbours'],['behavior','behaviour'],
  ['behavioral','behavioural'],['labor','labour'],['harbor','harbour'],['flavor','flavour'],
  ['meter','metre'],['meters','metres'],['liter','litre'],['liters','litres'],['jewelry','jewellery'],
];

export function matchCase(replacement, original) {
  if (!replacement) return replacement;
  if (original.length > 1 && original === original.toLocaleUpperCase()) return replacement.toLocaleUpperCase();
  if (/^\p{Lu}/u.test(original)) return replacement[0].toLocaleUpperCase() + replacement.slice(1);
  return replacement;
}

export function replacementFor(rule, match) {
  if (rule.replacement == null) return null;
  if (rule.plugin) return rule.caseSensitive ? rule.replacement : matchCase(rule.replacement, match[0]);
  const value = typeof rule.replacement === 'function' ? rule.replacement(match)
    : rule.replacement.replace(/\$(\d+)/g, (_, i) => match[Number(i)] ?? '');
  return matchCase(value, match[0]);
}

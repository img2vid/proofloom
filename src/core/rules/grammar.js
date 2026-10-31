// Grammar rules: the original curated regex rules, plus generated rules from
// the verb/plural/countability/preposition/contraction/article tables.
import {literalRule} from './literal.js';
import {IRREGULAR_VERBS, IRREGULAR_PLURALS, UNCOUNTABLE_NO_PLURAL, AN_WORDS, A_WORDS} from '../data/morphology.js';
import {PREPOSITIONS, CONTRACTIONS} from '../data/register-tables.js';

const rule = (id, category, pattern, replacement, message, confidence = .97, extra = {}) =>
  ({id, category, kind: 'regex', pattern, replacement, message, confidence, ...extra});

// Subject-verb agreement, verb forms, pronouns, comparatives, articles.
export const GRAMMAR_RULES = [
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
  rule('comparison-than-before','grammar', /\b(better|worse|greater|smaller|larger|faster|slower) ([\p{L}]+) then (before|ever|expected|usual)\b/giu, '$1 $2 than $3', 'Use “than” to compare these things.', .93),
  rule('a-vowel','grammar', /\ba (apple|orange|egg|idea|issue|example|answer|article|author|image|error|email|event|editor|engine|object|option|opportunity|umbrella|unexpected|unusual)\b/giu, 'an $1', 'Use “an” before a vowel sound.'),
  rule('an-consonant','grammar', /\ban (book|document|file|page|report|word|sentence|language|dictionary|plugin|user)\b/giu, 'a $1', 'Use “a” before a consonant sound.'),
  rule('much-countable','grammar', /\bmuch (books|pages|words|errors|documents|people|students|files|things|problems|hours)\b/giu, 'many $1', 'Use “many” with this countable plural noun.'),
  rule('less-countable','grammar', /\bless (books|pages|words|errors|documents|people|students|files|things|problems)\b/giu, 'fewer $1', 'Consider “fewer” for a countable plural noun.', .9),
  rule('many-uncountable','grammar', /\bmany (information|advice|equipment|furniture|knowledge|research)\b/giu, 'much $1', 'This noun is normally uncountable.'),
  rule('more-better','grammar', /\bmore (better|worse|easier|harder|faster|slower|stronger|smaller|larger)\b/giu, '$1', 'Remove the doubled comparative.'),
  rule('most-best','grammar', /\bmost (best|worst|easiest|hardest|fastest|slowest|strongest)\b/giu, '$1', 'Remove the doubled superlative.'),
  rule('between-you-me','grammar', /\bbetween you and I\b/giu, 'between you and me', 'Use the object pronoun after “between”.'),
  rule('one-of','grammar', /\bone of the (book|page|word|document|student|problem|reason)\b/giu, 'one of the $1s', 'Use a plural noun in “one of the …”.'),
  rule('look-forward','grammar', /\blook(?:ing)? forward to (hear|meet|see|work|read|learn)\b/giu, m=>m[0].replace(new RegExp(`${m[1]}$`,'i'),{hear:'hearing',meet:'meeting',see:'seeing',work:'working',read:'reading',learn:'learning'}[m[1].toLowerCase()]), 'Use the -ing form after “look forward to”.'),
  rule('its-important','grammar', /\bits (important|necessary|possible|impossible|obvious|clear|unlikely|likely|time to)\b/giu, 'it’s $1', 'Use “it’s” when you mean “it is”.', .92),
  rule('your-welcome','grammar', /\byour welcome\b/giu, 'you’re welcome', 'Use “you’re” when you mean “you are”.', .94),
  rule('their-is','grammar', /\btheir (is|are|was|were)\b/giu, 'there $1', 'Use “there” to introduce existence.', .94),
  rule('sentence-case','grammar', /(^|[.!?]["”’)]*[ \t\n]+)([a-z])(?=[a-z])/gmu, m=>m[1]+m[2].toUpperCase(), 'Start this sentence with a capital letter.', .92),
  rule('i-im','grammar', /\bim\b/gu, 'I’m', 'Capitalize and punctuate “I’m”.', .94),
];

// "did + simple past" and "didn't + simple past" -> base form.
// "have/has/had + simple past" -> past participle. Generated from the verb table.
export function generateVerbRules() {
  const rules = [];
  const byPast = new Map();
  const byParticiple = new Map();
  for (const [base, past, participle] of IRREGULAR_VERBS) {
    if (past !== participle && !byParticiple.has(past)) byParticiple.set(past, participle);
    if (!byPast.has(past)) byPast.set(past, base);
  }
  const pastGroup = [...byPast.keys()].join('|');
  rules.push(rule('did-base', 'grammar',
    new RegExp(`\\b(did|didn['’]t) (${pastGroup})\\b`, 'giu'),
    m => `${m[1]} ${byPast.get(m[2].toLowerCase())}`,
    'Use the base form of the verb after “did”.'));
  rules.push(rule('have-participle', 'grammar',
    new RegExp(`\\b(have|has|had) (${pastGroup})\\b`, 'giu'),
    m => { const past = m[2].toLowerCase(); const p = byParticiple.get(past) || byPast.get(past); return `${m[1]} ${p || past}`; },
    'Use the past participle after this auxiliary verb.'));
  // been + simple past -> been + participle ("has been went" is rare; skip).
  return rules;
}

// Wrong irregular plural forms -> correct plural.
export function generatePluralRules() {
  const rules = [];
  const wrong = new Map();
  for (const [singular, plural] of IRREGULAR_PLURALS) {
    if (singular === plural) continue;
    const add = (form, fix) => {
      if (/^[a-z]+$/.test(form) && !wrong.has(form) && form !== plural && form !== singular) wrong.set(form, fix);
    };
    add(singular + 's', plural);
    add(singular + 'es', plural);
    add(plural + 's', plural);
    add(plural + 'es', plural);
    if (/[^s]y$/.test(singular)) add(singular.slice(0, -1) + 'ies', plural);
  }
  const formList = [...wrong.keys()].filter(w => w.length > 3);
  if (formList.length) {
    rules.push(rule('irregular-plural', 'grammar',
      new RegExp(`\\b(${formList.join('|')})\\b`, 'giu'),
      m => wrong.get(m[0].toLowerCase()) || m[0],
      'Check this irregular plural.', .85));
  }
  return rules;
}

// Quantifiers with uncountable nouns; and uncountable -s plurals.
export function generateCountabilityRules() {
  const rules = [];
  const nouns = [...new Set(UNCOUNTABLE_NO_PLURAL.map(([, fix]) => fix))].filter(n => /^[a-z]+$/.test(n));
  const group = nouns.join('|');
  const fixOf = word => UNCOUNTABLE_NO_PLURAL.find(([w]) => w === word.toLowerCase())?.[1] || word;
  rules.push(rule('uncountable-plural', 'grammar',
    new RegExp(`\\b(${[...new Set(UNCOUNTABLE_NO_PLURAL.map(([w]) => w))].join('|')})\\b`, 'giu'),
    m => fixOf(m[0]),
    'This noun is normally uncountable in general English.', .9));
  rules.push(rule('many-uncountable-nouns', 'grammar',
    new RegExp(`\\bmany (${group})s\\b`, 'giu'),
    m => 'much ' + fixOf(m[1]),
    'This noun is normally uncountable. “Much” takes a singular form.', .94));
  rules.push(rule('many-uncountable-noun', 'grammar',
    new RegExp(`\\bmany (${group})\\b`, 'giu'),
    'much $1', 'This noun is normally uncountable; try “much” or rephrase.', .88));
  rules.push(rule('fewer-uncountable-nouns', 'grammar',
    new RegExp(`\\bfewer (${group})\\b`, 'giu'),
    'less $1', '“Less” suits uncountable nouns.', .8));
  rules.push(rule('lesser-uncountable', 'grammar',
    new RegExp(`\\bless (${group})s\\b`, 'giu'),
    'less $1', 'Uncountable nouns do not take a plural -s.', .9));
  return rules;
}

// Preposition collocations from the table.
export function generatePrepositionRules() {
  const rules = [];
  PREPOSITIONS.forEach(([wrong, right], i) => {
    if (!/^[a-z][a-z\s'-]*$/i.test(wrong) || wrong === right) return;
    rules.push(literalRule(`prep-${i}`, 'grammar', wrong, right, `“${right}” is the standard collocation.`, .92));
  });
  return rules;
}

// Missing apostrophes and contraction errors.
export function generateContractionRules() {
  const rules = [];
  CONTRACTIONS.forEach(([wrong, right], i) => {
    if (!/^[a-z][a-z'’ ]*$/i.test(wrong)) return;
    const id = `contract-${i}`;
    if (/\s/.test(wrong)) {
      rules.push(literalRule(id, 'spelling', wrong, right, `Write “${right}”.`, /\bof\b/.test(wrong) ? .96 : .9));
    } else if (!/['’]/.test(wrong)) {
      rules.push(rule(id, 'spelling', new RegExp(`\\b${wrong}\\b`, 'giu'), right, `Add the apostrophe: “${right}”.`, .96));
    }
  });
  return rules;
}

// a/an before words with tricky initial sounds, generated from lists.
export function generateArticleRules() {
  const rules = [];
  const anWords = AN_WORDS.filter(w => /^[a-z]+$/i.test(w)).join('|');
  const aWords = A_WORDS.filter(w => /^[a-z]+$/i.test(w)).join('|');
  rules.push(rule('an-before-vowel-sound', 'grammar',
    new RegExp(`\\ba (${anWords})\\b`, 'giu'), 'an $1', 'Use “an” before this vowel sound.', .95));
  rules.push(rule('a-before-consonant-sound', 'grammar',
    new RegExp(`\\ban (${aWords})\\b`, 'giu'), 'a $1', 'Use “a” before this consonant sound (the letter U sounds like “you”).', .95));
  // Single letters that are pronounced with an initial vowel sound.
  rules.push(rule('an-letter-names', 'grammar',
    /\ba ([FHLNMNRSX])\b(?![a-z])/gu, 'an $1', 'Use “an” before letters pronounced with a vowel sound.', .92));
  return rules;
}

// Pronoun + bare past participle ("I seen", "they drunk") -> simple past.
export function generateParticipleMisuseRules() {
  const pairs = new Map();
  for (const [base, past, participle] of IRREGULAR_VERBS) {
    if (past !== participle && past !== base && participle !== base) pairs.set(participle, past);
  }
  const group = [...pairs.keys()].filter(w => w.length > 2).join('|');
  if (!group) return [];
  return [rule('pronoun-participle', 'grammar',
    new RegExp(`\\b(I|we|they|you) (${group})\\b`, 'giu'),
    m => `${m[1]} ${pairs.get(m[2].toLowerCase()) || m[2]}`,
    'This is a past participle; the simple past fits after a subject.', .85)];
}

export const GRAMMAR_GENERATED = [
  ...generateVerbRules(),
  ...generateParticipleMisuseRules(),
  ...generatePluralRules(),
  ...generateCountabilityRules(),
  ...generatePrepositionRules(),
  ...generateContractionRules(),
  ...generateArticleRules(),
];

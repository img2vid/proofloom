// Generative morphology tables: one spec per language (or per script), used
// by src/core/morphology.js to recognize inflected, declined, and conjugated
// forms of dictionary words that the bundled Hunspell affix data does not
// cover (wordlist-only dictionaries, sparse affix files, user packs).
//
// A spec understands three operations, tried on any word the dictionary
// rejected:
//  - suffixes: strip the ending ("evlerde" -> "evler" -> "ev"),
//  - swaps:    replace the ending ("книги" -> "книга", "studies" -> "study"),
//  - prefixes: strip a clitic ("الكتاب" -> "كتاب", "والكتابات" -> ... -> "كتاب").
//
// verbSuffixes are past/gerund-style endings that may attach through
// consonant doubling or silent-e loss ("walking" = walk + ing, "loved" =
// love + d). With cvcGate, a stripped stem that ends vowel+consonant only
// verifies through its silent-e form ("runing" -> "rune" fails, so the typo
// stays flagged, while "loved" -> "love" passes).
//
// guards are function words that must never act as generative stems, so
// "thes", "les", "und" stay spelling errors.
//
// Every bundled language resolves to a curated spec, an alias onto a close
// relative, or a script fallback (_latin, _cyrillic, _arabic, _devanagari,
// _bengali, _gurmukhi, _gujarati, _oriya, _tamil, _telugu, _kannada,
// _malayalam, _sinhala, _hangul, _greek, _hebrew, _georgian), so the
// mechanism covers all of them.

const cyrillicGuards = ['и', 'в', 'не', 'на', 'что', 'это', 'как', 'а', 'но', 'по', 'из', 'у', 'за', 'то', 'же', 'бы', 'от', 'до', 'для', 'при', 'над', 'под', 'или', 'если', 'уже', 'еще', 'ещё', 'там', 'тут', 'очень'];

// Shared Cyrillic endings (nouns/adjectives + common verb forms). Velar
// alternations (книга -> книги) go through swaps.
const CYRILLIC_SPEC = {
  minStem: 3,
  maxDepth: 2,
  suffixes: ['ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ах', 'ях', 'ам', 'ям', 'ов', 'ев', 'ой', 'ей', 'ою', 'ею', 'ом', 'ем', 'ым', 'им', 'ешь', 'ете', 'ут', 'ют', 'ат', 'ят', 'ла', 'ло', 'ли', 'ть', 'ся', 'сь', 'ый', 'ий', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о', 'ё', 'й', 'ь'],
  swaps: [['ги', 'га'], ['ки', 'ка'], ['хи', 'ха'], ['и', 'а'], ['ы', 'а'], ['у', 'а'], ['ю', 'я']],
  guards: cyrillicGuards,
};

const ENGLISH_SPEC = {
  minStem: 3,
  maxDepth: 1,
  cvcGate: true,
  strictEs: true,
  suffixes: ["'s", "s'", 'es', 's'],
  verbs: ['ing', 'ed'],
  swaps: [['ied', 'y'], ['ies', 'y'], ['ves', 'fe'], ['ves', 'f']],
  guards: ['the', 'a', 'an', 'and', 'or', 'but', 'nor', 'so', 'yet', 'if', 'then', 'than', 'that', 'this', 'these', 'those', 'there', 'here', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some', 'such', 'only', 'own', 'same', 'too', 'very', 'just', 'now', 'out', 'up', 'down', 'off', 'over', 'under', 'again', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'not', 'no', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'his', 'her', 'its', 'our', 'your', 'my', 'me', 'us', 'him', 'what', 'which', 'who', 'whom', 'whose', 'one', 'once', 'also', 'because', 'while', 'until', 'upon', 'among', 'along', 'across', 'behind', 'beyond', 'without', 'within', 'per', 'via'],
};

const LATIN_SPEC = {
  minStem: 3,
  maxDepth: 1,
  cvcGate: true,
  strictEs: true,
  suffixes: ['es', 's'],
  verbs: ['ing', 'ed'],
  swaps: [['ies', 'y']],
  guards: ['the', 'and', 'of', 'to', 'in', 'is', 'it', 'that', 'for', 'on', 'with', 'as', 'was', 'be', 'are', 'this', 'at', 'by', 'an', 'or'],
};

const ARABIC_SPEC = {
  minStem: 2,
  maxDepth: 3,
  prefixes: ['وال', 'فال', 'كال', 'بال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'ك'],
  suffixes: ['اتهم', 'اتها', 'اتنا', 'اتكم', 'اتكن', 'ينها', 'ينهم', 'ونها', 'ونهم', 'هما', 'كما', 'ية', 'ات', 'ون', 'ين', 'ان', 'ها', 'هم', 'هن', 'كم', 'كن', 'نا', 'يه', 'ي', 'ك', 'ة', 'ه'],
  guards: ['في', 'من', 'على', 'إلى', 'عن', 'أن', 'إن', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'ما', 'لا', 'قد', 'كل', 'بعد', 'قبل', 'هو', 'هي', 'هم', 'أو', 'ثم', 'لكن', 'حتى', 'إذا', 'كما', 'مع', 'كان', 'كانت'],
};

const DEVANAGARI_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['रहा', 'रही', 'रहे', 'गया', 'गयी', 'गये', 'गा', 'गे', 'गी', 'ता', 'ते', 'ती', 'ना', 'ने', 'नी', 'या', 'ए', 'ओ', 'ओं', 'ें', 'ों', 'इयाँ', 'इयों', 'वाला', 'वाले', 'वाली', 'कर', 'त'],
  // Oblique/vocalized stems drop the final ा (लड़का -> लड़के, लड़कें).
  swaps: [['ें', 'ा'], ['ों', 'ा'], ['ो', 'ा'], ['े', 'ा']],
  guards: ['और', 'का', 'की', 'के', 'को', 'में', 'से', 'पर', 'यह', 'वह', 'है', 'हैं', 'था', 'थी', 'नहीं', 'भी', 'कि', 'जो', 'तो', 'ही', 'एक', 'इस', 'उस', 'मैं', 'हम', 'आप', 'क्या'],
};

// Brahmic-script tables. Each curated spec doubles as the fallback for its
// script, so imported packs in neighbouring languages (Assamese via the bn
// alias, Maithili, Konkani, Bhojpuri, Malayalam, ...) get real morphology
// instead of nothing.
const BENGALI_SPEC = {
  minStem: 2,
  maxDepth: 3,
  suffixes: [
    // Plural/classifier stacks with their own case endings.
    'গুলোতেই', 'গুলোতে', 'গুলোকে', 'গুলোর', 'গুলোয়', 'গুলোই', 'গুলো',
    'গুলিতে', 'গুলিকে', 'গুলির', 'গুলিয়', 'গুলি',
    'খানাতে', 'খানায়', 'খানার', 'খানা', 'খানি',
    'টাকেই', 'টাকে', 'টাতে', 'টায়', 'টার', 'টা', 'টিতেই', 'টিতে', 'টির', 'টি',
    'দেরকে', 'দের', 'রা',
    // Verb chains: perfect/progressive/past/future/person endings.
    'েছিলাম', 'েছিলেন', 'েছিলে', 'েছিল', 'েছেন', 'েছি', 'েছে', 'েছ',
    'চ্ছিলাম', 'চ্ছিলেন', 'চ্ছিলে', 'চ্ছিল', 'চ্ছেন', 'চ্ছি', 'চ্ছে', 'চ্ছ',
    'ছিলাম', 'ছিলেন', 'ছিলে', 'ছিল', 'ছেন', 'ছি', 'ছে', 'ছ',
    'লাম', 'লেন', 'লে', 'ল', 'বেন', 'বে', 'বো', 'ব', 'ুন', 'েন', 'িয়ে',
    // Case endings: ablative/instrumental/manner, locative, accusative,
    // genitive (with the য়-inserted vowel-stem forms), emphatics.
    'দ্বারা', 'থেকে', 'হতে', 'দিয়ে', 'ভাবে', 'বারে',
    'তে', 'কে', 'য়ের', 'ের', 'য়ে', 'য়', 'ার', 'ো', 'ও', 'ই', 'ি', 'ে', 'র',
  ],
  guards: ['এবং', 'অথবা', 'অথচ', 'কিন্তু', 'কিংবা', 'এই', 'সেই', 'ওই', 'যে', 'কি', 'কী', 'না', 'হ্যাঁ', 'তো', 'আর', 'বা', 'যদি', 'তাহলে', 'তবে', 'যেহেতু', 'কারণ', 'এখন', 'তখন', 'সব', 'কিছু', 'কেউ', 'কোনো', 'কোন', 'খুব', 'অনেক', 'আমি', 'আমরা', 'আমার', 'আমাকে', 'তুমি', 'তোমরা', 'তোমার', 'আপনি', 'সে', 'তার', 'তাকে', 'তাহার', 'তারা', 'তাদের', 'এটা', 'ওটা', 'এটি', 'ওটি', 'এরা', 'ওরা', 'এগুলো', 'ওগুলো', 'ইত্যাদি', 'হয়', 'এখানে', 'ওখানে', 'যেখানে', 'কোথায়', 'কেন', 'কখন', 'কীভাবে'],
};

const GURMUKHI_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['ਿਆਂ', 'ਵਾਲਾ', 'ਵਾਲੀ', 'ਵਾਲੇ', 'ਨੂੰ', 'ਤੋਂ', 'ਵਿੱਚ', 'ਨਾਲ', 'ਾਂ', 'ਨੇ', 'ਦਾ', 'ਦੀ', 'ਦੇ', 'ਕੇ', 'ਗਿਆ', 'ਦਿੱਤਾ', 'ਹੈ', 'ਹਨ', 'ਸੀ'],
  guards: ['ਅਤੇ', 'ਜਾਂ', 'ਹੈ', 'ਹਨ', 'ਸੀ', 'ਨਹੀਂ', 'ਵੀ', 'ਕਿ', 'ਇਹ', 'ਉਹ', 'ਮੈਂ', 'ਅਸੀਂ', 'ਤੁਸੀਂ', 'ਕੀ', 'ਕਿਉਂ', 'ਕਿੱਥੇ'],
};

const GUJARATI_SPEC = {
  minStem: 2,
  maxDepth: 2,
  // The plural marker is the vowel SIGN ો, not the independent letter ઓ.
  suffixes: ['વાળા', 'ોને', 'ોમાં', 'નું', 'નો', 'ની', 'ના', 'ને', 'માં', 'થી', 'એ', 'ો', 'તા', 'તી', 'તું'],
  guards: ['અને', 'છે', 'હતું', 'નથી', 'પણ', 'કે', 'આ', 'એ', 'હું', 'અમે', 'તમે', 'શું', 'કેમ', 'ક્યાં'],
};

const KANNADA_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['ಗಳನ್ನು', 'ಗಳಿಂದ', 'ಗಳಿಗೆ', 'ಯಲ್ಲಿ', 'ಯಿಂದ', 'ಯನ್ನು', 'ದಲ್ಲಿ', 'ದಿಂದ', 'ಅನ್ನು', 'ಗಳು', 'ಗೆ', 'ಗಳ', 'ನ', 'ದ', 'ಯ'],
  guards: ['ಮತ್ತು', 'ಅಥವಾ', 'ಇದು', 'ಅದು', 'ಇಲ್ಲ', 'ಆದರೆ', 'ನಾನು', 'ನಾವು', 'ನೀವು', 'ಏನು', 'ಯಾಕೆ', 'ಎಲ್ಲಿ'],
};

const TAMIL_SPEC = {
  minStem: 2,
  maxDepth: 2,
  // மரம்-type stems surface as மரத்தை/மரத்தில்: the doubled த் forms swap
  // back to the citation -ம் ending as well as stripping.
  suffixes: ['களுக்கு', 'களுடன்', 'களால்', 'களின்', 'களில்', 'களை', 'உடன்', 'ுடைய', 'ுக்கு', 'ால்', 'க்கு', 'கள்', 'இல்', 'ன்', 'ல்', 'து', 'ஐ'],
  // ம்-final stems assimilate before க/த (மரம் -> மரங்கள், மரத்தை), so
  // the nasal and doubled-த் endings swap back to the citation form.
  swaps: [['ங்கள்', 'ம்'], ['கள்', 'ம்'], ['த்தை', 'ம்'], ['த்தில்', 'ம்'], ['த்துடன்', 'ம்'], ['த்தால்', 'ம்'], ['த்தின்', 'ம்'], ['த்துக்கு', 'ம்'], ['த்', 'ம்']],
  guards: ['மற்றும்', 'அல்லது', 'இது', 'அது', 'இல்லை', 'ஆனால்', 'நான்', 'நாம்', 'நீங்கள்', 'என்ன', 'ஏன்', 'எங்கே'],
};

const TELUGU_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['యొక్క', 'నుండి', 'కోసం', 'తో', 'లను', 'ాలు', 'ాని', 'లో', 'కు', 'కి', 'లు', 'ను', 'ని'],
  // ఇల్లు -> ఇళ్లు: the plural retroflexes and doubles the ల.
  swaps: [['ాలు', 'ం'], ['ాని', 'ం'], ['ళ్లు', 'ల్లు']],
  guards: ['మరియు', 'లేదా', 'ఇది', 'అది', 'లేదు', 'కానీ', 'నేను', 'మేము', 'మీరు', 'ఏమి', 'ఎందుకు', 'ఎక్కడ'],
};

const ODIA_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['ମାନଙ୍କ', 'ଗୁଡ଼ିକ', 'ମାନେ', 'ପାଇଁ', 'ଟିକୁ', 'ଟିର', 'ରେ', 'ରୁ', 'କୁ', 'ଟା', 'ର', 'ଟି'],
  guards: ['ଏବଂ', 'ବା', 'ଏହା', 'ସେଇ', 'ନାହିଁ', 'କିନ୍ତୁ', 'ମୁଁ', 'ଆମେ', 'ତୁମେ', 'କଣ', 'କାହିଁକି', 'କେଉଁଠି'],
};

const SINHALA_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['වලින්', 'වලට', 'වල', 'ාගේ', 'ලා', 'ගේ', 'ින්', 'ෙන්', 'න්න', 'නවා', 'ට', 'මි', 'හි', 'ති'],
  guards: ['සහ', 'නැත', 'මෙය', 'ඒ', 'මම', 'අපි', 'ඔබ', 'කුමක්ද', 'ඇයි'],
};

const MALAYALAM_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['ക്കളിൽ', 'ക്കളുടെ', 'ക്കളെ', 'ക്കൾ', 'കളിൽ', 'കളുടെ', 'കളെ', 'ത്തിന്റെ', 'ത്തിൽ', 'ത്തെ', 'യിൽ', 'യുടെ', 'യെ', 'ുടെ', 'ിൽ', 'ന്റെ', 'ൻ', 'ൾ', 'ർ', 'ം'],
  guards: ['ഒപ്പം', 'അല്ലെങ്കിൽ', 'ഇത്', 'അത്', 'അല്ല', 'പക്ഷേ', 'ഞാൻ', 'നമ്മൾ', 'നിങ്ങൾ', 'എന്ത്', 'എന്തുകൊണ്ട്', 'എവിടെ'],
};

const HANGUL_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['에서는', '으로는', '으로써', '에게서', '에서', '에게', '한테', '까지', '부터', '처럼', '마다', '이라', '라는', '으로', '습니다', '습니까', '합니다', '주세요', '었다', '였다', '는다', '한다', '하고', '하면', '하지', '이다', '은', '는', '이', '가', '을', '를', '에', '와', '과', '의', '도', '만', '로'],
  guards: ['그리고', '하지만', '그래서', '그런데', '그러나', '이것', '그것', '저것', '무엇', '누구', '우리', '나', '너', '저'],
};

const GREEK_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['ουμε', 'ομαστε', 'εστε', 'ονται', 'εσαι', 'ομαι', 'εται', 'εις', 'ους', 'ων', 'ες', 'ας', 'ης', 'οι', 'ου', 'εις', 'ει', 'ηκα', 'ηκες', 'ηκε', 'ηκαν', 'α', 'η', 'ο', 'ε', 'ν', 'ς', 'ι'],
  swaps: [['ία', 'ίο'], ['ιά', 'ιό'], ['ές', 'ός'], ['ές', 'ής'], ['ά', 'ό']],
  guards: ['και', 'να', 'το', 'της', 'των', 'με', 'σε', 'για', 'από', 'που', 'είναι', 'δεν', 'ότι', 'αλλά', 'ως', 'ο', 'η', 'οι', 'τα', 'ενα', 'ένα', 'στη', 'στο'],
};

const HEBREW_SPEC = {
  minStem: 2,
  maxDepth: 2,
  prefixes: ['ש', 'ה', 'ב', 'ל', 'ו', 'מ', 'כ'],
  suffixes: ['יהם', 'יהן', 'יכם', 'יכן', 'ינו', 'יך', 'יה', 'ים', 'ות', 'נו', 'כם', 'כן', 'הם', 'הן', 'ך', 'ו', 'י', 'ה', 'ת'],
  guards: ['אני', 'אתה', 'הוא', 'היא', 'אנחנו', 'אתם', 'של', 'על', 'עם', 'יש', 'לא', 'כן', 'זה', 'זו', 'אל', 'עד', 'אם', 'גם'],
};

const GEORGIAN_SPEC = {
  minStem: 2,
  maxDepth: 2,
  suffixes: ['ების', 'ებმა', 'ებში', 'ებს', 'ები', 'იანი', 'ური', 'ელი', 'თან', 'ის', 'მა', 'ში', 'ს', 'ო', 'და'],
  guards: ['და', 'რომ', 'ეს', 'ის', 'არის', 'არ', 'კი', 'თუ', 'რა', 'ვინ', 'სად', 'როდის', 'ჩვენ', 'თქვენ', 'ისინი'],
};

export const INFLECTION_SPECS = {
  en: ENGLISH_SPEC,

  // Romance
  es: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ando', 'iendo', 'amos', 'áis', 'aban', 'aron', 'aste', 'ían', 'ado', 'ada', 'ados', 'adas', 'aba', 'é', 'ó', 'as', 'os', 'es', 'an', 'en', 's'],
    swaps: [['amos', 'ar'], ['ando', 'ar'], ['ado', 'ar'], ['aron', 'ar'], ['aban', 'ar'], ['aste', 'ar'], ['é', 'ar'], ['ó', 'ar'], ['emos', 'er'], ['iendo', 'er'], ['ido', 'er'], ['imos', 'ir'], ['iendo', 'ir'], ['ido', 'ir']],
    guards: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'u', 'es', 'son', 'de', 'del', 'al', 'en', 'con', 'por', 'para', 'que', 'se', 'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'lo', 'le', 'les', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'como', 'pero', 'mas', 'más', 'ya', 'ni', 'si', 'no', 'ha', 'he', 'han', 'hay', 'fue', 'era', 'dos', 'tres'],
  },
  pt: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ando', 'endo', 'indo', 'amos', 'avam', 'aram', 'aria', 'ado', 'ada', 'ados', 'adas', 'ões', 'ão', 'em', 'os', 'as', 'es', 's'],
    swaps: [['ões', 'ão'], ['amos', 'ar'], ['ando', 'ar'], ['ado', 'ar'], ['aram', 'ar'], ['amos', 'ar'], ['emos', 'er'], ['endo', 'er'], ['ido', 'er'], ['imos', 'ir'], ['indo', 'ir'], ['ido', 'ir']],
    guards: ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'com', 'para', 'que', 'se', 'não', 'mais', 'como', 'mas', 'também', 'e', 'ou', 'é', 'são', 'foi', 'era', 'eu', 'tu', 'ele', 'ela', 'nós', 'eles', 'muito', 'já', 'só', 'tem'],
  },
  fr: {
    minStem: 3,
    maxDepth: 2,
    strictEs: true,
    suffixes: ['aient', 'ions', 'iez', 'ent', 'ant', 'ons', 'ez', 'ais', 'ait', 'ée', 'ées', 'és', 'é', 'es', 's'],
    swaps: [['aient', 'er'], ['ions', 'er'], ['iez', 'er'], ['ons', 'er'], ['ez', 'er'], ['ent', 'er'], ['ant', 'er'], ['ais', 'er'], ['ait', 'er'], ['ée', 'er'], ['ées', 'er'], ['és', 'er'], ['é', 'er'], ['is', 'ir'], ['it', 'ir']],
    guards: ['le', 'la', 'les', 'un', 'une', 'des', 'et', 'est', 'sont', 'de', 'du', 'au', 'aux', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 'pour', 'par', 'avec', 'dans', 'sur', 'sous', 'que', 'qui', 'quoi', 'dont', 'ne', 'pas', 'plus', 'très', 'bien', 'mais', 'donc', 'car', 'ni', 'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on', 'en', 'y', 'se', 'ça'],
  },
  it: {
    minStem: 3,
    maxDepth: 2,
    strictEs: true,
    suffixes: ['ando', 'endo', 'iamo', 'avamo', 'evano', 'ono', 'ano', 'ato', 'ata', 'ati', 'ate', 'uto', 'ito', 'ita', 'ava', 'avo', 'ai', 'ò', 'os', 'as', 'es'],
    swaps: [['iamo', 'are'], ['ando', 'are'], ['ato', 'are'], ['avo', 'are'], ['ano', 'are'], ['ai', 'are'], ['ò', 'are'], ['emo', 'ere'], ['endo', 'ere'], ['uto', 'ere'], ['ono', 'ere'], ['imo', 'ire'], ['endo', 'ire'], ['ito', 'ire'], ['ono', 'ire']],
    guards: ['il', 'lo', 'la', 'gli', 'le', 'un', 'uno', 'una', 'ed', 'è', 'sono', 'dei', 'della', 'delle', 'degli', 'del', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'in', 'con', 'su', 'per', 'tra', 'fra', 'di', 'da', 'che', 'chi', 'non', 'più', 'molto', 'come', 'ma', 'però', 'anche', 'se', 'io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'mi', 'ti', 'si', 'ci', 'vi', 'questo', 'questa', 'quello', 'quella', 'due', 'tre'],
  },
  ca: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ant', 'ent', 'ada', 'ades', 'ats', 'ava', 'aven', 'em', 'eu', 'en', 'í', 'à', 'os', 'es', 's'],
    swaps: [['em', 'ar'], ['ant', 'ar'], ['at', 'ar'], ['ada', 'ar'], ['í', 'ir'], ['ent', 'er']],
    guards: ['el', 'la', 'els', 'les', 'un', 'una', 'uns', 'unes', 'i', 'o', 'és', 'són', 'de', 'del', 'al', 'en', 'amb', 'per', 'per a', 'que', 'es', 'seu', 'seva', 'aquest', 'aquesta', 'com', 'però', 'més', 'ja', 'ni', 'si', 'no', 'ha', 'he', 'han', 'hi'],
  },
  ro: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['urilor', 'elor', 'ului', 'uri', 'ile', 'le', 'ul', 'ă'],
    guards: ['și', 'este', 'sunt', 'un', 'una', 'unei', 'ale', 'al', 'ai', 'la', 'în', 'din', 'cu', 'pe', 'pentru', 'care', 'ce', 'nu', 'mai', 'dar', 'sau', 'ca', 'de', 'doar', 'foarte'],
  },
  la: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['orum', 'arum', 'ibus', 'ium', 'uum', 'ae', 'am', 'um', 'em', 'us', 'is', 'es', 'os', 'as'],
    guards: ['et', 'est', 'non', 'in', 'ab', 'ad', 'cum', 'si', 'sed', 'ut', 'qui', 'quae', 'quod', 'ne', 'ex', 'de', 'per', 'atque'],
  },
  eo: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ojn', 'ajn', 'oj', 'aj', 'on', 'as', 'is', 'os', 'us', 'n', 'j', 'o', 'a', 'e', 'i', 'u'],
    guards: ['kaj', 'estas', 'ne', 'la', 'de', 'en', 'al', 'kun', 'por', 'per', 'sed', 'aŭ', 'ke', 'kiu', 'kio', 'pli', 'tre', 'jen'],
  },

  // Germanic
  de: {
    minStem: 3,
    maxDepth: 3,
    unUmlaut: true,
    suffixes: ['es', 'en', 'er', 'em', 'n', 'e', 's'],
    guards: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'und', 'oder', 'aber', 'ist', 'sind', 'war', 'waren', 'sein', 'haben', 'hat', 'hatte', 'nicht', 'kein', 'keine', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mich', 'mir', 'dir', 'uns', 'euch', 'man', 'zum', 'zur', 'im', 'in', 'an', 'auf', 'mit', 'von', 'zu', 'bei', 'nach', 'aus', 'für', 'um', 'durch', 'gegen', 'ohne', 'über', 'unter', 'vor', 'hinter', 'wenn', 'weil', 'dass', 'wie', 'was', 'wer', 'wo', 'da', 'dann', 'auch', 'noch', 'schon', 'nur', 'sehr', 'mehr', 'als', 'so'],
  },
  nl: {
    minStem: 3,
    maxDepth: 2,
    finalDevoice: true,
    suffixes: ['jes', 'tje', 'en', 'e', 's'],
    guards: ['de', 'het', 'een', 'en', 'of', 'is', 'zijn', 'was', 'waren', 'niet', 'geen', 'ik', 'je', 'hij', 'zij', 'we', 'ze', 'me', 'mij', 'hem', 'haar', 'ons', 'jullie', 'deze', 'dit', 'dat', 'die', 'wat', 'wie', 'waar', 'hoe', 'met', 'van', 'in', 'op', 'voor', 'naar', 'uit', 'bij', 'om', 'door', 'over', 'onder', 'maar', 'als', 'dan', 'nog', 'ook', 'al', 'heel', 'meer', 'dan'],
  },
  sv: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['arnas', 'ornas', 'ernas', 'arna', 'orna', 'erna', 'arn', 'nas', 'ens', 'ets', 'ar', 'or', 'er', 'en', 'et', 'na', 'ne', 'a', 'e', 'n', 's'],
    guards: ['och', 'att', 'det', 'är', 'som', 'en', 'ett', 'på', 'för', 'med', 'av', 'inte', 'om', 'till', 'från', 'men', 'eller', 'jag', 'du', 'han', 'hon', 'vi', 'ni', 'de', 'den', 'denna', 'detta', 'dessa', 'vad', 'vem', 'var', 'hur', 'kan', 'varit', 'har', 'inte', 'mycket', 'också', 'bara'],
  },
  da: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['erne', 'ernes', 'ene', 'enes', 'er', 'en', 'et', 'e', 's', 'ne'],
    guards: ['og', 'at', 'det', 'er', 'som', 'en', 'et', 'på', 'for', 'med', 'af', 'ikke', 'om', 'til', 'fra', 'men', 'eller', 'jeg', 'du', 'han', 'hun', 'vi', 'de', 'den', 'denne', 'dette', 'disse', 'hvad', 'hvem', 'hvordan', 'kan', 'har', 'været', 'meget', 'også', 'kun'],
  },
  is: {
    minStem: 3,
    maxDepth: 2,
    unUmlaut: true,
    suffixes: ['arnir', 'urnar', 'irnar', 'inum', 'unum', 'inn', 'ina', 'num', 'um', 'ar', 'ir', 'ur', 'i', 'a', 's', 'u'],
    guards: ['og', 'að', 'sem', 'er', 'um', 'til', 'frá', 'með', 'af', 'ekki', 'en', 'eða', 'ég', 'þú', 'hann', 'hún', 'við', 'þeir', 'þetta', 'þessi', 'hvað', 'hvernig', 'mikid', 'ein'],
  },

  // Slavic (Cyrillic)
  ru: CYRILLIC_SPEC,
  be: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ами', 'ях', 'ах', 'ой', 'эй', 'ому', 'ему', 'ых', 'іх', 'ові', 'ів', 'ам', 'ям', 'ла', 'ло', 'лі', 'ць', 'ся', 'а', 'я', 'ы', 'і', 'у', 'ю', 'е', 'ё', 'о'],
    swaps: [['гі', 'га'], ['кі', 'ка'], ['хі', 'ха'], ['і', 'а'], ['ы', 'а']],
    guards: cyrillicGuards,
  },
  uk: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ами', 'ями', 'ах', 'ях', 'ові', 'ови', 'ої', 'ій', 'ими', 'им', 'их', 'ів', 'ам', 'ям', 'ла', 'ло', 'ли', 'ти', 'ся', 'а', 'я', 'и', 'і', 'у', 'ю', 'е', 'о'],
    swaps: [['ки', 'ка'], ['хи', 'ха'], ['і', 'а'], ['и', 'а']],
    guards: cyrillicGuards,
  },
  bg: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ата', 'ята', 'ето', 'ете', 'овце', 'ът', 'ят', 'та', 'то', 'те', 'ов', 'ев', 'а', 'я', 'и', 'у', 'ю', 'е', 'о'],
    swaps: [['хи', 'ха'], ['ки', 'ка'], ['и', 'а'], ['е', 'я']],
    guards: cyrillicGuards,
  },
  mk: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['овите', 'ите', 'ови', 'ја', 'от', 'та', 'то', 'те', 'а', 'и', 'е', 'у'],
    swaps: [['и', 'а']],
    guards: cyrillicGuards,
  },
  sr: {
    // Both scripts share vowel endings; script-specific clusters listed too.
    minStem: 3,
    maxDepth: 2,
    suffixes: ['има', 'ама', 'ога', 'оја', 'их', 'ом', 'има', 'ама', 'има', 'ama', 'ima', 'ama', 'og', 'oj', 'eg', 'ih', 'om', 'a', 'е', 'и', 'о', 'у', 'e', 'i', 'o', 'u'],
    swaps: [['и', 'а'], ['ки', 'ка'], ['ги', 'га'], ['i', 'a']],
    guards: cyrillicGuards,
  },

  // Slavic (Latin) + Baltic
  pl: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['owie', 'ami', 'ach', 'ów', 'om', 'iem', 'ie', 'ę', 'y', 'i', 'a', 'u', 'e', 'o', 'ą'],
    swaps: [['y', 'a'], ['i', 'a']],
    guards: ['i', 'w', 'na', 'z', 'ze', 'że', 'do', 'od', 'za', 'po', 'przy', 'dla', 'bez', 'pod', 'nad', 'przed', 'między', 'przez', 'o', 'nie', 'jest', 'są', 'to', 'ten', 'ta', 'te', 'ci', 'jak', 'co', 'kto', 'gdzie', 'kiedy', 'ale', 'lub', 'czy', 'tak', 'już', 'jeszcze', 'bardzo', 'tylko', 'może', 'się', 'mi', 'go', 'ją', 'nas', 'was', 'ich'],
  },
  cs: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ách', 'ých', 'ým', 'ami', 'ům', 'ou', 'em', 'ovi', 'ě', 'é', 'ý', 'í', 'u', 'y', 'i', 'a', 'e', 'o'],
    swaps: [['i', 'a'], ['y', 'a']],
    guards: ['a', 'ale', 'nebo', 'je', 'jsou', 'v', 'na', 's', 'se', 'z', 'do', 'od', 'za', 'po', 'při', 'pro', 'bez', 'pod', 'nad', 'před', 'mezi', 'přes', 'o', 'k', 'ke', 'ku', 'to', 'ten', 'ta', 'ty', 'tyto', 'jak', 'co', 'kdo', 'kde', 'kdy', 'tak', 'ještě', 'velmi', 'jen', 'možná', 'se'],
  },
  hr: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ovima', 'ijevima', 'ama', 'ima', 'og', 'eg', 'oj', 'om', 'im', 'ih', 'a', 'e', 'i', 'o', 'u'],
    swaps: [['i', 'a']],
    guards: ['i', 'u', 'na', 'za', 'od', 'do', 'po', 'prije', 'nakon', 'kod', 'bez', 'pod', 'nad', 'pred', 'među', 'kroz', 'o', 'k', 'ka', 's', 'sa', 'nije', 'je', 'su', 'to', 'taj', 'ta', 'to', 'ti', 'kako', 'što', 'tko', 'gdje', 'kada', 'ali', 'ili', 'još', 'vrlo', 'samo', 'se'],
  },
  sl: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['oma', 'ih', 'ov', 'em', 'ega', 'a', 'e', 'i', 'o', 'u', 'm'],
    guards: ['in', 'ali', 'je', 'so', 'v', 'na', 'z', 's', 'za', 'od', 'do', 'po', 'brez', 'pod', 'nad', 'pred', 'med', 'skozi', 'o', 'k', 'h', 'ta', 'to', 'ta', 'kako', 'kaj', 'kdo', 'kje', 'kdaj', 'ampak', 'še', 'zelo', 'samo', 'se'],
  },
  lt: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['iais', 'iems', 'iams', 'ose', 'ęs', 'ąs', 'ų', 'ą', 'ai', 'ui', 'ę', 'os', 'oms', 'is', 'ys', 'io', 'iui', 'ės', 'ėms', 'ėse', 'ė', 'us', 'em', 'es', 'i', 'a', 'e', 'o', 'u'],
    guards: ['ir', 'arba', 'yra', 'buvo', 'ne', 'į', 'prie', 'iš', 'nuo', 'iki', 'po', 'prieš', 'be', 'po', 'per', 'apie', 'su', 'su', 'tai', 'tas', 'ta', 'tie', 'kaip', 'kas', 'kur', 'kada', 'bet', 'dar', 'labai', 'tik', 'gali'],
  },
  lv: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['ajiem', 'ajām', 'iem', 'ām', 'os', 'ās', 'us', 'ai', 'ei', 'am', 'u', 'a', 'i', 'e', 's'],
    swaps: [['i', 'a']],
    guards: ['un', 'vai', 'ir', 'bija', 'ne', 'iekš', 'no', 'līdz', 'uz', 'par', 'bez', 'zem', 'virs', 'starppreikš', 'caur', 'ap', 'ar', 'tas', 'tā', 'šis', 'šī', 'kā', 'kas', 'kur', 'kad', 'bet', 'vēl', 'ļoti', 'tikai', 'var'],
  },

  // Uralic
  hu: {
    minStem: 2,
    maxDepth: 3,
    suffixes: ['aitok', 'aitok', 'aink', 'eink', 'akat', 'eket', 'okban', 'ekben', 'ökben', 'unk', 'ünk', 'nak', 'nek', 'nál', 'nél', 'tól', 'től', 'val', 'vel', 'ok', 'ek', 'ök', 'ak', 'ot', 'et', 'öt', 'at', 'on', 'en', 'ön', 'an', 'ban', 'ben', 'ba', 'be', 'ra', 're', 'hoz', 'hez', 'höz', 'ul', 'ül', 'vá', 'vé', 'ai', 'ei', 'k', 't', 'j', 'i', 'a', 'e', 'o'],
    guards: ['és', 'vagy', 'de', 'az', 'ez', 'egy', 'nem', 'van', 'vannak', 'volt', 'lett', 'hogy', 'mint', 'mikor', 'hol', 'miért', 'ki', 'mi', 'nagyon', 'még', 'is', 'csak', 'már', 'minden', 'sok'],
  },
  et: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['tesse', 'tes', 'sse', 'dega', 'st', 'le', 'lt', 'ga', 'de', 'd', 't', 'n'],
    guards: ['ja', 'või', 'on', 'olis', 'ei', 'et', 'mis', 'kes', 'kus', 'millal', 'kuidas', 'aga', 'ka', 'veel', 'väga', 'ainult', 'juba', 'see', 'see', 'tema', 'meie', 'teie', 'nemad'],
  },

  // Turkic
  tr: {
    minStem: 2,
    maxDepth: 4,
    suffixes: ['larında', 'lerinde', 'larından', 'lerinden', 'lardan', 'lerden', 'larını', 'lerini', 'ların', 'lerin', 'ımıza', 'imize', 'ımızi', 'ınızın', 'inizin', 'ımız', 'imiz', 'umuz', 'ümüz', 'ınız', 'iniz', 'ınız', 'ınız', 'larının', 'lerinin', 'larda', 'lerde', 'lardan', 'lerden', 'ları', 'leri', 'ında', 'inde', 'ında', 'ından', 'inden', 'sında', 'sinde', 'ından', 'inden', 'ım', 'im', 'um', 'üm', 'ım', 'ın', 'in', 'un', 'ün', 'sı', 'si', 'su', 'sü', 'da', 'de', 'ta', 'te', 'dan', 'den', 'tan', 'ten', 'ki', 'lar', 'ler', 'a', 'e', 'ı', 'i', 'u', 'ü'],
    guards: ['ve', 'bir', 'bu', 'şu', 'o', 'ile', 'için', 'gibi', 'ama', 'fakat', 'çok', 'daha', 'en', 'de', 'da', 'mi', 'mı', 'ise', 'yani', 'çünkü', 'göre', 'kadar', 'sonra', 'önce', 'var', 'yok', 'değil', 'ben', 'sen', 'biz', 'siz', 'onlar', 'benim', 'senin', 'bizim', 'sizin', 'onun'],
  },
  mn: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['уудын', 'үүдийн', 'уудаас', 'үүдээс', 'ууд', 'үүд', 'ийн', 'ын', 'ийг', 'ыг', 'аас', 'ээс', 'оос', 'өөс', 'аар', 'ээр', 'д', 'т', 'ы', 'и'],
    guards: ['ба', 'бол', 'инь', 'юу', 'хэн', 'хаана', 'хэзээ', 'яагаад', 'болон', 'гэж', 'маш', 'зөвхөн', 'бид', 'та', 'тэд', 'энэ', 'тэр'],
  },

  // Semitic / Iranian
  ar: ARABIC_SPEC,
  fa: {
    minStem: 2,
    maxDepth: 2,
    suffixes: ['ترین', 'هايي', 'هاي', 'های', 'هایی', 'تر', 'ها', 'ام', 'ات', 'اش', 'يم', 'ید', 'ند', 'ش', 'ی'],
    guards: ['در', 'به', 'از', 'که', 'این', 'آن', 'است', 'برای', 'با', 'هم', 'نیز', 'یا', 'را', 'می', 'بر', 'تا', 'اما', 'اگر', 'چون', 'هر', 'چه', 'خود', 'او', 'باید', 'دارد', 'بود', 'شد'],
  },
  he: HEBREW_SPEC,

  // Indic. Bengali gets the fullest table: Bangla attaches case markers
  // (কে, তে, ের/য়ের, ে/য়), classifiers (টা/টি, খানা, গুলো/গুলি), plural
  // markers (রা, দের) and person/tense verb endings (ছি/চ্ছি, েছি, লাম,
  // বে, ি, েন, ুন, ো) directly to the stem, and vowel-final stems insert
  // য় before vowel-initial endings (বই -> বইয়ের), so those endings exist
  // both bare and after য়.
  hi: DEVANAGARI_SPEC,
  mr: {
    minStem: 2,
    maxDepth: 2,
    suffixes: ['त्या', 'मध्ये', 'च्या', 'ला', 'चा', 'ची', 'चे', 'ने', 'शी', 'ता', 'ते', 'ती', 'ना', 'ने', 'त', 'या', 'ओं', 'े'],
    guards: ['आणि', 'का', 'की', 'के', 'को', 'मध्ये', 'से', 'पर', 'हा', 'ही', 'हे', 'आहे', 'नाही', 'पण', 'तो', 'ती', 'मी', 'आम्ही', 'तुम्ही', 'काय', 'का'],
  },
  ne: {
    minStem: 2,
    maxDepth: 2,
    suffixes: ['लाई', 'बाट', 'हरू', 'ले', 'मा', 'को', 'की', 'का', 'ता', 'ते', 'ना', 'ने'],
    guards: ['र', 'वा', 'छ', 'थियो', 'होइन', 'को', 'की', 'मा', 'बाट', 'यो', 'त्यो', 'उनी', 'उहाँ', 'हामी', 'तपाईं', 'के', 'किन', 'कहाँ'],
  },
  sa: {
    minStem: 2,
    maxDepth: 2,
    suffixes: ['न्ति', 'न्तः', 'न्ती', 'ति', 'ते', 'तः', 'ता', 'ना', 'या', 'म्', 'नि', 'तुम्'],
    guards: ['च', 'न', 'एव', 'इति', 'वा', 'हि', 'तु', 'यः', 'सः', 'सा', 'तत्', 'इदम्', 'अस्ति', 'सन्ति'],
  },
  pa: GURMUKHI_SPEC,
  gu: GUJARATI_SPEC,
  kn: KANNADA_SPEC,
  ta: TAMIL_SPEC,
  te: TELUGU_SPEC,
  bn: BENGALI_SPEC,
  or: ODIA_SPEC,

  // Caucasian / Armenian / Korean / Basque / others
  ka: GEORGIAN_SPEC,
  hy: {
    minStem: 2,
    maxDepth: 2,
    suffixes: ['ներում', 'ների', 'ները', 'ներ', 'ում', 'ից', 'ը', 'ն', 'ս', 'դ', 'ի', 'ու', 'եմ', 'ես'],
    guards: ['և', 'կամ', 'այս', 'այն', 'ոչ', 'բայց', 'ես', 'մենք', 'դուք', 'ինչ', 'ինչու', 'որտեղ', 'է', 'են'],
  },
  ko: HANGUL_SPEC,
  eu: {
    minStem: 2,
    maxDepth: 2,
    suffixes: ['tzeko', 'tzen', 'tako', 'aren', 'tik', 'eko', 'tzat', 'gun', 'ak', 'ek', 'ari', 'en', 'an', 'ra', 'kan', 'n', 'a', 'k', 't'],
    guards: ['eta', 'edo', 'baina', 'ez', 'da', 'dira', 'zen', 'hau', 'hori', 'ni', 'gu', 'zu', 'zer', 'zergatik', 'non', 'oso', 'bereziki'],
  },

  // African / Austronesian / other Latin-script languages
  sw: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['eni', 'wa', 'ni', 'ku'],
    guards: ['na', 'ya', 'wa', 'kwa', 'ni', 'hii', 'ile', 'hapana', 'lakini', 'mimi', 'sisi', 'nini', 'kwa nini', 'wapi'],
  },
  id: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['annya', 'lah', 'kah', 'pun', 'nya', 'an', 'i', 'kan', 'ku', 'mu'],
    guards: ['dan', 'atau', 'ini', 'itu', 'tidak', 'adalah', 'saya', 'kami', 'anda', 'apa', 'mengapa', 'di mana', 'sangat', 'juga', 'hanya', 'sudah'],
  },
  sq: {
    minStem: 3,
    maxDepth: 2,
    suffixes: ['së', 've', 'sh', 'it', 'ës', 'ë', 't'],
    guards: ['dhe', 'ose', 'është', 'janë', 'nuk', 'por', 'ky', 'kjo', 'ai', 'ajo', 'unë', 'ne', 'ju', 'çfarë', 'pse', 'ku'],
  },
  si: SINHALA_SPEC,
  ml: MALAYALAM_SPEC,

  // No safe generative rules: Tibetan and Vietnamese rely on their Hunspell
  // affix data and behave exactly as before (empty suffix list = no-op).
  bo: {minStem: 99, maxDepth: 1, suffixes: [], swaps: [], prefixes: [], guards: []},
  vi: {minStem: 99, maxDepth: 1, suffixes: [], swaps: [], prefixes: [], guards: []},
};

// Languages whose spec is a close relative's table. Keys are BASE codes
// (what Intl.Locale().language or split('-')[0] yields).
export const INFLECTION_ALIASES = {
  hyw: 'hy', ltg: 'lv', nds: 'de', lb: 'de', af: 'nl', fo: 'is', tk: 'tr',
  kmr: 'tr', ckb: 'ar', as: 'bn', bs: 'hr', sk: 'cs', nb: 'da', nn: 'sv',
  an: 'es', gl: 'es', lij: 'it', fur: 'it', oc: 'ca', 'ru-petr1708': 'ru',
  'ca-valencia': 'ca', 'el-polyton': 'el', gug: 'es',
};

// Script fallbacks: used when a language has no curated table and no alias,
// including user-imported packs in any of the 86 languages or beyond. Every
// Brahmic script has its own table so a pack in an unlisted language (Maithili,
// Konkani, Santali, Newari, ...) still gets its script's real inflections.
export const SCRIPT_SPECS = {
  latin: LATIN_SPEC,
  cyrillic: CYRILLIC_SPEC,
  arabic: ARABIC_SPEC,
  devanagari: DEVANAGARI_SPEC,
  bengali: BENGALI_SPEC,
  gurmukhi: GURMUKHI_SPEC,
  gujarati: GUJARATI_SPEC,
  oriya: ODIA_SPEC,
  tamil: TAMIL_SPEC,
  telugu: TELUGU_SPEC,
  kannada: KANNADA_SPEC,
  malayalam: MALAYALAM_SPEC,
  sinhala: SINHALA_SPEC,
  hangul: HANGUL_SPEC,
  greek: GREEK_SPEC,
  hebrew: HEBREW_SPEC,
  georgian: GEORGIAN_SPEC,
};

const SCRIPT_TESTS = [
  ['hangul', /\p{sc=Hangul}/u],
  ['bengali', /\p{sc=Beng}/u],
  ['gurmukhi', /\p{sc=Guru}/u],
  ['gujarati', /\p{sc=Gujr}/u],
  ['oriya', /\p{sc=Orya}/u],
  ['tamil', /\p{sc=Taml}/u],
  ['telugu', /\p{sc=Telu}/u],
  ['kannada', /\p{sc=Knda}/u],
  ['malayalam', /\p{sc=Mlym}/u],
  ['sinhala', /\p{sc=Sinh}/u],
  ['cyrillic', /\p{sc=Cyrillic}/u],
  ['greek', /\p{sc=Greek}/u],
  ['hebrew', /\p{sc=Hebrew}/u],
  ['georgian', /\p{sc=Georgian}/u],
  ['arabic', /\p{sc=Arabic}/u],
  ['devanagari', /\p{sc=Devanagari}/u],
  ['latin', /\p{sc=Latin}/u],
];

// Dominant script of a word, used only to pick a fallback spec.
export function scriptOf(word) {
  for (const [name, pattern] of SCRIPT_TESTS) if (pattern.test(word)) return name;
  return null;
}

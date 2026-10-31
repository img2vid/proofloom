# Extension API v1

There are two distinct extension paths. Both operate alongside the same document and issue model.

## Runtime data packs

Import a JSON pack under **Extension lab** or **Dictionaries & languages**. It is validated before installation and saved in IndexedDB. Reimporting the same ID updates it. Disable or remove it without rebuilding.

```json
{
  "apiVersion": 1,
  "id": "my-studio.house-style",
  "name": "My studio style",
  "version": "1.0.0",
  "language": "en",
  "direction": "ltr",
  "license": "MIT",
  "words": ["Proofloom", "NeuroBloom"],
  "rules": [
    {
      "id": "prefer-help",
      "find": "provide assistance to",
      "replace": "help",
      "category": "style",
      "message": "Use a familiar verb.",
      "confidence": 0.9,
      "caseSensitive": false
    }
  ]
}
```

Categories: `spelling`, `grammar`, `punctuation`, `style`, `ocr`. The `find` field is a literal phrase, bounded by Unicode letters/numbers; it is not a regular expression. Replacement strings are literal, including `$1`. Empty replacements delete the matched text. Case-insensitive rules preserve initial/all-caps case. General `en` packs apply to English variants; a specific `en-GB` pack applies only to that variant. Other language families work the same way.

Data packs do not run JavaScript, fetch a server, modify the DOM, or run a regular expression supplied by a file. For advanced logic, use a trusted source module.

## Trusted code extensions

Register providers in `src/custom-extensions.js`, then test and rebuild. This module is loaded by the app and the worker. Do not access `window` or `document` at module scope. Arbitrary source extensions have the same trust as application code; review them before building.

### Add a dictionary format

```js
import {registerDictionaryAdapter} from './extensions.js';
import {parseWordlist} from './core/resources.js';

registerDictionaryAdapter('my-studio.lexicon', {
  extensions: ['lex'],
  async read(file, options) {
    const source = await file.text();
    const normalized = source.split('\n')
      .filter(line => !line.startsWith(';'))
      .map(line => line.split('=')[0]).join('\n');
    return parseWordlist(normalized, 'txt', options);
  }
});
```

The resource picker automatically includes registered extensions. A binary parser can use `file.arrayBuffer()`, a dedicated worker, or an audited WASM module. Return the normalized wordlist/Hunspell/pack structure, and implement format-specific bounds and licensing checks. Built-in limits are not a substitute for validating the adapter's own output.

### Add a document format

```js
import {registerDocumentAdapter} from './extensions.js';

registerDocumentAdapter('my-studio.custom-document', {
  extensions: ['mydoc'],
  async read(file, {progress}) {
    const data = JSON.parse(await file.text());
    progress('Reading custom document', 100);
    return {
      title: String(data.title),
      chapters: data.sections.map(s => ({title: String(s.name), text: String(s.text)})),
      note: 'Custom document imported as editable text.'
    };
  }
});
```

### Add grammar, morphology, or contextual analysis

```js
import {registerCheckProvider, registerLanguage} from './extensions.js';

registerLanguage('hi', {name: 'हिन्दी', direction: 'ltr'});
registerCheckProvider('my-studio.hindi', {
  name: 'My Hindi checker',
  languages: ['hi'],
  async check(text, context) {
    // Load your own reviewed rules / tokenizer / model here.
    // A provider runs in the checker worker, once per ~14k-character chunk.
    // context contains language, preset, OCR setting, and absolute chunk offset.
    // Return local UTF-16 offsets, NOT code-point or byte offsets.
    return [];
  }
});
```

Each returned issue uses:

```js
{
  start: 0, end: 3,
  ruleId: 'specific-rule', category: 'grammar',
  replacements: ['replacement'],
  message: 'Explain the suggestion.', confidence: 0.9
}
```

The registry checks bounds, assigns provider identity, and derives the original substring. Extension issues are never bulk-applied as safe by default. They are filtered by category, OCR mode, and disabled-rule preferences. Avoid server calls from a provider unless you also add clear user-facing consent; the manual connected-check path is the supplied network boundary. Do not embed secret keys in a static website.

Providers operate on chunks, so they cannot assume complete-document context. For full-document analysis, implement an independent explicit action or revise the orchestration layer. The default implementation does not provide a universal tokenizer or pretrained model for every language.

## Normalized resource shape

Common fields: `apiVersion`, `id`, `name`, `language`, `license`, `kind`, `enabled`, `words`, `rules`. Hunspell resources additionally contain UTF-8 `aff` and `dic` strings. The `direction` field is `ltr` or `rtl`. Preserve source attribution in your own pack metadata and distribution.

## Verification

Add positive and negative language/format fixtures, Unicode offset tests (including combining marks and emoji), malformed input tests, and resource size limits. Run `npm test` and `npm run build`. Test a deployed repository subpath before releasing.

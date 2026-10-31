# Adding another language

The app does not hardcode a future total of languages. A BCP-47 identifier selects the active resources and providers. That accommodates ordinary ISO 639 language codes, regional variants, and valid private-use tags. This is an extension architecture, not a promise of automatic language understanding.

1. Pick the correct code, such as `hi`, `bn`, `ja`, `ar`, or a region-specific variant. Decide the writing direction.
2. Obtain a dictionary/wordlist with a license that permits your intended distribution. Preserve authorship, license, and upstream version.
3. Convert to UTF-8 TXT, CSV/TSV, JSON, or an appropriate Hunspell pair. Use a trusted dictionary adapter for binary or proprietary formats. The default JSON pack format is shown in `examples/language-pack.json`.
4. Import the pack and select the new language in the writing desk. English grammar rules are not applied to a different language.
5. Add language-specific phrase rules for a small reviewed scope, or implement a check provider for morphology, segmentation, agreement, and syntax. Runtime packs handle literal phrase replacement; they are not a general grammar description language.
6. Use independent validation material with both errors and correct text. Test scripts, combining marks, names, code switching, punctuation conventions, and right-to-left behavior.

`Intl.Segmenter` provides locale-aware word segmentation for non-English dictionary checking when available. This will not be sufficient for every low-resource language. A check provider can bring an alternate tokenizer or morphology engine and return issues in the common format. JavaScript offsets are UTF-16 code units.

Imported base-language packs apply to regional variants. A specific variant pack applies only to that exact tag. A pack `direction` controls the editor's display. `registerLanguage()` can advertise a locale name; runtime packs also make their language available in the selector.

Dictionary membership is not grammar analysis. A wordlist-only language can flag unfamiliar words but does not have morphological suggestion generation unless a Hunspell/provider engine supplies it. No English fallback is silently used for other languages.

English OCR is bundled separately from proofreading. To recognize another script, supply appropriate Tesseract trained data and add an OCR document/provider extension using that model. Installing a spelling wordlist alone does not install an OCR model.

## What the 36 built-in languages ship, and where the data comes from

Every built-in language is built at `npm run build` time from locked npm packages — nothing is committed to `dist/`:

1. **Hunspell dictionary** — the `dictionary-<code>` package (`node_modules/<pkg>/index.aff` + `index.dic`) is gzipped into `dist/data/lang/<code>.aff.gz` / `.dic.gz` and loaded on demand by the checker worker. The list lives in `LANGUAGE_PACKS` in `scripts/build.mjs`.
2. **Frequency-ranked suggestions** — `vendor/frequency/<code>_50k.txt` (OpenSubtitles 2018 top-50k, CC BY-SA 4.0, fetched by `scripts/fetch-frequency.sh`) is compiled into `dist/data/frequency/<code>.json.gz`. The worker builds a word→rank map and the engine ranks every language's suggestions with the same weighted scorer English uses. Languages without an OpenSubtitles list (Irish, Esperanto) fall back to the dictionary's own suggestion order.
3. **meta.json** advertises every language with its entry count, frequency count, license, and upstream source; the test suite asserts the advertised files actually exist.

To add another built-in language: add the `dictionary-<code>` dependency to `package.json`, a row to `LANGUAGE_PACKS` in `scripts/build.mjs`, and (optionally) `vendor/frequency/<code>_50k.txt`. Then `npm run build` — `meta.json`, the language selector, the worker's on-demand loader, and the standalone single-file build pick it up automatically.

Grammar, punctuation, style, confusion-set, dialect, and OCR rule tables remain English-only; no English fallback fires for other languages.

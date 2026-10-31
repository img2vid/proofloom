# Validation record

This build was validated on 31 October 2026. These checks establish implementation behavior on the exercised fixtures, not comprehensive grammar accuracy or universal format compatibility.

## Automated checks

- 83 Node.js tests passed (58 original engine/resource/IO tests plus 25 new algorithm, rule-generation, confusion-context, dialect, readability, and data-count tests).
- Production bundle built successfully with 67,286 correction mappings, 7,339 rules and dialect variants, 57 registered algorithms, 812,727 domain words in 38 dictionaries, 48,738 frequency-ranked words, and 67 corpus-modelled confusion sets.
- Dependency audit reported zero known vulnerabilities in the installed production dependency tree at verification time.
- DOCX and EPUB exports were generated, unpacked, and checked for required package/document/navigation parts and escaped text.
- Positive and negative cases cover agreement, articles, common misspellings, Unicode offsets, protected code/URLs, OCR artifacts, safe/stale/overlapping edits, dialects, resource parsing, plugin validation, and bounded server responses.

## Browser workflows exercised

- Initial editor, suggestions, accepting an edit, safe fixes, and undo.
- JSON plugin installation with custom vocabulary.
- DOCX, EPUB, and PDF text imports.
- EPUB chapter selection and whole-book review; applying safe fixes across the book.
- PNG recognition using the bundled English Tesseract model; the fixture reported an estimated 95% recognition confidence and correctly retained the deliberate spelling/grammar errors for proofreading. OCR output was not perfect, and the restoration rules identified a stroke/pronoun confusion.
- Scanned PDF rasterization and local recognition, followed by OCR/spelling/grammar suggestions.
- CSV dictionary and a Hindi vocabulary pack imported through the UI; Hindi word segmentation and pack selection worked without English grammar fallback.
- Drafts and installed resources survived browser reloads.

Browser download receipt could not be confirmed in the managed HTTP preview: the browser automation emitted no download event for either generated files or an ordinary static JSON download. The archive-generation tests passed. HTTPS deployment may behave differently; this does not establish cross-browser download compatibility.

## Not verified

No live external grammar server was configured; the compatible response/validation path is tested with fixtures. No independent Grammarly comparison, large grammar accuracy benchmark, 4,000-language evaluation, assistive-technology audit, or complete mobile/cross-browser certification was performed. PDF reading order, complex RTF, uncommon Hunspell flags, and arbitrary third-party dictionaries need representative real-world validation.

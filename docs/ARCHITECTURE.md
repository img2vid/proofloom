# Architecture and practical boundaries

| Layer | Files | Responsibility |
| --- | --- | --- |
| UI | `src/app.js`, `views.js`, `ui.js`, `style.css` | Editing, accessible controls, review, readability panel, imports, persistence, consent, exports |
| Worker orchestration | `src/worker.js` | Dictionary/context/frequency/domain loading, gzip decompression, cancellation between chunks, progress, global offset conversion, readability profile |
| Engine composition | `src/core/checker.js` | Protected ranges, rule pipeline composition, spelling pipeline, safe edit application |
| Rule sets | `src/core/rules/` | Curated regex rules, generated literal rules + trigger index (`literal.js`), grammar/style/punctuation tables, dialect and confusion generators |
| Linguistic data | `src/core/data/` | Irregular verbs/plurals, confusion sets, dialect pairs, style tables (redundancies, wordiness, clichés, buzzwords, register, inclusive), morphology, corpus context model |
| Algorithms | `src/core/algorithms/` | 57 registered algorithms: edit distances, similarity metrics, phonetics, keyboard/OCR error models, candidate generation, ranking, confusion-set language model, POS guesser, syllables, ten readability formulas, registry |
| Engines | `src/core/engines/` | Confusion-set disambiguation, dialect consistency, sentence-level style analysis |
| Resource adapters | `src/core/resources.js` | Normalized vocabulary, Hunspell pairs, CSV/TSV, JSON pack validation |
| Extension registry | `src/extensions.js`, `custom-extensions.js` | Trusted dictionary/document/check/language providers |
| Document I/O | `src/documents.js` | Text extraction, ZIP bounds, PDF rendering, local OCR, new document/ebook generation |
| Connected checks | `src/core/remote.js` | Manual, consent-based LanguageTool-compatible requests; response normalization |
| Persistence | `src/storage.js` | IndexedDB documents, resources, and preferences |
| Distribution | `scripts/build.mjs`, `scripts/build-context-model.mjs`, GitHub workflow | Bundling, dictionary extraction (txt/gz/trie), frequency index, gzipped domain dictionaries, licenses, offline cache, GitHub Pages |

## Issue coordinates

Offsets are half-open UTF-16 ranges into the unmodified chapter text: `[start, end)`. The original substring travels with each issue. Before applying a replacement, the engine compares it against the current text. Bulk edits resolve overlaps by confidence and apply changes from the end of the text toward the beginning.

Bundled data loads once per dialect variant: Hunspell pair, correction mappings (US or GB), the frequency index, the gzipped domain dictionaries (decompressed with `DecompressionStream`), and the confusion-set context model. The spelling pipeline builds a deletion index and phonetic bucket index over the correction targets, frequency words, and domain vocabulary at first use, then generates candidates per unknown word from six error models ranked by weighted edit distance, similarity, and frequency priors. Confusion-set disambiguation combines a Bayes-style context score (corpus prior + observed before/after words with a shared unseen-context floor) with deterministic pattern rules; a low margin never triggers a suggestion.

The default worker checks chunks of approximately 14,000 characters, preferring line/word boundaries. It yields between chunks and ignores superseded job IDs. Protected URL/email/code regions are also computed over the full chapter to prevent a fenced block crossing a chunk boundary from being corrected. Rules that span a chunk boundary can be missed; full contextual document analysis is not provided.

## Confidence and safe fixes

Confidence is an assigned rule score. High-confidence spelling mappings, spacing fixes, and unambiguous character normalization can be applied in bulk. Dictionary guesses, grammar, style, dialect, merged OCR letters, and uncertain recognition changes require individual review. Any bulk operation is undoable and has a checkpoint. A high issue score means few detected issues per word, not proof that the writing is correct.

## Privacy

All default extraction, OCR, spelling, and rule execution happen in the browser. Downloads of app assets go to the site host. A connected check sends the selected chapter to the endpoint only after the user opts in and manually requests a check. No analytics or remote proofreading call is in the typing loop. Runtime data packs do not execute code.

IndexedDB is not cloud storage or encryption. Other software with access to the browser profile may access saved data. Clearing site data, changing origin, changing browser profile, or private browsing can make drafts unavailable. The app provides downloads and backups rather than implying synchronization.

## Performance

Large text is processed off the UI thread. Grammar rules are finite and curated. Spelling suggestions are bounded, and results have a declared cap. Large imported packs increase worker initialization and memory use. Tesseract recognition and PDF rasterization can still be expensive, especially on old CPUs. OCR is lazy-loaded and scans are recognized sequentially. The shipped limits aim to prevent accidental runaway workloads; they are not a complete sandbox for arbitrary hostile archives.

## Future work

High-quality grammar for another language needs a separate linguistic implementation. Full document fidelity needs format-aware transformation rather than plain-text export. Calibrated accuracy needs a representative, licensed benchmark. Generative rewriting and plagiarism analysis need additional engines, explicit data boundaries, and independent evaluation. These are extension opportunities, not implemented capabilities.

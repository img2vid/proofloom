# Proofloom

A complete, static proofreading and OCR restoration website designed for GitHub Pages. The default engine runs on the user's CPU in a browser worker. Documents stay in the browser unless the user explicitly requests a connected grammar check.

## What ships

- **7,300+ language rules and dialect variants** (counts are generated at build time and shown in the app): curated grammar, punctuation and style rules; a multi-pattern phrase matcher running thousands of literal rules through a single token scan; generated verb-form, plural, countability, article and collocation rules from linguistic tables; and ~5,000 British/American dialect spelling forms.
- **57 registered algorithms** in six families: string metrics (Levenshtein, Damerau-Levenshtein, Jaro-Winkler, Dice, Monge-Elkan…), phonetics (Soundex, Refined Soundex, Metaphone, Double Metaphone, NYSIIS, Caverphone 1/2, Match Rating), candidate-generation models (Norvig deletion index, phonetic buckets, keyboard adjacency, OCR confusion, split/join), ranking (weighted edit distance, frequency priors), context analysis (confusion-set disambiguation), and text segmentation. The full registry with per-algorithm descriptions is in `src/core/algorithms/registry.js`.
- **67,000+ spelling-correction mappings** from CSpell's common-misspellings data (US and GB variants), plus **810,000+ domain dictionary words** from 38 bundled CSpell dictionaries (software terms, companies, programming languages, cloud platforms, medical and scientific vocabulary, gaming, licenses and more), shipped gzipped and decompressed in the worker.
- **Corpus-derived context model for real-word errors**: "their/there/they're"-style confusions are disambiguated by the surrounding words using before/after statistics mined from 3.7 million words of public-domain literature (32 Project Gutenberg classics), combined with grammatical pattern tests for 138 confusion sets.
- **49,000 frequency-ranked words in each of 35 languages** (OpenSubtitles top-50k, CC BY-SA — one ranked list per bundled language that has one): every language's spelling suggestions are ranked by real corpus frequency with the same weighted scorer as English, not just dictionary order.
- **Ten readability formulas** (Flesch Reading Ease, Flesch-Kincaid, Gunning Fog, SMOG, Coleman-Liau, ARI, Linsear Write, Dale-Chall, FORCAST, Spache) with Dale-Chall and Spache familiar-word lists, displayed in a readability panel.
- **Sentence-level style analysis**: sentence-length variance, repeated sentence starts, adverb density, nominalization and weasel-word density, and a passive-voice detector — all review-only suggestions.
- **36 bundled language dictionaries** (7 million+ Hunspell entries): Bulgarian, Catalan, Czech, Danish, German, Greek, Esperanto, Spanish, Estonian, Basque, Persian, French, Irish, Galician, Hebrew, Croatian, Hungarian, Icelandic, Italian, Korean, Lithuanian, Latvian, Norwegian Bokmål, Dutch, Norwegian Nynorsk, Polish, Portuguese, Romanian, Russian, Slovak, Slovenian, Serbian, Swedish, Turkish, Ukrainian, and Vietnamese — gzipped, loaded on demand for the document's language, with morphology-aware, frequency-ranked suggestions. American and British English remain fully bundled; Indian English uses the British dictionary and spelling policy.
- Suggestions with explanations, alternatives, confidence estimates, ignore controls, personal words, individual rule disabling, safe bulk fixes, undo/redo, checkpoints, literal find/replace, focus mode, and reading statistics. **Click-to-correct in the editor**: click any highlighted word to open a correction popover anchored to that word and rewrite the text in place, with ignore, add-to-dictionary, and rule-disable actions.
- Import of TXT, Markdown, HTML/XHTML, DOCX, ODT, basic RTF, EPUB, FB2, PDF, SRT/VTT, and images. EPUB follows the package spine; PDFs become one section per page. Whole-book review checks every section, produces a report, and can apply safe fixes with a checkpoint.
- CPU-based English OCR with bundled Tesseract.js, WebAssembly cores, and trained data, plus OCR restoration suggestions for ligatures, soft hyphens, broken line-end words, letter/digit confusion, and merged/split letters.
- New text-based TXT, Markdown, HTML, DOCX, and EPUB exports; browser printing for PDF.
- Local browser persistence, document search, workspace backup/restore, runtime JSON rule packs, TXT/CSV/TSV/JSON wordlists, UTF-8 Hunspell pairs, and a source-code extension registry.
- An optional, manually triggered LanguageTool-compatible server connection, with explicit sharing consent and visible failure reporting.
- Responsive layout, keyboard controls, semantic controls, reduced-motion support, and a service worker for offline reuse.

All counts above are produced by the build (`scripts/build.mjs`) and displayed under **Dictionaries & languages** — they describe the shipped data, honestly.

## Run locally

Requirements: Node.js 22 or later (Node.js 24 recommended), npm, and a modern browser.

```bash
npm ci
npm test
npm run build
```

Serve the generated `dist/` folder over HTTP, for example:

```bash
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000`. Browsers block module scripts and worker loading on `file://` pages, so `dist/index.html` opened straight from disk shows a blank page — use a local server, or use the **single-file build** instead: the build also produces `dist/proofloom-standalone.html` (~57 MB), one self-contained page with every dictionary embedded that opens from a double click, no server and no installation needed. In the standalone file the checker runs from an embedded Blob worker and drafts stay in memory (browsers grant no storage on `file://` pages), so export your work instead of relying on autosave. OCR and PDF import stay server-only features. The GitHub source package builds the complete self-contained `dist/` folder, including the English dictionaries, per-language frequency lists, domain dictionaries, context model, and OCR assets, from its locked dependencies. Regenerate the corpus-derived context model with `node scripts/build-context-model.mjs` (optional; the committed model is used by the build).

## Publish on GitHub Pages

1. Create a GitHub repository and upload this project's source files. Keep `package.json`, `package-lock.json`, `src/`, `scripts/`, `tests/`, `docs/`, `examples/`, `vendor/`, and `.github/workflows/pages.yml` together at the root. **No dictionaries need to be downloaded or committed separately** — the 36 Hunspell dictionaries ship as the locked `dictionary-*` npm packages and GitHub Actions unpacks and bundles them during the Pages build. The vendored `vendor/` folder (frequency lists, corpus) should be uploaded as-is; `scripts/fetch-frequency.sh` can restore it if needed.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Push to the `main` branch or manually run the **Deploy Proofloom to Pages** workflow.
4. GitHub Actions installs the locked dependencies, runs the tests, builds `dist/` (including `proofloom-standalone.html`), and publishes it. Open the Pages URL shown in the workflow.

All runtime asset URLs are relative, including dictionary, worker, OCR, and font paths, so repository-subpath hosting works. The workflow does not run a grammar server. An optional LanguageTool server needs separate hosting; see [the server guide](docs/GRAMMAR_SERVER.md).

The project has no browser API keys, analytics, CDN runtime dependencies, or subscription requirements for its local engine. Initial website and asset downloads still require a network connection (the domain dictionaries are a ~2 MB gzip download on first check). After successful caching, normal checks work offline. Large OCR/PDF assets are cached as used and can be evicted by the browser. For a completely disconnected machine, serve the included `dist/` folder locally.

## Honest scope

This is an extensible working editor with a substantially deepened local engine — **not a verified replacement for every Grammarly feature**. The rule count includes generated variants and data-driven entries; the algorithm count counts distinct, independently implemented procedures, not thousands. No evidence establishes it as the world's most powerful checker. It does not ship generative rewriting, plagiarism detection, fact checking, semantic guarantees, professional translation, or a full syntactic parser. Rule confidence is a hand-assigned estimate, not a calibrated probability. Suggestions can be wrong.

The context model is mined from 19th-century public-domain literature; its coverage is strongest for frequent function words and it can be silent (or occasionally wrong) on modern idioms — a low margin never triggers a suggestion, and pattern tests carry the remaining load. Spelling dictionaries ship for the 36 languages listed above plus English, each with a frequency-ranked suggestion model; **grammar, punctuation, style, confusion-set, dialect, and OCR rules remain English-focused** and do not run for other languages, which get dictionary-driven spelling with frequency-ranked suggestions. Languages without a bundled dictionary (for example Finnish, Hindi, Arabic, Chinese, Japanese, Thai) keep the existing path: import a Hunspell pair or wordlist pack, or connect a LanguageTool-compatible server. The architecture does not impose a fixed list of languages: BCP-47 IDs, Unicode text, per-pack direction, locale-aware segmentation, and separate check providers allow future language development.

No program can read every past and future dictionary format automatically. The built-in adapters cover the formats above (including CSpell tries via `cspell-trie-lib` at build time). StarDict, DSL, Babylon, proprietary binary dictionaries, legacy encodings, unusual Hunspell directives, and future formats need conversion or an adapter. nspell implements the essential Hunspell core, not every Hunspell feature. A `.dic` without its `.aff` provides surface forms only.

Imports extract editable text. **Original formatting, illustrations, exact PDF layout, footnote links, annotations, and tracked changes are not preserved.** Export creates a new document or ebook. PDF reading order depends on the source. Basic RTF extraction does not implement every RTF control. DRM/encrypted ebooks and legacy binary DOC/MOBI/AZW are not supported directly. Subtitle timestamps are kept as text; subtitles do not have a specialized timeline editor.

The browser does not contain a general language model. Complex agreement, long-distance syntax, and narrative tone are beyond a finite local ruleset. Connect a self-hosted grammar engine or build a provider to expand that coverage. Existing public LanguageTool endpoints are not automatically used.

## Limits and data care

- Up to 80 MB per imported file; 100 MB expanded archive size; 6,000 archive entries.
- Up to 500 PDF pages, 3,000 ebook sections, and two million UTF-16 text characters per document.
- Up to 3,000 reported issues per check. Resolve these and check again. Whole-book reports retain up to 12,000 issues across sections. Each chunk computes suggestions for up to 160 unknown words; later unknown words can still be flagged.
- Up to 60 imported resource packs; 12 MB per resource file; 400,000 words and 10,000 literal rules per pack.
- Connected checks accept a chapter of up to 18,000 characters. Browser access requires HTTPS/CORS, and local servers may require additional browser permission.
- Browser storage is local to an origin/profile. Clearing site data removes drafts. Export files or a workspace backup for safekeeping. No cloud synchronization is provided.
- Without `DecompressionStream` support (all current major browsers have it), the domain dictionaries and bundled language dictionaries are skipped; checking falls back to Hunspell, corrections, and the context model for English, and to imported packs for other languages.

## Keyboard controls

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd K | Quick actions |
| Ctrl/Cmd Enter | Check the current chapter |
| Ctrl/Cmd Alt N | New document |
| Ctrl/Cmd S | Save the current browser draft |
| Ctrl/Cmd F | Find and replace in the writing desk |
| Ctrl/Cmd Z | Undo a document edit |
| Ctrl/Cmd Shift Z | Redo a document edit |
| Escape | Close a dialog or leave focus mode |

## Extend it

See [EXTENSIONS.md](docs/EXTENSIONS.md), [LANGUAGE_PACKS.md](docs/LANGUAGE_PACKS.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), and the examples. Add trusted code providers in `src/custom-extensions.js`; the UI, engine, and existing document importers do not need to be rewritten. Uploaded runtime JSON packs are deliberately data-only and match literal phrases. Imported content is displayed as text, not executed as HTML.

## Licensing

Original application code is MIT licensed. Third-party data and libraries retain their own licenses. **The transformed CSpell spelling-correction data remains CC BY-SA 4.0**, as do the OpenSubtitles frequency ranks and the derived confusion-set context statistics; attribution and source links are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Full dependency license files are copied into `dist/licenses/` during the build. Do not remove those notices when distributing the site.

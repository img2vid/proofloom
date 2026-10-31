# Openmukti Audiobook Maker feature catalog

**130 implemented opt-in text transformations.** The operations can be selected individually through the GUI or CLI (`openvoice tools`). They are implemented in `openvoice/texttools.py` and exercised by the automated test suite.

## Unicode and whitespace

- **`unicode-nfc`** — Unicode NFC composition
- **`unicode-nfkc`** — Unicode NFKC compatibility
- **`unicode-nfd`** — Unicode NFD decomposition
- **`unicode-nfkd`** — Unicode NFKD decomposition
- **`remove-diacritics`** — Remove combining accents
- **`remove-control`** — Remove control characters
- **`remove-bom`** — Remove byte order markers
- **`remove-zero-width`** — Remove zero-width characters
- **`normalize-spaces`** — Convert uncommon spaces
- **`unix-newlines`** — Convert to Unix line endings
- **`windows-newlines`** — Convert to Windows line endings
- **`collapse-whitespace`** — Collapse spaces and tabs
- **`collapse-newlines`** — Collapse multiple blank lines
- **`all-one-line`** — Convert to one paragraph
- **`trim`** — Trim start and end
- **`trim-left`** — Trim leading whitespace
- **`trim-right`** — Trim trailing whitespace
- **`tabs-to-spaces`** — Replace tabs with four spaces
- **`spaces-to-tabs`** — Replace four spaces with tabs
- **`remove-trailing-spaces`** — Trim whitespace at line ends
- **`remove-leading-spaces`** — Remove line indentation
- **`remove-soft-hyphens`** — Remove discretionary hyphens
- **`remove-formfeeds`** — Remove page-break controls
- **`remove-non-ascii`** — Remove non-ASCII characters
- **`ascii-fold`** — ASCII-fold Latin characters

## Lines and paragraphs

- **`trim-lines`** — Trim each line
- **`drop-blank-lines`** — Remove empty lines
- **`unique-lines`** — Deduplicate lines, retaining order
- **`unique-lines-casefold`** — Deduplicate lines regardless of case
- **`sort-lines`** — Sort lines A to Z
- **`sort-lines-reverse`** — Sort lines Z to A
- **`sort-lines-casefold`** — Sort lines ignoring case
- **`sort-lines-length`** — Sort lines by length
- **`reverse-lines`** — Reverse line order
- **`reverse-words`** — Reverse word order
- **`number-lines`** — Number every line
- **`remove-line-numbers`** — Remove line numbers
- **`bullet-lines`** — Add bullet to each line
- **`remove-bullets`** — Remove bullet prefixes
- **`lines-to-commas`** — Join lines using commas
- **`commas-to-lines`** — Split comma-separated items
- **`semicolons-to-lines`** — Split at semicolons
- **`lines-to-semicolons`** — Join lines with semicolons
- **`sentences-to-lines`** — Put each sentence on its own line
- **`number-sentences`** — Number each sentence
- **`first-line-each-paragraph`** — Extract first line of paragraphs
- **`remove-page-numbers`** — Remove standalone page numbers
- **`remove-roman-page-numbers`** — Remove Roman-numeral page numbers
- **`remove-repeated-headers`** — Remove repeated page headers
- **`paragraphs-to-one-line`** — Join lines within paragraphs
- **`paragraphs-to-lines`** — Separate paragraphs with one newline

## Case and punctuation

- **`lowercase`** — Convert to lowercase
- **`uppercase`** — Convert to uppercase
- **`title-case`** — Capitalize as titles
- **`sentence-case`** — Capitalize sentence beginnings
- **`casefold`** — Unicode case folding
- **`swap-case`** — Swap uppercase and lowercase
- **`capitalize`** — Capitalize first character
- **`normalize-quotes`** — Normalize curly quotations
- **`normalize-dashes`** — Normalize Unicode dashes
- **`expand-ellipsis`** — Replace ellipsis with dots
- **`collapse-ellipsis`** — Replace three dots with ellipsis
- **`normalize-exclamation`** — Collapse repeated exclamations
- **`normalize-questions`** — Collapse repeated question marks
- **`normalize-commas`** — Collapse repeated commas
- **`normalize-periods`** — Collapse repeated periods
- **`punctuation-spaces`** — Remove spaces before punctuation
- **`space-after-commas`** — Ensure space after commas
- **`space-after-semicolons`** — Ensure space after semicolons
- **`space-after-colons`** — Ensure space after colons
- **`remove-commas`** — Remove commas
- **`remove-semicolons`** — Remove semicolons
- **`remove-colons`** — Remove colons
- **`remove-parentheses`** — Remove parentheses only
- **`remove-brackets`** — Remove square brackets only
- **`remove-punctuation`** — Remove all punctuation
- **`remove-symbols`** — Remove symbols
- **`remove-emoji`** — Remove most pictographic emoji
- **`remove-empty-parentheses`** — Remove empty parentheses
- **`remove-empty-brackets`** — Remove empty brackets

## Markup and extraction

- **`strip-html`** — Remove HTML tags and decode entities
- **`decode-html`** — Decode HTML entities
- **`escape-html`** — Escape HTML entities
- **`strip-markdown`** — Remove Markdown formatting
- **`remove-markdown-images`** — Remove Markdown image references
- **`strip-markdown-links`** — Keep labels of Markdown links
- **`remove-markdown-fences`** — Remove Markdown code fences
- **`remove-markdown-headings`** — Remove Markdown heading markers
- **`headings-only`** — Extract Markdown headings
- **`remove-code-blocks`** — Remove fenced code blocks
- **`remove-xml-tags`** — Remove XML tags
- **`remove-srt-timing`** — Remove subtitle timestamps
- **`remove-vtt-header`** — Remove WEBVTT header
- **`remove-web-links`** — Remove HTTP addresses
- **`remove-email-addresses`** — Remove email addresses
- **`extract-web-links`** — Extract HTTP addresses
- **`extract-email-addresses`** — Extract email addresses
- **`extract-numbers`** — Extract numbers
- **`extract-quoted-phrases`** — Extract quoted phrases
- **`remove-quoted-phrases`** — Remove quoted phrases
- **`remove-urls-and-emails`** — Remove URLs and email addresses

## Speech and OCR

- **`ocr-fix-hyphenated-lines`** — Join hyphenated OCR line breaks
- **`ocr-join-soft-lines`** — Merge soft-wrapped OCR lines
- **`ocr-expand-ligatures`** — Expand OCR ligatures
- **`ocr-remove-form-feeds`** — Replace OCR page breaks
- **`ocr-fix-punctuation-space`** — Repair punctuation spacing
- **`ocr-remove-page-numbers`** — Strip page-number-only lines
- **`ocr-clean`** — Apply conservative OCR cleanup
- **`spell-out-small-numbers`** — Spell out 0 through 20
- **`say-percent`** — Expand percent signs
- **`say-ampersand`** — Speak ampersands as and
- **`say-at`** — Speak @ as at
- **`say-hash`** — Speak hashtag symbols as hash
- **`say-plus`** — Speak plus signs
- **`say-equals`** — Speak equals signs
- **`say-multiplication`** — Speak multiplication symbols
- **`say-division`** — Speak division symbols
- **`say-degrees`** — Speak degree symbols
- **`say-currency`** — Expand common currency symbols
- **`say-fractions`** — Expand fraction glyphs
- **`say-common-abbreviations`** — Expand common English abbreviations
- **`spell-acronyms`** — Separate capital-letter acronyms
- **`pause-at-commas`** — Add line breaks after commas
- **`pause-at-semicolons`** — Add line breaks after semicolons
- **`pause-at-colons`** — Add line breaks after colons
- **`pause-at-dashes`** — Add line breaks after em dashes
- **`remove-stage-directions`** — Remove parenthetical stage directions
- **`remove-parenthetical-asides`** — Remove parenthesized passages
- **`remove-repeated-words`** — Remove repeated adjacent words
- **`remove-filler-ums`** — Remove um and uh fillers

## Other implemented capabilities

- Desktop GUI editor, document import, insert, save, find, replace, edit menu, selection, font zoom, voice settings, voice presets, voice picker, pronunciation dictionary selection, searchable text tools with preview, progress, pause between chunks, stop, batch audio export.
- Speech engine integration for Windows SAPI, eSpeak NG/eSpeak, macOS say, and external Piper voice models.
- Audio export to WAV, MP3, FLAC, OGG, M4A, Opus, AAC, AIFF, WMA.
- FFmpeg audio effects: convert, join, trim, speed, gain, normalize, reverse, fade-in, fade-out, mono, stereo, resample, denoise, compress.
- Command-line speech, direct short flags, multiple input files, standard input, audio on standard output, engine listing, voice listing, statistics, sentence/chunk splitting, text transformation, batch dry-run, batch skip-existing, audio inspection.
- TXT, Markdown, HTML, CSV, LOG, JSON, XML, SRT, VTT, DOCX, EPUB extraction; optional PDF, RTF, and image OCR.
- Third-party speech engine plugin API; JSON and tab-delimited pronunciation replacements.
- Bundling for Linux portable Python ZIP, Debian, RPM specification, Arch PKGBUILD, Alpine APKBUILD, Windows launcher ZIP, and Windows/Linux GitHub CI executable workflows.

## Combine Chapters 0.4.0

- Multiple chapters per book with distinct image covers, optional slideshow images, and existing per-chapter narration recordings.
- Multiple whole books per batch, folder discovery and JSON manifest imports, per-chapter video rendering and lossless joins into each full audiobook video.
- Desktop Combine Chapters import queue, cover reassignment, explicit output mode, aspect ratio, resolution and container format.
- Gutenberg Mode cleanup of the editor and many ebooks: known header/footer markers, table-of-contents heuristics, placeholder stripping, page number cleanup, Roman chapter heading normalization, paragraph repair.
- Automatic output organization, dry-run validation, skip-existing operation, per-chapter error isolation, batch failure reports.
- CLI `audiobooks` and `gutenberg` operations with options for bulk generation and direct scripting.


## Complete projects and shared character voices (v1.0.11)

Choose **File → Export entire project (.oamproj)** and **File → Open entire project (.oamproj)** to save and restore text, chapters, media, voice profiles, pronunciation dictionaries and downloaded ONNX/model configuration files. In the main Voice Settings panel choose **Speaker for untagged text** and enable **Apply character profiles to Speak / Audio / Video / Batch** so each character voice, age, gender presentation and personality is used across the whole app. See [COMPLETE_PROJECTS.md](COMPLETE_PROJECTS.md) for detailed GUI steps, CLI examples and licensing notes.


## Scanned-book OCR and English spelling (v1.0.12)

Use **Import scans** above the editor for scanned PDFs, images, multipage TIFFs or ZIP/CBZ image books. Choose adaptive black-and-white, Otsu, contrast, deskew, rotation and page-range options. Click underlined words for spelling suggestions, or use **Correct all OCR**; Ctrl+Z undoes corrections. Book Studio includes **Review chapter OCR / spelling**. Complete projects retain OCR settings, the recognition report and personal words. See **OCR_AND_SPELLING.md** or the new Help menu entry for installation, portable builds and Proofloom attribution.

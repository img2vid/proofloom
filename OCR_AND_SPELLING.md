# Tesseract OCR and English correction — v1.0.12

Openmukti imports scanned/mixed PDFs, page images, multipage TIFFs, image folders
and ZIP/CBZ image books. Recognition and spelling run locally on the CPU.

## Import and correct a book

1. Select **Import scans** above the main editor, or **File → Import scanned PDF /
   images / ZIP book**. **Open document** also routes these formats to OCR.
   For a directory, use **File → Import book page image folder**.
2. Choose preprocessing, language, DPI and any page range, then **Start OCR import**.
   **Cancel / Close** stops recognition without applying partial text.
3. Click an underlined word to see suggestions, then click the intended spelling.
   Alternatively put the cursor in it and press **Ctrl+period**.
4. Select **Correct all OCR** to apply the top suggestion for every issue that has
   a suggestion. **Ctrl+Z** undoes the entire operation in one step. A conservative
   option is **Tools → Apply high-confidence OCR fixes only**.
5. Use **Add / ignore this word in this project** for character names and specialist
   words. **Tools → English spelling / OCR settings** imports personal word lists.

OCR and spelling suggestions cannot guarantee every intended word. Unknown words
without plausible suggestions remain underlined. Real words used incorrectly,
names, numbers, tables and complex reading order can need manual review. Confidence
is an estimate from Tesseract, not proof of correctness.

## Preprocessing options

| Control | Behavior |
| --- | --- |
| Auto | Adaptive black-and-white thresholding; if confidence is low, also tries enhanced grayscale and selects using confidence and word coverage. |
| Adaptive | Local black-and-white thresholding for shadows and uneven lighting. |
| Otsu | Global black-and-white thresholding for evenly lit scans. |
| Contrast | Grayscale normalization and adjustable contrast; useful for faint text. |
| Original | Grayscale with a white margin, without contrast, denoise or deskew. |
| Remove speckle noise | Median filtering before thresholding. |
| Deskew | Projection-based correction of small tilts up to five degrees. |
| Detect rotated pages | Tesseract OSD corrects confident 90/180/270-degree rotations; requires osd data. |
| Split spreads | Splits wide images at the middle, left page then right page. |
| PDF DPI | 150–600 DPI, bounded by the work-image pixel limit; default 300. |
| Segmentation | 3: book layout; 4: column; 6: text block; 11/12: sparse text. |

Transparency is flattened onto white. Dark backgrounds are inverted in processing
modes. PDF pages are assessed separately: usable text layers remain unchanged,
while scanned pages are rendered and recognized. **Force OCR** also recognizes
pages whose existing text layer is inaccurate or incomplete. Layout and reading
order of tables, footnotes and complex columns still need review.

ZIP/folder pages use natural filename order (`page1`, `page2`, `page10`); TIFF
frames keep source order. Page ranges count source pages/frames before spread
splitting, separately for each selected file. Multiple selected images are joined
in natural filename order. Page boundaries remain as form feeds without adding
synthetic page labels to the narration.

ZIP images are read without extracting paths. Imports reject unsafe paths,
symbolic links, encrypted pages, images over 80 MiB / 60 megapixels, archives over
2 GiB expanded / 30,000 entries, and excessive text. Work images are bounded to
24 megapixels. Tesseract defaults to two OpenMP threads. Source scans stay unchanged.

## Book Studio and complete projects

The importer can also add recognized text to Book Studio. **Add many ebooks**
accepts scanned PDFs, images and ZIP/CBZ books. Select a chapter and choose
**Review chapter OCR / spelling**, or double-click it. The chapter editor has the
same underlines, suggestion popup, correction button and undo. **Save chapter**
updates the text used for audiobook export; **Cancel** discards its edits.

The main editor and Book Studio chapters are separate buffers. If an import is
added to both, review and save the chapter before exporting that book. Main-editor
edits do not automatically overwrite book chapters.

**Export entire project (.oamproj)** preserves recognized/edited text, OCR settings,
page confidence report, personal spelling words and existing voice/book/video
settings. OCR runtime binaries are not stored inside a project. Page images are
not automatically copied into the project unless selected as existing book/video
resources; retain the original scans for comparison.

## Source setup

Python **3.12** is recommended for source usage with native imaging wheels:

```sh
python -m pip install ".[ocr]"
python -m openvoice gui
```

Install Tesseract 5 with English `eng` and orientation `osd` data on the source-run
computer. On Debian/Ubuntu:

```sh
sudo apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-osd python3-tk
```

For Windows source usage, install a Windows Tesseract distribution and put
`tesseract.exe` on PATH, or set `OPENMUKTI_TESSERACT` to its full path. The standard
`C:\Program Files\Tesseract-OCR` location is detected automatically. Other OCR
languages require their matching traineddata; use codes such as `eng+hin`.

English spelling uses the bundled dictionary without a separate spelling package,
Node.js process, server or API key. British/Indian and American variants are accepted
without forcing the text into another dialect.

## Portable Windows builds

This source archive contains code and build recipes, **not prebuilt EXEs**.
Each main EXE in the Windows build embeds Tesseract, English/orientation data and a
native imaging worker built with isolated Python 3.12. The main application keeps
the existing Python 3.15.2 recipe, avoiding a dependence on 3.15 imaging wheels.

On the Windows BUILD computer, install Tesseract with `eng` and `osd` before running
`Build-Portable-EXEs.bat`. For a custom installation, set `OPENMUKTI_TESSERACT_DIR`
to the directory containing `tesseract.exe`, its DLLs and `tessdata`. The collector
validates the data, copies the DLLs/configuration and available license notices,
and fails if OCR cannot be bundled. GitHub Actions installs build-time Tesseract.

Destination Windows x64 computers need no separate Python, Tesseract, native imaging
libraries or spelling dictionary. The nested worker and OCR runtime temporarily
extract while running, like the existing Piper helper. Native Windows EXEs must be
built and verified on Windows; Linux development checks do not validate those EXEs.

## Command line

```sh
python -m openvoice ocr --status
python -m openvoice ocr book.pdf -w book.txt
python -m openvoice ocr pages.zip --preprocessing otsu --dpi 300 -w book.txt
python -m openvoice ocr ./page-images --first-page 5 --last-page 20 -w excerpt.txt
python -m openvoice ocr scans.tiff --no-rotate --psm 6 --json -w report.json
python -m openvoice ocr book.pdf --force-ocr --correct -w corrected.txt
python -m openvoice spellcheck -f book.txt --json
python -m openvoice spellcheck -f book.txt --correct -w corrected.txt
python -m openvoice spellcheck -f book.txt --correct --safe-only -w cautious.txt
```

With `ocr --correct`, JSON reports contain corrected page text and the original
recognition confidence. That confidence describes OCR, not later spelling changes.
Ordinary document imports in CLI, batch and book flows also recognize scans.

## Proofloom and dictionary attribution

The focused Python implementation adapts the MIT-licensed code in
[img2vid/proofloom](https://github.com/img2vid/proofloom) at commit
`2fa2d34a2a50fd1a62f9c08c0d9a071265449518`. Unmodified reference files and the license
are retained under `third_party/proofloom`:

- `algorithms/candidates.js`: OCR confusions, edit/split candidates and deletion index.
- `algorithms/edit-distance.js` and `ranker.js`: transposition distance and ranking.
- `checker.js`: case matching, dehyphenation, protected ranges and overlap-safe edits.
- `rules/punctuation.js`: ligatures and soft-hyphen cleanup.
- `data/dialect.js`: accepted British/American spelling variants.
- `quickfix.js`: clicked-word lookup and bounded suggestion popovers.
- `documents.js`: per-page PDF text/OCR fallback strategy.

This is a Python adaptation of those behaviors, not Proofloom's entire JavaScript
grammar application. The English frequency dictionary contains 160,572 upstream
entries before dialect supplements. It comes from pyspellchecker, blob
`f7f462b2c6de1d58008f79245a9d5feb13c0df52`; upstream license and source attribution
are in `openvoice/resources/ENGLISH_DICTIONARY_LICENSE.txt`.

## Verification

```sh
python -m pip install ".[dev,ocr,pdf]"
python -m pytest -q
xvfb-run -a python -m pytest -q tests/test_ocr_gui.py
```

Tests cover real OCR, scanned/mixed PDFs, natural archive ordering, TIFF frames,
cancellation, safe archives, worker transport, spelling, dialects, project
persistence, and Tk popup/undo behavior. Unavailable runtimes skip with a reason.
See `VALIDATION_v1.0.12.md` for this development environment's actual results.

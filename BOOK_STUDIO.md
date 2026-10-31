# Combine Chapters and Gutenberg Mode — Openmukti Audiobook Maker 0.4.0

## What can be exported

Combine Chapters supports **per-chapter videos**, **one joined video per audiobook**, or **both** in a single bulk job. Each chapter may have its own cover, several slideshow images, narration text, an existing audio track, or both text and audio (text is then useful for estimated subtitles). A single library can hold hundreds of books. Jobs run in a worker thread in the GUI and sequentially through the CLI. The GUI allows reassigning individual chapter covers before exporting.

Video settings include 16:9, 9:16 and 1:1, 360p through 2160p, contain/crop and MP4/MKV/MOV/WebM. Videos and failure reports are written to separate, sanitized book folders. Use `--skip-existing` to reuse completed files, and `--dry-run` to validate imports without rendering. A chapter failure prevents that book's whole-book export so an incomplete book is not presented as complete; other books continue unless `--fail-fast` is set. There is no arbitrary limit on the number of chapter files, but output size, disk capacity, memory and encoding time depend on the actual workload.

## Fastest method: drop files into folders

```
My Library/
  Alice in Wonderland/
    Chapter 1.txt
    Chapter 1.png
    Chapter 2.txt
    Chapter 2.jpg
  The History of Astronomy/
    text/Chapter 01.txt
    text/Chapter 02.txt
    covers/01-cover.png
    covers/02-cover.png
```

Name chapter covers the same as their chapter's text file, or use uniquely identifiable chapter numbers. `cover.png` may serve as a fallback for all chapters. If a cover match is missing or ambiguous, resolve it in Combine Chapters or use a JSON manifest. For best results keep each book in its own folder. If a library folder contains multiple unrelated **whole-ebook** files without numbered chapter names, those become separate books.

```bash
openvoice audiobooks --folder "My Library" --output-dir "Exported" --gutenberg --mode both --aspect 16:9 --resolution 720p
```

## Explicit covers and chapter mappings

A manifest controls chapters precisely when file names do not match. Relative paths are resolved against the manifest location. You may specify an existing chapter audio file to skip TTS.

```json
{
  "books": [
    {
      "title": "My Example Book",
      "chapters": [
        {
          "title": "Chapter 1: The Beginning",
          "text_file": "BookA/chapter01.txt",
          "cover": "BookA/covers/chapter01.jpg"
        },
        {
          "title": "Chapter 2: The Journey",
          "text_file": "BookA/chapter02.txt",
          "cover": "BookA/covers/chapter02.jpg",
          "audio": "BookA/recordings/chapter02.wav"
        }
      ]
    },
    {
      "title": "Another Book",
      "ebook": "BookB/novel.epub",
      "gutenberg": true,
      "chapter_covers": {
        "1": "BookB/cover1.png",
        "2": "BookB/cover2.png"
      }
    }
  ]
}
```

For a whole ebook, an ordered `"covers"` list with exactly one image per detected chapter also works. `"chapter_covers"` can map a chapter number or the complete chapter heading to an image or list of images. Specify a default `"cover"` when all chapters intentionally share one cover.

```bash
openvoice audiobooks --manifest books.json --output-dir exports --mode both --gutenberg --format mp4
openvoice audiobooks --folder my-library --output-dir exports --mode chapters --aspect 9:16
openvoice audiobooks --manifest books.json --output-dir exports --dry-run --json
openvoice audiobooks --manifest books.json --output-dir exports --skip-existing
```

Output structure:

```
exports/
  My Example Book/
    My Example Book.mp4
    chapters/
      0001 - Chapter 1 - The Beginning.mp4
      0002 - Chapter 2 - The Journey.mp4
    export-report.json
  Another Book/
    ...
  openvoice-batch-report.json
```

If you select `--mode book`, intermediate chapter files are discarded after joining. If you select `--mode chapters`, no whole-book file is produced. All chapters are encoded with consistent video settings and 48 kHz stereo audio for reliable joins. Approximate caption files can be generated with `--captions` when narration text is available; these timings are estimates, not forced alignment.

## Gutenberg Mode

Gutenberg Mode is a **new, independently implemented, configurable text-cleaning pipeline** informed by the goals of the earlier `pgformatter` project. It improves upon simple delimiter trimming and blanket bracket deletion with:

- Recognizing standard Project Gutenberg **START/END** markers, removing descriptive notices and license boilerplate outside them while leaving original ebook files unchanged.
- Detecting table-of-contents blocks only when they resemble lists of chapter entries, and locating subsequent narrative chapters rather than indiscriminately deleting everything before the first word “chapter.”
- Validating Roman numerals before normalizing chapter headings; ordinary words and the first-person pronoun “I” are unaffected.
- Removing standalone `[Illustration]`, `[Image: ...]`, page numbers and similar reading artifacts without destroying meaningful bracketed dialogue or scientific references.
- Repairing wrapped paragraphs, joining line-break hyphenation conservatively, normalizing Unicode, and preserving chapter boundaries.
- Bulk processing ebook files from the GUI or CLI, with configurable toggles and one-click editor cleanup.

```bash
openvoice gutenberg novel.txt reference.epub --output-dir clean --split-chapters
openvoice gutenberg book.txt --output-dir clean --keep-toc --no-reflow
```

The parser is heuristic. Project Gutenberg files vary widely, including poetry, academic texts, bilingual editions and books with unusual internal headings. **No automatic formatter can guarantee perfect results for all books.** Preview and proofread the output, especially tables, poetry, embedded illustrations, footnotes, and scientific notation. Gutenberg Mode removes notices from the **narration copy**; users remain responsible for complying with applicable rights and distribution terms for the original works. It does not replace attribution and source notices in distributed source files when legally required.

## Windows and Linux builds

Use `Build-Portable-EXEs.bat` on Windows to create the native GUI and CLI EXEs with packaged media binaries. Use `Build-Windows-ARM64.bat` on native ARM Windows. On Linux run `Build-All-Available.sh` to build what the current machine supports. The project source can also build the Python `.pyz` and native `.deb` locally. Precompiled Windows executables require a Windows build machine; recipes for other distributions remain available under `packaging/`.


## Scanned-book OCR and English spelling (v1.0.12)

Use **Import scans** above the editor for scanned PDFs, images, multipage TIFFs or ZIP/CBZ image books. Choose adaptive black-and-white, Otsu, contrast, deskew, rotation and page-range options. Click underlined words for spelling suggestions, or use **Correct all OCR**; Ctrl+Z undoes corrections. Book Studio includes **Review chapter OCR / spelling**. Complete projects retain OCR settings, the recognition report and personal words. See **OCR_AND_SPELLING.md** or the new Help menu entry for installation, portable builds and Proofloom attribution.

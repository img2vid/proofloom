# Validation — Openmukti Audiobook Maker 1.0.12

Development checks completed on 2026-10-31 with Python 3.12 on Linux.

## Automated checks

- Full regression suite: **344 passed, 4 skipped** in 8.39 seconds.
- The four skipped tests require a live Tk display: suggestion-popup replacement,
  one-step undo, stale-result/personal-word behavior, and Unicode popup offsets.
  This environment cannot start an X display. The tests are included and the
  Linux GitHub Actions job runs them under Xvfb.
- Real Tesseract integration tests passed for a page image and a scanned PDF.
- Mixed-PDF integration passed: digital text was retained exactly and a second
  scanned page was recognized.
- Image-book checks passed for ZIP natural ordering, unsafe-path rejection,
  multipage TIFF frames, folder ordering, selected ranges and cancellation.
- Portable-worker JSON transport was exercised with a real OCR subprocess.
- Windows OCR runtime collection was checked with a simulated installation,
  including DLLs, eng/osd data, TSV configuration and notices.
- Spelling tests passed for case preservation, OCR letter/digit confusions,
  ligatures, dehyphenation, protected URLs/IPA/speaker tags, stale/overlapping
  edits, personal words, Unicode offsets, dialects, CLI and project persistence.
- Existing audio, character-voice, complete-project and packaging regressions
  passed with an eSpeak runtime available.
- Application and worker sources compile; new OCR/spelling modules also parse
  with Python 3.10 syntax rules.
- A Python wheel built successfully. Its bundled dictionary was loaded in an
  isolated import from the wheel and suggested `received` for `recieved`.
- `git diff --check` passed.

## Additional real-recognition checks

A generated English sample was recognized correctly after 90-degree rotation,
a three-degree tilt, and dark-background inversion. Estimated Tesseract
confidence for these samples was 96.17%, 95.96% and 96.19% respectively. These are
sample-specific results, not a general accuracy benchmark.

The included example scanned PDF was recognized through the CLI at 96.1%
estimated confidence. The sample typo document produced eight corrections:

Before:

```text
Teh freind recieved a speling eror in the rnodern w0rld.
The infor-
mation is useful.
```

After:

```text
The friend received a spelling error in the modern world.
The information is useful.
```

## Platform verification still needed

Windows EXEs were not compiled or executed in this Linux environment. Their
updated build recipe embeds the Tesseract runtime and imaging worker, validates
the traineddata and runs OCR status checks, but the resulting native Windows
applications require Windows validation. GUI interaction/visual checks must
also be run on a display-enabled system. This archive contains complete source
and build instructions rather than prebuilt Windows executables.

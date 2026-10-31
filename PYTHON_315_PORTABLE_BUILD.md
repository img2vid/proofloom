# Building two standalone Windows EXE files — Python 3.15.2

The Windows builder uses **CPython 3.15.2** and **PyInstaller 6.22.3** to produce two independent single-file applications:

- `OpenmuktiAudiobookMaker.exe` — GUI
- `OpenmuktiAudiobookMakerCMD.exe` — command line

Each EXE embeds its Python 3.15.2 runtime, application code, FFmpeg, FFprobe, and the Piper helper. The Piper helper is itself a single-file executable built with an isolated **Python 3.12** runtime because ONNX Runtime does not currently provide a compatible Python 3.15 wheel. The target PC **does not need Python 3.12, Python 3.15, or an `_internal` folder**. Piper voice model `.onnx` and `.onnx.json` files are downloaded separately according to the user's choices.

## One-click build (Windows x64)

1. Install **64-bit Python 3.15.2** and Tesseract 5 with `eng` and `osd` data on the Windows computer doing the build. The source-run OCR setup and custom build-time paths are described in `OCR_AND_SPELLING.md`.
2. Extract this source archive and double-click `Build-Portable-EXEs.bat`.
3. The build downloads isolated build dependencies, including a build-only Python 3.12 runtime, Piper, ONNX Runtime, and the required FFmpeg/FFprobe binaries.
4. After a successful build, open `dist/Openmukti-Audiobook-Maker-Windows-x64-Standalone-EXEs.zip`.
5. Extract either or both EXEs anywhere you like; **no other runtime files or folders need to accompany them**.

`Build-With-Piper.bat` runs the same full-featured build. The build stops with an error if the Piper helper is missing or incompatible. This is a Windows x64 builder; the source does not claim a tested ARM64 single-file build.

Version 1.0.12 also embeds Tesseract, its DLLs and English/orientation data, and a
separate onefile OCR imaging helper built with Python 3.12. The target computer
requires no installed Tesseract or imaging libraries. The build stops if OCR
components are missing; see `OCR_AND_SPELLING.md`.

## What "single-file" means

PyInstaller onefile EXEs **temporarily extract** their bundled Python libraries, FFmpeg/FFprobe, and nested Piper helper to a system temporary directory while running. This is not an external folder that you must copy or distribute. Windows must allow the executable to write to its user temporary directory and run files from it. Multiple launches can use additional temporary disk space; startup will be slower than in folder mode. Large FFmpeg and Piper libraries can make each EXE substantial in size.

In restricted enterprise or school environments where running files from temp is blocked, `--onefile` may fail even though the EXE is portable. The previous onedir method remains a useful fallback for such environments, but is not the default build here.

## Publishing and security

The ZIP includes `SHA256SUMS.txt`, `BUILD_PROVENANCE.json`, and relevant third-party notices. Do not disable antivirus protections to run the software; self-extracting EXEs can be heuristically flagged. Use vendor false-positive review and code signing as appropriate. Follow applicable FFmpeg GPL redistribution requirements, including corresponding source obligations.

## Verification

The source tests verify onefile command construction, embedded Piper worker discovery, package structure, hashes, and failed-build detection. Creating and launching the actual Windows EXEs must be performed on Windows; successful Linux-based source tests do not prove Windows runtime compatibility.

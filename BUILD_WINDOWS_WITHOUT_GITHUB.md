# Windows x64: build portable standalone EXEs without GitHub

Install 64-bit **CPython 3.15.2**, install Tesseract 5 with English (`eng`) and orientation (`osd`) data on this build computer, and extract the source. Double-click `Build-Portable-EXEs.bat`. The script builds both programs, the bundled Piper and OCR workers, and FFmpeg/FFprobe. Tesseract, its DLLs and English data are embedded in each main EXE; destination computers need no separate OCR installation. Set `OPENMUKTI_TESSERACT_DIR` for a custom Tesseract location. See `OCR_AND_SPELLING.md`.

When successful, `dist/Openmukti-Audiobook-Maker-Windows-x64-Standalone-EXEs.zip` contains:

```
OpenmuktiAudiobookMaker.exe
OpenmuktiAudiobookMakerCMD.exe
README.txt
SHA256SUMS.txt
BUILD_PROVENANCE.json
LICENSE
FFmpeg-notices/ (when supplied by binary vendor)
```

**No `_internal` directory or helper EXE needs to be distributed.** Either application EXE can be copied independently to another compatible Windows x64 PC. Voice models remain user-managed files. No GitHub and no installed Python are needed on the destination PC.

**Technical note:** The EXE self-extracts into a temporary folder while it runs. This means sufficient free temp space and ordinary write/execute permissions are required. The PyInstaller onefile design can increase antivirus heuristics compared with a folder-based build. See `PYTHON_315_PORTABLE_BUILD.md` for details and license obligations.


## Complete projects and shared character voices (v1.0.11)

Choose **File → Export entire project (.oamproj)** and **File → Open entire project (.oamproj)** to save and restore text, chapters, media, voice profiles, pronunciation dictionaries and downloaded ONNX/model configuration files. In the main Voice Settings panel choose **Speaker for untagged text** and enable **Apply character profiles to Speak / Audio / Video / Batch** so each character voice, age, gender presentation and personality is used across the whole app. See [COMPLETE_PROJECTS.md](COMPLETE_PROJECTS.md) for detailed GUI steps, CLI examples and licensing notes.

# Add Piper Neural Voices — Simple Instructions

1. For a source-based installation, install a compatible **Piper executable** or Python Piper runtime. For the full Windows x64 portable build, no separate Piper install is needed because `Build-Portable-EXEs.bat` bundles a self-contained Piper helper.
2. Launch Openmukti Audiobook Maker Version 1.
3. Choose **Voices → Download Piper voices by language**.
4. Pick a language, such as English, Bengali, or Hindi, then select a model. Press **Download Selected**.
5. The application automatically downloads the `.onnx` file and its matching `.onnx.json` file, checks the published checksums, and places both in your local voice library.
6. Click **Refresh installed voices**. Choose Piper, Auto, or assign individual Piper models in **Character Voices**.

Manual installation: download matching model/config files from https://huggingface.co/rhasspy/piper-voices/tree/main and choose **Add local Piper model + configuration**.

Voices are not bundled into the source download. The downloader requires a network connection. If you choose to download all models, check the displayed size first; the entire catalog can consume many gigabytes. Individual voices may have licensing conditions; review their model cards before distribution.


### Bengali model error: `ar is not a single codepoint`

This error comes from the phoneme mapping in a legacy Piper configuration, not from your Bengali writing. Version 1.0.2 validates the JSON before speech generation and, when the issue consists of unreachable multi-character mappings, creates a temporary compatible JSON for the legacy Piper executable. The downloaded `.onnx` and `.onnx.json` files are not modified. If another incompatible mapping is present, try the optional Python Piper runtime (`python -m pip install piper-tts`) in the same Python environment as the app, or use another compatible Bengali voice. The compiled Windows build contains only dependencies that were installed and explicitly bundled at build time.

### Building Windows EXEs with direct IPA support

For portable Windows **x64** builds, install CPython **3.15.2** and run `Build-Portable-EXEs.bat`. The main GUI and CLI are frozen with Python 3.15.2. The builder separately downloads a build-only Python 3.12 using `uv`, creates a Piper/ONNX Runtime helper, and embeds both runtimes in the portable ZIP. No Python is needed on the destination PC. See `PYTHON_315_PORTABLE_BUILD.md`.


## Python 3.15.2 portable Windows build (Version 1.0.10)

Use `Build-Portable-EXEs.bat` on Windows x64 with CPython **3.15.2**. The main GUI and CLI use Python 3.15.2, while a bundled Piper helper built with Python 3.12 preserves neural IPA synthesis despite the current ONNX Runtime wheel limitation. Both runtimes are frozen into the portable package, so destination computers need no Python installation. See `PYTHON_315_PORTABLE_BUILD.md` for detailed instructions.
